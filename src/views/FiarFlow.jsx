import { useMemo, useRef, useState, useEffect } from 'react'
import { ArrowLeft, ArrowRight, Handshake, CircleDollarSign, Search, X, Plus, Minus, Package, IdCard, Check, ShoppingBag, Banknote, Smartphone } from 'lucide-react'
import { toast } from 'sonner'
import { formatPrice } from '@/lib/format'
import { emojiDeCategoria as emojiDe, esRutaImagen, rutaAFileUrl as fileUrl } from '@/lib/categoriaEmoji'
import './fiar-flow.css'

/* ─────────────────────────────────────────────────────────────────────
 * Flujo Fiar — vive DENTRO del PDV (pestaña del sliderbar y destino del
 * botón Fiar del cobro). LLENA la pantalla como la venta (parrilla de
 * productos + carrito), sin card flotando. Confirmar = db.addSale(fiar).
 * ──────────────────────────────────────────────────────────────────── */

const norm = (v) => String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
const initials = (name) => {
  const p = String(name || '').trim().split(/\s+/).filter(Boolean)
  return p.length ? p.slice(0, 2).map((x) => x[0]?.toUpperCase() || '').join('') : '—'
}
const normItems = (arr) => (Array.isArray(arr) ? arr : []).map((it) => ({
  productoId: Number(it.productoId), codigo: String(it.codigo || ''), nombre: String(it.nombre || 'Producto'),
  precio: Number(it.precio) || 0, cantidad: Math.max(1, Math.floor(Number(it.cantidad) || 1)),
})).filter((it) => it.productoId)

function FotoId({ ruta }) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    let alive = true
    const r = String(ruta || '').trim()
    if (!r) { setSrc(''); return }
    const api = typeof window !== 'undefined' ? window.bazar?.assets?.imageFileDataUrl : null
    if (api) { api(r).then((res) => { if (alive && res?.ok) setSrc(res.dataUrl) }).catch(() => {}) }
    return () => { alive = false }
  }, [ruta])
  if (!src) return <div className="fiar-idfoto fiar-idfoto--vacia"><IdCard size={22} strokeWidth={1.5} /><span>{ruta ? '…' : 'Sin ID'}</span></div>
  return <div className="fiar-idfoto"><img src={src} alt="Identificación" /></div>
}

export function AccionScreen({ onBack, onAbonar, onFiar }) {
  return (
    <div className="fiar2">
      <div className="fiar2-bar">
        <button type="button" className="fiar2-back" onClick={onBack} aria-label="Volver"><ArrowLeft size={20} strokeWidth={1.9} /></button>
        <div className="fiar2-titles"><strong>Abonar y fiar</strong><span>Elige qué vas a hacer con el cliente</span></div>
      </div>
      <div className="fiar2-accion">
        <button type="button" className="fiar2-half fiar2-half--abonar" onClick={onAbonar}>
          <span className="fiar2-half-ic"><CircleDollarSign size={42} strokeWidth={1.5} /></span>
          <span className="fiar2-half-nom">Abonar</span>
          <small>Registrar un pago a una deuda</small>
        </button>
        <button type="button" className="fiar2-half fiar2-half--fiar" onClick={onFiar}>
          <span className="fiar2-half-ic"><Handshake size={42} strokeWidth={1.5} /></span>
          <span className="fiar2-half-nom">Fiar</span>
          <small>Llevar mercancía a crédito</small>
        </button>
      </div>
    </div>
  )
}

