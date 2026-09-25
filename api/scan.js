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
  const { images, image, mimeType, code } = req.body || {}
  const list = images || (image ? [image] : [])

  // Código de acceso opcional: evita que extraños gasten tu cuota
  const pass = process.env.APP_PASSCODE
  if (pass && code !== pass) return res.status(401).json({ error: 'Código de acceso incorrecto' })

  if (!list.length || !list.every((i) => typeof i === 'string'))
    return res.status(400).json({ error: 'Imagen ausente' })
  if (list.length > 6) return res.status(400).json({ error: 'Máximo 6 fotos a la vez' })
  if (list.reduce((s, i) => s + i.length, 0) > 4_000_000)
    return res.status(400).json({ error: 'Las fotos pesan demasiado juntas, prueba con menos o de menor resolución' })

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
    const r = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: [
        ...list.map((data) => ({ inlineData: { mimeType: mimeType || 'image/jpeg', data } })),
        { text: `Estas ${list.length > 1 ? list.length + ' imágenes son páginas o fotos' : 'imagen es una foto'} de la carta de un restaurante. Extrae todas las categorías, platos y precio numérico (sin símbolo de moneda ni separador de miles), combinando todo en una sola lista sin duplicar categorías repetidas entre imágenes. Si un plato no tiene precio, usa 0.` }
      ],
      config: { responseMimeType: 'application/json', responseSchema: schema }
    })
    res.status(200).json(JSON.parse(r.text))
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'No se pudo leer la carta. Intenta con otra foto.' })
  }
}
