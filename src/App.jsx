import { useEffect, useMemo, useState } from 'react'
import { scanMenu } from './gemini'

const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d } catch { return d } }
const money = (n) => n.toLocaleString('es-CO', { maximumFractionDigits: 0 })
const uid = () => Math.random().toString(36).slice(2, 8)

export default function App() {
  const [tab, setTab] = useState('carta')
  const [menu, setMenu] = useState(() => load('menu', []))
  const [people, setPeople] = useState(() => load('people', []))
  const [orders, setOrders] = useState(() => load('orders', {})) // { personId: { itemId: qty } }
  const [tax, setTax] = useState(() => load('tax', 8))
  const [tip, setTip] = useState(() => load('tip', 10))
  const [active, setActive] = useState(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    localStorage.setItem('menu', JSON.stringify(menu))
    localStorage.setItem('people', JSON.stringify(people))
    localStorage.setItem('orders', JSON.stringify(orders))
    localStorage.setItem('tax', JSON.stringify(tax))
    localStorage.setItem('tip', JSON.stringify(tip))
  }, [menu, people, orders, tax, tip])

  const items = useMemo(() => Object.fromEntries(menu.flatMap((c) => c.items.map((i) => [i.id, i]))), [menu])

  async function onFile(e) {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    setBusy(true); setError('')
    try {
      const cats = await scanMenu(files)
      setMenu(cats.map((c) => ({ ...c, items: c.items.map((i) => ({ ...i, id: uid() })) })))
      setOrders({}); setTab('pedido')
    } catch (err) { setError(err.message) }
    setBusy(false)
  }

  function addPerson(e) {
    e.preventDefault()
    if (!name.trim()) return
    const p = { id: uid(), name: name.trim() }
    setPeople([...people, p]); setActive(p.id); setName('')
  }
  const removePerson = (id) => {
    setPeople(people.filter((p) => p.id !== id))
    const { [id]: _, ...rest } = orders; setOrders(rest)
    if (active === id) setActive(null)
  }
  const change = (pid, iid, d) => {
    const cur = orders[pid]?.[iid] || 0
    const next = Math.max(0, cur + d)
    setOrders({ ...orders, [pid]: { ...orders[pid], [iid]: next } })
  }

  const totals = people.map((p) => {
    const lines = Object.entries(orders[p.id] || {}).filter(([id, q]) => q > 0 && items[id])
    const sub = lines.reduce((s, [id, q]) => s + items[id].price * q, 0)
    const t = sub * tax / 100, g = sub * tip / 100
    return { p, lines, sub, t, g, total: sub + t + g }
  })
  const consolidated = {}
  totals.forEach(({ p, lines }) => lines.forEach(([id, q]) => {
    const c = (consolidated[id] ||= { qty: 0, who: [] })
    c.qty += q; c.who.push(`${p.name}${q > 1 ? ' x' + q : ''}`)
  }))
  const grand = totals.reduce((s, x) => s + x.total, 0)
  const waiterText = Object.entries(consolidated).map(([id, c]) => `${c.qty} × ${items[id].name}`).join('\n')

  const chip = (on) => `px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap ${on ? 'bg-[#e8a33d] text-[#1f3a34]' : 'bg-white text-[#1f3a34]'}`

  return (
    <div className="min-h-screen pb-24" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <header className="bg-[#1f3a34] text-white px-5 pt-5 pb-4">
        <h1 className="text-2xl font-bold">MesaSplit</h1>
        <nav className="flex gap-2 mt-3">
          {[['carta', 'Carta'], ['pedido', 'Pedido'], ['resumen', 'Resumen']].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={chip(tab === k)}>{l}</button>
          ))}
        </nav>
      </header>

      <main className="max-w-xl mx-auto px-4 py-5 space-y-4">
        {tab === 'carta' && (
          <>
            <label className="block rounded-2xl border-2 border-dashed border-[#1f3a34]/40 bg-white p-6 text-center cursor-pointer">
              <input type="file" accept="image/*" multiple className="hidden" onChange={onFile} disabled={busy} />
              <span className="font-semibold">{busy ? 'Leyendo la carta…' : 'Subir foto(s) de la carta'}</span>
              <span className="block text-sm text-[#1c2421]/60 mt-1">Si tiene varias páginas, selecciona todas a la vez. Gemini extraerá categorías, platos y precios.</span>
            </label>
            {error && <p className="text-red-700 bg-red-50 rounded-xl p-3 text-sm">{error}</p>}
            {menu.map((c) => (
              <section key={c.name} className="bg-white rounded-2xl p-4">
                <h2 className="font-bold mb-2">{c.name}</h2>
                {c.items.map((i) => (
                  <div key={i.id} className="flex justify-between py-1 text-sm">
                    <span>{i.name}</span><span className="tabular-nums">${money(i.price)}</span>
                  </div>
                ))}
              </section>
            ))}
            {!menu.length && !busy && <p className="text-center text-sm text-[#1c2421]/60">Aún no hay carta. Sube una foto para empezar.</p>}
          </>
        )}

        {tab === 'pedido' && (
          <>
            <form onSubmit={addPerson} className="flex gap-2">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre (ej. Clara)" className="flex-1 rounded-xl px-4 py-3 bg-white outline-none focus:ring-2 ring-[#e8a33d]" />
              <button className="rounded-xl px-5 bg-[#1f3a34] text-white font-medium">Añadir</button>
            </form>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {people.map((p) => (
                <button key={p.id} onClick={() => setActive(p.id)} className={chip(active === p.id)}>{p.name}</button>
              ))}
            </div>
            {!people.length && <p className="text-center text-sm text-[#1c2421]/60">Añade a los integrantes de la mesa.</p>}
            {active && menu.map((c) => (
              <section key={c.name} className="bg-white rounded-2xl p-4">
                <h2 className="font-bold mb-2">{c.name}</h2>
                {c.items.map((i) => {
                  const q = orders[active]?.[i.id] || 0
                  return (
                    <div key={i.id} className="flex items-center justify-between py-1.5">
                      <div className="text-sm pr-2">{i.name}<div className="text-xs text-[#1c2421]/55">${money(i.price)}</div></div>
                      <div className="flex items-center gap-2">
                        {q > 0 && <button onClick={() => change(active, i.id, -1)} className="size-9 rounded-full bg-[#eef1ee] text-lg">−</button>}
                        {q > 0 && <span className="w-4 text-center font-semibold">{q}</span>}
                        <button onClick={() => change(active, i.id, 1)} className="size-9 rounded-full bg-[#e8a33d] text-lg font-bold">+</button>
                      </div>
                    </div>
                  )
                })}
              </section>
            ))}
          </>
        )}

        {tab === 'resumen' && (
          <>
            <section className="bg-white rounded-2xl p-4">
              <h2 className="font-bold mb-2">Para la mesera</h2>
              <pre className="whitespace-pre-wrap text-sm font-sans">{waiterText || 'Sin pedidos todavía.'}</pre>
              {waiterText && <button onClick={() => navigator.clipboard?.writeText(waiterText)} className="mt-3 text-sm underline">Copiar pedido</button>}
            </section>
            <div className="flex gap-3">
              {[['Impuesto %', tax, setTax], ['Propina %', tip, setTip]].map(([l, v, set]) => (
                <label key={l} className="flex-1 text-sm">{l}
                  <input type="number" inputMode="decimal" value={v} onChange={(e) => set(+e.target.value || 0)} className="mt-1 w-full rounded-xl px-3 py-2 bg-white" />
                </label>
              ))}
            </div>
            {totals.map(({ p, lines, sub, t, g, total }) => (
              <section key={p.id} className="bg-white rounded-2xl p-4">
                <div className="flex justify-between items-baseline">
                  <h2 className="font-bold">{p.name}</h2>
                  <button onClick={() => removePerson(p.id)} className="text-xs text-[#1c2421]/50">Quitar</button>
                </div>
                {lines.map(([id, q]) => (
                  <div key={id} className="flex justify-between text-sm py-0.5"><span>{q} × {items[id].name}</span><span>${money(items[id].price * q)}</span></div>
                ))}
                <div className="border-t mt-2 pt-2 text-sm space-y-0.5">
                  <div className="flex justify-between"><span>Subtotal</span><span>${money(sub)}</span></div>
                  <div className="flex justify-between"><span>Impuesto</span><span>${money(t)}</span></div>
                  <div className="flex justify-between"><span>Propina</span><span>${money(g)}</span></div>
                  <div className="flex justify-between font-bold text-base pt-1"><span>Total</span><span>${money(total)}</span></div>
                </div>
              </section>
            ))}
            {!!people.length && <p className="text-right font-bold text-lg">Cuenta total: ${money(grand)}</p>}
          </>
        )}
      </main>
    </div>
  )
}
