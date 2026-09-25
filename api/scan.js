import { GoogleGenAI, Type } from '@google/genai'

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
              properties: { name: { type: Type.STRING }, price: { type: Type.NUMBER } },
              required: ['name', 'price']
            }
          }
        },
        required: ['name', 'items']
      }
    }
  },
  required: ['categories']
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' })
  const { image, mimeType, code } = req.body || {}

  // Código de acceso opcional: evita que extraños gasten tu cuota
  const pass = process.env.APP_PASSCODE
  if (pass && code !== pass) return res.status(401).json({ error: 'Código de acceso incorrecto' })

  if (!image || typeof image !== 'string' || image.length > 4_000_000)
    return res.status(400).json({ error: 'Imagen ausente o demasiado grande' })

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
    const r = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: [
        { inlineData: { mimeType: mimeType || 'image/jpeg', data: image } },
        { text: 'Extrae la carta de este restaurante: categorías, platos y precio numérico (sin símbolo de moneda ni separador de miles). Si un plato no tiene precio, usa 0.' }
      ],
      config: { responseMimeType: 'application/json', responseSchema: schema }
    })
    res.status(200).json(JSON.parse(r.text))
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'No se pudo leer la carta. Intenta con otra foto.' })
  }
}
