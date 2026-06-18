import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Search, Barcode, Trash2, ShoppingBag, X, Plus, Minus, ArrowRight,
  Banknote, Smartphone, Handshake, Check, ArrowLeft, RefreshCcw,
  ShoppingCart, Printer, ReceiptText, BarChart3, Store, CalendarDays,
} from 'lucide-react'
import { toast } from 'sonner'
import { formatPrice } from '@/lib/format'
import { ipcErrorMessage } from '@/lib/ipcErrorMessage'
import { productSellableError } from '@/lib/productSellable'
import { emojiDeCategoria as emojiDe, esRutaImagen, rutaAFileUrl as fileUrl } from '@/lib/categoriaEmoji'
import { calcularCuentaSaldos } from '@/lib/saldosLedger'
import { corteDelDia, totalFiadoAfuera } from '@/lib/reportes'
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
      setClientes((Array.isArray(cuentas) ? cuentas : []).map((c) => ({
        id: c.id, nombre: c.nombre, saldo_pendiente: calcularCuentaSaldos(c).saldo,
      })))
    } catch { setClientes([]) }
  }, [saldosApi])

  useEffect(() => {
    void loadClientes()
    const unsub = window.bazar?.runtime?.subscribeCuentasChanged?.(() => { void loadClientes() })
    return () => { unsub?.() }
  }, [loadClientes])

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

  const cobrar = useCallback(async ({ metodo, pagoCon, cuentaBancaria, clienteId, enganche }) => {
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
        metodo, notas: '',
        pagoCon: metodo === 'efectivo' && pagoCon != null ? Number(pagoCon) : null,
        cuentaBancaria: metodo === 'transferencia' ? cuentaBancaria : null,
        creditoMovimiento: metodo === 'credito'
          ? { saldosClienteId: Number(clienteId), monto: total, enganche: Number(enganche) || 0, engancheMetodo: 'efectivo', descripcion: `Fiado en caja (${cart.length} artículo${cart.length === 1 ? '' : 's'})` }
          : null,
      }
      const result = await api.addSale(payload)
      if (!result?.ok) throw new Error('La venta no se confirmó.')
      if (metodo === 'credito') void loadClientes()

      const cliente = metodo === 'credito' ? clientes.find((c) => Number(c.id) === Number(clienteId)) : null
      const cambio = metodo === 'efectivo' && pagoCon != null ? Math.max(0, Number(pagoCon) - total) : 0
      const ticket = {
        ventaId: result.ventaId, total: result.total ?? total, cambio: result.cambio ?? cambio, metodo,
        pago_con: metodo === 'efectivo' && pagoCon != null ? Number(pagoCon) : null,
        cuenta_bancaria: metodo === 'transferencia' ? cuentaBancaria : null,
        created_at: new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' }),
        items: cart.map((l) => ({ cantidad: l.cantidad, precio_snapshot: l.precio, nombre_snapshot: l.nombre, codigo: l.codigo })),
        cliente: cliente ? { nombre: cliente.nombre, saldo_pendiente: (Number(cliente.saldo_pendiente) || 0) + total - (Number(enganche) || 0) } : null,
        clienteNombre: cliente?.nombre || null, notas: '',
      }
      setPagoPaso(null)
      setCart([])
      setConfirm(ticket)

      if (window.bazar?.printers?.printTicket) {
        const p = window.bazar.printers.printTicket(ticket).then((r) => { if (!r.ok) throw new Error(r.message); return r.message })
        toast.promise(p, { loading: 'Imprimiendo ticket…', success: (m) => m, error: (e) => e.message || 'Error al imprimir.' })
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
          <VentasWorkspace onChanged={() => { void loadClientes() }} />
        ) : modo === 'devoluciones' ? (
          <DevolucionWorkspace cuentas={cuentas} onChanged={() => { void loadClientes() }} />
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
      const res = await api.registrarDevolucionRapida({ codigo: item.codigo_snapshot, montoReembolso: montoRenglon })
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

function ModalCobro({ paso, setPaso, total, cart, cuentas, clientes, busy, saldosApi, onClientesChanged, onCobrar, onClose }) {
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') { e.preventDefault(); paso === 'metodos' ? onClose() : setPaso('metodos') } }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [paso, setPaso, onClose])

  if (paso === 'metodos') {
    return (
      <div className="pos-modal-overlay" onClick={onClose}>
        <div className="pos-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Cobrar venta">
          <div className="pos-modal__head">
            <h2>Cobrar venta</h2>
            <button type="button" className="pos-modal__close" onClick={onClose} aria-label="Cerrar"><X size={20} strokeWidth={2} /></button>
          </div>
          <div className="pos-pay-amount">
            <span>Total a cobrar</span>
            <strong>{formatPrice(total)}</strong>
          </div>
          <div className="pos-pay-methods">
            <button type="button" className="pos-pay-btn" onClick={() => setPaso('efectivo')}>
              <span className="pos-rainbow level-1" />
              <span className="pos-pay-btn__content"><span className="pos-pay-btn__icon"><Banknote size={20} strokeWidth={1.8} /></span>Efectivo</span>
            </button>
            <button type="button" className="pos-pay-btn" onClick={() => setPaso('transferencia')}>
              <span className="pos-rainbow level-3" />
              <span className="pos-pay-btn__content"><span className="pos-pay-btn__icon"><Smartphone size={20} strokeWidth={1.8} /></span>Transferencia</span>
            </button>
            <button type="button" className="pos-pay-btn" onClick={() => setPaso('credito')}>
              <span className="pos-rainbow level-2" />
              <span className="pos-pay-btn__content"><span className="pos-pay-btn__icon"><Handshake size={20} strokeWidth={1.8} /></span>Fiar a cliente</span>
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (paso === 'efectivo') return <PanelEfectivo total={total} cart={cart} busy={busy} onBack={() => setPaso('metodos')} onClose={onClose} onCobrar={onCobrar} />
  if (paso === 'transferencia') return <PanelTransferencia total={total} cuentas={cuentas} busy={busy} onBack={() => setPaso('metodos')} onClose={onClose} onCobrar={onCobrar} />
  if (paso === 'credito') return <PanelFiar total={total} clientes={clientes} busy={busy} saldosApi={saldosApi} onClientesChanged={onClientesChanged} onBack={() => setPaso('metodos')} onClose={onClose} onCobrar={onCobrar} />
  return null
}

function ModalHead({ icon: Icon, title, onClose, onBack }) {
  return (
    <div className="pos-modal__head">
      <div className="pos-modal__head-left">
        {onBack ? <button type="button" className="pos-modal__close" onClick={onBack} aria-label="Volver"><ArrowLeft size={18} strokeWidth={2} /></button> : null}
        <span className="pos-modal__icon"><Icon size={20} strokeWidth={1.8} /></span>
        <h2>{title}</h2>
      </div>
      <button type="button" className="pos-modal__close" onClick={onClose} aria-label="Cerrar"><X size={20} strokeWidth={2} /></button>
    </div>
  )
}

function PanelEfectivo({ total, cart, busy, onBack, onClose, onCobrar }) {
  const [recibido, setRecibido] = useState('')
  const num = Number(recibido)
  const valido = Number.isFinite(num) && num >= total
  const cambio = valido ? num - total : 0

  return (
    <div className="pos-modal-overlay" onClick={onClose}>
      <div className="pos-modal pos-modal--cash" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Pago en efectivo">
        <ModalHead icon={Banknote} title="Pago en efectivo" onClose={onClose} onBack={onBack} />
        <div className="pos-receipt">
          {cart.map((l) => (
            <div key={l.pid} className="pos-receipt__line">
              <span className="pos-receipt__name">{l.nombre} {l.cantidad > 1 ? <span style={{ color: 'var(--mlb-text-muted)' }}>×{l.cantidad}</span> : null}</span>
              <span className="pos-receipt__price">{formatPrice(l.precio * l.cantidad)}</span>
            </div>
          ))}
        </div>
        <div className="pos-ticket-divider"><span>TOTAL</span><span>{formatPrice(total)}</span></div>

        <div style={{ marginBottom: 14 }}>
          <label className="pos-cash-label" htmlFor="pos-recibido">Monto recibido</label>
          <div className="pos-cash-input">
            <span className="pos-cash-input__sym">$</span>
            <input id="pos-recibido" type="number" min={0} step="0.5" inputMode="decimal" value={recibido} onChange={(e) => setRecibido(e.target.value)} placeholder="0.00" autoFocus />
          </div>
          <div className="pos-quick">
            {BILLETES.map((b) => (
              <button key={b} type="button" className="pos-quick__btn" disabled={total > b} onClick={() => setRecibido(String(b))}>${b}</button>
            ))}
            <button type="button" className="pos-quick__btn" onClick={() => setRecibido(String(total))}>Exacto</button>
          </div>
        </div>

        <div className="pos-change">
          <div className="pos-change__row"><span>Recibido</span><span>{recibido !== '' ? formatPrice(num) : '—'}</span></div>
          <div className="pos-change__row"><span>Total</span><span>{formatPrice(total)}</span></div>
          <div className="pos-change__row pos-change__result"><span>Cambio</span><span>{valido ? formatPrice(cambio) : '—'}</span></div>
        </div>

        <button type="button" className="pos-confirm-btn" disabled={busy || (recibido !== '' && !valido)} onClick={() => onCobrar({ metodo: 'efectivo', pagoCon: recibido === '' ? null : num })}>
          <Check size={18} strokeWidth={2.4} />{busy ? 'Cobrando…' : 'Confirmar venta'}
        </button>
      </div>
    </div>
  )
}

function PanelTransferencia({ total, cuentas, busy, onBack, onClose, onCobrar }) {
  const [cuenta, setCuenta] = useState(cuentas[0]?.id || '')
  return (
    <div className="pos-modal-overlay" onClick={onClose}>
      <div className="pos-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Transferencia">
        <ModalHead icon={Smartphone} title="Transferencia" onClose={onClose} onBack={onBack} />
        <div className="pos-pay-amount"><span>Total a cobrar</span><strong>{formatPrice(total)}</strong></div>
        <div className="pos-field">
          <span className="pos-field__label">¿A qué cuenta llega?</span>
          <div className="pos-cuentas" role="radiogroup" aria-label="Cuenta receptora">
            {cuentas.map((c) => (
              <button key={c.id} type="button" role="radio" aria-checked={cuenta === c.id} className={`pos-cuenta${cuenta === c.id ? ' is-active' : ''}`} onClick={() => setCuenta(c.id)}>
                <span className="pos-cuenta__dot" style={{ backgroundColor: c.color }} aria-hidden />{c.nombre}
                {cuenta === c.id ? <Check size={17} strokeWidth={2.4} style={{ marginLeft: 'auto', color: 'var(--mlb-accent-ink)' }} /> : null}
              </button>
            ))}
          </div>
        </div>
        <button type="button" className="pos-confirm-btn" disabled={busy || !cuenta} onClick={() => onCobrar({ metodo: 'transferencia', cuentaBancaria: cuenta })}>
          <Check size={18} strokeWidth={2.4} />{busy ? 'Cobrando…' : `Confirmar ${formatPrice(total)}`}
        </button>
      </div>
    </div>
  )
}

function PanelFiar({ total, clientes, busy, saldosApi, onClientesChanged, onBack, onClose, onCobrar }) {
  const [clienteId, setClienteId] = useState(String(clientes[0]?.id || ''))
  const [enganche, setEnganche] = useState('')
  const [creando, setCreando] = useState(false)
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [nuevoTel, setNuevoTel] = useState('')
  const [guardando, setGuardando] = useState(false)
  const cliente = clientes.find((c) => Number(c.id) === Number(clienteId)) || null
  const engNum = Number(enganche) || 0
  const invalido = enganche !== '' && (!Number.isFinite(engNum) || engNum < 0 || engNum > total)

  const crearCuenta = async () => {
    const nombre = nuevoNombre.trim()
    if (!nombre) { toast.error('Escribí el nombre del cliente.'); return }
    if (!saldosApi?.crearCliente) { toast.error('Las cuentas se manejan en la app de escritorio.'); return }
    setGuardando(true)
    try {
      const res = await saldosApi.crearCliente({ nombre, telefono: nuevoTel.trim() })
      const nuevoId = res?.clienteId || res?.id
      await onClientesChanged?.()
      if (nuevoId) setClienteId(String(nuevoId))
      setCreando(false); setNuevoNombre(''); setNuevoTel('')
      toast.success(`Cuenta de ${nombre} creada.`)
      window.dispatchEvent(new CustomEvent('bazar:cuentas-changed'))
    } catch (err) { toast.error(err?.message || 'No se pudo crear la cuenta.') } finally { setGuardando(false) }
  }

  return (
    <div className="pos-modal-overlay" onClick={onClose}>
      <div className="pos-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Fiar a cliente">
        <ModalHead icon={Handshake} title="Fiar a cliente" onClose={onClose} onBack={onBack} />
        <div className="pos-pay-amount"><span>Se anota a la cuenta</span><strong>{formatPrice(total - engNum)}</strong></div>

        {creando ? (
          <div className="pos-field" style={{ display: 'grid', gap: 9 }}>
            <span className="pos-field__label">Nueva cuenta de fiado</span>
            <input className="pos-input" value={nuevoNombre} onChange={(e) => setNuevoNombre(e.target.value)} placeholder="Nombre de la clienta" autoFocus />
            <input className="pos-input" value={nuevoTel} onChange={(e) => setNuevoTel(e.target.value)} placeholder="Teléfono (opcional)" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>
              <button type="button" className="pos-cuenta" style={{ justifyContent: 'center' }} disabled={guardando} onClick={() => { setCreando(false); setNuevoNombre(''); setNuevoTel('') }}>Cancelar</button>
              <button type="button" className="pos-confirm-btn" style={{ marginTop: 0 }} disabled={guardando || !nuevoNombre.trim()} onClick={() => void crearCuenta()}>{guardando ? 'Guardando…' : 'Crear y elegir'}</button>
            </div>
          </div>
        ) : (
          <>
            <div className="pos-field">
              <label className="pos-field__label" htmlFor="pos-cliente">¿A quién se le fía?</label>
              <select id="pos-cliente" className="pos-select" value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
                {clientes.length === 0 ? <option value="">No hay cuentas registradas</option>
                  : clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}{Number(c.saldo_pendiente) > 0 ? ` — debe ${formatPrice(c.saldo_pendiente)}` : ''}</option>)}
              </select>
              <button type="button" className="pos-link-btn" style={{ marginTop: 8, background: 'none', border: 'none', color: 'var(--mlb-accent-ink, #c2185b)', font: 'inherit', fontWeight: 600, cursor: 'pointer', padding: 0 }} onClick={() => setCreando(true)}>
                <Plus size={14} strokeWidth={2.4} style={{ verticalAlign: '-2px' }} /> Nueva cuenta
              </button>
            </div>
            <div className="pos-field">
              <label className="pos-field__label" htmlFor="pos-enganche">Deja algo a cuenta (opcional)</label>
              <input id="pos-enganche" type="number" min={0} step="0.5" className="pos-input" value={enganche} onChange={(e) => setEnganche(e.target.value)} placeholder="$0.00" />
            </div>
            <button type="button" className="pos-confirm-btn" disabled={busy || !cliente || invalido} onClick={() => onCobrar({ metodo: 'credito', clienteId, enganche: engNum })}>
              <Check size={18} strokeWidth={2.4} />{busy ? 'Registrando…' : 'Confirmar fiado'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

/* ── Éxito ─────────────────────────────────────────────────────────── */

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
  const [salidas, setSalidas] = useState([])
  const [active, setActive] = useState(null)
  const [detail, setDetail] = useState(null)
  const [codigo, setCodigo] = useState('')
  const [precio, setPrecio] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const cargar = useCallback(async () => {
    if (!api?.listBanquetaSalidas) { setLoading(false); return }
    setLoading(true)
    try {
      const [rows, act] = await Promise.all([
        api.listBanquetaSalidas(),
        api.getActiveBanquetaSalida?.(),
      ])
      setSalidas(Array.isArray(rows) ? rows : [])
      setActive(act || null)
      if (act?.id && api.getBanquetaSalidaDetail) setDetail(await api.getBanquetaSalidaDetail(act.id))
      else setDetail(null)
    } catch {
      setSalidas([])
      setActive(null)
      setDetail(null)
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => { void cargar() }, [cargar])

  const crear = async () => {
    if (!api?.createBanquetaSalida) { toast.error('Banqueta solo en la app de escritorio.'); return }
    setBusy(true)
    try {
      const hoy = new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })
      const res = await api.createBanquetaSalida({ nombre: `Banqueta ${hoy}`, lugar: 'Local' })
      if (res?.id && api.activateBanquetaSalida) await api.activateBanquetaSalida(res.id)
      await cargar()
      toast.success('Salida de banqueta creada y activada.')
    } catch (err) {
      toast.error(err?.message || 'No se pudo crear banqueta.')
    } finally {
      setBusy(false)
    }
  }

  const registrarRegreso = async (e) => {
    e.preventDefault()
    if (!active?.id) { toast.error('Primero activa una salida de banqueta.'); return }
    if (!codigo.trim()) { toast.error('Escanea un codigo.'); return }
    setBusy(true)
    try {
      const res = await api.scanBanquetaSalidaResult({ salidaId: active.id, codigo: codigo.trim(), precioVendido: precio })
      if (res?.detail) setDetail(res.detail)
      setCodigo('')
      setPrecio('')
      toast.success(res?.yaEstaba ? 'Ya estaba marcada como vendida.' : 'Regreso registrado.')
      await cargar()
    } catch (err) {
      toast.error(err?.message || 'No se pudo registrar.')
    } finally {
      setBusy(false)
    }
  }

  const items = detail?.items || []
  const vendidos = items.filter((i) => Number(i.vendido) === 1)
  const total = vendidos.reduce((s, i) => s + (Number(i.precio_vendido) || 0), 0)

  return (
    <section className="pos-tool pos-tool--banqueta" aria-label="Banqueta">
      <div className="pos-tool__panel">
        <div className="pos-tool__head">
          <div className="pos-tool__title">
            <span className="pos-tool__icon"><Store size={19} strokeWidth={1.8} /></span>
            <div>
              <h2>Banqueta</h2>
              <p>Control de salida activa y regreso por codigo.</p>
            </div>
          </div>
          <button type="button" className="pos-tool__ghost" disabled={busy} onClick={() => void cargar()}>Actualizar</button>
        </div>

        {loading ? <div className="pos-ventas__empty">Cargando banqueta...</div>
          : !active ? (
            <div className="pos-tool__empty">
              <Store size={38} strokeWidth={1.5} />
              <h3>No hay salida activa</h3>
              <p>Crea una salida para separar prendas de banqueta y luego registrar lo que regresa vendido.</p>
              <button type="button" className="pos-confirm-btn" disabled={busy} onClick={() => void crear()}>Crear salida activa</button>
              {salidas.length > 0 ? <p className="pos-tool__hint">{salidas.length} salidas guardadas en historial.</p> : null}
            </div>
          ) : (
            <div className="pos-tool__grid2">
              <div>
                <div className="pos-tool__summary">
                  <div><span>Salida activa</span><strong>{active.nombre || `#${active.id}`}</strong></div>
                  <div><span>Vendidas</span><strong>{vendidos.length}/{items.length}</strong></div>
                  <div><span>Total regreso</span><strong>{formatPrice(total)}</strong></div>
                </div>
                <form className="pos-banqueta-form" onSubmit={registrarRegreso}>
                  <input className="pos-input" value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Codigo que regreso" autoFocus />
                  <input className="pos-input" value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="Precio vendido opcional" inputMode="decimal" />
                  <button type="submit" className="pos-confirm-btn" disabled={busy}>{busy ? 'Registrando...' : 'Marcar vendido'}</button>
                </form>
              </div>
              <div className="pos-tool__list">
                {items.length === 0 ? <div className="pos-ventas__empty">La salida todavia no tiene prendas.</div>
                  : items.slice(0, 80).map((it) => (
                    <div key={it.id} className={`pos-ventas__item${Number(it.vendido) === 1 ? ' is-returned' : ''}`}>
                      <div className="pos-ventas__itemtext">
                        <span className="pos-ventas__itemname">{it.nombre_snapshot || it.codigo_snapshot}</span>
                        <span className="pos-line__code">{it.codigo_snapshot} · {formatPrice(it.precio_snapshot)}</span>
                      </div>
                      <span className="pos-ventas__returned">{Number(it.vendido) === 1 ? formatPrice(it.precio_vendido) : 'Pendiente'}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}
      </div>
    </section>
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
