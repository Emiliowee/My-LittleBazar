import { Fragment, useMemo, useRef, useState, useEffect } from 'react'
import { ArrowLeft, ArrowRight, Handshake, CircleDollarSign, Search, X, Plus, Minus, Package, IdCard, Check, ShoppingBag } from 'lucide-react'
import { toast } from 'sonner'
import { formatPrice } from '@/lib/format'
import './fiar-flow.css'

/* ─────────────────────────────────────────────────────────────────────
 * Flujo Fiar — vive DENTRO del PDV (pestaña del sliderbar y destino del
 * botón Fiar del cobro). Usa el lenguaje premium .pos-tool (panel centrado),
 * con stepper de avance. Confirmar = window.bazar.db.addSale(fiar).
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
    <div className="pos-tool">
      <div className="pos-tool__panel pos-tool__panel--narrow">
        <div className="pos-tool__head">
          <div className="pos-tool__title">
            <button type="button" className="pos-tool__back" onClick={onBack} aria-label="Volver"><ArrowLeft size={18} /></button>
            <div>
              <h2>Abonar y fiar</h2>
              <p>Elige qué vas a hacer con el cliente</p>
            </div>
          </div>
        </div>
        <div className="fiar-accion-grid">
          <button type="button" className="fiar-accion-card" onClick={onAbonar}>
            <span className="fiar-accion-ic fiar-accion-ic--abonar"><CircleDollarSign size={30} strokeWidth={1.7} /></span>
            <span className="fiar-accion-nom">Abonar</span>
            <small>Registrar un pago a una deuda</small>
          </button>
          <button type="button" className="fiar-accion-card fiar-accion-card--fiar" onClick={onFiar}>
            <span className="fiar-accion-ic fiar-accion-ic--fiar"><Handshake size={30} strokeWidth={1.7} /></span>
            <span className="fiar-accion-nom">Fiar</span>
            <small>Llevar mercancía a crédito</small>
          </button>
        </div>
      </div>
    </div>
  )
}

const STEPS = [{ n: 1, label: 'Cliente' }, { n: 2, label: 'Productos' }, { n: 3, label: 'Confirmar' }]

export function FiarScreen({ clientes, productos, categorias, draftItems, onSalir }) {
  const db = typeof window !== 'undefined' ? window.bazar?.db : undefined
  const importRef = useRef(null)
  if (importRef.current === null) importRef.current = normItems(draftItems)
  const importados = importRef.current.length > 0

  const [step, setStep] = useState(1)
  const [clienteId, setClienteId] = useState('')
  const [buscar, setBuscar] = useState('')
  const [cargandoCliente, setCargandoCliente] = useState(false)
  const [items, setItems] = useState(importRef.current)
  const [codigo, setCodigo] = useState('')
  const [conEnganche, setConEnganche] = useState(false)
  const [engEfec, setEngEfec] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const lstClientes = useMemo(() => (Array.isArray(clientes) ? clientes : []), [clientes])
  const clienteSel = lstClientes.find((c) => String(c.id) === String(clienteId)) || null
  const q = norm(buscar)
  const resultados = useMemo(() => (q ? lstClientes.filter((c) => norm(c.nombre).includes(q)).slice(0, 8) : []), [lstClientes, q])

  const total = items.reduce((s, it) => s + it.precio * it.cantidad, 0)
  const enganche = conEnganche ? Math.min(total, Number(engEfec) || 0) : 0
  const quedaDebiendo = Math.max(0, total - enganche)
  const saldo = clienteSel ? Math.max(0, Number(clienteSel.saldo) || 0) : 0
  const favor = clienteSel ? Math.max(0, Number(clienteSel.saldoAFavor) || 0) : 0

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

  const cambiarCant = (pid, delta) => setItems((prev) => prev.flatMap((x) => {
    if (x.productoId !== pid) return [x]
    const n = x.cantidad + delta
    return n <= 0 ? [] : [{ ...x, cantidad: n }]
  }))
  const quitar = (pid) => setItems((prev) => prev.filter((x) => x.productoId !== pid))

  const confirmar = async () => {
    if (!clienteSel) { toast.error('Elige un cliente para fiar.'); setStep(1); return }
    if (items.length === 0) { toast.error('Agrega productos para fiar.'); setStep(2); return }
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

  const atras = () => (step > 1 ? setStep(step - 1) : onSalir?.(false))

  return (
    <div className="pos-tool">
      <div className="pos-tool__panel fiar-panel">
        <div className="pos-tool__head">
          <div className="pos-tool__title">
            <button type="button" className="pos-tool__back" onClick={atras} aria-label="Volver"><ArrowLeft size={18} /></button>
            <div>
              <h2>Sacar fiado</h2>
              <p>{importados ? `${items.length} producto${items.length === 1 ? '' : 's'} traídos del punto de venta` : 'Llevar mercancía a crédito'}</p>
            </div>
          </div>
          {importados ? <span className="fiar-foco-badge"><span className="fiar-foco" /><Package size={14} strokeWidth={1.9} /> importado</span> : null}
        </div>

        <div className="fiar-steps">
          {STEPS.map((s, i) => (
            <Fragment key={s.n}>
              {i > 0 ? <span className={`fiar-stepline${step > i ? ' is-done' : ''}`} /> : null}
              <div className={`fiar-step${step === s.n ? ' is-active' : step > s.n ? ' is-done' : ''}`}>
                <span className="fiar-stepnum">{step > s.n ? <Check size={14} strokeWidth={3} /> : s.n}</span>
                <span className="fiar-steplbl">{s.label}</span>
              </div>
            </Fragment>
          ))}
        </div>

        <div className="fiar-stage">
          {step === 1 ? (
            cargandoCliente ? (
              <div className="fiar-loading"><span className="fiar-spinner" /> Cargando datos del cliente…</div>
            ) : clienteSel ? (
              <div className="fiar-sel-card">
                <FotoId ruta={clienteSel.idImagen} />
                <div className="fiar-sel-info">
                  <strong>{clienteSel.nombre}</strong>
                  <span>{clienteSel.telefono || 'Sin teléfono'}</span>
                  <span className="fiar-sel-saldo">{saldo > 0 ? `Ya debe ${formatPrice(saldo)}` : 'Sin deuda previa'}{favor > 0 ? ` · a favor ${formatPrice(favor)}` : ''}</span>
                </div>
                <button type="button" className="pos-tool__ghost" onClick={() => { setClienteId(''); setBuscar('') }}>Cambiar</button>
              </div>
            ) : (
              <div className="fiar-clientepick">
                <div className="fiar-bigsearch">
                  <Search size={20} strokeWidth={1.9} />
                  <input autoFocus value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Escribe el nombre del cliente…" />
                </div>
                {q ? (
                  resultados.length === 0 ? (
                    <div className="fiar-empty">Sin clientes para «{buscar}».</div>
                  ) : (
                    <div className="fiar-results">
                      {resultados.map((c) => {
                        const cd = Math.max(0, Number(c.saldo) || 0)
                        return (
                          <button type="button" key={c.id} className="fiar-result" onClick={() => seleccionar(c.id)}>
                            <span className="fiar-avatar">{initials(c.nombre)}</span>
                            <span className="fiar-result-nom">{c.nombre}</span>
                            <span className="fiar-result-saldo">{cd > 0 ? `debe ${formatPrice(cd)}` : 'al corriente'}</span>
                          </button>
                        )
                      })}
                    </div>
                  )
                ) : (
                  <div className="fiar-searchhint">Busca al cliente por su nombre y selecciónalo de la lista.</div>
                )}
              </div>
            )
          ) : step === 2 ? (
            <div className="fiar-prodstep">
              <div className="fiar-prodbar">
                <button type="button" className="fiar-addbtn" onClick={() => setPickerOpen(true)}><Plus size={16} strokeWidth={2.2} /> Agregar productos</button>
                <div className="fiar-codebox">
                  <input value={codigo} onChange={(e) => setCodigo(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addCodigo() }} placeholder="o escanea / teclea el código…" />
                </div>
              </div>
              {items.length === 0 ? (
                <div className="fiar-empty fiar-empty--big"><ShoppingBag size={30} strokeWidth={1.4} /><p>Aún no hay productos a fiar.</p><span>Usa «Agregar productos» o el lector de código.</span></div>
              ) : (
                <div className="fiar-items">
                  {items.map((it) => (
                    <div key={it.productoId} className="fiar-item">
                      <span className="fiar-item-nom">{it.nombre}</span>
                      <div className="fiar-item-qty">
                        <button type="button" onClick={() => cambiarCant(it.productoId, -1)} aria-label="Menos"><Minus size={14} strokeWidth={2.2} /></button>
                        <span>{it.cantidad}</span>
                        <button type="button" onClick={() => cambiarCant(it.productoId, 1)} aria-label="Más"><Plus size={14} strokeWidth={2.2} /></button>
                      </div>
                      <span className="fiar-item-sub">{formatPrice(it.precio * it.cantidad)}</span>
                      <button type="button" className="fiar-item-x" onClick={() => quitar(it.productoId)} aria-label={`Quitar ${it.nombre}`}><X size={15} strokeWidth={2.2} /></button>
                    </div>
                  ))}
                </div>
              )}
              <div className="fiar-engbox">
                <label className="fiar-engtoggle">
                  <input type="checkbox" checked={conEnganche} onChange={(e) => setConEnganche(e.target.checked)} /> ¿Dejó enganche?
                </label>
                {conEnganche ? (
                  <input className="fiar-eng-input" inputMode="decimal" value={engEfec} onChange={(e) => setEngEfec(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="Monto en efectivo" />
                ) : null}
              </div>
            </div>
          ) : (
            <div className="fiar-confirm">
              <div className="fiar-res-cliente">
                <FotoId ruta={clienteSel?.idImagen} />
                <div><strong>{clienteSel?.nombre}</strong><span>{saldo > 0 ? `Ya debía ${formatPrice(saldo)}` : 'Sin deuda previa'}</span></div>
              </div>
              <div className="fiar-res-items">
                {items.map((it) => (
                  <div key={it.productoId} className="fiar-res-line"><span>{it.cantidad}× {it.nombre}</span><span>{formatPrice(it.precio * it.cantidad)}</span></div>
                ))}
              </div>
              <div className="fiar-res-tot">
                <div className="fiar-res-row"><span>Total a fiar</span><strong>{formatPrice(total)}</strong></div>
                {enganche > 0 ? <div className="fiar-res-row fiar-res-row--eng"><span>Enganche (efectivo)</span><strong>− {formatPrice(enganche)}</strong></div> : null}
                <div className="fiar-res-debe"><span>Queda debiendo</span><strong>{formatPrice(quedaDebiendo)}</strong></div>
              </div>
            </div>
          )}
        </div>

        <div className="fiar-foot">
          <button type="button" className="pos-tool__ghost" onClick={atras}>{step === 1 ? 'Cancelar' : 'Atrás'}</button>
          {step === 1 ? (
            <button type="button" className="fiar-btn-primary" disabled={!clienteSel || cargandoCliente} onClick={() => setStep(2)}>Continuar <ArrowRight size={18} strokeWidth={2.1} /></button>
          ) : step === 2 ? (
            <button type="button" className="fiar-btn-primary" disabled={items.length === 0} onClick={() => setStep(3)}>Continuar <ArrowRight size={18} strokeWidth={2.1} /></button>
          ) : (
            <button type="button" className="fiar-btn-primary" disabled={busy} onClick={confirmar}><Handshake size={18} strokeWidth={2} /> {busy ? 'Guardando…' : 'Confirmar fiado'}</button>
          )}
        </div>
      </div>

      {pickerOpen ? (
        <ProductoPicker productos={productos} categorias={categorias} yaEn={items} onAdd={addProducto} onClose={() => setPickerOpen(false)} />
      ) : null}
    </div>
  )
}

function ProductoPicker({ productos, categorias, yaEn, onAdd, onClose }) {
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('Todo')
  const enSet = new Set((yaEn || []).map((x) => x.productoId))
  const cats = Array.isArray(categorias) ? categorias : []
  const visibles = useMemo(() => {
    const nq = norm(q)
    let rows = Array.isArray(productos) ? productos : []
    if (cat !== 'Todo') rows = rows.filter((p) => String(p.categoria || '').trim() === cat)
    if (nq) rows = rows.filter((p) => norm(p.descripcion || '').includes(nq) || norm(p.codigo || '').includes(nq))
    return rows.slice(0, 80)
  }, [productos, cat, q])

  return (
    <div className="fiar-picker-ov" onClick={onClose}>
      <div className="fiar-picker" role="dialog" aria-label="Agregar productos" onClick={(e) => e.stopPropagation()}>
        <div className="fiar-picker-head">
          <strong>Agregar productos</strong>
          <button type="button" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
        </div>
        <div className="fiar-picker-search"><Search size={16} strokeWidth={1.9} /><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar producto o código…" /></div>
        <div className="fiar-picker-cats">
          <button type="button" className={cat === 'Todo' ? 'is-active' : ''} onClick={() => setCat('Todo')}>Todo</button>
          {cats.map((c) => <button type="button" key={c.nombre} className={cat === c.nombre ? 'is-active' : ''} onClick={() => setCat(c.nombre)}>{c.nombre} <em>{c.count}</em></button>)}
        </div>
        <div className="fiar-picker-grid">
          {visibles.length === 0 ? <div className="fiar-empty">Sin productos.</div> : visibles.map((p) => {
            const added = enSet.has(p.id)
            return (
              <button type="button" key={p.id} className={`fiar-picker-card${added ? ' is-added' : ''}`} onClick={() => onAdd(p)}>
                <span className="fiar-picker-nom">{p.descripcion || p.codigo}</span>
                <span className="fiar-picker-bottom">
                  <span className="fiar-picker-precio">{formatPrice(p.precio)}</span>
                  <span className="fiar-picker-act">{added ? <Check size={14} strokeWidth={2.6} /> : <Plus size={14} strokeWidth={2.4} />}</span>
                </span>
              </button>
            )
          })}
        </div>
        <div className="fiar-picker-foot">
          <span className="fiar-picker-count">{yaEn.length} producto{yaEn.length === 1 ? '' : 's'} en el fiado</span>
          <button type="button" className="fiar-btn-primary" onClick={onClose}>Listo</button>
        </div>
      </div>
    </div>
  )
}
