import { useMemo, useRef, useState, useEffect } from 'react'
import { ArrowLeft, ArrowRight, Handshake, CircleDollarSign, Search, X, Plus, Package, IdCard } from 'lucide-react'
import { toast } from 'sonner'
import { formatPrice } from '@/lib/format'
import './fiar-flow.css'

/* ─────────────────────────────────────────────────────────────────────
 * Flujo Fiar — vive DENTRO del PDV (pestaña del sliderbar y destino del
 * botón Fiar del cobro). Estilo boceto/ERP siguiendo las imágenes del
 * usuario: ¿qué desea hacer? → cliente → productos.
 *
 * Confirmar crea la venta a crédito con window.bazar.db.addSale(fiar)
 * (una sola libreta en Saldos). Recibe los productos importados del cobro
 * por prop `draftItems` (mismo window, sin localStorage ni saltos).
 * ──────────────────────────────────────────────────────────────────── */

const norm = (v) => String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
const initials = (name) => {
  const p = String(name || '').trim().split(/\s+/).filter(Boolean)
  return p.length ? p.slice(0, 2).map((x) => x[0]?.toUpperCase() || '').join('') : '—'
}

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
  if (!ruta) return <div className="fiar-idfoto fiar-idfoto--vacia"><IdCard size={24} strokeWidth={1.5} /><span>Sin ID</span></div>
  if (!src) return <div className="fiar-idfoto fiar-idfoto--vacia"><IdCard size={24} strokeWidth={1.5} /><span>…</span></div>
  return <div className="fiar-idfoto"><img src={src} alt="Identificación" /></div>
}

export function AccionScreen({ onBack, onAbonar, onFiar }) {
  return (
    <div className="fiar-shell">
      <div className="fiar-topbar">
        <button type="button" className="fiar-volver" onClick={onBack}><ArrowLeft size={18} strokeWidth={1.9} /> Volver</button>
        <span className="fiar-title">Abonar y fiar</span>
        <span className="fiar-topbar-pad" />
      </div>
      <div className="fiar-accion">
        <h2 className="fiar-accion-q">¿Qué desea hacer?</h2>
        <div className="fiar-accion-grid">
          <button type="button" className="fiar-accion-card fiar-accion-abonar" onClick={onAbonar}>
            <CircleDollarSign size={38} strokeWidth={1.6} />
            <span className="fiar-accion-nom">Abonar</span>
            <small>Pagar una deuda existente</small>
          </button>
          <button type="button" className="fiar-accion-card fiar-accion-fiar" onClick={onFiar}>
            <Handshake size={38} strokeWidth={1.6} />
            <span className="fiar-accion-nom">Fiar</span>
            <small>Llevar mercancía a crédito</small>
          </button>
        </div>
      </div>
    </div>
  )
}