export function FiarScreen({ clientes, productos, categorias, categoriasMeta, draftItems, clienteIdInicial, onSalir }) {
  const db = typeof window !== 'undefined' ? window.bazar?.db : undefined
  const importRef = useRef(null)
  if (importRef.current === null) importRef.current = normItems(draftItems)
  const importados = importRef.current.length > 0

  // Si vienes del cobro con cliente ya elegido, saltas directo a productos.
  const [step, setStep] = useState(clienteIdInicial ? 'productos' : 'cliente')
  const [clienteId, setClienteId] = useState(clienteIdInicial ? String(clienteIdInicial) : '')
  const [buscarCli, setBuscarCli] = useState('')
  const [cargandoCliente, setCargandoCliente] = useState(false)
  const [items, setItems] = useState(importRef.current)
  const [search, setSearch] = useState('')
  const [categoria, setCategoria] = useState('Todo')
  const [conEnganche, setConEnganche] = useState(false)
  const [engEfec, setEngEfec] = useState('')
  const [busy, setBusy] = useState(false)

  const lstClientes = useMemo(() => (Array.isArray(clientes) ? clientes : []), [clientes])
  const clienteSel = lstClientes.find((c) => String(c.id) === String(clienteId)) || null
  const qCli = norm(buscarCli)
  const resultados = useMemo(() => (qCli ? lstClientes.filter((c) => norm(c.nombre).includes(qCli)).slice(0, 10) : []), [lstClientes, qCli])

  const cats = Array.isArray(categorias) ? categorias : []
  const meta = categoriasMeta || {}
  const visibles = useMemo(() => {
    const nq = norm(search)
    let rows = Array.isArray(productos) ? productos : []
    if (categoria !== 'Todo') rows = rows.filter((p) => String(p.categoria || '').trim() === categoria)
    if (nq) rows = rows.filter((p) => norm(p.descripcion || '').includes(nq) || norm(p.codigo || '').includes(nq))
    return rows.slice(0, 80)
  }, [productos, categoria, search])

  const enSet = new Set(items.map((x) => x.productoId))
  const total = items.reduce((s, it) => s + it.precio * it.cantidad, 0)
  const enganche = conEnganche ? Math.min(total, Number(engEfec) || 0) : 0
  const quedaDebiendo = Math.max(0, total - enganche)
  const saldo = clienteSel ? Math.max(0, Number(clienteSel.saldo) || 0) : 0
  const favor = clienteSel ? Math.max(0, Number(clienteSel.saldoAFavor) || 0) : 0
  const nItems = items.reduce((s, it) => s + it.cantidad, 0)

  const seleccionar = (id) => {
    setClienteId(String(id))
    setCargandoCliente(true)
    window.setTimeout(() => setCargandoCliente(false), 450 + Math.floor(Math.random() * 500))
  }

  const addProducto = (p) => {
    if (!p?.id) return
    setItems((prev) => {
      const i = prev.findIndex((x) => x.productoId === p.id)
      if (i >= 0) { const n = [...prev]; n[i] = { ...n[i], cantidad: n[i].cantidad + 1 }; return n }
      return [...prev, { productoId: p.id, codigo: String(p.codigo || ''), nombre: String(p.descripcion || p.codigo || 'Producto'), precio: Number(p.precio) || 0, cantidad: 1 }]
    })
  }
  const cambiarCant = (pid, delta) => setItems((prev) => prev.flatMap((x) => {
    if (x.productoId !== pid) return [x]
    const n = x.cantidad + delta
    return n <= 0 ? [] : [{ ...x, cantidad: n }]
  }))
  const quitar = (pid) => setItems((prev) => prev.filter((x) => x.productoId !== pid))

  const confirmar = async () => {
    if (!clienteSel) { toast.error('Elige un cliente para fiar.'); setStep('cliente'); return }
    if (items.length === 0) { toast.error('Agrega productos para fiar.'); return }
    if (!db?.addSale) { toast.error('Sin conexión a la base de datos.'); return }
    setBusy(true)
    try {
      const res = await db.addSale({
        items: items.map((it) => ({ productoId: it.productoId, cantidad: it.cantidad })),
        pagos: { efectivo: enganche, transferencia: 0 },
        clienteId: clienteSel.id, fiar: true, notas: '',
      })
      if (!res?.ok) throw new Error('No se pudo registrar el fiado.')
      const debe = Number(res.faltante)
      toast.success(`Fiado registrado. ${clienteSel.nombre} queda debiendo ${formatPrice(Number.isFinite(debe) ? debe : quedaDebiendo)}.`)
      onSalir?.(true)
    } catch (e) { toast.error(e?.message || 'No se pudo registrar el fiado.') }
    finally { setBusy(false) }
  }

  const atras = () => (step === 'confirmar' ? setStep('productos') : step === 'productos' ? setStep('cliente') : onSalir?.(false))
  const cur = step === 'cliente' ? 1 : step === 'productos' ? 2 : 3

  return (
    <div className="fiar2">
      <div className="fiar2-bar">
        <button type="button" className="fiar2-back" onClick={atras} aria-label="Volver"><ArrowLeft size={20} strokeWidth={1.9} /></button>
        <div className="fiar2-titles"><strong>Sacar fiado</strong></div>
        {importados ? <span className="fiar-foco-badge"><span className="fiar-foco" /><Package size={14} strokeWidth={1.9} /> {nItems} del PDV</span> : null}
      </div>

      <div className="fiar2-stepper">
        <div className={`fiar2-stp${cur === 1 ? ' on' : cur > 1 ? ' done' : ''}`}><span className="fiar2-stp-n">{cur > 1 ? <Check size={14} strokeWidth={3} /> : 1}</span><span className="fiar2-stp-l">Cliente</span></div>
        <span className={`fiar2-stl${cur > 1 ? ' done' : ''}`} />
        <div className={`fiar2-stp${cur === 2 ? ' on' : cur > 2 ? ' done' : ''}`}><span className="fiar2-stp-n">{cur > 2 ? <Check size={14} strokeWidth={3} /> : 2}</span><span className="fiar2-stp-l">Productos</span></div>
        <span className={`fiar2-stl${cur > 2 ? ' done' : ''}`} />
        <div className={`fiar2-stp${cur === 3 ? ' on' : ''}`}><span className="fiar2-stp-n">3</span><span className="fiar2-stp-l">Confirmar</span></div>
      </div>

      {step === 'cliente' ? (
        <div className="fiar2-stage fiar2-stage--center">
          {cargandoCliente ? (
            <div className="fiar-loading"><span className="fiar-spinner" /> Cargando datos del cliente…</div>
          ) : clienteSel ? (
            <div className="fiar2-clientesel">
              <div className="fiar2-cs-head">
                <FotoId ruta={clienteSel.idImagen} />
                <div className="fiar2-cs-id">
                  <span className="fiar2-cs-tag">Cliente seleccionado</span>
                  <h3>{clienteSel.nombre}</h3>
                </div>
              </div>
              <dl className="fiar2-cs-tabla">
                <div><dt>Teléfono</dt><dd>{clienteSel.telefono || '—'}</dd></div>
                <div><dt>Saldo actual</dt><dd className={saldo > 0 ? 'is-debe' : ''}>{saldo > 0 ? `Debe ${formatPrice(saldo)}` : 'Al corriente'}</dd></div>
                <div><dt>Saldo a favor</dt><dd>{favor > 0 ? formatPrice(favor) : '—'}</dd></div>
                <div><dt>Identificación</dt><dd>{clienteSel.idImagen ? 'En archivo' : 'Sin ID registrada'}</dd></div>
              </dl>
              <div className="fiar2-pane-foot">
                <button type="button" className="fiar2-ghost" onClick={() => { setClienteId(''); setBuscarCli('') }}>Cambiar cliente</button>
                <button type="button" className="fiar2-primary" onClick={() => setStep('productos')}>Continuar <ArrowRight size={18} strokeWidth={2.1} /></button>
              </div>
            </div>
          ) : (
            <div className="fiar2-cli-inner">
              <h2 className="fiar2-cli-q">¿A quién le fías?</h2>
              <div className="fiar2-search">
                <Search size={22} strokeWidth={1.9} />
                <input autoFocus value={buscarCli} onChange={(e) => setBuscarCli(e.target.value)} placeholder="Escribe el nombre del cliente…" />
              </div>
              {qCli ? (
                resultados.length === 0 ? (
                  <div className="fiar-empty">Sin clientes para «{buscarCli}».</div>
                ) : (
                  <div className="fiar2-results">
                    {resultados.map((c) => {
                      const cd = Math.max(0, Number(c.saldo) || 0)
                      return (
                        <button type="button" key={c.id} className="fiar2-result" onClick={() => seleccionar(c.id)}>
                          <span className="fiar-avatar">{initials(c.nombre)}</span>
                          <span className="fiar2-result-nom">{c.nombre}</span>
                          <span className="fiar2-result-saldo">{cd > 0 ? `debe ${formatPrice(cd)}` : 'al corriente'}</span>
                          <ArrowRight size={16} strokeWidth={2} className="fiar2-result-go" />
                        </button>
                      )
                    })}
                  </div>
                )
              ) : (
                <div className="fiar2-cli-hint">Empieza a escribir para buscar al cliente.</div>
              )}
            </div>
          )}
        </div>
      ) : step === 'productos' ? (
        <div className="fiar2-prod">
          <section className="pos-products">
            <div className="pos-search-header">
              <div className="pos-search-bar">
                <Search size={22} strokeWidth={1.8} />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Busca un producto o escanea su código…" autoFocus />
              </div>
            </div>
            <div className="pos-categories">
              <div className="pos-cat-row">
                <button type="button" className={`pos-cat${categoria === 'Todo' ? ' is-active' : ''}`} onClick={() => setCategoria('Todo')}>Todo<span className="pos-cat__count">{(productos || []).length}</span></button>
                {cats.map((c) => {
                  const ic = emojiDe(c.nombre, meta)
                  return (
                    <button type="button" key={c.nombre} className={`pos-cat${categoria === c.nombre ? ' is-active' : ''}`} onClick={() => setCategoria(categoria === c.nombre ? 'Todo' : c.nombre)}>
                      {esRutaImagen(ic) ? <img className="pos-cat__img" src={fileUrl(ic)} alt="" /> : <span>{ic}</span>}{c.nombre}<span className="pos-cat__count">{c.count}</span>
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="pos-grid">
              {visibles.length === 0 ? (
                <div className="pos-grid__empty"><ShoppingBag size={42} strokeWidth={1.4} /><h3>Nada con ese filtro</h3><p>Prueba con otro nombre, código o categoría.</p></div>
              ) : visibles.map((p) => {
                const ic = emojiDe(p.categoria, meta)
                const prodImg = esRutaImagen(p.imagen_path) ? p.imagen_path : null
                const yaN = items.find((x) => x.productoId === p.id)?.cantidad || 0
                return (
                  <button type="button" key={p.id} className={`pos-card${enSet.has(p.id) ? ' fiar2-card--in' : ''}`} onClick={() => addProducto(p)}>
                    {yaN > 0 ? <span className="fiar2-card-badge">{yaN}</span> : null}
                    <span className="pos-card__img">
                      {prodImg ? <img className="pos-card__photo" src={fileUrl(prodImg)} alt="" />
                        : esRutaImagen(ic) ? <img className="pos-card__glyph" src={fileUrl(ic)} alt="" />
                        : <span>{ic}</span>}
                    </span>
                    <span className="pos-card__info">
                      <span className="pos-card__name">{p.descripcion || p.codigo}</span>
                      <span className="pos-card__price">{formatPrice(p.precio)}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </section>

          <aside className="pos-cart fiar2-cart">
            <div className="pos-cart__header fiar2-cart-head">
              <span className="fiar-avatar">{initials(clienteSel?.nombre)}</span>
              <div>
                <h2>Fiado de {clienteSel?.nombre || 'cliente'}</h2>
                <span className="fiar2-cart-sub">{saldo > 0 ? `Ya debe ${formatPrice(saldo)}` : 'Sin deuda previa'}</span>
              </div>
            </div>

            <div className="fiar2-cart-items">
              {items.length === 0 ? (
                <div className="fiar2-cart-empty"><ShoppingBag size={34} strokeWidth={1.4} /><p>Toca productos para fiarlos</p></div>
              ) : items.map((it) => (
                <div key={it.productoId} className="fiar2-line">
                  <span className="fiar2-line-nom">{it.nombre}</span>
                  <div className="fiar2-line-qty">
                    <button type="button" onClick={() => cambiarCant(it.productoId, -1)} aria-label="Menos"><Minus size={13} strokeWidth={2.3} /></button>
                    <span>{it.cantidad}</span>
                    <button type="button" onClick={() => cambiarCant(it.productoId, 1)} aria-label="Más"><Plus size={13} strokeWidth={2.3} /></button>
                  </div>
                  <span className="fiar2-line-sub">{formatPrice(it.precio * it.cantidad)}</span>
                  <button type="button" className="fiar2-line-x" onClick={() => quitar(it.productoId)} aria-label={`Quitar ${it.nombre}`}><X size={14} strokeWidth={2.2} /></button>
                </div>
              ))}
            </div>

            <div className="fiar2-cart-foot">
              <label className="fiar2-engtoggle">
                <input type="checkbox" checked={conEnganche} onChange={(e) => setConEnganche(e.target.checked)} /> ¿Dejó enganche?
              </label>
              {conEnganche ? (
                <input className="fiar2-eng-input" inputMode="decimal" value={engEfec} onChange={(e) => setEngEfec(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="Monto en efectivo" />
              ) : null}
              <div className="fiar2-tot-row"><span>Total</span><strong>{formatPrice(total)}</strong></div>
              <div className="fiar2-debe-row"><span>Queda debiendo</span><strong>{formatPrice(quedaDebiendo)}</strong></div>
              <button type="button" className="fiar2-confirm" disabled={items.length === 0} onClick={() => setStep('confirmar')}>
                Continuar <ArrowRight size={18} strokeWidth={2.1} />
              </button>
            </div>
          </aside>
        </div>
      ) : (
        <div className="fiar2-stage fiar2-stage--center">
          <div className="fiar2-resumen">
            <h2 className="fiar2-res-title">Revisa antes de fiar</h2>
            <div className="fiar2-res-cli">
              <FotoId ruta={clienteSel?.idImagen} />
              <div>
                <strong>{clienteSel?.nombre || '—'}</strong>
                <span>{clienteSel?.telefono || 'Sin teléfono'} · {saldo > 0 ? `ya debía ${formatPrice(saldo)}` : 'sin deuda previa'}</span>
              </div>
            </div>
            <table className="fiar2-res-tabla">
              <thead><tr><th>Cant.</th><th>Artículo</th><th>Precio</th><th>Importe</th></tr></thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.productoId}>
                    <td>{it.cantidad}</td>
                    <td>{it.nombre}</td>
                    <td>{formatPrice(it.precio)}</td>
                    <td>{formatPrice(it.precio * it.cantidad)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="fiar2-res-tot">
              <div className="fiar2-res-line"><span>Total de la compra</span><span>{formatPrice(total)}</span></div>
              {enganche > 0 ? <div className="fiar2-res-line is-eng"><span>Enganche en efectivo</span><span>− {formatPrice(enganche)}</span></div> : null}
              <div className="fiar2-res-debe"><span>Queda debiendo</span><strong>{formatPrice(quedaDebiendo)}</strong></div>
              <div className="fiar2-res-nuevo">Su nuevo saldo será <strong>{formatPrice(Math.round((saldo + quedaDebiendo) * 100) / 100)}</strong></div>
            </div>
          </div>
          <div className="fiar2-pane-foot">
            <button type="button" className="fiar2-ghost" onClick={() => setStep('productos')}>Atrás</button>
            <button type="button" className="fiar2-confirm" disabled={busy || items.length === 0} onClick={confirmar}>
              <Handshake size={19} strokeWidth={2} /> {busy ? 'Guardando…' : 'Confirmar fiado'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* Abonar (ligero): elegir cliente → registrar el pago. Reusa la lógica de Saldos
 * (registrarMovimientos tipo 'abono'); el saldo lo recalcula el motor. */
export function AbonarScreen({ clientes, onSalir }) {
  const saldosApi = typeof window !== 'undefined' ? window.bazar?.saldos : undefined
  const [step, setStep] = useState('cliente')
  const [clienteId, setClienteId] = useState('')
  const [buscar, setBuscar] = useState('')
  const [cargando, setCargando] = useState(false)
  const [monto, setMonto] = useState('')
  const [medio, setMedio] = useState('efectivo')
  const [busy, setBusy] = useState(false)

  const lst = useMemo(() => (Array.isArray(clientes) ? clientes : []), [clientes])
  const clienteSel = lst.find((c) => String(c.id) === String(clienteId)) || null
  const q = norm(buscar)
  const resultados = useMemo(() => (q ? lst.filter((c) => norm(c.nombre).includes(q)).slice(0, 10) : []), [lst, q])
  const saldo = clienteSel ? Math.max(0, Number(clienteSel.saldo) || 0) : 0
  const favor = clienteSel ? Math.max(0, Number(clienteSel.saldoAFavor) || 0) : 0
  const montoN = Number(monto) || 0
  const nuevoSaldo = Math.max(0, Math.round((saldo - montoN) * 100) / 100)

  const seleccionar = (id) => {
    setClienteId(String(id)); setCargando(true)
    window.setTimeout(() => { setCargando(false); setStep('abono') }, 450 + Math.floor(Math.random() * 400))
  }

  const confirmar = async () => {
    if (!clienteSel) { toast.error('Elige un cliente.'); setStep('cliente'); return }
    if (!(montoN > 0)) { toast.error('Escribe el monto del abono.'); return }
    if (!saldosApi?.registrarMovimientos) { toast.error('Saldos no disponible.'); return }
    setBusy(true)
    try {
      const d = new Date()
      const hoy = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const r = await saldosApi.registrarMovimientos({ clienteId: clienteSel.id, movimientos: [{ tipo: 'abono', fecha: hoy, monto: montoN, medio, concepto: 'Abono' }] })
      if (r && r.ok === false) throw new Error(r.message || 'No se pudo registrar el abono.')
      toast.success(`Abono de ${formatPrice(montoN)} de ${clienteSel.nombre}. ${nuevoSaldo > 0 ? `Ahora debe ${formatPrice(nuevoSaldo)}` : 'Queda al corriente'}.`)
      onSalir?.(true)
    } catch (e) { toast.error(e?.message || 'No se pudo registrar el abono.') }
    finally { setBusy(false) }
  }

  const atras = () => (step === 'abono' ? setStep('cliente') : onSalir?.(false))

  return (
    <div className="fiar2">
      <div className="fiar2-bar">
        <button type="button" className="fiar2-back" onClick={atras} aria-label="Volver"><ArrowLeft size={20} strokeWidth={1.9} /></button>
        <div className="fiar2-titles"><strong>Abonar</strong><span>{step === 'cliente' ? 'Elige el cliente' : 'Registra el pago'}</span></div>
      </div>
      <div className="fiar2-cli">
        <div className="fiar2-cli-inner">
          {step === 'cliente' ? (
            <>
              <h2 className="fiar2-cli-q">¿Quién va a abonar?</h2>
              <div className="fiar2-search">
                <Search size={22} strokeWidth={1.9} />
                <input autoFocus value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Escribe el nombre del cliente…" />
              </div>
              {cargando ? (
                <div className="fiar-loading"><span className="fiar-spinner" /> Cargando datos del cliente…</div>
              ) : q ? (
                resultados.length === 0 ? <div className="fiar-empty">Sin clientes para «{buscar}».</div> : (
                  <div className="fiar2-results">
                    {resultados.map((c) => {
                      const cd = Math.max(0, Number(c.saldo) || 0)
                      return (
                        <button type="button" key={c.id} className="fiar2-result" onClick={() => seleccionar(c.id)}>
                          <span className="fiar-avatar">{initials(c.nombre)}</span>
                          <span className="fiar2-result-nom">{c.nombre}</span>
                          <span className="fiar2-result-saldo">{cd > 0 ? `debe ${formatPrice(cd)}` : 'al corriente'}</span>
                          <ArrowRight size={16} strokeWidth={2} className="fiar2-result-go" />
                        </button>
                      )
                    })}
                  </div>
                )
              ) : (
                <div className="fiar2-cli-hint">Empieza a escribir para buscar al cliente.</div>
              )}
            </>
          ) : (
            <>
              <div className="fiar-sel-card">
                <FotoId ruta={clienteSel?.idImagen} />
                <div className="fiar-sel-info">
                  <strong>{clienteSel?.nombre}</strong>
                  <span className="fiar-sel-saldo">{saldo > 0 ? `Debe ${formatPrice(saldo)}` : favor > 0 ? `A favor ${formatPrice(favor)}` : 'Sin deuda'}</span>
                </div>
                <button type="button" className="fiar2-ghost" onClick={() => { setClienteId(''); setBuscar(''); setStep('cliente') }}>Cambiar</button>
              </div>
              <label className="fiar2-ab-label">Monto del abono</label>
              <input className="fiar2-ab-monto" inputMode="decimal" autoFocus value={monto} onChange={(e) => setMonto(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0" />
              <div className="fiar2-ab-medios">
                <button type="button" className={medio === 'efectivo' ? 'on' : ''} onClick={() => setMedio('efectivo')}><Banknote size={18} strokeWidth={1.9} /> Efectivo</button>
                <button type="button" className={medio === 'transferencia' ? 'on' : ''} onClick={() => setMedio('transferencia')}><Smartphone size={18} strokeWidth={1.9} /> Transferencia</button>
              </div>
              {montoN > 0 ? <div className="fiar2-ab-after">{nuevoSaldo > 0 ? `Quedará debiendo ${formatPrice(nuevoSaldo)}` : 'Quedará al corriente'}</div> : null}
              <button type="button" className="fiar2-confirm" disabled={busy || !(montoN > 0)} onClick={confirmar}><Check size={19} strokeWidth={2} /> {busy ? 'Guardando…' : 'Registrar abono'}</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
