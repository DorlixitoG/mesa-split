// Reduce la foto (máx. 1600 px, JPEG) para que quepa en el límite de Vercel y sea más rápida
async function shrink(file) {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * scale)
  c.height = Math.round(bmp.height * scale)
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height)
  return c.toDataURL('image/jpeg', 0.85).split(',')[1]
}

export async function scanMenu(file) {
  const image = await shrink(file)
  const send = (code) =>
    fetch('/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image, mimeType: 'image/jpeg', code })
    })

  let res = await send(localStorage.getItem('code') || '')
  if (res.status === 401) {
    const code = window.prompt('Código de acceso:')
    if (!code) throw new Error('Se necesita el código de acceso')
    res = await send(code)
    if (res.ok) localStorage.setItem('code', code)
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Error al escanear la carta')
  return data.categories
}
