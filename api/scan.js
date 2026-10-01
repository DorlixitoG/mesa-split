import { GoogleGenAI, Type } from "@google/genai";

const schema = {
  type: Type.OBJECT,
  properties: {
    categories: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          items: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                price: { type: Type.NUMBER },
              },
              required: ["name", "price"],
            },
          },
        },
        required: ["name", "items"],
      },
    },
  },
  required: ["categories"],
};

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Método no permitido" });
  const { images, image, mimeType, code } = req.body || {};
  const list = images || (image ? [image] : []);

  // Código de acceso opcional: evita que extraños gasten tu cuota
  const pass = process.env.APP_PASSCODE;
  if (pass && code !== pass)
    return res.status(401).json({ error: "Código de acceso incorrecto" });

  if (!list.length || !list.every((i) => typeof i === "string"))
    return res.status(400).json({ error: "Imagen ausente" });
  if (list.length > 6)
    return res.status(400).json({ error: "Máximo 6 fotos a la vez" });
  if (list.reduce((s, i) => s + i.length, 0) > 4_000_000)
    return res.status(400).json({
      error:
        "Las fotos pesan demasiado juntas, prueba con menos o de menor resolución",
    });

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const call = (model) =>
      ai.models.generateContent({
        model,
        contents: [
          ...list.map((data) => ({
            inlineData: { mimeType: mimeType || "image/jpeg", data },
          })),
          {
            text: `Estas ${list.length > 1 ? list.length + " imágenes son páginas o fotos" : "imagen es una foto"} de la carta de un restaurante. Extrae todas las categorías, platos y precio numérico (sin símbolo de moneda ni separador de miles), combinando todo en una sola lista sin duplicar categorías repetidas entre imágenes. Si un plato no tiene precio, usa 0.`,
          },
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: schema,
        },
      });
    const isOverloaded = (e) =>
      e?.status === 503 ||
      /UNAVAILABLE|overloaded|high demand/i.test(e?.message || "");
    const isQuota = (e) =>
      e?.status === 429 ||
      /RESOURCE_EXHAUSTED|exceeded your current quota/i.test(e?.message || "");

    // 503 = saturación momentánea → reintentamos el mismo modelo.
    // 429 = se acabó la cuota gratis del día para ese modelo → pasamos directo al de respaldo, sin reintentar.
    const models = ["gemini-3.6-flash", "gemini-3.5-flash"];
    let r,
      lastErr,
      quotaHit = false;
    outer: for (const model of models) {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          r = await call(model);
          break outer;
        } catch (e) {
          lastErr = e;
          if (isQuota(e)) {
            quotaHit = true;
            break;
          }
          if (!isOverloaded(e)) throw e;
          await new Promise((res) => setTimeout(res, 1000 * 2 ** attempt));
        }
      }
    }
    if (!r) {
      if (quotaHit) {
        const err = new Error("quota");
        err.isQuota = true;
        throw err;
      }
      throw lastErr;
    }
    res.status(200).json(JSON.parse(r.text));
  } catch (e) {
    console.error(e);
    const overloaded =
      e?.status === 503 ||
      /UNAVAILABLE|overloaded|high demand/i.test(e?.message || "");
    const quota =
      e?.isQuota ||
      e?.status === 429 ||
      /RESOURCE_EXHAUSTED|exceeded your current quota/i.test(e?.message || "");
    res.status(quota ? 429 : overloaded ? 503 : 500).json({
      error: quota
        ? "Ya usaste las peticiones gratis de Gemini por hoy (el nivel gratuito permite unas pocas al día por modelo). Espera a que se reinicie la cuota o activa facturación en Google AI Studio para tener más margen."
        : overloaded
          ? "Gemini está saturado en este momento. Espera unos segundos e inténtalo de nuevo."
          : "No se pudo leer la carta. Intenta con otra foto.",
    });
  }
}