export function FiarScreen({ clientes, draftItems, onSalir }) {
  const db = typeof window !== 'undefined' ? window.bazar?.db : undefined
  const importRef = useRef(null)
  if (importRef.current === null) {
    importRef.current = (Array.isArray(draftItems) ? draftItems : []).map((it) => ({
      productoId: Number(it.productoId), codigo: String(it.codigo || ''), nombre: String(it.nombre || 'Producto'),
      precio: Number(it.precio) || 0, cantidad: Math.max(1, Math.floor(Number(it.cantidad) || 1)),
    })).filter((it) => it.productoId)
  }
  const importados = importRef.current.length > 0

  const [step, setStep] = useState('cliente')
  const [clienteId, setClienteId] = useState('')
  const [buscar, setBuscar] = useState('')
  const [cargandoCliente, setCargandoCliente] = useState(false)
  const [items, setItems] = useState(importRef.current)
  const [codigo, setCodigo] = useState('')
  const [conEnganche, setConEnganche] = useState(false)
  const [engEfec, setEngEfec] = useState('')
  const [busy, setBusy] = useState(false)

  const lst = useMemo(() => (Array.isArray(clientes) ? clientes : []), [clientes])
  const clienteSel = lst.find((c) => String(c.id) === String(clienteId)) || null
  const q = norm(buscar)
  const lista = useMemo(() => (q ? lst.filter((c) => norm(c.nombre).includes(q)) : lst).slice(0, 40), [lst, q])

  const total = items.reduce((s, it) => s + it.precio * it.cantidad, 0)
  const enganche = conEnganche ? (Number(engEfec) || 0) : 0
  const quedaDebiendo = Math.max(0, total - enganche)

  const seleccionar = (id) => {
    setClienteId(String(id))
    setCargandoCliente(true)
    const ms = 450 + Math.floor(Math.random() * 500)
    window.setTimeout(() => setCargandoCliente(false), ms)
  }

  const agregarCodigo = async () => {
    const c = String(codigo).trim()
    if (!c) return
    if (!db?.getProductByCodigo) { toast.error('Sin conexión al inventario.'); return }
    try {
      const p = await db.getProductByCodigo(c)
      if (!p?.id) { toast.error(`Sin resultados para «${c}».`); return }
      if (String(p.estado || 'disponible') !== 'disponible') { toast.error(`«${p.codigo}» no está disponible para vender.`); return }
      setItems((prev) => {
        const i = prev.findIndex((x) => x.productoId === p.id)
        if (i >= 0) { const n = [...prev]; n[i] = { ...n[i], cantidad: n[i].cantidad + 1 }; return n }
        return [...prev, { productoId: p.id, codigo: String(p.codigo || ''), nombre: String(p.descripcion || p.codigo || 'Producto'), precio: Number(p.precio) || 0, cantidad: 1 }]
      })
      setCodigo('')
    } catch { toast.error('No se pudo agregar el artículo.') }
  }

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
        clienteId: clienteSel.id,
        fiar: true,
        notas: '',
      })
      if (!res?.ok) throw new Error('No se pudo registrar el fiado.')
      const debe = Number(res.faltante)
      toast.success(`Fiado registrado. ${clienteSel.nombre} queda debiendo ${formatPrice(Number.isFinite(debe) ? debe : quedaDebiendo)}.`)
      onSalir?.(true)
    } catch (e) { toast.error(e?.message || 'No se pudo registrar el fiado.') }
    finally { setBusy(false) }
  }

  const saldo = clienteSel ? Math.max(0, Number(clienteSel.saldo) || 0) : 0
  const favor = clienteSel ? Math.max(0, Number(clienteSel.saldoAFavor) || 0) : 0

  return (
    <div className="fiar-shell">
      <div className="fiar-topbar">
        <button type="button" className="fiar-volver" onClick={step === 'productos' ? () => setStep('cliente') : () => onSalir?.(false)}>
          <ArrowLeft size={18} strokeWidth={1.9} /> Volver
        </button>
        <span className="fiar-title"><Handshake size={18} strokeWidth={1.9} /> Fiar</span>
        {importados
          ? <span className="fiar-foco-badge" title="Productos traídos del punto de venta"><span className="fiar-foco" /><Package size={14} strokeWidth={1.9} /> {items.length} del punto de venta</span>
          : <span className="fiar-topbar-pad" />}
      </div>

      {step === 'cliente' ? (
        <>
          <div className="fiar-body">
            <div className="fiar-step-label">Paso 1 · Cliente</div>
            <div className="fiar-search">
              <Search size={18} strokeWidth={1.9} />
              <input autoFocus value={buscar} onChange={(e) => { setBuscar(e.target.value); setClienteId('') }} placeholder="Buscar cliente por nombre…" />
            </div>

            {clienteId && cargandoCliente ? (
              <div className="fiar-loading"><span className="fiar-spinner" /> Cargando datos del cliente…</div>
            ) : clienteSel ? (
              <div className="fiar-cliente-card">
                <FotoId ruta={clienteSel.idImagen} />
                <div className="fiar-cliente-datos">
                  <strong>{clienteSel.nombre}</strong>
                  <span>{clienteSel.telefono || 'Sin teléfono'}</span>
                  <span className="fiar-cliente-saldo-line">
                    {saldo > 0 ? `Ya debe ${formatPrice(saldo)}` : 'Sin deuda previa'}
                    {favor > 0 ? ` · a favor ${formatPrice(favor)}` : ''}
                  </span>
                  <button type="button" className="fiar-link" onClick={() => setClienteId('')}>Cambiar cliente</button>
                </div>
              </div>
            ) : (
              <div className="fiar-cliente-list">
                {lista.length === 0 ? (
                  <div className="fiar-empty">Sin clientes {q ? `para «${buscar}»` : 'registrados'}.</div>
                ) : lista.map((c) => {
                  const cd = Math.max(0, Number(c.saldo) || 0)
                  return (
                    <button type="button" key={c.id} className="fiar-cliente-row" onClick={() => seleccionar(c.id)}>
                      <span className="fiar-avatar">{initials(c.nombre)}</span>
                      <span className="fiar-cliente-nom">{c.nombre}</span>
                      <span className="fiar-cliente-saldo">{cd > 0 ? `debe ${formatPrice(cd)}` : 'al corriente'}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
          <div className="fiar-footer">
            <button type="button" className="fiar-btn-ghost" onClick={() => onSalir?.(false)}>Cancelar</button>
            <button type="button" className="fiar-btn-primary" disabled={!clienteSel || cargandoCliente} onClick={() => setStep('productos')}>
              Continuar <ArrowRight size={18} strokeWidth={2} />
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="fiar-prod-layout">
            <div className="fiar-prod-main">
              <div className="fiar-step-label">Paso 2 · Productos a fiar</div>
              <div className="fiar-prod-grid">
                {items.map((it) => (
                  <div key={it.productoId} className="fiar-prod-card">
                    <button type="button" className="fiar-prod-x" onClick={() => quitar(it.productoId)} aria-label={`Quitar ${it.nombre}`}><X size={14} strokeWidth={2.2} /></button>
                    <span className="fiar-prod-nom">{it.nombre}</span>
                    <span className="fiar-prod-precio">{formatPrice(it.precio)}{it.cantidad > 1 ? ` ×${it.cantidad}` : ''}</span>
                  </div>
                ))}
                <button type="button" className="fiar-prod-add" onClick={() => document.getElementById('fiar-cod')?.focus()} aria-label="Agregar producto"><Plus size={24} strokeWidth={1.8} /></button>
              </div>
              {items.length === 0 ? <div className="fiar-empty">Aún no hay productos. Agrégalos por código del lado derecho →</div> : null}
            </div>

            <aside className="fiar-side">
              <div className="fiar-side-cliente">
                <span className="fiar-side-label">Cuenta del cliente</span>
                <strong>{clienteSel?.nombre || '—'}</strong>
              </div>
              <label className="fiar-side-label" htmlFor="fiar-cod">Ingresar código del artículo</label>
              <div className="fiar-add-row">
                <input id="fiar-cod" value={codigo} onChange={(e) => setCodigo(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') agregarCodigo() }} placeholder="Código…" />
                <button type="button" onClick={agregarCodigo} aria-label="Agregar"><Plus size={16} strokeWidth={2} /></button>
              </div>
              <small className="fiar-hint">Si se escanea con el lector, se mete automático.</small>
              <label className="fiar-check">
                <input type="checkbox" checked={conEnganche} onChange={(e) => setConEnganche(e.target.checked)} /> Enganche
              </label>
              {conEnganche ? (
                <input className="fiar-eng-input" inputMode="decimal" value={engEfec} onChange={(e) => setEngEfec(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="Monto del enganche" />
              ) : null}
            </aside>
          </div>
          <div className="fiar-footer fiar-footer--total">
            <div className="fiar-total">
              <span className="fiar-total-label">TOTAL</span>
              <strong>{formatPrice(total)}</strong>
              {enganche > 0 ? <em className="fiar-total-debe">queda debiendo {formatPrice(quedaDebiendo)}</em> : null}
            </div>
            <button type="button" className="fiar-btn-primary" disabled={busy || items.length === 0} onClick={confirmar}>
              {busy ? 'Guardando…' : 'Continuar'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
