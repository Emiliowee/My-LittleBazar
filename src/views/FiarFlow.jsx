import { useMemo, useRef, useState, useEffect } from 'react'
import { ArrowLeft, ArrowRight, Handshake, CircleDollarSign, Search, X, Plus, Minus, Package, IdCard, Check, ShoppingBag, Banknote, Smartphone } from 'lucide-react'
import { toast } from 'sonner'
import { formatPrice } from '@/lib/format'
import { emojiDeCategoria as emojiDe, esRutaImagen, rutaAFileUrl as fileUrl } from '@/lib/categoriaEmoji'
import { calcularCuentaSaldos } from '@/lib/saldosLedger'
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
const fechaCorta = (v) => {
  if (!v) return ''
  try { return new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short' }).format(new Date(`${String(v).slice(0, 10)}T12:00:00`)) }
  catch { return String(v).slice(0, 10) }
}
const normItems = (arr) => (Array.isArray(arr) ? arr : []).map((it) => ({
  productoId: Number(it.productoId), codigo: String(it.codigo || ''), nombre: String(it.nombre || 'Producto'),
  precio: Number(it.precio) || 0, cantidad: Math.max(1, Math.floor(Number(it.cantidad) || 1)),
  categoria: String(it.categoria || '').trim(), imagen: String(it.imagen || it.imagen_path || ''),
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
  const [codigo, setCodigo] = useState('')
  const [conEnganche, setConEnganche] = useState(false)
  const [engEfec, setEngEfec] = useState('')
  const [valeInput, setValeInput] = useState('')
  const [valeInfo, setValeInfo] = useState(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const lstClientes = useMemo(() => (Array.isArray(clientes) ? clientes : []), [clientes])
  const clienteSel = lstClientes.find((c) => String(c.id) === String(clienteId)) || null
  const qCli = norm(buscarCli)
  const resultados = useMemo(() => (qCli ? lstClientes.filter((c) => norm(c.nombre).includes(qCli)).slice(0, 10) : []), [lstClientes, qCli])

  const meta = categoriasMeta || {}
  // Productos a fiar agrupados por categoría (como el boceto del usuario).
  const grupos = useMemo(() => {
    const m = new Map()
    for (const it of items) { const c = String(it.categoria || '').trim() || 'Otros'; if (!m.has(c)) m.set(c, []); m.get(c).push(it) }
    return [...m.entries()]
  }, [items])

  const total = items.reduce((s, it) => s + it.precio * it.cantidad, 0)
  const saldo = clienteSel ? Math.max(0, Number(clienteSel.saldo) || 0) : 0
  const favor = clienteSel ? Math.max(0, Number(clienteSel.saldoAFavor) || 0) : 0
  // Vale y saldo a favor bajan lo que se debe (mismo orden que addSale); el resto es la deuda.
  const valeDisp = valeInfo ? Math.max(0, Number(valeInfo.disponible) || 0) : 0
  const valeAplica = Math.round(Math.min(valeDisp, total) * 100) / 100
  const adeudadoTrasVale = Math.max(0, Math.round((total - valeAplica) * 100) / 100)
  const favorAplica = Math.round(Math.min(favor, adeudadoTrasVale) * 100) / 100
  const adeudadoTrasFavor = Math.max(0, Math.round((adeudadoTrasVale - favorAplica) * 100) / 100)
  const enganche = conEnganche ? Math.min(adeudadoTrasFavor, Number(engEfec) || 0) : 0
  const quedaDebiendo = Math.max(0, Math.round((adeudadoTrasFavor - enganche) * 100) / 100)
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
      return [...prev, { productoId: p.id, codigo: String(p.codigo || ''), nombre: String(p.descripcion || p.codigo || 'Producto'), precio: Number(p.precio) || 0, cantidad: 1, categoria: String(p.categoria || '').trim(), imagen: String(p.imagen_path || '') }]
    })
  }
  const addCodigo = async () => {
    const c = String(codigo).trim()
    if (!c) return
    if (!db?.getProductByCodigo) { toast.error('Sin conexión al inventario.'); return }
    try {
      const p = await db.getProductByCodigo(c)
      if (!p?.id) { toast.error(`Sin resultados para «${c}».`); return }
      if (String(p.estado || 'disponible') !== 'disponible') { toast.error(`«${p.codigo}» no está disponible.`); return }
      addProducto(p); setCodigo('')
    } catch { toast.error('No se pudo agregar el artículo.') }
  }
  const aplicarVale = async () => {
    const code = String(valeInput).trim()
    if (!code) return
    if (!db?.buscarVale) { toast.error('Los vales son solo en la app de escritorio.'); return }
    try {
      const v = await db.buscarVale(code)
      if (!v) { toast.error('Ese vale no existe.'); return }
      if (!v.activo) { toast.error('Ese vale ya no tiene saldo.'); return }
      setValeInfo(v); toast.success(`Vale ${v.codigo}: ${formatPrice(v.disponible)} disponible.`)
    } catch { toast.error('No se pudo buscar el vale.') }
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
      const valePago = valeInfo && valeAplica > 0 ? { codigo: valeInfo.codigo, monto: valeAplica } : undefined
      const res = await db.addSale({
        items: items.map((it) => ({ productoId: it.productoId, cantidad: it.cantidad })),
        pagos: { efectivo: enganche, transferencia: 0, vale: valePago },
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
        <button type="button" className="fiar2-back" onClick={atras} aria-label="Volver"><ArrowLeft size={18} strokeWidth={2} /></button>
        <div className="fiar2-stepper">
          <div className={`fiar2-stp${cur === 1 ? ' on' : cur > 1 ? ' done' : ''}`}><span className="fiar2-stp-n">{cur > 1 ? <Check size={13} strokeWidth={3} /> : 1}</span><span className="fiar2-stp-l">Cliente</span></div>
          <span className={`fiar2-stl${cur > 1 ? ' done' : ''}`} />
          <div className={`fiar2-stp${cur === 2 ? ' on' : cur > 2 ? ' done' : ''}`}><span className="fiar2-stp-n">{cur > 2 ? <Check size={13} strokeWidth={3} /> : 2}</span><span className="fiar2-stp-l">Productos</span></div>
          <span className={`fiar2-stl${cur > 2 ? ' done' : ''}`} />
          <div className={`fiar2-stp${cur === 3 ? ' on' : ''}`}><span className="fiar2-stp-n">3</span><span className="fiar2-stp-l">Confirmar</span></div>
        </div>
        {importados ? <span className="fiar-foco-badge"><span className="fiar-foco" /><Package size={14} strokeWidth={1.9} /> {nItems} del PDV</span> : <span className="fiar2-bar-pad" />}
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
        <div className="fiar2-prod2">
          <div className="fiar2-prod2-main">
            {items.length === 0 ? (
              <div className="fiar2-prod2-empty"><ShoppingBag size={40} strokeWidth={1.4} /><p>Aún no hay productos a fiar</p><span>Agrégalos con «+ Agregar productos» o el código de la derecha.</span></div>
            ) : grupos.map(([cat, its]) => (
              <div key={cat} className="fiar2-cat">
                <h3 className="fiar2-cat-h">{cat}</h3>
                <div className="fiar2-cat-grid">
                  {its.map((it) => {
                    const ic = emojiDe(it.categoria, meta)
                    const prodImg = esRutaImagen(it.imagen) ? it.imagen : null
                    return (
                      <div key={it.productoId} className="fiar2-fc">
                        <button type="button" className="fiar2-fc-x" onClick={() => quitar(it.productoId)} aria-label={`Quitar ${it.nombre}`}><X size={13} strokeWidth={2.6} /></button>
                        <span className="fiar2-fc-img">
                          {prodImg ? <img src={fileUrl(prodImg)} alt="" />
                            : esRutaImagen(ic) ? <img src={fileUrl(ic)} alt="" />
                            : <span>{ic}</span>}
                        </span>
                        <span className="fiar2-fc-nom">{it.nombre}</span>
                        <div className="fiar2-fc-foot">
                          <div className="fiar2-fc-qty">
                            <button type="button" onClick={() => cambiarCant(it.productoId, -1)} aria-label="Menos"><Minus size={12} strokeWidth={2.6} /></button>
                            <span>{it.cantidad}</span>
                            <button type="button" onClick={() => cambiarCant(it.productoId, 1)} aria-label="Más"><Plus size={12} strokeWidth={2.6} /></button>
                          </div>
                          <span className="fiar2-fc-precio">{formatPrice(it.precio * it.cantidad)}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
            <button type="button" className="fiar2-fc-add" onClick={() => setPickerOpen(true)}><Plus size={26} strokeWidth={1.8} /><span>Agregar productos</span></button>
            <div className="fiar2-prod2-total">TOTAL: <strong>{formatPrice(total)}</strong></div>
          </div>

          <aside className="fiar2-prod2-side">
            <div className="fiar2-side-cuenta">
              <span className="fiar2-side-tag">Cuenta del cliente</span>
              <strong>{clienteSel?.nombre || '—'}</strong>
              <span className="fiar2-side-saldo">{saldo > 0 ? `Ya debe ${formatPrice(saldo)}` : 'Sin deuda previa'}</span>
            </div>

            <label className="fiar2-side-label" htmlFor="fiar2-cod">Ingresar código del artículo</label>
            <div className="fiar2-side-code">
              <input id="fiar2-cod" value={codigo} onChange={(e) => setCodigo(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addCodigo() }} placeholder="Código…" />
              <button type="button" onClick={addCodigo} aria-label="Agregar"><Plus size={16} strokeWidth={2.2} /></button>
            </div>
            <small className="fiar2-side-hint">Si se escanea con el lector, se mete automático.</small>

            <label className="fiar2-side-check">
              <input type="checkbox" checked={conEnganche} onChange={(e) => setConEnganche(e.target.checked)} /> Enganche
            </label>
            {conEnganche ? (
              <input className="fiar2-side-input" inputMode="decimal" value={engEfec} onChange={(e) => setEngEfec(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="Monto en efectivo" />
            ) : null}

            {favor > 0 ? (
              <div className="fiar2-side-favor">Saldo a favor: <strong>{formatPrice(favor)}</strong> <em>se aplicará</em></div>
            ) : null}

            <div className="fiar2-side-valebox">
              <span className="fiar2-side-label">Vale</span>
              {valeInfo ? (
                <div className="fiar2-side-valechip">Vale {valeInfo.codigo} · −{formatPrice(valeAplica)}<button type="button" onClick={() => { setValeInfo(null); setValeInput('') }} aria-label="Quitar vale"><X size={13} strokeWidth={2.4} /></button></div>
              ) : (
                <div className="fiar2-side-code">
                  <input value={valeInput} onChange={(e) => setValeInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') aplicarVale() }} placeholder="Código de vale" />
                  <button type="button" onClick={aplicarVale}>Usar</button>
                </div>
              )}
            </div>

            <div className="fiar2-side-debe"><span>Queda debiendo</span><strong>{formatPrice(quedaDebiendo)}</strong></div>
            <button type="button" className="fiar2-confirm" disabled={items.length === 0} onClick={() => setStep('confirmar')}>Continuar <ArrowRight size={18} strokeWidth={2.1} /></button>
          </aside>

          {pickerOpen ? <ProductoPicker productos={productos} categorias={categorias} categoriasMeta={categoriasMeta} yaEn={items} onAdd={addProducto} onClose={() => setPickerOpen(false)} /> : null}
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
              {valeAplica > 0 ? <div className="fiar2-res-line is-eng"><span>Vale {valeInfo?.codigo}</span><span>− {formatPrice(valeAplica)}</span></div> : null}
              {favorAplica > 0 ? <div className="fiar2-res-line is-eng"><span>Saldo a favor</span><span>− {formatPrice(favorAplica)}</span></div> : null}
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

/* Selector de productos por categoría (modal que abre el botón "+"). */
function ProductoPicker({ productos, categorias, categoriasMeta, yaEn, onAdd, onClose }) {
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('Todo')
  const meta = categoriasMeta || {}
  const cats = Array.isArray(categorias) ? categorias : []
  const enSet = new Set((yaEn || []).map((x) => x.productoId))
  const visibles = useMemo(() => {
    const nq = norm(q)
    let rows = Array.isArray(productos) ? productos : []
    if (cat !== 'Todo') rows = rows.filter((p) => String(p.categoria || '').trim() === cat)
    if (nq) rows = rows.filter((p) => norm(p.descripcion || '').includes(nq) || norm(p.codigo || '').includes(nq))
    return rows.slice(0, 80)
  }, [productos, cat, q])
  return (
    <div className="fiar2-picker-ov" onClick={onClose}>
      <div className="fiar2-picker" role="dialog" aria-label="Agregar productos" onClick={(e) => e.stopPropagation()}>
        <div className="fiar2-picker-head"><strong>Agregar productos</strong><button type="button" onClick={onClose} aria-label="Cerrar"><X size={18} /></button></div>
        <div className="fiar2-picker-search"><Search size={16} strokeWidth={1.9} /><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar producto o código…" /></div>
        <div className="fiar2-picker-cats">
          <button type="button" className={cat === 'Todo' ? 'on' : ''} onClick={() => setCat('Todo')}>Todo</button>
          {cats.map((c) => <button type="button" key={c.nombre} className={cat === c.nombre ? 'on' : ''} onClick={() => setCat(c.nombre)}>{c.nombre} <em>{c.count}</em></button>)}
        </div>
        <div className="fiar2-picker-grid">
          {visibles.length === 0 ? <div className="fiar-empty">Sin productos.</div> : visibles.map((p) => {
            const ic = emojiDe(p.categoria, meta)
            const prodImg = esRutaImagen(p.imagen_path) ? p.imagen_path : null
            const added = enSet.has(p.id)
            return (
              <button type="button" key={p.id} className={`fiar2-pk-card${added ? ' is-added' : ''}`} onClick={() => onAdd(p)}>
                <span className="fiar2-pk-img">{prodImg ? <img src={fileUrl(prodImg)} alt="" /> : esRutaImagen(ic) ? <img src={fileUrl(ic)} alt="" /> : <span>{ic}</span>}</span>
                <span className="fiar2-pk-nom">{p.descripcion || p.codigo}</span>
                <span className="fiar2-pk-foot"><span className="fiar2-pk-precio">{formatPrice(p.precio)}</span><span className="fiar2-pk-act">{added ? <Check size={14} strokeWidth={2.6} /> : <Plus size={14} strokeWidth={2.4} />}</span></span>
              </button>
            )
          })}
        </div>
        <div className="fiar2-picker-foot"><span>{(yaEn || []).length} producto{(yaEn || []).length === 1 ? '' : 's'} en el fiado</span><button type="button" className="fiar2-confirm" onClick={onClose}>Listo</button></div>
      </div>
    </div>
  )
}

/* Abonar (ligero): elegir cliente → registrar el pago. Reusa la lógica de Saldos
 * (registrarMovimientos tipo 'abono'); el saldo lo recalcula el motor. */
export function AbonarScreen({ clientes, onSalir }) {
  const saldosApi = typeof window !== 'undefined' ? window.bazar?.saldos : undefined
  const hoyIso = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })()
  const [step, setStep] = useState('cliente')
  const [clienteId, setClienteId] = useState('')
  const [buscar, setBuscar] = useState('')
  const [cargando, setCargando] = useState(false)
  const [monto, setMonto] = useState('')
  const [medio, setMedio] = useState('efectivo')
  const [fecha, setFecha] = useState(hoyIso)
  const [quienPago, setQuienPago] = useState('')
  const [nota, setNota] = useState('')
  const [masOpciones, setMasOpciones] = useState(false)
  const [cargos, setCargos] = useState([]) // detalle de la deuda (cargos abiertos) del cliente
  const [busy, setBusy] = useState(false)

  const lst = useMemo(() => (Array.isArray(clientes) ? clientes : []), [clientes])
  const clienteSel = lst.find((c) => String(c.id) === String(clienteId)) || null
  const q = norm(buscar)
  const resultados = useMemo(() => (q ? lst.filter((c) => norm(c.nombre).includes(q)).slice(0, 10) : []), [lst, q])
  const saldo = clienteSel ? Math.max(0, Number(clienteSel.saldo) || 0) : 0
  const favor = clienteSel ? Math.max(0, Number(clienteSel.saldoAFavor) || 0) : 0
  const montoN = Number(monto) || 0
  // El abono se TOPA a la deuda (nunca genera saldo a favor). Si paga de más, el
  // sobrante es CAMBIO en efectivo que se le entrega; no queda como crédito.
  const abonoReal = Math.min(montoN, saldo)
  const cambio = Math.max(0, Math.round((montoN - saldo) * 100) / 100)
  const nuevoSaldo = Math.max(0, Math.round((saldo - abonoReal) * 100) / 100)
  const cur = step === 'cliente' ? 1 : 2

  const seleccionar = async (id) => {
    setClienteId(String(id)); setCargando(true); setCargos([])
    try {
      const cuentas = await saldosApi?.listCuentas?.({ incluirArchivadas: false })
      const c = (Array.isArray(cuentas) ? cuentas : []).find((x) => String(x.id) === String(id))
      if (c) { const r = calcularCuentaSaldos(c); setCargos((r.cargos || []).filter((cg) => (Number(cg.saldo) || 0) > 0.005)) }
    } catch { /* sin detalle: el saldo total igual se muestra */ }
    window.setTimeout(() => { setCargando(false); setStep('abono') }, 450 + Math.floor(Math.random() * 400))
  }
  const cambiar = () => { setClienteId(''); setBuscar(''); setStep('cliente'); setCargos([]) }
  const tecla = (d) => setMonto((s) => {
    if (d === 'back') return s.slice(0, -1)
    if (d === '00') return s === '' ? '' : s + '00'
    if (d === '.') return s.includes('.') ? s : (s === '' ? '0.' : s + '.')
    const next = s + d
    if (/^\d*\.?\d{0,2}$/.test(next)) return next.replace(/^0+(?=\d)/, '')
    return s
  })

  const confirmar = async () => {
    if (!clienteSel) { toast.error('Elige un cliente.'); setStep('cliente'); return }
    if (saldo <= 0) { toast.error('Este cliente no tiene deuda que abonar.'); return }
    if (!(montoN > 0)) { toast.error('Escribe el monto del abono.'); return }
    if (!saldosApi?.registrarMovimientos) { toast.error('Saldos no disponible.'); return }
    setBusy(true)
    try {
      // Se registra solo lo que cubre la deuda (abonoReal); el sobrante es cambio, no se guarda como crédito.
      const r = await saldosApi.registrarMovimientos({ clienteId: clienteSel.id, movimientos: [{ tipo: 'abono', fecha, monto: abonoReal, medio, concepto: 'Abono general', quienPago: quienPago.trim(), nota: nota.trim() }] })
      if (r && r.ok === false) throw new Error(r.message || 'No se pudo registrar el abono.')
      const colita = cambio > 0 ? ` Entrega ${formatPrice(cambio)} de cambio.` : ''
      toast.success(`Abono de ${formatPrice(abonoReal)} de ${clienteSel.nombre}. ${nuevoSaldo > 0 ? `Ahora debe ${formatPrice(nuevoSaldo)}.` : 'Queda al corriente.'}${colita}`)
      onSalir?.(true)
    } catch (e) { toast.error(e?.message || 'No se pudo registrar el abono.') }
    finally { setBusy(false) }
  }

  const atras = () => (step === 'abono' ? setStep('cliente') : onSalir?.(false))

  return (
    <div className="fiar2">
      <div className="fiar2-bar">
        <button type="button" className="fiar2-back" onClick={atras} aria-label="Volver"><ArrowLeft size={18} strokeWidth={2} /></button>
        <div className="fiar2-stepper fiar2-stepper--green">
          <div className={`fiar2-stp${cur === 1 ? ' on' : ' done'}`}><span className="fiar2-stp-n">{cur > 1 ? <Check size={13} strokeWidth={3} /> : 1}</span><span className="fiar2-stp-l">Cliente</span></div>
          <span className={`fiar2-stl${cur > 1 ? ' done' : ''}`} />
          <div className={`fiar2-stp${cur === 2 ? ' on' : ''}`}><span className="fiar2-stp-n">2</span><span className="fiar2-stp-l">Abono</span></div>
        </div>
        <span className="fiar2-bar-pad" />
      </div>

      {step === 'cliente' ? (
        <div className="fiar2-stage fiar2-stage--center">
          <div className="fiar2-cli-inner">
            <h2 className="fiar2-cli-q">¿Quién va a abonar?</h2>
            <div className="fiar2-search">
              <Search size={22} strokeWidth={1.9} />
              <input autoFocus value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Escribe el nombre del cliente…" />
            </div>
            {cargando ? (
              <div className="fiar-loading"><span className="fiar-spinner fiar-spinner--green" /> Cargando datos del cliente…</div>
            ) : q ? (
              resultados.length === 0 ? <div className="fiar-empty">Sin clientes para «{buscar}».</div> : (
                <div className="fiar2-results">
                  {resultados.map((c) => {
                    const cd = Math.max(0, Number(c.saldo) || 0)
                    return (
                      <button type="button" key={c.id} className="fiar2-result fiar2-result--green" onClick={() => seleccionar(c.id)}>
                        <span className="fiar-avatar fiar-avatar--green">{initials(c.nombre)}</span>
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
        </div>
      ) : (
        <div className="fiar2-abono2">
          <section className="fiar2-ab-pad">
            <div className="fiar2-ab-pad-q">¿Cuánto paga <strong>{clienteSel?.nombre || 'el cliente'}</strong>?</div>
            <div className="fiar2-ab-display"><span className="cur">$</span><span className="amt">{monto || '0'}</span></div>
            <div className="fiar2-ab-quick">
              {saldo > 0 ? <button type="button" onClick={() => setMonto(String(saldo))}><Check size={14} strokeWidth={2.6} /> Liquidar todo · {formatPrice(saldo)}</button> : null}
              {saldo >= 100 ? <button type="button" onClick={() => setMonto(String(Math.round(saldo / 2)))}>La mitad · {formatPrice(Math.round(saldo / 2))}</button> : null}
            </div>
            <div className="numpad-grid fiar2-ab-numpad">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0'].map((d) => <button type="button" key={d} className="numpad-btn" onClick={() => tecla(d)}>{d}</button>)}
              <button type="button" className="numpad-btn numpad-del" onClick={() => tecla('back')} aria-label="Borrar"><X size={20} strokeWidth={2.4} /></button>
            </div>
          </section>

          <aside className="fiar2-ab-side2">
            <div className="fiar2-ab-cli2">
              <div className="fiar2-ab-cli2-name">{clienteSel?.nombre || '—'}</div>
              <div className={`fiar2-ab-cli2-bal ${saldo > 0 ? 'is-debe' : 'is-ok'}`}>{saldo > 0 ? formatPrice(saldo) : favor > 0 ? formatPrice(favor) : '$0'}</div>
              <div className="fiar2-ab-cli2-lbl">{saldo > 0 ? 'DEUDA ACTUAL' : favor > 0 ? 'SALDO A FAVOR' : 'AL CORRIENTE'}</div>
              <button type="button" className="fiar2-link fiar2-link--green" onClick={cambiar}>Cambiar cliente</button>
            </div>

            {saldo > 0 && cargos.length > 0 ? (
              <div className="fiar2-ab-deuda">
                <span className="fiar2-ab-deuda-h">Le debe por</span>
                <div className="fiar2-ab-deuda-list">
                  {cargos.map((cg) => {
                    const dias = Number(cg.dias) || 0
                    const venc = dias >= 30 ? 'vencido' : dias >= 25 ? 'por vencer' : ''
                    return (
                      <div key={cg.id} className="fiar2-ab-deuda-row">
                        <span className="fiar2-ab-deuda-nom">{cg.concepto || cg.articulo || 'Cargo'}<em className="fiar2-ab-deuda-fecha">{fechaCorta(cg.fecha)}{venc ? ` · ${venc}` : ''}</em></span>
                        <span className={`fiar2-ab-deuda-mon${dias >= 30 ? ' is-venc' : ''}`}>{formatPrice(cg.saldo)}</span>
                      </div>
                    )
                  })}
                </div>
                <span className="fiar2-ab-deuda-note">El abono se aplica primero a lo más antiguo.</span>
              </div>
            ) : null}

            <div className="fiar2-ab-medios">
              <button type="button" className={medio === 'efectivo' ? 'on' : ''} onClick={() => setMedio('efectivo')}><Banknote size={20} strokeWidth={2} /> Efectivo</button>
              <button type="button" className={medio === 'transferencia' ? 'on' : ''} onClick={() => setMedio('transferencia')}><Smartphone size={20} strokeWidth={2} /> Transferencia</button>
            </div>

            <div className={`fiar2-ab-after2${montoN > 0 && nuevoSaldo === 0 ? ' is-ok' : ''}`}>
              <span>{montoN > 0 ? (nuevoSaldo > 0 ? 'Quedará debiendo' : 'Quedará al corriente') : (saldo > 0 ? 'Debe' : 'Sin deuda')}</span>
              <strong>{montoN > 0 ? (nuevoSaldo > 0 ? formatPrice(nuevoSaldo) : '✓') : formatPrice(saldo)}</strong>
            </div>
            {cambio > 0 ? <div className="fiar2-ab-cambio"><span>Cambio a entregar</span><strong>{formatPrice(cambio)}</strong></div> : null}

            <button type="button" className="fiar2-ab-more" onClick={() => setMasOpciones((v) => !v)}>{masOpciones ? '▲ Ocultar' : '▼ Más datos'} · fecha, quién pagó, nota</button>
            {masOpciones ? (
              <div className="fiar2-ab-extra">
                <label className="fiar2-ab-field"><span>Fecha</span><input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></label>
                <label className="fiar2-ab-field"><span>Quién pagó</span><input value={quienPago} onChange={(e) => setQuienPago(e.target.value)} placeholder="Ej. su hermana" /></label>
                <label className="fiar2-ab-field"><span>Nota</span><input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Comentario…" /></label>
              </div>
            ) : null}

            <button type="button" className="fiar2-confirm fiar2-confirm--green fiar2-ab-confirm" disabled={busy || saldo <= 0 || !(montoN > 0)} onClick={confirmar}><Check size={20} strokeWidth={2.2} /> {busy ? 'Guardando…' : 'Confirmar abono'}</button>
          </aside>
        </div>
      )}
    </div>
  )
}
