import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Search, Barcode, Trash2, ShoppingBag, X, Plus, Minus, ArrowRight, User,
  Banknote, Smartphone, Handshake, Check, ArrowLeft, RefreshCcw,
  ShoppingCart, Printer, ReceiptText, BarChart3, Store, CalendarDays, Tag,
} from 'lucide-react'
import { toast } from 'sonner'
import { formatPrice } from '@/lib/format'
import { ipcErrorMessage } from '@/lib/ipcErrorMessage'
import { productSellableError } from '@/lib/productSellable'
import { emojiDeCategoria as emojiDe, esRutaImagen, rutaAFileUrl as fileUrl } from '@/lib/categoriaEmoji'
import { calcularCuentaSaldos } from '@/lib/saldosLedger'
import { corteDelDia, totalFiadoAfuera } from '@/lib/reportes'
import { banquetaPrecioParaToggleVendido } from '@/lib/banquetaPrint'
import './pos-monserrat.css'

/**
 * Punto de venta Monserrat — diseño boutique del mock pos-ui aprobado,
 * cableado al backend testeado (window.bazar.db: searchProducts,
 * getProductByCodigo, addSale, devoluciones).
 *
 * Flujo de cobro: ticket → "Cobrar Venta" → modal de métodos (efectivo /
 * transferencia / fiar) con rainbow bars → panel del método → confirmar →
 * éxito con checkmark animado.
 *
 * Atajos: F2/F12 cobrar; Esc en la barra vacía el ticket.
 */

const BILLETES = [50, 100, 200, 500]

const CUENTAS_DEFAULT = [
  { id: 'BBVA', nombre: 'BBVA', color: '#0d3873' },
  { id: 'Mercado Pago', nombre: 'Mercado Pago', color: '#00B1EA' },
  { id: 'Spin Oxxo', nombre: 'Spin OXXO', color: '#E30613' },
  { id: 'BanCoppel', nombre: 'BanCoppel', color: '#e6c100' },
]

function parseCuentas(settings) {
  const raw = settings?.cuentasBancarias
  if (!Array.isArray(raw)) return null
  const rows = raw
    .map((c) => ({ id: String(c?.id || c?.nombre || '').trim(), nombre: String(c?.nombre || c?.id || '').trim(), color: String(c?.color || '#94a3b8').trim() }))
    .filter((c) => c.id)
  return rows.length > 0 ? rows : null
}

export function PdvView() {
  const api = typeof window !== 'undefined' ? window.bazar?.db : undefined
  const saldosApi = typeof window !== 'undefined' ? window.bazar?.saldos : undefined
  const settingsApi = typeof window !== 'undefined' ? window.bazar?.settings : undefined

  const [productos, setProductos] = useState([])
  const [productosLoading, setProductosLoading] = useState(true)
  const [categoriasMeta, setCategoriasMeta] = useState({})
  const [cuentas, setCuentas] = useState(CUENTAS_DEFAULT)
  const [categoria, setCategoria] = useState('Todo')
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState([])
  const [clientes, setClientes] = useState([])

  const [pagoPaso, setPagoPaso] = useState(null) // null | metodos | efectivo | transferencia | credito
  const [confirm, setConfirm] = useState(null)
  const [modo, setModo] = useState('venta') // venta | ventas | devoluciones | banqueta | reportes

  const scanRef = useRef(null)
  const busyRef = useRef(false)
  const [busy, setBusy] = useState(false)

  const focusScan = useCallback(() => { queueMicrotask(() => scanRef.current?.focus()) }, [])
  useEffect(() => { focusScan() }, [focusScan])

  const cargarProductos = useCallback(async () => {
    if (!api?.searchProducts) { setProductosLoading(false); return }
    try {
      const rows = await api.searchProducts('')
      setProductos(Array.isArray(rows) ? rows.filter((r) => !productSellableError(r)) : [])
    } catch {
      setProductos([])
    } finally {
      setProductosLoading(false)
    }
  }, [api])

  useEffect(() => { void cargarProductos() }, [cargarProductos, confirm])

  useEffect(() => {
    if (!settingsApi?.get) return
    let alive = true
    settingsApi.get().then((s) => {
      if (!alive || !s) return
      if (s.categoriasMeta && typeof s.categoriasMeta === 'object') setCategoriasMeta(s.categoriasMeta)
      const custom = parseCuentas(s)
      if (custom) setCuentas(custom)
    }).catch(() => {})
    return () => { alive = false }
  }, [settingsApi])

  /* Fiar es una cuenta del módulo Saldos (libreta única). Listamos las cuentas
   * de Saldos y calculamos el saldo con el motor (saldosLedger). */
  const loadClientes = useCallback(async () => {
    if (!saldosApi?.listCuentas) { setClientes([]); return }
    try {
      const cuentas = await saldosApi.listCuentas({ incluirArchivadas: false })
      setClientes((Array.isArray(cuentas) ? cuentas : []).map((c) => {
        const r = calcularCuentaSaldos(c)
        return {
          id: c.id, nombre: c.nombre,
          saldo_pendiente: r.saldo, saldo_deudor: r.saldo,
          saldo_a_favor: r.saldoAFavor,
        }
      }))
    } catch { setClientes([]) }
  }, [saldosApi])

  useEffect(() => {
    void loadClientes()
    /* Cambios desde otra ventana (venta/devolución/edición de inventario)
     * deben refrescar también el stock visible del PDV, no solo los clientes. */
    const unsub = window.bazar?.runtime?.subscribeCuentasChanged?.(() => { void loadClientes(); void cargarProductos() })
    return () => { unsub?.() }
  }, [loadClientes, cargarProductos])

  /* ── Derivados ─────────────────────────────────────────────────── */

  const categorias = useMemo(() => {
    const counts = new Map()
    for (const p of productos) {
      const c = String(p.categoria || '').trim()
      if (!c) continue
      counts.set(c, (counts.get(c) || 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es')).map(([nombre, count]) => ({ nombre, count }))
  }, [productos])

  const visibles = useMemo(() => {
    const q = search.trim().toLowerCase()
    let rows = productos
    if (categoria !== 'Todo') rows = rows.filter((p) => String(p.categoria || '').trim() === categoria)
    if (q) rows = rows.filter((p) => String(p.descripcion || '').toLowerCase().includes(q) || String(p.codigo || '').toLowerCase().includes(q))
    return rows.slice(0, 60)
  }, [productos, categoria, search])

  const total = useMemo(() => cart.reduce((s, l) => s + (Number(l.precio) || 0) * l.cantidad, 0), [cart])

  /* ── Ticket ────────────────────────────────────────────────────── */

  const addLine = useCallback((p) => {
    setCart((prev) => {
      const idx = prev.findIndex((x) => x.pid === p.id)
      if (idx >= 0) {
        const x = prev[idx]
        if (x.pieza_unica) { toast.warning(`"${x.nombre}" es pieza única, ya está en el ticket.`); return prev }
        if (x.cantidad >= x.stock) { toast.error(`Solo quedan ${x.stock} de "${x.nombre}".`); return prev }
        const next = [...prev]; next[idx] = { ...x, cantidad: x.cantidad + 1 }; return next
      }
      const err = productSellableError(p)
      if (err) { toast.error(err); return prev }
      return [...prev, {
        pid: p.id, codigo: String(p.codigo || ''), nombre: String(p.descripcion || p.codigo || 'Producto'),
        categoria: String(p.categoria || ''), precio: Number(p.precio) || 0, cantidad: 1,
        pieza_unica: Number(p.pieza_unica) === 1, stock: Math.max(0, Math.floor(Number(p.stock) || 0)),
      }]
    })
  }, [])

  const resolveAndAdd = useCallback(async (raw) => {
    const q = String(raw || '').trim()
    if (!q) return
    if (!api) { toast.error('Sin conexión a la base de datos.'); return }
    try {
      const direct = await api.getProductByCodigo(q)
      if (direct?.id) {
        const why = productSellableError(direct)
        if (why) { toast.error(`"${direct.codigo}": ${why}`); return }
        addLine(direct); setSearch(''); focusScan(); return
      }
      const ql = q.toLowerCase()
      const matches = productos.filter((p) => String(p.descripcion || '').toLowerCase().includes(ql) || String(p.codigo || '').toLowerCase().includes(ql))
      if (matches.length === 1) { addLine(matches[0]); setSearch(''); focusScan(); return }
      if (matches.length === 0) toast.error(`Sin resultados para "${q}".`)
    } catch (err) {
      toast.error(ipcErrorMessage(err) || 'Error al buscar el producto.')
    }
  }, [api, addLine, focusScan, productos])

  const setLineQty = useCallback((pid, delta) => {
    setCart((prev) => prev.flatMap((l) => {
      if (l.pid !== pid) return [l]
      const n = l.cantidad + delta
      if (n <= 0) return []
      if (l.pieza_unica && n > 1) { toast.warning(`"${l.nombre}" es pieza única.`); return [l] }
      if (!l.pieza_unica && n > l.stock) { toast.error(`Solo quedan ${l.stock} de "${l.nombre}".`); return [l] }
      return [{ ...l, cantidad: n }]
    }))
  }, [])

  const removeLine = useCallback((pid) => setCart((prev) => prev.filter((l) => l.pid !== pid)), [])
  const clearCart = useCallback(() => { setCart([]); focusScan() }, [focusScan])

  /* ── Cobro ─────────────────────────────────────────────────────── */

  const cobrar = useCallback(async ({ pagos, clienteId, cuentaBancaria, fiar }) => {
    if (busyRef.current) return
    if (cart.length === 0) { toast.error('El ticket está vacío.'); return }
    if (!Number.isFinite(total) || total <= 0) { toast.error('Total inválido.'); return }
    for (const l of cart) {
      if (!Number.isFinite(Number(l.precio)) || Number(l.precio) <= 0) { toast.error(`"${l.nombre}" tiene precio inválido.`); return }
      if (!l.pieza_unica && l.cantidad > l.stock) { toast.error(`"${l.nombre}" excede el stock (${l.stock}).`); return }
    }
    if (!api?.addSale) { toast.error('Sin conexión a la base de datos.'); return }

    busyRef.current = true; setBusy(true)
    try {
      const payload = {
        items: cart.map((l) => ({ productoId: l.pid, cantidad: l.cantidad })),
        pagos,
        clienteId,
        fiar: !!fiar,
        cuentaBancaria,
        notas: '',
      }
      const result = await api.addSale(payload)
      if (!result?.ok) throw new Error('La venta no se confirmó.')

      /* La verdad la define el backend: tomamos faltante / saldo a favor / cambio
       * / método de la respuesta, no recalculamos en la UI. */
      const p = pagos || {}
      const montoEfectivo = Number(p.efectivo) || 0
      const montoTransferencia = Number(p.transferencia) || 0
      const faltante = Number(result.faltante) || 0
      const favorAplicado = Number(result.favorAplicado) || 0
      const valeAplicado = Number(result.valeAplicado) || 0
      const cambio = Number(result.cambio) || 0
      const metodo = result.metodo || 'efectivo'
      const tocaCuenta = faltante > 0.01 || favorAplicado > 0.005

      if (tocaCuenta) void loadClientes()
      const cliente = tocaCuenta ? clientes.find((c) => Number(c.id) === Number(clienteId)) : null

      const ticket = {
        ventaId: result.ventaId, total: result.total ?? total, cambio, metodo,
        pago_con: montoEfectivo + montoTransferencia,
        pagos: {
          efectivo: montoEfectivo,
          transferencia: montoTransferencia,
          saldo_favor: favorAplicado,
          vale: valeAplicado,
          credito: faltante,
        },
        cuenta_bancaria: montoTransferencia > 0 ? cuentaBancaria : null,
        created_at: new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' }),
        items: cart.map((l) => ({ cantidad: l.cantidad, precio_snapshot: l.precio, nombre_snapshot: l.nombre, codigo: l.codigo })),
        cliente: cliente ? { nombre: cliente.nombre, saldo_pendiente: (Number(cliente.saldo_pendiente) || 0) + faltante } : null,
        clienteNombre: cliente?.nombre || null, notas: '',
      }
      setPagoPaso(null)
      setCart([])
      setConfirm(ticket)

      if (window.bazar?.printers?.printTicket) {
        const pr = window.bazar.printers.printTicket(ticket).then((r) => { if (!r.ok) throw new Error(r.message); return r.message })
        toast.promise(pr, { loading: 'Imprimiendo ticket…', success: (m) => m, error: (e) => e.message || 'Error al imprimir.' })
      }
    } catch (err) {
      toast.error(ipcErrorMessage(err) || 'No se pudo completar la venta.')
    } finally {
      busyRef.current = false; setBusy(false)
    }
  }, [api, cart, total, clientes, loadClientes])

  useEffect(() => {
    const h = (e) => {
      if (confirm || pagoPaso) return
      if (modo !== 'venta') return
      if ((e.key === 'F2' || e.key === 'F12') && !e.repeat) {
        e.preventDefault()
        if (cart.length > 0) setPagoPaso('metodos')
        return
      }
      const tag = document.activeElement?.tagName
      if ((tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA')) {
        if (e.key === 'Escape' && cart.length > 0 && document.activeElement === scanRef.current) clearCart()
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [confirm, pagoPaso, modo, cart.length, clearCart])

  if (confirm) {
    return <ExitoVenta info={confirm} onNueva={() => { setConfirm(null); focusScan() }} />
  }

  return (
    <div data-app-workspace className="pos">
      {/* Sidebar */}
      <aside className="pos-sidebar">
        <div className="pos-brand">
          <span className="pos-brand__logo">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3a2.5 2.5 0 0 0-2.5 2.5c0 1.25.5 2.25 1.5 3L8 11.5 2 17h20l-6-5.5-3-3c1-.75 1.5-1.75 1.5-3A2.5 2.5 0 0 0 12 3z" />
              <path d="M12 5.5v3" /><path d="M2 17h20v2H2z" />
            </svg>
          </span>
          <span className="pos-brand__text">
            <h1>Monserrat</h1>
            <span>Punto de venta</span>
          </span>
        </div>

        <nav className="pos-nav">
          <button type="button" className={`pos-nav__item${modo === 'venta' ? ' is-active' : ''}`} onClick={() => { setModo('venta'); focusScan() }}><ShoppingCart size={19} strokeWidth={1.8} />Punto de venta</button>
          <button type="button" className={`pos-nav__item${modo === 'ventas' ? ' is-active' : ''}`} onClick={() => setModo('ventas')}><ReceiptText size={19} strokeWidth={1.8} />Consultar ventas</button>
          <button type="button" className={`pos-nav__item${modo === 'banqueta' ? ' is-active' : ''}`} onClick={() => setModo('banqueta')}><Store size={19} strokeWidth={1.8} />Banqueta</button>
        </nav>

        <div className="pos-sidebar__bottom">
          <button
            type="button"
            className="pos-nav__item is-danger"
            onClick={() => window.bazar?.window?.close?.()}
          >
            <ArrowLeft size={19} strokeWidth={1.8} />Cerrar caja
          </button>
        </div>
      </aside>

      <main className={`pos-main${modo === 'venta' ? '' : modo === 'ventas' ? ' pos-main--ventas' : ' pos-main--tool'}`}>
        {modo === 'venta' ? (
          <>
        {/* Productos */}
        <section className="pos-products">
          <div className="pos-search-header">
            <form className="pos-search-bar" onSubmit={(e) => { e.preventDefault(); void resolveAndAdd(search) }}>
              <Search size={22} strokeWidth={1.8} />
              <input
                ref={scanRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Escaneá un código o buscá un producto…"
                autoComplete="off"
                autoFocus
                aria-label="Escanear o buscar"
              />
              <button type="button" className="pos-search-bar__scan" title="Escáner activo" onClick={focusScan}>
                <Barcode size={22} strokeWidth={1.8} />
              </button>
            </form>
          </div>

          <div className="pos-categories">
            <div className="pos-cat-row">
              <button type="button" className={`pos-cat${categoria === 'Todo' ? ' is-active' : ''}`} onClick={() => { setCategoria('Todo'); focusScan() }}>
                Todo<span className="pos-cat__count">{productos.length}</span>
              </button>
              {categorias.map((c) => {
                const ic = emojiDe(c.nombre, categoriasMeta)
                return (
                  <button key={c.nombre} type="button" className={`pos-cat${categoria === c.nombre ? ' is-active' : ''}`} onClick={() => { setCategoria(categoria === c.nombre ? 'Todo' : c.nombre); focusScan() }}>
                    {esRutaImagen(ic) ? <img className="pos-cat__img" src={fileUrl(ic)} alt="" /> : <span>{ic}</span>}{c.nombre}<span className="pos-cat__count">{c.count}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="pos-grid">
            {productosLoading ? (
              Array.from({ length: 8 }).map((_, i) => <div key={i} className="pos-card" style={{ height: 215, animation: 'none' }} />)
            ) : visibles.length === 0 ? (
              <div className="pos-grid__empty">
                <ShoppingBag size={42} strokeWidth={1.4} />
                <h3>{search || categoria !== 'Todo' ? 'Nada con ese filtro' : 'Sin productos para vender'}</h3>
                <p>{search || categoria !== 'Todo' ? 'Probá con otro nombre, código o categoría.' : 'Dá de alta productos desde Inventario para venderlos acá.'}</p>
              </div>
            ) : visibles.map((p) => {
              const stock = Math.max(0, Math.floor(Number(p.stock) || 0))
              const unica = Number(p.pieza_unica) === 1
              const agotado = !unica && stock <= 0
              const ic = emojiDe(p.categoria, categoriasMeta)
              // La imagen propia del producto manda; si no tiene, el ícono/imagen
              // de su categoría; y si la categoría tampoco, el emoji por defecto.
              const prodImg = esRutaImagen(p.imagen_path) ? p.imagen_path : null
              return (
                <button
                  key={p.id}
                  type="button"
                  className={`pos-card${agotado ? ' is-out' : ''}`}
                  onClick={() => { if (agotado) { toast.error(`"${p.descripcion || p.codigo}" está agotado.`); return } addLine(p); focusScan() }}
                >
                  {agotado ? <span className="pos-stock-badge is-error">Agotado</span>
                    : unica ? <span className="pos-stock-badge is-unica">Única</span>
                    : stock <= 2 ? <span className="pos-stock-badge is-warn">{stock === 1 ? 'Última' : `Quedan ${stock}`}</span> : null}
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

        {/* Ticket */}
        <aside className="pos-cart">
          <div className="pos-cart__header">
            <h2>Ticket de venta</h2>
            {cart.length > 0 ? (
              <button type="button" className="pos-icon-btn" title="Vaciar ticket" onClick={clearCart}><Trash2 size={20} strokeWidth={1.8} /></button>
            ) : null}
          </div>

          <div className="pos-cart__items">
            {cart.length === 0 ? (
              <div className="pos-cart__empty">
                <span className="pos-cart__empty-circle"><ShoppingBag size={38} strokeWidth={1.4} /></span>
                <span>Agregá productos para la venta</span>
              </div>
            ) : cart.map((l) => (
              <div key={l.pid} className="pos-line">
                <div className="pos-line__top">
                  <div>
                    <div className="pos-line__name">{l.nombre}</div>
                    <div className="pos-line__code">{l.codigo}</div>
                  </div>
                  <span className="pos-line__price">{formatPrice(l.precio * l.cantidad)}</span>
                </div>
                <div className="pos-line__controls">
                  {l.pieza_unica ? (
                    <span className="pos-line__unica">Pieza única</span>
                  ) : (
                    <div className="pos-qty">
                      <button type="button" className="pos-qty__btn" onClick={() => setLineQty(l.pid, -1)} aria-label="Quitar uno"><Minus size={14} strokeWidth={2.2} /></button>
                      <span className="pos-qty__val">{l.cantidad}</span>
                      <button type="button" className="pos-qty__btn" disabled={l.cantidad >= l.stock} onClick={() => setLineQty(l.pid, 1)} aria-label="Sumar uno"><Plus size={14} strokeWidth={2.2} /></button>
                    </div>
                  )}
                  <button type="button" className="pos-line__del" onClick={() => removeLine(l.pid)} aria-label={`Quitar ${l.nombre}`}><X size={19} strokeWidth={1.8} /></button>
                </div>
              </div>
            ))}
          </div>

          <div className="pos-cart__footer">
            <div className="pos-totals">
              <span className="pos-totals__label">Total a cobrar</span>
              <span className="pos-totals__amount">{formatPrice(total)}</span>
            </div>
            <button type="button" className="pos-checkout" disabled={cart.length === 0 || busy} onClick={() => setPagoPaso('metodos')}>
              <span>Cobrar Venta</span>
              <ArrowRight size={18} strokeWidth={2.4} />
            </button>
          </div>
        </aside>
          </>
        ) : modo === 'ventas' ? (
          <VentasWorkspace onChanged={() => { void loadClientes(); void cargarProductos() }} />
        ) : modo === 'devoluciones' ? (
          <DevolucionWorkspace cuentas={cuentas} onChanged={() => { void loadClientes(); void cargarProductos() }} />
        ) : modo === 'banqueta' ? (
          <BanquetaWorkspace />
        ) : (
          <ReportesPosWorkspace />
        )}
      </main>

      {pagoPaso ? (
        <ModalCobro
          paso={pagoPaso}
          setPaso={setPagoPaso}
          total={total}
          cart={cart}
          cuentas={cuentas}
          clientes={clientes}
          busy={busy}
          saldosApi={saldosApi}
          onClientesChanged={loadClientes}
          onCobrar={cobrar}
          onClose={() => { setPagoPaso(null); focusScan() }}
        />
      ) : null}

    </div>
  )
}

/* ── Consultar ventas (lista → detalle → reimprimir / devolver) ─────── */

function fechaCortaVenta(s) {
  try {
    const d = new Date(String(s || '').replace(' ', 'T') + 'Z')
    if (Number.isNaN(d.getTime())) return String(s || '')
    return d.toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  } catch { return String(s || '') }
}

function metodoVentaLabel(m) {
  const v = String(m || '').toLowerCase()
  if (v === 'efectivo') return 'Efectivo'
  if (v === 'transferencia') return 'Transferencia'
  if (v === 'credito') return 'Fiado'
  if (v.startsWith('intercambio')) return 'Intercambio'
  return m || '—'
}

function VentasWorkspace({ onChanged }) {
  const api = typeof window !== 'undefined' ? window.bazar?.db : undefined
  const printers = typeof window !== 'undefined' ? window.bazar?.printers : undefined
  const [ventas, setVentas] = useState([])
  const [loading, setLoading] = useState(true)
  const [sel, setSel] = useState(null)
  const [detalle, setDetalle] = useState(null)
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [metodo, setMetodo] = useState('todos')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const cargar = useCallback(async () => {
    if (!api?.getSales) { setLoading(false); return }
    setLoading(true)
    try { const rows = await api.getSales({ limit: 200, query, metodo, from, to }); setVentas(Array.isArray(rows) ? rows : []) }
    catch { setVentas([]) } finally { setLoading(false) }
  }, [api, query, metodo, from, to])

  useEffect(() => { void cargar() }, [cargar])
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape' && sel) { e.preventDefault(); setSel(null) } }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [sel])

  const abrir = async (v) => {
    setSel(v.id); setDetalle(null)
    try { const d = await api.getVentaDetalle(v.id); setDetalle(d) } catch { setDetalle(null) }
  }

  const reimprimir = async () => {
    if (!detalle || !printers?.printTicket) { toast.error('La impresión es solo en la app de escritorio.'); return }
    const v = detalle.venta
    const ticket = {
      ventaId: v.id, total: v.total, cambio: v.cambio, metodo: v.metodo,
      pago_con: v.pago_con, cuenta_bancaria: v.cuenta_bancaria, created_at: v.created_at,
      pagos: {
        efectivo: Number(v.monto_efectivo) || 0,
        transferencia: Number(v.monto_transferencia) || 0,
        credito: Number(v.monto_credito) || 0,
      },
      items: detalle.items.map((i) => ({ cantidad: i.cantidad, precio_snapshot: i.precio_snapshot, nombre_snapshot: i.nombre_snapshot, codigo: i.codigo_snapshot })),
      cliente: detalle.clienteNombre ? { nombre: detalle.clienteNombre } : null,
      clienteNombre: detalle.clienteNombre || null, notas: v.notas || '', reimpresion: true,
    }
    const p = printers.printTicket(ticket).then((r) => { if (!r.ok) throw new Error(r.message); return r.message || 'Ticket enviado' })
    toast.promise(p, { loading: 'Reimprimiendo…', success: (m) => m, error: (e) => e.message || 'Error al imprimir.' })
  }

  const devolver = async (item) => {
    if (item.devuelto_en || busy) return
    if (!api?.registrarDevolucionRapida) { toast.error('Devoluciones solo en la app de escritorio.'); return }
    setBusy(true)
    try {
      const montoRenglon = (Number(item.precio_snapshot) || 0) * (Math.max(1, Math.floor(Number(item.cantidad) || 1)))
      const res = await api.registrarDevolucionRapida({ ventaItemId: item.id, codigo: item.codigo_snapshot, montoReembolso: montoRenglon })
      if (!res?.ok) throw new Error(res?.message || 'No se pudo devolver.')
      if (res.ventaEsCredito) {
        let msg = `Devuelta. Se canceló ${formatPrice(res.deudaCancelada || 0)} del fiado${res.clienteNombre ? ` de ${res.clienteNombre}` : ''}.`
        if ((res.excedente || 0) > 0) {
          msg += res.excedenteMetodo === 'saldo_a_favor'
            ? ` Se agregaron ${formatPrice(res.excedente)} a su Saldo a Favor.`
            : ` Devolví ${formatPrice(res.excedente)} en ${res.excedenteMetodo}.`
        }
        toast.success(msg)
      } else {
        toast.success(`Devuelta "${item.codigo_snapshot}". Volvió al inventario.`)
      }
      const d = await api.getVentaDetalle(sel); setDetalle(d)
      await cargar()
      onChanged?.()
      window.dispatchEvent(new CustomEvent('bazar:cuentas-changed'))
    } catch (err) { toast.error(err.message || 'No se pudo devolver.') } finally { setBusy(false) }
  }

  const [scanModalOpen, setScanModalOpen] = useState(false)
  const [scanCode, setScanCode] = useState('')

  const handleClienteClick = () => {
    if (!detalle?.clienteNombre) return
    if (navigator.clipboard) navigator.clipboard.writeText(detalle.clienteNombre)
    localStorage.setItem('navigate_to', JSON.stringify({ path: 'saldos', search: detalle.clienteNombre, ts: Date.now() }))
    toast.success('Abriendo cliente en la ventana principal...', { duration: 3000 })
  }

  return (
    <section className="pos-sr" aria-label="Consulta de ventas y devoluciones">
      <div className="pos-sr__top">
        <div className="pos-sr__filters">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Folio o código…" />
          <select value={metodo} onChange={(e) => setMetodo(e.target.value)}>
            <option value="todos">Todos los métodos</option>
            <option value="efectivo">Efectivo</option>
            <option value="transferencia">Transferencia</option>
            <option value="credito">Fiado</option>
          </select>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Desde" />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Hasta" />
        </div>
        <div className="pos-sr__actions">
          <button type="button" className="pos-sr__actionbtn" onClick={() => void cargar()}>
            <RefreshCcw size={22} strokeWidth={2} />
            Actualizar
          </button>
          <button type="button" className="pos-sr__actionbtn" disabled={!detalle} onClick={() => void reimprimir()}>
            <Printer size={22} strokeWidth={2} />
            Reimprimir
          </button>
          <button type="button" className="pos-sr__actionbtn" disabled={!detalle || busy} onClick={() => { setScanCode(''); setScanModalOpen(true); }} style={{ color: 'var(--mlb-danger)' }}>
            <Barcode size={22} strokeWidth={2} />
            Devolver...
          </button>
          <button type="button" className="pos-sr__actionbtn" onClick={() => setSel(null)}>
            <X size={22} strokeWidth={2} />
            Cerrar
          </button>
        </div>
      </div>

      <div className="pos-sr__body">
        <div className="pos-sr__master" style={{ padding: 0 }}>
          {loading ? (
            <div className="pos-tool__empty" style={{ padding: 30 }}>Cargando ventas...</div>
          ) : ventas.length === 0 ? (
            <div className="pos-tool__empty" style={{ padding: 30 }}>No hay ventas registradas.</div>
          ) : (
            <table className="pos-table pos-table--hover" style={{ width: '100%', minWidth: 350 }}>
              <thead>
                <tr>
                  <th>Folio</th>
                  <th>Fecha</th>
                  <th style={{ textAlign: 'center' }}>Art.</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {ventas.map((v) => (
                  <tr key={v.id} className={sel === v.id ? 'is-selected' : ''} onClick={() => void abrir(v)} style={{ cursor: 'pointer' }}>
                    <td style={{ fontFamily: 'var(--mlb-font-mono)', fontWeight: 700 }}>#{v.id}</td>
                    <td>{fechaCortaVenta(v.created_at)}</td>
                    <td style={{ textAlign: 'center' }}>
                      {v.item_count}
                      {Number(v.returned_count) > 0 && <span className="pos-ventas__returned-chip" style={{ marginLeft: 4 }}>-{v.returned_count}</span>}
                    </td>
                    <td style={{ fontFamily: 'var(--mlb-font-mono)', fontWeight: 800, textAlign: 'right' }} className="pos-table-total">
                      {formatPrice(v.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="pos-sr__detail">
          <div className="pos-sr__detailhead">
            <div className="pos-sr__dfield"><span className="pos-sr__dlabel">Folio Ticket</span><span className="pos-sr__dval" style={{ fontFamily: 'var(--mlb-font-mono)' }}>{detalle ? `#${detalle.venta.id}` : '--'}</span></div>
            <div className="pos-sr__dfield"><span className="pos-sr__dlabel">Fecha</span><span className="pos-sr__dval">{detalle ? fechaCortaVenta(detalle.venta.created_at) : '--'}</span></div>
            <div className="pos-sr__dfield">
              <span className="pos-sr__dlabel">Cliente</span>
              <span className="pos-sr__dval">
                {!detalle ? '--' : detalle.clienteNombre ? (
                  <button type="button" className="pos-sr__clientlink" onClick={handleClienteClick} title="Copiar nombre para buscar en Saldos">
                    {detalle.clienteNombre}
                  </button>
                ) : 'Público en general'}
              </span>
            </div>
            <div className="pos-sr__dfield"><span className="pos-sr__dlabel">Vendedor</span><span className="pos-sr__dval">{detalle ? 'Admin' : '--'}</span></div>
          </div>

          <div className="pos-sr__ditems">
            <table className="pos-table">
              <thead>
                <tr>
                  <th style={{ width: 60, textAlign: 'center' }}>Cant.</th>
                  <th>Código</th>
                  <th>Descripción</th>
                  <th style={{ textAlign: 'right' }}>Precio</th>
                  <th style={{ textAlign: 'right' }}>Importe</th>
                  <th style={{ textAlign: 'right', width: 100 }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {!detalle ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--mlb-text-muted)' }}>
                      Ninguna venta seleccionada
                    </td>
                  </tr>
                ) : detalle.items.map((it) => (
                  <tr key={it.id} style={{ opacity: it.devuelto_en ? 0.6 : 1 }}>
                    <td style={{ fontFamily: 'var(--mlb-font-mono)', textAlign: 'center' }}>{it.cantidad}</td>
                    <td style={{ fontFamily: 'var(--mlb-font-mono)' }}>{it.codigo_snapshot}</td>
                    <td style={{ whiteSpace: 'normal', minWidth: 140 }}>{it.nombre_snapshot || it.codigo_snapshot}</td>
                    <td style={{ fontFamily: 'var(--mlb-font-mono)', textAlign: 'right' }}>{formatPrice(it.precio_snapshot)}</td>
                    <td style={{ fontFamily: 'var(--mlb-font-mono)', textAlign: 'right' }}>{formatPrice(Number(it.precio_snapshot) * Number(it.cantidad))}</td>
                    <td style={{ textAlign: 'right' }}>
                      {it.devuelto_en ? (
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--mlb-danger)' }}>Devuelto</span>
                      ) : (
                        <button type="button" className="pos-sr__btn-dev" disabled={busy} onClick={(e) => { e.stopPropagation(); void devolver(it) }}>
                          <RefreshCcw size={14} strokeWidth={2.5} /> Devolver
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="pos-sr__bottom">
            <div className="pos-sr__payments">
              <table className="pos-table">
                <thead>
                  <tr>
                    <th>Forma de Pago</th>
                    <th style={{ textAlign: 'right' }}>Importe</th>
                  </tr>
                </thead>
                <tbody>
                  {!detalle ? (
                    <tr>
                      <td>--</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mlb-font-mono)', fontWeight: 600 }}>$0.00</td>
                    </tr>
                  ) : (
                    <>
                      <tr>
                        <td>{metodoVentaLabel(detalle.venta.metodo)}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mlb-font-mono)', fontWeight: 600 }}>{formatPrice(detalle.venta.total)}</td>
                      </tr>
                      {Number(detalle.venta.cambio) > 0 && (
                        <tr>
                          <td>Cambio entregado</td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--mlb-font-mono)', fontWeight: 600, color: 'var(--mlb-text-muted)' }}>{formatPrice(detalle.venta.cambio)}</td>
                        </tr>
                      )}
                    </>
                  )}
                </tbody>
              </table>
            </div>
            <div className="pos-sr__totals">
              <div className="pos-sr__trow"><span>Subtotal:</span> <strong>{detalle ? formatPrice(detalle.venta.total) : '$0.00'}</strong></div>
              <div className="pos-sr__trow"><span>Descuento:</span> <strong>$0.00</strong></div>
              <div className="pos-sr__trow"><span>Impuestos:</span> <strong>$0.00</strong></div>
              <div className="pos-sr__trow is-grand"><span>Total:</span> <strong>{detalle ? formatPrice(detalle.venta.total) : '$0.00'}</strong></div>
            </div>
          </div>
        </div>
      </div>
      
      {scanModalOpen ? (
        <div className="pos-modal-overlay" onClick={() => setScanModalOpen(false)}>
          <div className="pos-modal pos-modal--cash" onClick={(e) => e.stopPropagation()}>
            <div className="pos-modal__head">
              <h2>Devolver Renglón</h2>
              <button type="button" className="pos-modal__close" onClick={() => setScanModalOpen(false)}><X size={20} strokeWidth={2} /></button>
            </div>
            <p style={{ marginBottom: 14, color: 'var(--mlb-text-muted)', fontSize: 13, lineHeight: 1.4 }}>
              Escanea o escribe el código del artículo que deseas devolver de este ticket.
            </p>
            <form onSubmit={(e) => {
              e.preventDefault()
              const c = scanCode.trim().toLowerCase()
              if (!c) return
              const match = detalle.items.find((it) => String(it.codigo_snapshot).toLowerCase() === c)
              if (!match) { toast.error('Ese artículo no pertenece a este ticket.'); return }
              if (match.devuelto_en) { toast.error('Ese artículo ya fue devuelto.'); return }
              setScanModalOpen(false)
              void devolver(match)
            }}>
              <div className="pos-field" style={{ marginBottom: 20 }}>
                <input autoFocus className="pos-input" style={{ fontFamily: 'var(--mlb-font-mono)' }} value={scanCode} onChange={(e) => setScanCode(e.target.value)} placeholder="Código del artículo..." />
              </div>
              <button type="submit" className="pos-confirm-btn" disabled={!scanCode.trim()}>Buscar y Devolver</button>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  )
}

/* ── Modal de cobro (métodos → panel → confirmar) ──────────────────── */

function ModalHead({ icon: Icon, title, onClose, onBack }) {
  return (
    <div className="pos-modal__head">
      <div className="pos-modal__head-left">
        {onBack ? <button type="button" className="pos-modal__close" onClick={onBack} aria-label="Volver"><ArrowLeft size={18} strokeWidth={2} /></button> : null}
        <span className="pos-modal__icon"><Icon size={20} strokeWidth={1.8} /></span>
        <h2 className="pos-modal__title">{title}</h2>
      </div>
      <button type="button" className="pos-modal__close" onClick={onClose} aria-label="Cerrar"><X size={18} strokeWidth={2} /></button>
    </div>
  )
}

function ModalCobro({ total, cuentas, clientes, busy, onCobrar, onClose, cart }) {
  const api = typeof window !== 'undefined' ? window.bazar?.db : undefined
  const [efectivo, setEfectivo] = useState('')
  const [transferencia, setTransferencia] = useState('')
  const [cuenta, setCuenta] = useState(cuentas[0]?.id || '')
  const [clienteId, setClienteId] = useState('')
  const [modoFiar, setModoFiar] = useState(false)
  const [activo, setActivo] = useState('efectivo')
  const [valeInfo, setValeInfo] = useState(null)
  const [valeOpen, setValeOpen] = useState(false)
  const [valeInput, setValeInput] = useState('')

  const valEfectivo = Number(efectivo) || 0
  const valTransferencia = Number(transferencia) || 0
  const clienteSelec = clientes.find((c) => String(c.id) === String(clienteId)) || null
  const maxSaldoFavor = clienteSelec ? Math.max(0, Number(clienteSelec.saldo_a_favor) || 0) : 0
  const deudaCliente = clienteSelec ? Math.max(0, Number(clienteSelec.saldo_deudor ?? clienteSelec.saldo_pendiente) || 0) : 0
  const valeDisp = valeInfo ? Math.max(0, Number(valeInfo.disponible) || 0) : 0

  const pagadoCaja = Math.round((valEfectivo + valTransferencia) * 100) / 100
  const restanteTrasCaja = Math.max(0, Math.round((total - pagadoCaja) * 100) / 100)
  const valeAplicado = Math.round(Math.min(valeDisp, restanteTrasCaja) * 100) / 100
  const restanteTrasVale = Math.max(0, Math.round((restanteTrasCaja - valeAplicado) * 100) / 100)
  const favorAplicado = Math.round(Math.min(maxSaldoFavor, restanteTrasVale) * 100) / 100
  const faltante = Math.round((restanteTrasVale - favorAplicado) * 100) / 100
  const cambio = Math.max(0, Math.round((pagadoCaja - total) * 100) / 100)

  const activoVal = activo === 'tarjeta' ? transferencia : efectivo
  const setActivoVal = (fn) => {
    if (activo === 'tarjeta') setTransferencia((p) => fn(String(p ?? '')))
    else setEfectivo((p) => fn(String(p ?? '')))
  }
  const tecla = (d) => setActivoVal((s) => {
    if (d === 'back') return s.slice(0, -1)
    if (d === '.') return s.includes('.') ? s : (s === '' ? '0.' : s + '.')
    if (d === '00') return s === '' ? '' : s + '00'
    const next = s + d
    if (/^\d*\.?\d{0,2}$/.test(next)) return next.replace(/^0+(?=\d)/, '')
    return s
  })
  const pagoJusto = () => {
    const otro = activo === 'tarjeta' ? valEfectivo : valTransferencia
    const justo = Math.max(0, Math.round((total - otro - valeAplicado - favorAplicado) * 100) / 100)
    setActivoVal(() => (justo ? String(justo) : ''))
  }

  const aplicarVale = async () => {
    const code = valeInput.trim()
    if (!code) return
    if (!api?.buscarVale) { toast.error('Vales solo en la app de escritorio.'); return }
    try {
      const v = await api.buscarVale(code)
      if (!v) { toast.error('Ese vale no existe.'); return }
      if (!v.activo) { toast.error('Ese vale ya no tiene saldo.'); return }
      setValeInfo({ codigo: v.codigo, disponible: v.disponible })
      setValeOpen(false); setValeInput('')
      toast.success(`Vale ${v.codigo}: ${formatPrice(v.disponible)} disponible.`)
    } catch { toast.error('No se pudo buscar el vale.') }
  }

  useEffect(() => {
    const h = (e) => {
      if (document.activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
      if (e.key === 'Escape') { if (valeOpen) setValeOpen(false); else if (modoFiar) setModoFiar(false); else onClose() }
      if (e.key === 'Enter' && !valeOpen) {
        const btn = document.getElementById('btn-pcb-cobrar')
        if (btn && !btn.disabled) { e.preventDefault(); btn.click() }
      }
      if (/^[0-9.]$/.test(e.key)) { e.preventDefault(); tecla(e.key) }
      if (e.key === 'Backspace') { e.preventDefault(); tecla('back') }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, modoFiar, valeOpen, activo])

  const confirmar = () => {
    if (valTransferencia > 0 && !cuenta) { toast.error('Elige la cuenta de la tarjeta.'); return }
    const valePago = valeInfo && valeAplicado > 0 ? { codigo: valeInfo.codigo, monto: valeAplicado } : undefined
    const base = {
      pagos: { efectivo: valEfectivo, transferencia: valTransferencia, vale: valePago },
      cuentaBancaria: valTransferencia > 0 ? cuenta : null,
    }
    if (modoFiar) {
      if (!clienteSelec) { toast.error('Elige un cliente para fiar.'); return }
      onCobrar({ ...base, clienteId: clienteSelec.id, fiar: true })
    } else {
      if (faltante > 0) { toast.error('Aún falta dinero para cubrir el total.'); return }
      onCobrar({ ...base, clienteId: clienteSelec?.id || null, fiar: false })
    }
  }

  const generateQuickBills = (totalAmount) => {
    const suggestions = new Set();
    const exact = Math.ceil(totalAmount);
    suggestions.add(exact);
    const r50  = Math.ceil(totalAmount / 50)  * 50;
    const r100 = Math.ceil(totalAmount / 100) * 100;
    const r200 = Math.ceil(totalAmount / 200) * 200;
    const r500 = Math.ceil(totalAmount / 500) * 500;
    [r50, r100, r200, r500].forEach(v => { if (v > totalAmount) suggestions.add(v); });
    return [...suggestions].slice(0, 4);
  }

  const itemsCount = cart ? cart.reduce((sum, i) => sum + i.cantidad, 0) : 0;

  return (
    <div className="checkout-overlay active" onClick={onClose}>
      <div className="checkout-content" role="dialog" aria-label="Cobrar venta" onClick={(e) => e.stopPropagation()}>
        
        <div className="checkout-header">
          <div className="checkout-header-left" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div>
              <h2 style={{ margin: 0 }}>Cobrar Venta</h2>
              {itemsCount > 0 ? <span className="checkout-items-count">{itemsCount} artículo{itemsCount === 1 ? '' : 's'}</span> : null}
            </div>
            <div className="client-header-selector">
              {clienteId ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--mlb-bg-active)', padding: '5px 8px 5px 5px', borderRadius: '20px', color: 'var(--mlb-text-primary)' }}>
                  <span style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--mlb-accent-soft)', color: 'var(--mlb-accent-ink)', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700 }}>{(clienteSelec?.nombre || '?').trim().slice(0, 2).toUpperCase()}</span>
                  <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{clienteSelec?.nombre}</span>
                    {(deudaCliente > 0 || maxSaldoFavor > 0) ? (
                      <span style={{ fontSize: 10.5, fontWeight: 500, color: 'var(--mlb-text-muted)' }}>{deudaCliente > 0 ? `debe ${formatPrice(deudaCliente)}` : ''}{deudaCliente > 0 && maxSaldoFavor > 0 ? ' · ' : ''}{maxSaldoFavor > 0 ? `a favor ${formatPrice(maxSaldoFavor)}` : ''}</span>
                    ) : null}
                  </span>
                  <button onClick={() => {setClienteId(''); setModoFiar(false)}} style={{ background: 'none', border: 'none', padding: 0, marginLeft: 2, color: 'var(--mlb-text-muted)', cursor: 'pointer', display: 'flex' }} aria-label="Quitar cliente"><X size={14} /></button>
                </div>
              ) : (
                <select 
                  className="pos-select" 
                  style={{ padding: '6px 28px 6px 12px', fontSize: '13px', borderRadius: '16px', borderColor: modoFiar ? '#ef4444' : 'var(--mlb-border)', background: 'var(--mlb-bg-app)', fontWeight: '600', color: 'var(--mlb-text-primary)', height: 'auto' }} 
                  value={clienteId} 
                  onChange={(e) => { setClienteId(e.target.value); if (!e.target.value) setModoFiar(false) }}
                >
                  <option value="">Mostrador (Público general)</option>
                  {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              )}
            </div>
          </div>
          <button className="close-checkout-btn" onClick={onClose}><X size={22} /></button>
        </div>

        <div className="checkout-body">
          {/* Izquierda: Métodos y Teclado */}
          <div className="checkout-left-panel">
            
            <div className="checkout-step-container" style={{ padding: '0 8px', marginBottom: '24px' }}>
              <div className="checkout-step-label" style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--mlb-text-secondary)', marginBottom: '16px', letterSpacing: '0.05em' }}>
                1. ¿Cómo te paga?
              </div>
              <div className="payment-methods-grid">
                <button className={`pay-method-btn method-efectivo ${activo === 'efectivo' && !modoFiar ? 'active' : ''}`} onClick={() => {setActivo('efectivo'); setModoFiar(false);}}>
                  <Banknote size={24} color={activo === 'efectivo' && !modoFiar ? "#fff" : "#065f46"} fill={activo === 'efectivo' && !modoFiar ? "#10b981" : "#a7f3d0"} /> Efectivo
                </button>
                <button className={`pay-method-btn method-tarjeta ${activo === 'tarjeta' && !modoFiar ? 'active' : ''}`} onClick={() => {setActivo('tarjeta'); setModoFiar(false);}}>
                  <Smartphone size={24} color={activo === 'tarjeta' && !modoFiar ? "#fff" : "#1e40af"} fill={activo === 'tarjeta' && !modoFiar ? "#3b82f6" : "#bfdbfe"} /> Transferencia
                </button>
                <button className={`pay-method-btn method-fiar ${modoFiar ? 'active' : ''}`} onClick={() => {setModoFiar(true); setActivo('efectivo');}}>
                  <Handshake size={24} color={modoFiar ? "#fff" : "#86198f"} fill={modoFiar ? "#d946ef" : "#f5d0fe"} /> Fiar
                </button>
              </div>
            </div>

            <div className="numpad-section" style={{display: (activo === 'efectivo' || activo === 'tarjeta' || modoFiar) ? 'flex' : 'none', padding: '0 8px'}}>
              <div className="checkout-step-label" style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--mlb-text-secondary)', marginTop: '0px', letterSpacing: '0.05em' }}>
                2. ¿Cuánto recibes?
              </div>
              <div className="received-display-wrapper">
                <span>{modoFiar ? 'Enganche' : (activo === 'tarjeta' ? 'En Tarjeta' : 'Recibido')}</span>
                <div className="received-amount-display">
                  <span className="currency">$</span>
                  <span className="amount">{activoVal || '0'}</span>
                </div>
              </div>
              
              <div className="quick-bills-row">
                <button className="quick-bill-btn" onClick={pagoJusto}>Exacto</button>
                {generateQuickBills(total).slice(0,3).map(n => (
                  <button key={n} className="quick-bill-btn" onClick={() => setActivoVal(() => String(n))}>{formatPrice(n)}</button>
                ))}
              </div>

              <div className="numpad-grid">
                <button className="numpad-btn" onClick={() => tecla('1')}>1</button>
                <button className="numpad-btn" onClick={() => tecla('2')}>2</button>
                <button className="numpad-btn" onClick={() => tecla('3')}>3</button>
                <button className="numpad-btn" onClick={() => tecla('4')}>4</button>
                <button className="numpad-btn" onClick={() => tecla('5')}>5</button>
                <button className="numpad-btn" onClick={() => tecla('6')}>6</button>
                <button className="numpad-btn" onClick={() => tecla('7')}>7</button>
                <button className="numpad-btn" onClick={() => tecla('8')}>8</button>
                <button className="numpad-btn" onClick={() => tecla('9')}>9</button>
                <button className="numpad-btn" onClick={() => tecla('00')}>00</button>
                <button className="numpad-btn" onClick={() => tecla('0')}>0</button>
                <button className="numpad-btn numpad-del" onClick={() => tecla('back')} aria-label="Borrar"><X size={22} strokeWidth={2.5}/></button>
              </div>
            </div>
            
          </div>

          {/* Derecha: Resumen y Confirmación */}
          <div className="checkout-right-panel">
            <div className="checkout-summary" style={{ marginBottom: '16px' }}>
              <div className="summary-row total-row" style={{ marginBottom: valeInfo ? '8px' : '0' }}>
                <span>Total a Cobrar</span>
                <strong>{formatPrice(total)}</strong>
              </div>

              {!valeInfo && (
                <div style={{ marginBottom: '12px', marginTop: '4px', textAlign: 'right', display: 'flex', justifyContent: 'flex-end' }}>
                  {valeOpen ? (
                    <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
                      <input type="text" className="pos-input" placeholder="Código de vale" value={valeInput} onChange={e => setValeInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && aplicarVale()} autoFocus style={{ flex: 1, padding: '6px 8px', fontSize: '12px', border: '1px solid rgba(0,0,0,0.1)', borderRadius: '6px' }} />
                      <button onClick={aplicarVale} style={{ padding: '6px 10px', background: 'var(--mlb-accent)', border: 'none', color: '#fff', borderRadius: '6px', fontWeight: 600, fontSize: '12px', cursor: 'pointer' }}>Usar</button>
                      <button onClick={() => {setValeOpen(false); setValeInput('');}} style={{ padding: '6px', background: 'none', border: 'none', color: 'var(--mlb-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><X size={16}/></button>
                    </div>
                  ) : (
                    <button onClick={() => setValeOpen(true)} style={{ background: 'none', border: 'none', color: '#6366f1', fontSize: '12px', cursor: 'pointer', fontWeight: '600', padding: 0, opacity: 0.9 }}>
                      + Tienes código de Vale o Regalo?
                    </button>
                  )}
                </div>
              )}

              {favorAplicado > 0 && (
                <div className="summary-row" style={{ color: '#10b981', fontSize: '14px' }}>
                  <span>Saldo a favor</span>
                  <strong>-{formatPrice(favorAplicado)}</strong>
                </div>
              )}

              {valeInfo && (
                <div className="summary-row" style={{ color: '#10b981', fontSize: '14px' }}>
                  <span>Vale ({valeInfo.codigo})</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <strong>-{formatPrice(valeAplicado)}</strong>
                    <button onClick={() => { setValeInfo(null); setValeInput(''); }} style={{ background: 'none', border: 'none', padding: 0, color: '#ef4444', cursor: 'pointer', display: 'flex' }}><X size={14} /></button>
                  </div>
                </div>
              )}

              {modoFiar ? (
                <div className="amount-due-row">
                  <span>Queda debiendo</span>
                  <strong>{formatPrice(faltante)}</strong>
                </div>
              ) : cambio > 0 ? (
                <div className="change-return-row">
                  <span>Entregar Cambio</span>
                  <strong>{formatPrice(cambio)}</strong>
                </div>
              ) : faltante > 0 ? (
                <div className="amount-due-row">
                  <span>Falta Pagar</span>
                  <strong>{formatPrice(faltante)}</strong>
                </div>
              ) : (
                <div className="change-return-row exact">
                  <span>Cambio</span>
                  <strong>$0</strong>
                </div>
              )}

              {clienteSelec && (deudaCliente > 0 || maxSaldoFavor > 0) ? (
                <div style={{ fontSize: 13, color: '#475569', marginTop: 16, padding: '12px 16px', background: '#f1f5f9', borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <strong><User size={14} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: 4 }}/> {clienteSelec.nombre}</strong>
                  <span>{deudaCliente > 0 ? `Debía ${formatPrice(deudaCliente)}` : ''}{deudaCliente > 0 && maxSaldoFavor > 0 ? ' · ' : ''}{maxSaldoFavor > 0 ? `A favor ${formatPrice(maxSaldoFavor)}` : ''}</span>
                </div>
              ) : null}
            </div>

            {activo === 'tarjeta' && !modoFiar && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: '16px', textAlign: 'left' }}>
                <label style={{fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase'}}>
                  <Smartphone size={14} style={{ marginRight: '4px', verticalAlign: 'text-bottom', display: 'inline-block' }} fill="#3b82f6" color="#fff" />
                  Cuenta Destino
                </label>
                <select className="pos-select pos-select-3d" style={{ width: '100%', borderColor: '#bfdbfe', borderBottomColor: '#60a5fa' }} value={cuenta} onChange={(e) => setCuenta(e.target.value)}>
                  {cuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
            )}



            <button 
              id="btn-pcb-cobrar" 
              className="confirm-sale-btn" 
              disabled={busy || (!modoFiar && faltante > 0)} 
              onClick={confirmar}
            >
              <Check size={24} strokeWidth={2.5} />
              {busy ? 'Cobrando…' : modoFiar ? 'Confirmar fiado' : 'Completar Venta'}
            </button>
            
          </div>
        </div>
        
      </div>
    </div>
  )
}

function ExitoVenta({ info, onNueva }) {
  useEffect(() => {
    const h = (e) => { if (['Enter', ' ', 'F2', 'F12', 'Escape'].includes(e.key)) { e.preventDefault(); onNueva() } }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onNueva])

  const reimprimir = () => {
    if (!window.bazar?.printers?.printTicket) { toast.error('Impresión no disponible.'); return }
    const p = window.bazar.printers.printTicket(info).then((r) => { if (!r.ok) throw new Error(r.message); return r.message })
    toast.promise(p, { loading: 'Reimprimiendo…', success: (m) => m, error: (e) => e.message })
  }

  const conCambio = Number(info.cambio) > 0
  return (
    <div data-app-workspace className="pos-success-overlay">
      <div className="pos-success" role="dialog" aria-label="Venta registrada">
        <div className="pos-success__check">
          <svg viewBox="0 0 52 52"><circle className="pos-check-circle" cx="26" cy="26" r="25" /><path className="pos-check-path" d="M14 27l8 8 16-16" /></svg>
        </div>
        <h2>¡Venta registrada!</h2>
        <p>Ticket #{info.ventaId} · {formatPrice(info.total)}{info.clienteNombre ? ` · fiada a ${info.clienteNombre}` : ''}</p>
        {conCambio ? (
          <div className="pos-success__change">
            <span className="pos-success__change-label">Cambio a entregar</span>
            <span className="pos-success__change-amount">{formatPrice(info.cambio)}</span>
          </div>
        ) : null}
        <div className="pos-success__btns">
          <button type="button" className="pos-success-btn" onClick={onNueva}><Plus size={17} strokeWidth={2.4} />Nueva venta</button>
          <button type="button" className="pos-success-btn pos-success-btn--ghost" onClick={reimprimir}>Reimprimir ticket</button>
        </div>
        <p className="pos-success__hint">Enter o F2 para la siguiente venta</p>
      </div>
    </div>
  )
}

/* ── Devolución ────────────────────────────────────────────────────── */


function BanquetaWorkspace() {
  const api = typeof window !== 'undefined' ? window.bazar?.db : undefined
  const banquetaApi = typeof window !== 'undefined' ? window.bazar?.banqueta : undefined
  const [salidas, setSalidas] = useState([])
  const [selId, setSelId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [codigo, setCodigo] = useState('')
  const [cantidad, setCantidad] = useState('1')
  const [edits, setEdits] = useState({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [nuevaOpen, setNuevaOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [cierreOpen, setCierreOpen] = useState(false)
  const [tabIndex, setTabIndex] = useState('activas')

  const cargarDetalle = useCallback(async (id) => {
    if (!id || !api?.getBanquetaSalidaDetail) { setDetail(null); return null }
    const d = await api.getBanquetaSalidaDetail(id)
    setDetail(d || null)
    return d
  }, [api])

  const cargar = useCallback(async () => {
    if (!api?.listBanquetaSalidas) { setLoading(false); return }
    setLoading(true)
    try {
      const rows = await api.listBanquetaSalidas()
      const lista = Array.isArray(rows) ? rows : []
      setSalidas(lista)
      setSelId((prev) => (prev && lista.some((s) => s.id === prev) ? prev : null))
    } catch {
      setSalidas([])
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => { void cargar() }, [cargar])
  useEffect(() => { void cargarDetalle(selId) }, [selId, cargarDetalle])

  useEffect(() => {
    const map = {}
    for (const it of detail?.items || []) {
      map[it.id] = {
        precio: it.precio_vendido != null && it.precio_vendido !== '' ? String(it.precio_vendido) : '',
        cant: String(it.cantidad_vendida || it.cantidad || 1),
      }
    }
    setEdits(map)
  }, [detail])

  const salida = detail?.salida || null
  const items = detail?.items || []
  const estado = salida?.estado || ''
  const editable = estado === 'borrador'
  const enCurso = estado === 'activa'
  const cerrada = estado === 'cerrada'
  const vendidos = items.filter((i) => Number(i.vendido) === 1)
  const ingreso = vendidos.reduce((s, i) => s + (Number(i.precio_vendido) || 0), 0)

  const refrescar = async () => { await cargar(); await cargarDetalle(selId) }
  const withBusy = async (fn, okMsg) => {
    setBusy(true)
    try { const r = await fn(); if (okMsg) toast.success(typeof okMsg === 'function' ? okMsg(r) : okMsg); return r }
    catch (err) { toast.error(err?.message || 'No se pudo completar.') }
    finally { setBusy(false) }
  }

  const crear = (payload) => withBusy(async () => {
    const res = await api.createBanquetaSalida(payload || {})
    await cargar()
    if (res?.id) setSelId(res.id)
    setNuevaOpen(false)
    return res
  }, 'Salida programada.')

  const agregar = async (cod, cant) => {
    const codeUse = String(cod ?? codigo).trim()
    if (!codeUse) { toast.error('Escanea o escribe un código.'); return }
    await withBusy(async () => {
      await api.addProductToBanquetaSalida({ salidaId: selId, codigo: codeUse, cantidad: Math.max(1, Math.floor(Number(cant ?? cantidad) || 1)) })
      setCodigo(''); setCantidad('1')
      await cargarDetalle(selId); await cargar()
    })
  }

  const quitar = (itemId) => withBusy(async () => {
    await api.removeBanquetaSalidaItem(itemId)
    await cargarDetalle(selId); await cargar()
  })

  const activar = () => withBusy(async () => {
    await api.activateBanquetaSalida(selId)
    await refrescar()
  }, '¡Salida en marcha! Ya puedes registrar ventas.')

  const imprimirHoja = () => withBusy(async () => {
    if (!banquetaApi?.printSheet) throw new Error('La impresión es solo en la app de escritorio.')
    const r = await banquetaApi.printSheet(detail)
    if (r && r.ok === false && !r.cancelled) throw new Error(r.message || 'No se pudo generar la hoja.')
  })

  const marcarResultado = (it, vendido) => withBusy(async () => {
    const e = edits[it.id] || {}
    const precio = vendido ? (e.precio !== '' && e.precio != null ? Number(e.precio) : banquetaPrecioParaToggleVendido(it)) : null
    const cant = vendido ? Math.max(1, Math.min(Number(e.cant) || Number(it.cantidad) || 1, Number(it.cantidad) || 1)) : 0
    await api.setBanquetaSalidaItemResult({ itemId: it.id, vendido, precioVendido: precio, cantidadVendida: cant })
    await cargarDetalle(selId)
  })

  const cerrar = () => withBusy(async () => {
    const r = await api.closeBanquetaSalida(selId)
    await refrescar()
    return r
  }, (r) => `Salida cerrada. Ingreso ${formatPrice(r?.ingreso || 0)}.`)

  const eliminar = () => withBusy(async () => {
    await api.deleteBanquetaSalida(selId)
    setSelId(null)
    await cargar()
  }, 'Salida eliminada.')

  const setEdit = (id, key, val) => setEdits((m) => ({ ...m, [id]: { ...(m[id] || {}), [key]: val } }))
  const estadoBadge = (s) => (s === 'activa' ? 'En Curso' : s === 'cerrada' ? 'Cerrada' : 'Borrador')
  const fechaPlan = (f) => {
    if (!f) return 'Sin fecha'
    const s = String(f).slice(0, 10)
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (!m) return s
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })
  }

  const salidasFiltradas = salidas.filter(s => {
    if (tabIndex === 'activas') return s.estado === 'activa'
    if (tabIndex === 'borradores') return s.estado === 'borrador'
    return s.estado === 'cerrada'
  })

  return (
    <section className="pos-tool pos-tool--banqueta" aria-label="Banqueta">
      <div className="pos-tool__workspace" style={{ flex: 1, width: '100%', maxWidth: 1400, padding: '24px 32px', display: 'flex', flexDirection: 'column' }}>
        {!salida ? (
          /* ───────── Ventana 1 · Inicio ───────── */
          <>
            <div className="pos-tool__head" style={{ paddingBottom: 0, borderBottom: 'none', marginBottom: 24 }}>
              <div className="pos-tool__head-left">
                <h2>Salidas a Banqueta</h2>
              </div>
              <button type="button" className="pos-confirm-btn" style={{ width: 'auto', padding: '0 16px', height: 38, borderRadius: 8, display: 'flex', gap: 8, alignItems: 'center' }} disabled={busy} onClick={() => setNuevaOpen(true)}>
                <Plus size={16} /> Programar Salida
              </button>
            </div>
            
            <div style={{ display: 'flex', gap: 24, marginBottom: 24, borderBottom: '1px solid var(--mlb-border)' }}>
              <button type="button" style={{ background: 'transparent', border: 'none', padding: '0 4px 12px', fontSize: 14, fontWeight: 600, color: tabIndex === 'activas' ? 'var(--mlb-accent)' : 'var(--mlb-text-secondary)', borderBottom: tabIndex === 'activas' ? '3px solid var(--mlb-accent)' : '3px solid transparent', cursor: 'pointer', transition: 'color 0.2s' }} onClick={() => setTabIndex('activas')}>En Curso</button>
              <button type="button" style={{ background: 'transparent', border: 'none', padding: '0 4px 12px', fontSize: 14, fontWeight: 600, color: tabIndex === 'borradores' ? 'var(--mlb-accent)' : 'var(--mlb-text-secondary)', borderBottom: tabIndex === 'borradores' ? '3px solid var(--mlb-accent)' : '3px solid transparent', cursor: 'pointer', transition: 'color 0.2s' }} onClick={() => setTabIndex('borradores')}>Borradores</button>
              <button type="button" style={{ background: 'transparent', border: 'none', padding: '0 4px 12px', fontSize: 14, fontWeight: 600, color: tabIndex === 'cerradas' ? 'var(--mlb-accent)' : 'var(--mlb-text-secondary)', borderBottom: tabIndex === 'cerradas' ? '3px solid var(--mlb-accent)' : '3px solid transparent', cursor: 'pointer', transition: 'color 0.2s' }} onClick={() => setTabIndex('cerradas')}>Cerradas</button>
            </div>

            {loading ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--mlb-text-muted)' }}>Cargando salidas…</div>
            ) : salidasFiltradas.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--mlb-text-muted)' }}>
                <Store size={48} strokeWidth={1.2} style={{ opacity: 0.5, margin: '0 auto 16px' }} />
                <h3 style={{ color: 'var(--mlb-text-primary)', marginBottom: 8 }}>No hay salidas aquí</h3>
                <p>Usa las pestañas superiores para navegar.</p>
              </div>
            ) : (
              <div style={{ width: '100%', overflowX: 'auto' }}>
                <table className="pos-table pos-table--hover" style={{ width: '100%', minWidth: 500 }}>
                  <thead>
                    <tr>
                      <th>Salida</th>
                      <th>Ubicación</th>
                      <th>Fecha</th>
                      <th style={{ textAlign: 'center' }}>Prendas</th>
                      <th style={{ textAlign: 'right' }}>Ingresos</th>
                      <th style={{ textAlign: 'center' }}>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {salidasFiltradas.map((s) => (
                      <tr key={s.id} onClick={() => setSelId(s.id)} style={{ cursor: 'pointer' }}>
                        <td style={{ fontWeight: 600 }}>{s.nombre || `#${s.id}`}</td>
                        <td style={{ color: 'var(--mlb-text-secondary)' }}>{s.lugar || '---'}</td>
                        <td style={{ color: 'var(--mlb-text-secondary)' }}>{fechaPlan(s.fecha_planeada)}</td>
                        <td style={{ textAlign: 'center' }}>{s.item_count}</td>
                        <td className="pos-table-total" style={{ fontFamily: 'var(--mlb-font-mono)', fontWeight: 700, textAlign: 'right' }}>
                          {s.estado !== 'borrador' ? formatPrice(s.sold_total || 0) : '---'}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span className="pos-ventas__tag" style={{ background: s.estado === 'activa' ? 'color-mix(in srgb, var(--mlb-success) 15%, transparent)' : 'var(--mlb-bg-panel)', color: s.estado === 'activa' ? 'var(--mlb-success)' : 'var(--mlb-text-muted)' }}>{estadoBadge(s.estado)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : (
                    /* ───────── Detalle: Layout nativo POS (pos-ventas) ───────── */
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div className="pos-tool__head" style={{ paddingBottom: 16, marginBottom: 20 }}>
              <div className="pos-tool__head-left" style={{ gap: 12 }}>
                <button type="button" className="pos-tool__ghost" style={{ padding: 6, borderRadius: '50%' }} onClick={() => setSelId(null)} aria-label="Volver"><ArrowLeft size={18} /></button>
                <h2>{salida.nombre || `#${salida.id}`}</h2>
                <span className="pos-ventas__tag" style={{ marginLeft: 8, background: estado === 'activa' ? 'color-mix(in srgb, var(--mlb-success) 15%, transparent)' : 'var(--mlb-bg-panel)', color: estado === 'activa' ? 'var(--mlb-success)' : 'var(--mlb-text-muted)' }}>{estadoBadge(estado)}</span>
              </div>
            </div>

            <div className="pos-ventas">
              {/* Main Area (Izquierda) */}
              <div className="pos-ventas__main">
                {editable && (
                  <form className="pos-ventas__head" onSubmit={(e) => { e.preventDefault(); void agregar() }}>
                    <div className="pos-ventas__scan">
                      <Barcode size={22} />
                      <input className="pos-input" autoFocus value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Escanea la etiqueta aquí..." />
                    </div>
                    <input className="pos-input" style={{ width: 64, textAlign: 'center' }} value={cantidad} onChange={(e) => setCantidad(e.target.value)} inputMode="numeric" title="Cantidad" />
                    <button type="button" className="pos-tool__ghost" style={{ padding: '0 16px', display: 'flex', alignItems: 'center', gap: 8 }} onClick={() => setAddOpen(true)}>
                      <Search size={18} /> Buscar manual
                    </button>
                    <button type="submit" style={{ display: 'none' }} disabled={busy}>Agregar</button>
                  </form>
                )}

                <div className="pos-ventas__list" style={{ marginTop: editable ? 0 : 12, paddingRight: 4 }}>
                  {items.length === 0 ? (
                    <div className="pos-ventas__empty">
                      <Store size={48} strokeWidth={1} style={{ marginBottom: 12, opacity: 0.5 }} />
                      <h3>No hay prendas aún</h3>
                      <p>{editable ? 'Escanea o busca productos para empezar a armar la salida.' : 'Esta salida no tiene prendas.'}</p>
                    </div>
                  ) : items.map((it) => {
                    const e = edits[it.id] || {}
                    const multi = Number(it.cantidad) > 1
                    const vend = Number(it.vendido) === 1
                    return (
                      <div key={it.id} className={`pos-ventas__row ${vend ? 'is-returned' : ''}`} style={{ cursor: 'default' }}>
                        <div className="pos-ventas__rowmain" style={{ flex: 1 }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <div className="pos-ventas__id">{it.nombre_snapshot || it.codigo_snapshot}{multi ? ` ×${it.cantidad}` : ''}</div>
                            <div className="pos-ventas__meta">{it.codigo_snapshot} · {formatPrice(it.precio_snapshot)}</div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                          <div style={{ textAlign: 'right' }}>
                            {cerrada ? (
                              <span style={{ fontWeight: 600, fontSize: 13, color: vend ? 'var(--mlb-success)' : 'var(--mlb-text-muted)' }}>{vend ? formatPrice(it.precio_vendido) : 'No vendida'}</span>
                            ) : (
                              <span style={{ fontSize: 12, fontWeight: 600, color: vend ? 'var(--mlb-success)' : 'var(--mlb-text-muted)' }}>{vend ? 'Vendida' : 'Pendiente'}</span>
                            )}
                          </div>

                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, minWidth: 100 }}>
                            {editable && (
                              <button type="button" className="pos-tool__ghost" style={{ padding: '6px 8px' }} disabled={busy} onClick={() => void quitar(it.id)}><Trash2 size={16} /></button>
                            )}
                            {enCurso && (
                              <>
                                {multi && <input className="pos-input" value={e.cant ?? ''} onChange={(ev) => setEdit(it.id, 'cant', ev.target.value)} style={{ width: 44, height: 32 }} inputMode="numeric" />}
                                <input className="pos-input" value={e.precio ?? ''} onChange={(ev) => setEdit(it.id, 'precio', ev.target.value)} style={{ width: 76, height: 32, textAlign: 'right' }} inputMode="decimal" placeholder="$" />
                                <button type="button" className={vend ? 'pos-tool__ghost' : 'pos-confirm-btn'} style={{ height: 32, padding: '0 12px', fontSize: 13 }} disabled={busy} onClick={() => void marcarResultado(it, !vend)}>{vend ? '✓' : 'Vender'}</button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Sidebar Area (Derecha) */}
              <div className="pos-ventas__side">
                {(enCurso || cerrada) && (
                  <div className="pos-ventas__cuenta" style={{ background: 'var(--mlb-bg-app)', border: '1px solid var(--mlb-border)' }}>
                    <div className="pos-ventas__cuenta-head">Total Ingresos</div>
                    <div className="pos-ventas__cuenta-amount" style={{ color: 'var(--mlb-success)' }}>{formatPrice(ingreso)}</div>
                  </div>
                )}

                <div className="pos-ventas__detail" style={{ background: 'var(--mlb-bg-app)', borderRadius: 12, padding: 16, border: '1px solid var(--mlb-border)' }}>
                  <div style={{ borderBottom: '1px solid var(--mlb-border)', paddingBottom: 12, marginBottom: 12 }}>
                    <div style={{ fontSize: 13, color: 'var(--mlb-text-secondary)', marginBottom: 2 }}>{salida.lugar || 'Ubicación'}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--mlb-text-primary)' }}>{fechaPlan(salida.fecha_planeada)}</div>
                  </div>

                  {(enCurso || cerrada) ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span style={{ color: 'var(--mlb-text-muted)' }}>Prendas totales</span><strong style={{ fontFamily: 'var(--mlb-font-mono)' }}>{items.length}</strong></div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span style={{ color: 'var(--mlb-text-muted)' }}>Vendidas</span><strong style={{ fontFamily: 'var(--mlb-font-mono)' }}>{vendidos.length}</strong></div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span style={{ color: 'var(--mlb-text-muted)' }}>Pendientes</span><strong style={{ fontFamily: 'var(--mlb-font-mono)' }}>{items.length - vendidos.length}</strong></div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span style={{ color: 'var(--mlb-text-muted)' }}>Prendas listas</span><strong style={{ fontFamily: 'var(--mlb-font-mono)' }}>{items.length}</strong></div>
                  )}
                </div>

                {editable && <button type="button" className="pos-confirm-btn" style={{ width: '100%', height: 48, fontSize: 15 }} disabled={busy || items.length === 0} onClick={() => void activar()}>Activar Salida →</button>}
                {enCurso && <button type="button" className="pos-confirm-btn" style={{ width: '100%', height: 48, fontSize: 15, background: 'var(--mlb-success)' }} disabled={busy} onClick={() => setCierreOpen(true)}>Cerrar Venta</button>}

                <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                  {(editable || enCurso) && <button type="button" className="pos-tool__ghost" style={{ flex: 1, padding: 10, fontSize: 13, borderRadius: 10 }} disabled={busy || items.length === 0} onClick={() => void imprimirHoja()}><Printer size={16} /> Imprimir</button>}
                  {(editable || cerrada) && <button type="button" className="pos-tool__ghost" style={{ flex: 1, padding: 10, fontSize: 13, borderRadius: 10, color: 'var(--mlb-danger)' }} disabled={busy} onClick={() => void eliminar()}><Trash2 size={16} /> {cerrada ? 'Eliminar' : 'Descartar'}</button>}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {nuevaOpen && <BanquetaNuevaModal onClose={() => setNuevaOpen(false)} onCreate={crear} />}
      {addOpen && salida && <BanquetaAddModal salidaId={selId} onClose={() => setAddOpen(false)} onAdded={async () => { await cargarDetalle(selId); await cargar() }} />}
      {cierreOpen && salida && <BanquetaCierreModal detail={detail} onClose={() => setCierreOpen(false)} onConfirm={async () => { await cerrar(); setCierreOpen(false) }} />}
    </section>
  )
}

function BanquetaNuevaModal({ onClose, onCreate }) {
  const [nombre, setNombre] = useState('')
  const [lugar, setLugar] = useState('')
  const [fecha, setFecha] = useState('')
  const [busy, setBusy] = useState(false)
  const crear = async () => {
    setBusy(true)
    try { await onCreate({ nombre: nombre.trim(), lugar: lugar.trim(), fechaPlaneada: fecha || null }) }
    finally { setBusy(false) }
  }
  return (
    <div className="pos-modal-overlay" onClick={onClose}>
      <div className="pos-modal" onClick={(e) => e.stopPropagation()} role="dialog" style={{ maxWidth: 440 }}>
        <div className="pos-modal__head">
          <h2>Programar salida</h2>
          <button type="button" className="pos-modal__close" onClick={onClose}><X size={20} /></button>
        </div>
        <div className="pos-field" style={{ marginBottom: 16 }}>
          <label className="pos-field__label">Nombre</label>
          <input className="pos-input" autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Banqueta de temporada" />
        </div>
        <div className="pos-field" style={{ marginBottom: 16 }}>
          <label className="pos-field__label">Lugar</label>
          <input className="pos-input" value={lugar} onChange={(e) => setLugar(e.target.value)} placeholder="Ej: Tianguis del centro" />
        </div>
        <div className="pos-field" style={{ marginBottom: 24 }}>
          <label className="pos-field__label">Fecha planeada (opcional)</label>
          <input className="pos-input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </div>
        <button type="button" className="pos-confirm-btn" disabled={busy || !nombre.trim()} onClick={() => void crear()} style={{ width: '100%' }}>{busy ? 'Creando...' : 'Crear salida'}</button>
      </div>
    </div>
  )
}

function BanquetaAddModal({ salidaId, onClose, onAdded }) {
  const api = typeof window !== 'undefined' ? window.bazar?.db : undefined
  const [tab, setTab] = useState('buscar')
  const [q, setQ] = useState('')
  const [resultados, setResultados] = useState([])
  const [candidatos, setCandidatos] = useState([])
  const [cant, setCant] = useState({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (tab !== 'buscar' || !api?.searchProducts) return
    let alive = true
    const t = setTimeout(async () => {
      try { const r = await api.searchProducts(q.trim()); if (alive) setResultados(Array.isArray(r) ? r : []) }
      catch { if (alive) setResultados([]) }
    }, 180)
    return () => { alive = false; clearTimeout(t) }
  }, [q, tab, api])

  useEffect(() => {
    if (tab !== 'candidatos' || !api?.listStaleForBanqueta) return
    let alive = true
    ;(async () => {
      try { const c = await api.listStaleForBanqueta({ meses: 6, limit: 80 }); if (alive) setCandidatos(Array.isArray(c) ? c : []) }
      catch { if (alive) setCandidatos([]) }
    })()
    return () => { alive = false }
  }, [tab, api])

  const lista = tab === 'buscar' ? resultados : candidatos
  const agregar = async (p) => {
    if (busy) return
    setBusy(true)
    try {
      const n = Math.max(1, Math.floor(Number(cant[p.id]) || 1))
      await api.addProductToBanquetaSalida({ salidaId, codigo: p.codigo, cantidad: n })
      toast.success(`«${p.descripcion || p.codigo}» agregada.`)
      onAdded?.()
    } catch (err) { toast.error(err?.message || 'No se pudo agregar.') }
    finally { setBusy(false) }
  }

  return (
    <div className="pos-modal-overlay" onClick={onClose}>
      <div className="pos-modal" style={{ maxWidth: 560, width: '92%' }} onClick={(e) => e.stopPropagation()} role="dialog">
        <div className="pos-modal__head">
          <h2>Agregar prendas</h2>
          <button type="button" className="pos-modal__close" onClick={onClose}><X size={20} /></button>
        </div>
        <div style={{ display: 'flex', gap: 24, marginBottom: 16, borderBottom: '1px solid var(--mlb-border)' }}>
          <button type="button" style={{ background: 'transparent', border: 'none', padding: '0 4px 12px', fontSize: 14, fontWeight: 600, color: tab === 'buscar' ? 'var(--mlb-accent)' : 'var(--mlb-text-secondary)', borderBottom: tab === 'buscar' ? '3px solid var(--mlb-accent)' : '3px solid transparent', cursor: 'pointer', transition: 'color 0.2s' }} onClick={() => setTab('buscar')}>Inventario</button>
          <button type="button" style={{ background: 'transparent', border: 'none', padding: '0 4px 12px', fontSize: 14, fontWeight: 600, color: tab === 'candidatos' ? 'var(--mlb-accent)' : 'var(--mlb-text-secondary)', borderBottom: tab === 'candidatos' ? '3px solid var(--mlb-accent)' : '3px solid transparent', cursor: 'pointer', transition: 'color 0.2s' }} onClick={() => setTab('candidatos')}>Candidatos (+6 meses)</button>
        </div>
        {tab === 'buscar' && (
          <input className="pos-input" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre o código..." style={{ marginBottom: 12 }} />
        )}
        <div style={{ border: '1px solid var(--mlb-border)', borderRadius: 8, maxHeight: 300, overflowY: 'auto' }}>
          {lista.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--mlb-text-muted)' }}>Sin resultados.</div>
          ) : lista.map(p => {
            const multi = Number(p.pieza_unica) === 0
            return (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderBottom: '1px solid var(--mlb-border)' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{p.descripcion || p.codigo}</div>
                  <div style={{ fontSize: 11, color: 'var(--mlb-text-muted)' }}>{p.codigo} · {formatPrice(p.precio)} {p.dias_sin_mover != null ? ` · ${p.dias_sin_mover}d sin vender` : ''}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {multi && <input className="pos-input" style={{ width: 44, height: 30 }} inputMode="numeric" value={cant[p.id] ?? '1'} onChange={(e) => setCant((m) => ({ ...m, [p.id]: e.target.value }))} />}
                  <button type="button" className="pos-confirm-btn" style={{ height: 30, padding: '0 10px' }} disabled={busy} onClick={() => void agregar(p)}><Plus size={14} /></button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function BanquetaCierreModal({ detail, onClose, onConfirm }) {
  const items = detail?.items || []
  const vendidos = items.filter((i) => Number(i.vendido) === 1)
  const noVendidos = items.filter((i) => Number(i.vendido) !== 1)
  const ingreso = vendidos.reduce((s, i) => s + (Number(i.precio_vendido) || 0), 0)
  const [busy, setBusy] = useState(false)
  return (
    <div className="pos-modal-overlay" onClick={onClose}>
      <div className="pos-modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()} role="dialog">
        <div className="pos-modal__head">
          <h2>Confirmar Cierre</h2>
          <button type="button" className="pos-modal__close" onClick={onClose}><X size={20} /></button>
        </div>
        <div style={{ background: 'var(--mlb-bg-app)', border: '1px solid var(--mlb-border)', borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 14 }}>
            <span style={{ color: 'var(--mlb-text-muted)' }}>Vendidas</span>
            <strong>{vendidos.length} / {items.length}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16 }}>
            <span style={{ color: 'var(--mlb-text-muted)' }}>Total Ingresos</span>
            <strong style={{ color: 'var(--mlb-success)' }}>{formatPrice(ingreso)}</strong>
          </div>
        </div>
        <div style={{ background: 'color-mix(in srgb, #d99a16 12%, transparent)', color: '#8a5a08', padding: 12, borderRadius: 8, fontSize: 13, marginBottom: 20 }}>
          <Store size={16} style={{ float: 'left', marginRight: 8, marginTop: 2 }} />
          Las {noVendidos.length} prendas no vendidas quedarán <b>desactivadas</b>. Podrás reactivarlas después escaneándolas.
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button type="button" className="pos-tool__ghost" style={{ flex: 1 }} onClick={onClose}>Cancelar</button>
          <button type="button" className="pos-confirm-btn" style={{ flex: 1 }} disabled={busy} onClick={async () => { setBusy(true); try { await onConfirm() } finally { setBusy(false) } }}>Cerrar Venta</button>
        </div>
      </div>
    </div>
  )
}


function ReportesPosWorkspace() {
  const api = typeof window !== 'undefined' ? window.bazar?.db : undefined
  const saldosApi = typeof window !== 'undefined' ? window.bazar?.saldos : undefined
  const [ventas, setVentas] = useState([])
  const [cuentas, setCuentas] = useState([])
  const [loading, setLoading] = useState(true)

  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      const [vs, cs] = await Promise.all([
        api?.getSales?.({ limit: 500 }) ?? [],
        saldosApi?.listCuentas?.({ incluirArchivadas: false }) ?? [],
      ])
      setVentas(Array.isArray(vs) ? vs : [])
      setCuentas(Array.isArray(cs) ? cs : [])
    } catch {
      setVentas([])
      setCuentas([])
    } finally {
      setLoading(false)
    }
  }, [api, saldosApi])

  useEffect(() => {
    void cargar()
    const unsub = window.bazar?.runtime?.subscribeCuentasChanged?.(() => { void cargar() })
    return () => { unsub?.() }
  }, [cargar])

  const corte = useMemo(() => corteDelDia(ventas, cuentas), [ventas, cuentas])
  const fiado = useMemo(() => totalFiadoAfuera(cuentas), [cuentas])

  const descargarCsv = () => {
    const rows = [
      ['Concepto', 'Monto'],
      ['Efectivo neto', corte.efectivoEnCaja],
      ['Transferencias', corte.transferencia],
      ['Total cobrado', corte.totalCobrado],
      ['Fiado anotado', corte.fiadoAnotado],
      ['Devoluciones efectivo', corte.devolucionesEfectivo],
      ['Devoluciones transferencia', corte.devolucionesTransferencia],
      ['Fiado en la calle', fiado.total],
    ]
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `reporte-caja-${corte.hoy}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="pos-tool pos-tool--reportes" aria-label="Reportes">
      <div className="pos-tool__panel">
        <div className="pos-tool__head">
          <div className="pos-tool__title">
            <span className="pos-tool__icon"><BarChart3 size={19} strokeWidth={1.8} /></span>
            <div>
              <h2>Reportes de caja</h2>
              <p>Corte rapido del dia con devoluciones y fiado separado.</p>
            </div>
          </div>
          <button type="button" className="pos-tool__ghost" onClick={descargarCsv}>Descargar CSV</button>
        </div>
        {loading ? <div className="pos-ventas__empty">Calculando...</div> : (
          <div className="pos-report-grid">
            <MetricCard label="Efectivo neto" value={corte.efectivoEnCaja} icon={Banknote} />
            <MetricCard label="Transferencias" value={corte.transferencia} icon={Smartphone} />
            <MetricCard label="Cobrado hoy" value={corte.totalCobrado} icon={ReceiptText} />
            <MetricCard label="Fiado anotado" value={corte.fiadoAnotado} icon={Handshake} />
            <MetricCard label="Devoluciones efectivo" value={corte.devolucionesEfectivo} icon={RefreshCcw} muted />
            <MetricCard label="Fiado en la calle" value={fiado.total} icon={CalendarDays} muted />
          </div>
        )}
      </div>
    </section>
  )
}

function MetricCard({ label, value, icon: Icon, muted = false }) {
  return (
    <div className={`pos-report-card${muted ? ' is-muted' : ''}`}>
      <div className="pos-report-card__head"><Icon size={17} strokeWidth={1.8} /><span>{label}</span></div>
      <strong>{formatPrice(value)}</strong>
    </div>
  )
}

function DevolucionWorkspace({ cuentas, onChanged }) {
  const api = typeof window !== 'undefined' ? window.bazar?.db : undefined
  const [codigo, setCodigo] = useState('')
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState(null)
  const [metodo, setMetodo] = useState('efectivo')               // venta pagada: cómo se devuelve
  const [excedenteMetodo, setExcedenteMetodo] = useState('saldo_a_favor') // venta fiada: qué hacer con lo ya pagado
  const [cuenta, setCuenta] = useState(cuentas[0]?.id || '')

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') { e.preventDefault(); setData(null); setCodigo('') } }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  const item = data?.ventaItem || null
  const credito = data?.credito || null
  const esFiado = !!(item && credito)
  const cantidad = Math.max(1, Math.floor(Number(item?.cantidad) || 1))
  const precio = (Number(item?.precio_snapshot) || 0) * cantidad
  const saldoPend = Number(credito?.saldoPendiente) || 0
  const aplicado = Math.min(saldoPend, precio)                    // cuánto baja la deuda
  const excedente = Math.round(Math.max(0, precio - saldoPend) * 100) / 100 // lo que ya tenía pagado y vuelve

  const buscar = async () => {
    const clean = codigo.trim()
    if (!clean) { toast.error('Ingresá un código de prenda.'); return }
    if (!api?.getVentaItemPorCodigoDevolucion) { toast.error('Devoluciones solo en la app de escritorio.'); return }
    setLoading(true)
    try {
      const d = await api.getVentaItemPorCodigoDevolucion(clean)
      if (!d) { toast.error(`No existe ninguna prenda con el código "${clean}".`); setData(null) }
      else if (!d.ventaItem) { toast.error('Esa prenda no figura vendida (o ya fue devuelta).'); setData(d) }
      else {
        setData(d)
        setExcedenteMetodo('saldo_a_favor')
        const orig = String(d.ventaItem.venta_metodo || '').toLowerCase()
        if (orig === 'efectivo' || orig === 'transferencia') setMetodo(orig)
      }
    } catch (err) { toast.error(err.message || 'Error al buscar.') } finally { setLoading(false) }
  }

  const confirmar = async () => {
    if (!item) return
    setLoading(true)
    try {
      const payload = esFiado
        ? {
            codigo: data.producto.codigo,
            excedenteMetodo, cuentaBancaria: excedenteMetodo === 'transferencia' ? cuenta : '', montoReembolso: precio,
          }
        : {
            codigo: data.producto.codigo, metodoReembolso: metodo,
            cuentaBancaria: metodo === 'transferencia' ? cuenta : '', montoReembolso: precio,
          }
      const res = await api.registrarDevolucionRapida(payload)
      if (res?.ok) {
        if (esFiado) {
          const partes = [`Devuelta. Se canceló ${formatPrice(res.deudaCancelada ?? aplicado)} del fiado de ${credito.clienteNombre}.`]
          if ((res.excedente ?? excedente) > 0) {
            const exMetodo = res.excedenteMetodo || excedenteMetodo;
            if (exMetodo === 'saldo_a_favor') {
              partes.push(`Se agregaron ${formatPrice(res.excedente ?? excedente)} a su Saldo a Favor.`)
            } else {
              partes.push(`Devolví ${formatPrice(res.excedente ?? excedente)} en ${exMetodo}.`)
            }
          }
          toast.success(partes.join(' '))
        } else {
          toast.success(`Listo: "${data.producto.codigo}" volvió al inventario.`)
        }
        setCodigo('')
        setData(null)
        onChanged?.()
        window.dispatchEvent(new CustomEvent('bazar:cuentas-changed'))
      } else throw new Error(res?.message || 'Error inesperado.')
    } catch (err) { toast.error(err.message || 'No se pudo registrar la devolución.') } finally { setLoading(false) }
  }

  return (
    <section className="pos-tool pos-tool--devoluciones" aria-label="Devoluciones">
      <div className="pos-tool__panel pos-tool__panel--narrow">
        <div className="pos-tool__head">
          <div className="pos-tool__title">
            <span className="pos-tool__icon"><RefreshCcw size={19} strokeWidth={1.8} /></span>
            <div>
              <h2>Devoluciones</h2>
              <p>Escanea el codigo vendido y decide si regresa dinero o cancela fiado.</p>
            </div>
          </div>
        </div>
        <form className="pos-field" onSubmit={(e) => { e.preventDefault(); void buscar() }} style={{ display: 'flex', gap: 10 }}>
          <input className="pos-input" value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Código de la prenda vendida" autoFocus />
          <button type="submit" className="pos-confirm-btn" style={{ width: 'auto', padding: '0 22px' }} disabled={loading}>{loading ? '…' : 'Buscar'}</button>
        </form>

        {data ? (
          <div style={{ marginTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{data.producto.descripcion || 'Sin descripción'}</div>
                <div className="pos-line__code" style={{ marginTop: 3 }}>{data.producto.codigo} · {data.producto.estado}</div>
              </div>
              <span className="mono" style={{ fontFamily: 'var(--mlb-font-mono)', fontSize: 18, fontWeight: 700 }}>{formatPrice(data.producto.precio)}</span>
            </div>
            {item ? (
              <div style={{ marginTop: 16, borderTop: '1px solid var(--mlb-border)', paddingTop: 16 }}>
                <p style={{ fontSize: 13.5, color: 'var(--mlb-text-muted)', lineHeight: 1.5, marginBottom: 14 }}>
                  Vendida en el ticket #{item.venta_id} el {new Date(item.venta_fecha).toLocaleDateString('es-MX')} por {formatPrice(precio)} ({item.venta_metodo}).
                </p>

                {esFiado ? (
                  <>
                    <div style={{ background: 'var(--mlb-accent-soft, rgba(255,107,158,0.10))', border: '1px solid var(--mlb-border)', borderRadius: 12, padding: '12px 14px', marginBottom: 14 }}>
                      <div style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 4 }}>Se vendió fiada a {credito.clienteNombre}</div>
                      <div style={{ fontSize: 13, color: 'var(--mlb-text-muted)', lineHeight: 1.55 }}>
                        Hoy debe <strong>{formatPrice(saldoPend)}</strong>. Al devolverla se cancela <strong>{formatPrice(aplicado)}</strong> de su fiado
                        {excedente > 0 ? <> y le sobran <strong>{formatPrice(excedente)}</strong> de lo que ya había pagado.</> : <>.</>}
                      </div>
                    </div>

                    {excedente > 0 ? (
                      <div className="pos-field">
                        <span className="pos-field__label" style={{ color: 'var(--mlb-accent)' }}>
                          🌟 Los {formatPrice(excedente)} sobrantes se guardarán automáticamente como <strong>Saldo a Favor</strong> en su cuenta.
                        </span>
                      </div>
                    ) : null}

                    <button type="button" className="pos-confirm-btn" disabled={loading} onClick={confirmar}>
                      {loading ? 'Confirmando…' : `Devolver y cancelar fiado`}
                    </button>
                  </>
                ) : (
                  <>
                    <div className="pos-field">
                      <span className="pos-field__label">¿Cómo se devuelve el dinero?</span>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>
                        {[['efectivo', 'Efectivo'], ['transferencia', 'Transferencia']].map(([id, label]) => (
                          <button key={id} type="button" className={`pos-cuenta${metodo === id ? ' is-active' : ''}`} style={{ justifyContent: 'center' }} onClick={() => setMetodo(id)}>{label}</button>
                        ))}
                      </div>
                    </div>
                    {metodo === 'transferencia' ? (
                      <div className="pos-field">
                        <span className="pos-field__label">¿Desde qué cuenta?</span>
                        <div className="pos-cuentas">
                          {cuentas.map((c) => (
                            <button key={c.id} type="button" className={`pos-cuenta${cuenta === c.id ? ' is-active' : ''}`} onClick={() => setCuenta(c.id)}>
                              <span className="pos-cuenta__dot" style={{ backgroundColor: c.color }} aria-hidden />{c.nombre}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    <button type="button" className="pos-confirm-btn" style={{ background: 'var(--mlb-danger)' }} disabled={loading} onClick={confirmar}>
                      {loading ? 'Confirmando…' : `Devolver ${formatPrice(precio)}`}
                    </button>
                  </>
                )}

                <p style={{ marginTop: 12, fontSize: 12, color: 'var(--mlb-text-muted)', lineHeight: 1.5 }}>
                  ¿Se lleva otra en su lugar? Devolvé esta y después cobrá la otra como una venta nueva.
                </p>
              </div>
            ) : (
              <p style={{ marginTop: 14, fontSize: 13, color: '#b7791f', lineHeight: 1.5 }}>Esta prenda está disponible en inventario y no figura vendida, así que no hay nada que devolver.</p>
            )}
          </div>
        ) : null}
      </div>
    </section>
  )
}
