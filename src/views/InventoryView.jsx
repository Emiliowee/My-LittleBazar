import { startTransition, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  Package,
  Plus,
  RefreshCw,
  Pencil,
  Trash2,
  Percent,
  Tag as TagIcon,
  Printer,
  LayoutGrid,
  LayoutList,
  Download,
  FilterX,
  ScanLine,
  Minus,
} from 'lucide-react'
import { toast } from 'sonner'
import { ProductFormView } from '@/views/ProductFormView'
import { PriceAdjustDialog } from '@/components/inventory/PriceAdjustDialog'
import { formatPrice } from '@/lib/format'
import { appConfirm } from '@/lib/appConfirm'
import { releaseModalBodyLocks } from '@/lib/releaseModalBodyLocks'
import { ipcErrorMessage } from '@/lib/ipcErrorMessage'
import { localPathToFileUrl } from '@/lib/localFileUrl'
import { useEnabledModules } from '@/hooks/useEnabledModules'
import { useModuleCapabilities } from '@/hooks/useModuleCapabilities'
import {
  PageHeader,
  PageHeaderDivider,
  ChipFilter,
  ViewSwitcher,
  EmptyState,
  SelectionToolbar,
  SelectionToolbarButton,
  DataTable,
  DataTableHeader,
  DataTableHead,
  DataTableBody,
  DataTableRow,
  DataTableCell,
  DataTableShell,
  RowActionStrip,
  RowActionButton,
  Checkbox,
  SearchField,
} from '@/components/premium'

const ESTADO_OPTIONS = [
  { value: '0', label: 'Todos' },
  { value: '1', label: 'Disponible' },
  { value: '2', label: 'En banqueta' },
  { value: '3', label: 'Vendido' },
  { value: '4', label: 'Reservado' },
]

const VISTA_OPTIONS = [
  { value: '0', label: 'General' },
  { value: '1', label: 'Banqueta' },
]

const ANTIGUEDAD_OPTIONS = [
  { value: 'main', label: 'Todos' },
  { value: 'stale', label: 'Mas de 6 meses' },
]

function estadoLabel(raw) {
  const e = String(raw || '').trim().toLowerCase()
  const map = { disponible: 'Disponible', reservado: 'Reservado', vendido: 'Vendido', en_banqueta: 'En banqueta' }
  return map[e] || e.split('_').filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') || '—'
}

/** Pill de estado sobre tokens MLB donde aplica. */
function EstadoBadge({ raw }) {
  const e = String(raw || '').toLowerCase()
  const cls =
    e === 'disponible'
      ? 'bg-[var(--mlb-success)]/12 text-[var(--mlb-success)]'
      : e === 'vendido'
        ? 'bg-[var(--mlb-bg-active)] text-[var(--mlb-text-muted)]'
        : e === 'en_banqueta'
          ? 'bg-[var(--mlb-accent-soft)] text-[var(--mlb-accent)]'
          : e === 'reservado'
            ? 'bg-amber-500/12 text-amber-700 dark:text-amber-400'
            : 'bg-[var(--mlb-bg-input)] text-[var(--mlb-text-secondary)]'
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1 truncate rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}
    >
      {estadoLabel(raw)}
    </span>
  )
}

function invVentaItemsCount(row) {
  const n = Number(row?.venta_items_count)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

const MSG_DELETE_BLOCKED_POS =
  'Este articulo tiene al menos una linea en ventas del POS: el comprobante sigue vinculado a este registro. Por eso no se puede borrar, aunque lo marques Disponible otra vez. (Si solo habias puesto Vendido a mano en la ficha y nunca paso por el POS, no hay esas lineas y el borrado puede estar permitido.)'

function formatFechaIngreso(v) {
  if (v == null || v === '') return '—'
  const s = String(v)
  const raw = s.length >= 10 ? s.slice(0, 10) : s
  try {
    const [y, m, d] = raw.split('-').map(Number)
    if (!y || !m || !d) return raw
    const fecha = new Date(y, m - 1, d)
    const hoy = new Date()
    hoy.setHours(0, 0, 0, 0)
    const diffMs = hoy.getTime() - fecha.getTime()
    const diffDias = Math.round(diffMs / 86_400_000)
    if (diffDias === 0) return 'Hoy'
    if (diffDias === 1) return 'Ayer'
    if (diffDias >= 2 && diffDias <= 6) return `Hace ${diffDias} días`
    if (diffDias >= 7 && diffDias <= 13) return 'Hace 1 sem'
    if (diffDias >= 14 && diffDias <= 29) return `Hace ${Math.floor(diffDias / 7)} sem`
    const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
    const mismoAnio = fecha.getFullYear() === hoy.getFullYear()
    return mismoAnio ? `${d} ${meses[m - 1]}` : `${d} ${meses[m - 1]} ${y}`
  } catch {
    return raw
  }
}

function normPiezaUnica(v) { return v == null ? true : typeof v === 'boolean' ? v : Number(v) === 1 }
/** Stock real en BD (incluye 0); solo cae a 1 si el valor es invalido. */
function normStock(row) {
  const n = Number(row?.stock)
  if (Number.isFinite(n) && n >= 0) return Math.floor(n)
  return 1
}

function invRowId(row) {
  const n = Number(row?.id)
  return Number.isFinite(n) ? n : null
}

/** Tags de lista inventario como pills compactas (CSV desde API). */
function InvTagPills({ tagsCsv, max = 999 }) {
  const parts = String(tagsCsv ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (parts.length === 0) {
    return <span className="text-[var(--mlb-text-muted)]">—</span>
  }
  const cap = Number.isFinite(Number(max)) && Number(max) > 0 ? Math.floor(Number(max)) : 999
  const visible = parts.slice(0, cap)
  const hidden = parts.length - visible.length
  return (
    <span className="flex max-w-full flex-wrap items-center gap-1">
      {visible.map((t, i) => (
        <span
          key={`${i}-${t}`}
          className="inline-flex max-w-[9rem] shrink-0 truncate rounded-md border border-[var(--mlb-border)] bg-[var(--mlb-bg-input)] px-1.5 py-0.5 text-[10.5px] font-medium text-[var(--mlb-text-primary)]"
          title={t}
        >
          {t}
        </span>
      ))}
      {hidden > 0 ? (
        <span className="shrink-0 text-[10px] font-medium tabular-nums text-[var(--mlb-text-muted)]" title={parts.join(', ')}>
          +{hidden}
        </span>
      ) : null}
    </span>
  )
}

export function InventoryView() {
  const { isEnabled: isModuleEnabled } = useEnabledModules()
  const { isCapabilityEnabled } = useModuleCapabilities()
  const [rows, setRows] = useState([])
  const [q, setQ] = useState('')
  const qRef = useRef('')
  const inventorySearchRef = useRef(null)
  const listReqRef = useRef(0)
  /** Evita doble `openEdit` (StrictMode + sessionStorage + evento en la misma navegacion). */
  const openingInventoryProductRef = useRef(null)
  /** Evita doble `openNew` al abrir alta desde Home / paleta. */
  const newProductBootstrapRef = useRef(false)
  const viewAliveRef = useRef(true)
  const [estadoIndex, setEstadoIndex] = useState(0)
  const [vistaIndex, setVistaIndex] = useState(0)
  const [listTab, setListTab] = useState('main')
  const [viewMode, setViewMode] = useState('table')
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [focusedId, setFocusedId] = useState(null)
  const [editId, setEditId] = useState(null)
  const editIdRef = useRef(null)
  const [priceDialogOpen, setPriceDialogOpen] = useState(false)
  const [altaOpen, setAltaOpen] = useState(false)
  const [altaMode, setAltaMode] = useState('new')
  const [scanPrompt, setScanPrompt] = useState(null) // producto escaneado que ya existe
  const [scanCaptureOpen, setScanCaptureOpen] = useState(false)
  const [scanValue, setScanValue] = useState('')
  const [pendingNewCodigo, setPendingNewCodigo] = useState(null)
  const [addQty, setAddQty] = useState('1')
  editIdRef.current = editId
  qRef.current = q

  const cuadernoInstalled = isModuleEnabled('cuaderno')
  const tagsEnabled = cuadernoInstalled && isCapabilityEnabled('cuaderno', 'tag-explorer')

  useLayoutEffect(() => {
    let raw
    try { raw = sessionStorage.getItem('bazar.inventoryLanding') } catch { return }
    if (!raw) return
    try { sessionStorage.removeItem('bazar.inventoryLanding') } catch { /* noop */ }
    let parsed
    try { parsed = JSON.parse(raw) } catch { return }
    if (!parsed || typeof parsed !== 'object') return
    if (typeof parsed.estadoIndex === 'number' && parsed.estadoIndex >= 0 && parsed.estadoIndex <= 4) setEstadoIndex(parsed.estadoIndex)
    if (typeof parsed.vistaIndex === 'number' && parsed.vistaIndex >= 0 && parsed.vistaIndex <= 1) setVistaIndex(parsed.vistaIndex)
    if (parsed.listTab === 'stale' || parsed.listTab === 'main') setListTab(parsed.listTab)
  }, [])

  // Vista Banqueta ya filtra por `en_banqueta`; un chip de estado incompatible (p. ej. Vendido) vacia la lista sin que quede claro por que.
  useEffect(() => {
    if (vistaIndex !== 1) return
    if (estadoIndex !== 0 && estadoIndex !== 2) setEstadoIndex(0)
  }, [vistaIndex, estadoIndex])

  const refresh = useCallback(async (searchOverride) => {
    const api = window.bazar?.db
    if (!api?.getInventoryList) { setRows([]); return }
    const search =
      searchOverride !== undefined && searchOverride !== null
        ? String(searchOverride).trim()
        : String(qRef.current).trim()
    const reqId = ++listReqRef.current
    try {
      const data = await api.getInventoryList({ search, estadoIndex, vistaIndex, listTab })
      if (reqId !== listReqRef.current) return
      if (!viewAliveRef.current) return
      const nextRows = Array.isArray(data) ? data : []
      const visibleIds = new Set(
        nextRows.map((r) => invRowId(r)).filter((id) => id != null),
      )
      // Transicion baja la prioridad frente a la escritura en la busqueda (p. ej. tras borrar y listas grandes).
      startTransition(() => {
        setRows(nextRows)
        // Tras cambiar busqueda/filtros, la seleccion debe quedar solo sobre filas visibles;
        // si no, Eliminar actua sobre ids que ya no coinciden con lo que el usuario ve.
        setSelectedIds((prev) => {
          if (prev.size === 0) return prev
          const next = new Set()
          for (const x of prev) {
            const n = Number(x)
            if (Number.isFinite(n) && n > 0 && visibleIds.has(n)) next.add(n)
          }
          return next.size === prev.size ? prev : next
        })
        setFocusedId((cur) => {
          if (cur == null) return cur
          const n = Number(cur)
          return Number.isFinite(n) && n > 0 && visibleIds.has(n) ? n : null
        })
      })
    } catch (e) {
      if (reqId !== listReqRef.current) return
      if (!viewAliveRef.current) return
      toast.error(ipcErrorMessage(e))
    }
  }, [estadoIndex, vistaIndex, listTab])

  useEffect(() => {
    viewAliveRef.current = true
    return () => {
      viewAliveRef.current = false
    }
  }, [])

  // Filtros: limpiar seleccion (evita ids invisibles) y refresco inmediato. Texto: debounce aparte.
  useEffect(() => {
    setSelectedIds(new Set())
    void refresh()
  }, [estadoIndex, vistaIndex, listTab, refresh])

  useEffect(() => {
    const t = window.setTimeout(() => {
      void refresh(q)
    }, 200)
    return () => window.clearTimeout(t)
  }, [q, refresh])

  // Una venta o devolución en la ventana del PDV cambia el stock; si esta vista
  // de inventario está abierta, debe enterarse y refrescarse (no quedar vieja).
  useEffect(() => {
    const handler = () => { void refresh() }
    const unsub = window.bazar?.runtime?.subscribeCuentasChanged?.(handler)
    window.addEventListener('bazar:cuentas-changed', handler)
    return () => {
      unsub?.()
      window.removeEventListener('bazar:cuentas-changed', handler)
    }
  }, [refresh])

  // ProductFormView hace su propio fetch por productId, así que aquí solo
  // necesitamos el id: abrimos la página y el form carga la prenda.
  const openEdit = useCallback((row) => {
    if (!row) return
    const id = invRowId(row)
    if (id == null) { toast.error('Identificador de articulo no valido.'); return }
    setEditId(id)
    setFocusedId(id)
    setAltaMode('edit')
    setAltaOpen(true)
  }, [])

  // El código nuevo lo genera ProductFormView (nextCodigoMsr) al abrir.
  const openNew = useCallback(() => {
    setEditId(null)
    setFocusedId(null)
    setPendingNewCodigo(null)
    setAltaMode('new')
    setAltaOpen(true)
  }, [])

  const onAltaSaved = useCallback(async (saved) => {
    const sid = Number(saved?.id)
    if (Number.isFinite(sid) && sid > 0) setFocusedId(sid)
    if (saved?.keepOpen !== true) {
      setAltaOpen(false)
    }
    await refresh()
  }, [refresh])

  useEffect(() => {
    // Al escanear una etiqueta YA registrada → mostramos un aviso con opciones
    // (en vez de abrir edición directo). Recordá a la señora: 1 escaneo, 1 elección.
    const onScan = (e) => {
      const id = Number(e?.detail)
      if (!Number.isFinite(id) || id <= 0) return
      if (openingInventoryProductRef.current === id) return
      openingInventoryProductRef.current = id
      void (async () => {
        try {
          const db = window.bazar?.db
          const prod = (await db?.getProductById?.(id)) || null
          if (prod) setScanPrompt(prod)
          else await openEdit({ id })
        } finally {
          openingInventoryProductRef.current = null
        }
      })()
    }
    window.addEventListener('bazar:inventory-open-product', onScan)
    return () => window.removeEventListener('bazar:inventory-open-product', onScan)
  }, [openEdit])

  useEffect(() => {
    let cancelled = false
    if (newProductBootstrapRef.current) return
    let raw
    try {
      raw = sessionStorage.getItem('bazar.inventoryNewProduct')
    } catch {
      return
    }
    if (!raw) return
    newProductBootstrapRef.current = true
    void (async () => {
      try {
        if (!cancelled) await openNew()
      } finally {
        newProductBootstrapRef.current = false
        if (!cancelled) {
          try {
            sessionStorage.removeItem('bazar.inventoryNewProduct')
          } catch {
            /* noop */
          }
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [openNew])

  const closeAlta = useCallback(() => {
    setAltaOpen(false)
    setPendingNewCodigo(null)
    releaseModalBodyLocks()
  }, [])

  /* ---- Botón escáner: capturá el código y enrutá ---- */
  const processScan = useCallback(async (raw) => {
    const code = String(raw || '').trim()
    if (!code) return
    setScanCaptureOpen(false)
    setScanValue('')
    const db = window.bazar?.db
    try {
      const found = await db?.getProductByCodigo?.(code)
      if (found) {
        const full = (await db?.getProductById?.(found.id)) || found
        setScanPrompt(full) // ya existe → mensaje con opciones
      } else {
        // Código nuevo → crear producto con esa etiqueta ya puesta.
        setEditId(null)
        setFocusedId(null)
        setPendingNewCodigo(code)
        setAltaMode('new')
        setAltaOpen(true)
      }
    } catch (err) {
      toast.error(ipcErrorMessage(err) || 'No se pudo leer el código.')
    }
  }, [])

  /* ---- Aviso al escanear una etiqueta ya registrada ---- */
  const closeScanPrompt = useCallback(() => setScanPrompt(null), [])
  const scanPromptEdit = useCallback(() => {
    const p = scanPrompt
    setScanPrompt(null)
    if (p?.id != null) void openEdit({ id: p.id })
  }, [scanPrompt, openEdit])
  const scanPromptAddStock = useCallback(async () => {
    const p = scanPrompt
    const amount = Math.max(1, Math.floor(Number(addQty) || 1))
    setScanPrompt(null)
    if (!p) return
    const db = window.bazar?.db
    const newStock = Math.max(0, Number(p.stock) || 0) + amount
    try {
      // Payload completo (spread del producto) para no pisar nada al sumar stock.
      await db.updateProduct({ ...p, stock: newStock, pieza_unica: 0, skipTagValidation: true, skipRuleLearning: true })
      toast.success(`+${amount} a «${p.descripcion || 'artículo'}» (ahora ${newStock}).`)
      void refresh()
    } catch (err) {
      toast.error(ipcErrorMessage(err) || 'No se pudo sumar stock.')
    }
  }, [scanPrompt, addQty, refresh])

  const scanPromptReactivar = useCallback(async () => {
    const p = scanPrompt
    setScanPrompt(null)
    if (!p?.id) return
    const db = window.bazar?.db
    try {
      await db.reactivarProductoBanqueta({ productoId: p.id })
      toast.success(`«${p.descripcion || 'artículo'}» reactivado y disponible.`)
      void refresh()
    } catch (err) {
      toast.error(ipcErrorMessage(err) || 'No se pudo reactivar.')
    }
  }, [scanPrompt, refresh])

  // Al abrir el aviso, la cantidad a sumar arranca en 1.
  useEffect(() => { if (scanPrompt) setAddQty('1') }, [scanPrompt])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      if (priceDialogOpen) { setPriceDialogOpen(false); return }
      if (altaOpen) closeAlta()
    }
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey)
  }, [altaOpen, priceDialogOpen, closeAlta])

  const priceDialogWasOpen = useRef(false)
  useEffect(() => {
    if (priceDialogOpen) { priceDialogWasOpen.current = true; return }
    if (!priceDialogWasOpen.current) return
    priceDialogWasOpen.current = false
    const id = window.setTimeout(() => {
      releaseModalBodyLocks()
      inventorySearchRef.current?.focus?.({ preventScroll: true })
    }, 50)
    return () => clearTimeout(id)
  }, [priceDialogOpen])

  const deleteOne = useCallback(async (id, codigo, metaRow) => {
    const api = window.bazar?.db
    const pid = Number(id)
    if (!api?.deleteProduct || id == null || !Number.isFinite(pid) || pid <= 0) return
    if (metaRow != null && invVentaItemsCount(metaRow) > 0) {
      toast.error(MSG_DELETE_BLOCKED_POS)
      return
    }
    if (!(await appConfirm(`Eliminar ${codigo || id}?`, { destructive: true, confirmLabel: 'Eliminar' }))) return
    try {
      await api.deleteProduct(pid)
      toast.success('Eliminado')
      setSelectedIds((prev) => { const n = new Set(prev); n.delete(pid); n.delete(id); return n })
      if (focusedId === pid || focusedId === id) setFocusedId(null)
      if (editIdRef.current === pid || editIdRef.current === id) closeAlta()
      await new Promise((r) => requestAnimationFrame(r))
      await refresh()
      requestAnimationFrame(() => {
        inventorySearchRef.current?.focus?.({ preventScroll: true })
      })
    } catch (e) {
      toast.error(ipcErrorMessage(e))
    }
  }, [closeAlta, refresh, focusedId])

  const deleteMany = useCallback(async () => {
    const ids = Array.from(
      new Set(Array.from(selectedIds, (x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0)),
    )
    if (ids.length === 0) return
    if (!(await appConfirm(`Eliminar ${ids.length} articulo(s)?`, { destructive: true, confirmLabel: 'Eliminar' }))) return
    const api = window.bazar?.db
    if (!api?.deleteProduct) { toast.error('Base de datos no disponible.'); return }
    const byId = new Map()
    for (const r of rows) {
      const rid = invRowId(r)
      if (rid != null) byId.set(rid, r)
    }
    let ok = 0
    const failLines = []
    const removedFromSelection = new Set()
    for (const pid of ids) {
      const row = byId.get(pid)
      if (row != null && invVentaItemsCount(row) > 0) {
        failLines.push(`${row.codigo || pid}: historial POS (no se borra)`)
        continue
      }
      try {
        await api.deleteProduct(pid)
        ok += 1
        removedFromSelection.add(pid)
        // Ceder el hilo para que el input de busqueda siga respondiendo entre borrados IPC.
        await new Promise((r) => requestAnimationFrame(r))
      } catch (e) {
        failLines.push(`${row?.codigo || pid}: ${ipcErrorMessage(e)}`)
      }
    }
    if (removedFromSelection.size > 0) {
      setSelectedIds((prev) => {
        const n = new Set(prev)
        for (const id of removedFromSelection) n.delete(id)
        return n
      })
    }
    if (ok > 0) toast.success(ok === ids.length ? `Eliminados ${ok} articulo(s)` : `Eliminados ${ok} de ${ids.length}`)
    if (failLines.length) {
      const head = failLines.slice(0, 4).join('\n')
      const more = failLines.length > 4 ? `\n...y ${failLines.length - 4} mas` : ''
      toast.error(head + more, { duration: 12_000 })
    }
    await refresh()
    requestAnimationFrame(() => {
      inventorySearchRef.current?.focus?.({ preventScroll: true })
    })
  }, [selectedIds, refresh, rows])

  const printLabels = useCallback(async (ids) => {
    const api = window.bazar?.printers?.printLabel
    if (!api) { toast.error('Impresion no disponible'); return }
    const list = ids && ids.length ? ids : [...selectedIds]
    if (list.length === 0) { toast.message('Selecciona al menos un articulo'); return }
    const byId = new Map()
    for (const r of rows) {
      const id = invRowId(r)
      if (id != null) byId.set(id, r)
    }
    let ok = 0
    for (const raw of list) {
      const id = Number(raw)
      const r = Number.isFinite(id) ? byId.get(id) : undefined
      if (!r) continue
      try {
        const res = await api({ codigo: r.codigo, nombre: r.descripcion || r.codigo, precio: Number(r.precio) || 0 })
        if (res?.ok) ok += 1
      } catch { /* continuamos con las demas */ }
    }
    toast.success(`${ok}/${list.length} etiquetas generadas`)
  }, [rows, selectedIds])

  const clearFilters = () => {
    setEstadoIndex(0)
    setVistaIndex(0)
    setListTab('main')
    setQ('')
    inventorySearchRef.current?.focus?.({ preventScroll: true })
  }

  const hasActiveFilters = estadoIndex !== 0 || vistaIndex !== 0 || listTab !== 'main' || q.trim() !== ''
  const allRowIds = useMemo(
    () => rows.map((r) => invRowId(r)).filter((id) => id != null),
    [rows],
  )
  const allSelected = allRowIds.length > 0 && allRowIds.every((id) => selectedIds.has(id))
  const someSelected = allRowIds.some((id) => selectedIds.has(id))
  const headerChecked = allSelected ? true : someSelected ? 'indeterminate' : false

  /** El `Checkbox` premium llama `onChange(!isOn)`; en indeterminado `isOn` es true → llega `false` y no debe vaciar la tabla: debe completar la seleccion. */
  const toggleHeaderSelect = useCallback(() => {
    if (allRowIds.length === 0) return
    if (allSelected) setSelectedIds(new Set())
    else setSelectedIds(new Set(allRowIds))
  }, [allRowIds, allSelected])

  const toggleOne = (id) => {
    const n = Number(id)
    if (!Number.isFinite(n)) return
    setSelectedIds((prev) => {
      const next = new Set(Array.from(prev, (x) => Number(x)).filter((x) => Number.isFinite(x)))
      if (next.has(n)) next.delete(n)
      else next.add(n)
      return next
    })
  }

  /** Toda la seleccion visible tiene historial POS: el borrado masivo no va a lograr nada util. */
  const bulkDeleteAllBlocked = useMemo(() => {
    if (selectedIds.size === 0) return false
    const byId = new Map()
    for (const r of rows) {
      const rid = invRowId(r)
      if (rid != null) byId.set(rid, r)
    }
    for (const raw of selectedIds) {
      const id = Number(raw)
      if (!Number.isFinite(id) || id <= 0) return false
      const r = byId.get(id)
      if (!r) return false
      if (invVentaItemsCount(r) === 0) return false
    }
    return true
  }, [rows, selectedIds])

  // Si hay pagina abierta (nuevo / edit) tomamos todo el canvas del modulo.
  const hasInvSelection = selectedIds.size > 0

  // Alta / edición: el formulario nuevo a página completa.
  if (altaOpen) {
    return (
      <ProductFormView
        productId={altaMode === 'edit' ? editId : null}
        initialCodigo={altaMode === 'new' ? pendingNewCodigo : null}
        onClose={closeAlta}
        onSaved={onAltaSaved}
      />
    )
  }

  return (
    <div data-app-workspace className="relative flex min-h-0 min-w-0 h-full w-full flex-1 flex-col bg-[var(--mlb-bg-app)] text-[var(--mlb-text-primary)]">
      <PageHeader
        className="relative z-[130] shrink-0 bg-[var(--mlb-bg-app)]"
        icon={<Package className="size-5" strokeWidth={1.5} />}
        eyebrow="Catalogo"
        title="Inventario"
        description="Todos los articulos de la tienda. Filtra, edita y ajusta precios en masa."
        count={rows.length}
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { setScanValue(''); setScanCaptureOpen(true) }}
              title="Escanear etiqueta"
              aria-label="Escanear etiqueta"
              className="mlb-focus-ring inline-flex size-7 items-center justify-center rounded-md border border-[var(--mlb-border-strong)] bg-[var(--mlb-bg-input)] text-[var(--mlb-text-secondary)] transition-colors hover:bg-[var(--mlb-bg-hover)] hover:text-[var(--mlb-text-primary)]"
            >
              <ScanLine className="size-4" strokeWidth={1.75} />
            </button>
            <button
              type="button"
              onClick={() => void openNew()}
              className="inline-flex h-7 items-center gap-1.5 rounded-md bg-[var(--mlb-accent)] px-2.5 text-[12.5px] font-medium text-white transition-colors hover:bg-[var(--mlb-accent-hover)]"
            >
              <Plus className="size-3.5" strokeWidth={2} />
              Nueva prenda
            </button>
          </div>
        }
        menuItems={[
          { id: 'price', label: 'Ajustar precios en masa...', icon: <Percent className="size-3.5" />, onClick: () => setPriceDialogOpen(true) },
          { id: 'print', label: 'Imprimir etiquetas seleccionadas', icon: <Printer className="size-3.5" />, onClick: () => printLabels() },
          { id: 'refresh', label: 'Refrescar', icon: <RefreshCw className="size-3.5" />, onClick: () => void refresh(), separatorBefore: true },
          { id: 'clear', label: 'Vaciar filtros', icon: <FilterX className="size-3.5" />, onClick: clearFilters },
          { id: 'export', label: 'Exportar CSV', icon: <Download className="size-3.5" />, onClick: () => toast.message('Exportacion pronto disponible') },
        ]}
      />
      <PageHeaderDivider className="relative z-[130] shrink-0 bg-[var(--mlb-bg-app)]" />

      <div className="relative isolate z-0 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      {/* Toolbar de filtros / vista */}
      <div className="relative flex shrink-0 items-center justify-between gap-4 border-b border-[var(--mlb-border)] px-10 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <ViewSwitcher
            views={[
              { id: 'table', label: 'Tabla', icon: <LayoutList className="size-3.5" strokeWidth={1.75} /> },
              { id: 'cards', label: 'Tarjetas', icon: <LayoutGrid className="size-3.5" strokeWidth={1.75} /> },
            ]}
            current={viewMode}
            onChange={setViewMode}
          />
          <span className="h-4 w-px bg-[var(--mlb-border)]" aria-hidden />
          <div className="flex min-w-0 items-center gap-1.5">
            <ChipFilter
              label="Estado"
              options={ESTADO_OPTIONS.filter((o) => o.value !== '0')}
              value={estadoIndex ? String(estadoIndex) : null}
              onChange={(v) => setEstadoIndex(v == null ? 0 : Number(v))}
              placeholder="Todos"
            />
            <ChipFilter
              label="Vista"
              options={VISTA_OPTIONS.filter((o) => o.value !== '0')}
              value={vistaIndex ? String(vistaIndex) : null}
              onChange={(v) => setVistaIndex(v == null ? 0 : Number(v))}
              placeholder="General"
            />
            <ChipFilter
              label="Antigüedad"
              options={ANTIGUEDAD_OPTIONS.filter((o) => o.value !== 'main')}
              value={listTab !== 'main' ? listTab : null}
              onChange={(v) => setListTab(v == null ? 'main' : String(v))}
              placeholder="Todas"
            />
            {hasActiveFilters ? (
              <button
                type="button"
                onClick={clearFilters}
                className="ml-0.5 inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium text-[var(--mlb-text-muted)] transition-colors hover:bg-[var(--mlb-bg-hover)] hover:text-[var(--mlb-text-primary)]"
              >
                <FilterX className="size-3" strokeWidth={1.75} />
                Vaciar
              </button>
            ) : null}
          </div>
        </div>
        <SearchField
          ref={inventorySearchRef}
          value={q}
          onChange={setQ}
          data-inventory-search
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void refresh(q)
            }
          }}
          placeholder={tagsEnabled ? 'Codigo, nombre o tag...' : 'Codigo o nombre...'}
          width="w-72"
        />
      </div>

      {/* Tabla / tarjetas */}
      <DataTableShell className="min-h-0 flex-1 px-10 pb-6 pt-2">
        {rows.length === 0 ? (
          <EmptyState
            icon={<Package className="size-6" strokeWidth={1.5} />}
            title={hasActiveFilters ? 'Sin resultados' : 'Todavia no hay articulos'}
            description={
              hasActiveFilters
                ? 'Proba quitando algunos filtros o ampliar la busqueda.'
                : 'Crea tu primer articulo para empezar a registrar el inventario del bazar.'
            }
            action={
              hasActiveFilters ? (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--mlb-border-strong)] px-3 text-[12.5px] font-medium text-[var(--mlb-text-secondary)] transition-colors hover:bg-[var(--mlb-bg-hover)] hover:text-[var(--mlb-text-primary)]"
                >
                  <FilterX className="size-3.5" strokeWidth={1.75} />
                  Vaciar filtros
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void openNew()}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[var(--mlb-accent)] px-3 text-[12.5px] font-medium text-white transition-colors hover:bg-[var(--mlb-accent-hover)]"
                >
                  <Plus className="size-3.5" strokeWidth={2} />
                  Crear primera prenda
                </button>
              )
            }
          />
        ) : viewMode === 'cards' ? (
          <CardsView
            rows={rows}
            focusedId={focusedId}
            onFocus={(rid) => {
              if (rid != null && Number.isFinite(Number(rid))) setFocusedId(Number(rid))
            }}
            onEdit={openEdit}
            selectedIds={selectedIds}
            onToggle={toggleOne}
            hasSelection={hasInvSelection}
            showTags={tagsEnabled}
          />
        ) : (
          <div
            className="inv-table-select flex min-h-0 flex-1 flex-col"
            data-has-selection={hasInvSelection ? '' : undefined}
          >
            <DataTable>
            <DataTableHeader>
              <DataTableHead width="32px" className="px-3 inv-select-cell">
                <div data-inv-check-wrap className="inline-flex">
                  <Checkbox checked={headerChecked} onChange={toggleHeaderSelect} aria="Seleccionar todo" />
                </div>
              </DataTableHead>
              <DataTableHead width="128px">Código</DataTableHead>
              <DataTableHead>Nombre</DataTableHead>
              <DataTableHead width="96px" align="right">Precio</DataTableHead>
              <DataTableHead width="64px" align="center">Stock</DataTableHead>
              <DataTableHead width="110px">Estado</DataTableHead>
              <DataTableHead width="100px">Ingreso</DataTableHead>
            </DataTableHeader>
            <DataTableBody>
              {rows.map((r) => {
                const rid = invRowId(r)
                const rowSelected = rid != null && selectedIds.has(rid)
                const rowActive = rid != null && focusedId === rid
                return (
                <DataTableRow
                  key={rid ?? r.id}
                  selected={rowSelected}
                  active={rowActive}
                  onClick={() => rid != null && setFocusedId(rid)}
                  onDoubleClick={(e) => { e.preventDefault(); void openEdit(r) }}
                >
                  <DataTableCell className="px-3 inv-select-cell">
                    <div data-inv-check-wrap className="inline-flex">
                      <Checkbox
                        checked={rowSelected}
                        onChange={() => rid != null && toggleOne(rid)}
                        aria={`Seleccionar ${r.codigo}`}
                      />
                    </div>
                  </DataTableCell>
                  <DataTableCell mono muted>{r.codigo || '—'}</DataTableCell>
                  <DataTableCell>
                    <span className="block max-w-full truncate text-[var(--mlb-text-primary)]">{r.descripcion || '—'}</span>
                  </DataTableCell>
                  <DataTableCell align="right" className="col-precio font-semibold text-[var(--mlb-text-primary)] [font-family:var(--mlb-font-mono)]">
                    {formatPrice(r.precio)}
                  </DataTableCell>
                  <DataTableCell align="center" className="py-1">
                    {(() => {
                      const stock = normPiezaUnica(r.pieza_unica) ? 1 : normStock(r)
                      const isSold = String(r.estado).toLowerCase() === 'vendido'
                      if (isSold || stock === 0) {
                        return <span className="inline-flex px-1.5 py-0.5 rounded-md bg-red-500/10 text-red-500 border border-red-500/20 text-[10px] font-bold">Agotado</span>
                      }
                      if (stock === 1) {
                        return <span className="inline-flex px-1.5 py-0.5 rounded-md bg-[var(--mlb-accent-soft)] text-[var(--mlb-accent)] border border-[var(--mlb-accent-ring)] text-[10px] font-bold">Única</span>
                      }
                      return <span className="inline-flex px-2 py-0.5 rounded-md bg-[var(--mlb-bg-input)] text-[var(--mlb-text-secondary)] border border-[var(--mlb-border)] text-[11px] font-semibold tabular-nums">{stock}</span>
                    })()}
                  </DataTableCell>
                  <DataTableCell><EstadoBadge raw={r.estado} /></DataTableCell>
                  <DataTableCell className="relative pr-3 text-[11.5px] tabular-nums text-[var(--mlb-text-secondary)]">
                    {formatFechaIngreso(r.fecha_ingreso ?? r.created_at)}
                    <RowActionStrip>
                      <RowActionButton
                        icon={<Pencil className="size-3.5" strokeWidth={1.75} />}
                        label="Editar"
                        onClick={() => void openEdit(r)}
                      />
                      <RowActionButton
                        icon={<Printer className="size-3.5" strokeWidth={1.75} />}
                        label="Imprimir etiqueta"
                        onClick={() => rid != null && void printLabels([rid])}
                      />
                      <RowActionButton
                        icon={<Trash2 className="size-3.5" strokeWidth={1.75} />}
                        label="Eliminar"
                        destructive
                        disabled={invVentaItemsCount(r) > 0}
                        title={
                          invVentaItemsCount(r) > 0
                            ? 'No se puede eliminar: tiene lineas en ventas del POS (aunque el estado sea Disponible).'
                            : undefined
                        }
                        onClick={() => rid != null && void deleteOne(rid, r.codigo, r)}
                      />
                    </RowActionStrip>
                  </DataTableCell>
                </DataTableRow>
                )
              })}
            </DataTableBody>
          </DataTable>
          </div>
        )}
      </DataTableShell>

      </div>

      <SelectionToolbar
        underLay={altaOpen}
        count={selectedIds.size}
        countLabel={selectedIds.size === 1 ? 'articulo' : 'articulos'}
        onClear={() => setSelectedIds(new Set())}
        actions={
          <>
            <SelectionToolbarButton
              icon={<Percent className="size-3.5" strokeWidth={1.75} />}
              label="Ajustar precios"
              onClick={() => setPriceDialogOpen(true)}
            />
            <SelectionToolbarButton
              icon={<Printer className="size-3.5" strokeWidth={1.75} />}
              label="Imprimir etiquetas"
              onClick={() => printLabels()}
            />
            {tagsEnabled ? (
              <SelectionToolbarButton
                icon={<TagIcon className="size-3.5" strokeWidth={1.75} />}
                label="Cambiar tags"
                onClick={() => toast.message('Proximamente')}
              />
            ) : null}
            <SelectionToolbarButton
              icon={<Trash2 className="size-3.5" strokeWidth={1.75} />}
              label="Eliminar"
              destructive
              disabled={bulkDeleteAllBlocked}
              title={
                bulkDeleteAllBlocked
                  ? 'Ninguno de los seleccionados se puede borrar: todos tienen historial en ventas del POS.'
                  : undefined
              }
              onClick={deleteMany}
            />
          </>
        }
      />

      <PriceAdjustDialog
        open={priceDialogOpen}
        inventorySearchRef={inventorySearchRef}
        onClose={() => setPriceDialogOpen(false)}
        onApplied={() => void refresh()}
      />

      {scanPrompt && (
        <div
          className="absolute inset-0 z-[200] flex items-center justify-center bg-black/30 p-4"
          onClick={closeScanPrompt}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-[var(--mlb-border-strong)] bg-[var(--mlb-bg-panel)] p-5 shadow-[var(--shadow-pop)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--mlb-bg-active)] text-[var(--mlb-text-secondary)]">
                <Package className="size-4" strokeWidth={1.75} />
              </div>
              <div className="min-w-0">
                <h3 className="text-[14px] font-semibold text-[var(--mlb-text-primary)]">Ya tenés esto</h3>
                <p className="mt-0.5 truncate text-[13px] text-[var(--mlb-text-secondary)]">{scanPrompt.descripcion || 'Artículo'}</p>
                <p className="mt-0.5 text-[12px] tabular-nums text-[var(--mlb-text-muted)]">
                  {scanPrompt.precio != null ? formatPrice(scanPrompt.precio) : '—'} · {Math.max(0, Number(scanPrompt.stock) || 0)} en stock
                </p>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {String(scanPrompt.estado || '').toLowerCase() === 'desactivado' && (
                <>
                  <div className="rounded-lg border border-[var(--mlb-border-strong)] bg-[var(--mlb-bg-active)] px-3 py-2 text-[12.5px] text-[var(--mlb-text-secondary)]">
                    Está <b className="text-[var(--mlb-text-primary)]">desactivado</b> (salió a banqueta y no se vendió). Reactívalo para volver a venderlo.
                  </div>
                  <button
                    type="button"
                    onClick={() => void scanPromptReactivar()}
                    className="mlb-focus-ring inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[var(--mlb-accent)] px-4 text-[13px] font-semibold text-white transition-colors hover:bg-[var(--mlb-accent-hover)]"
                  >
                    <RefreshCw className="size-4" strokeWidth={2.2} /> Reactivar y poner disponible
                  </button>
                </>
              )}
              {/* Elegir cuánto sumar: − N + (o escribir) */}
              <div className="flex items-center justify-center gap-2.5">
                <span className="text-[12.5px] text-[var(--mlb-text-secondary)]">Sumar al stock:</span>
                <div className="inline-flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setAddQty((q) => String(Math.max(1, (Math.floor(Number(q) || 1)) - 1)))}
                    className="mlb-focus-ring inline-flex size-8 items-center justify-center rounded-md border border-[var(--mlb-border-strong)] text-[var(--mlb-text-muted)] transition-colors hover:text-[var(--mlb-text-primary)]"
                    aria-label="Menos"
                  >
                    <Minus className="size-3.5" />
                  </button>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={addQty}
                    onChange={(e) => setAddQty(e.target.value.replace(/[^\d]/g, ''))}
                    onBlur={() => { if (!addQty || Number(addQty) < 1) setAddQty('1') }}
                    className="h-8 w-14 rounded-md border border-[var(--mlb-border-strong)] bg-[var(--mlb-bg-input)] text-center text-[14px] font-semibold tabular-nums text-[var(--mlb-text-primary)] outline-none focus:border-[var(--mlb-border-focus)]"
                  />
                  <button
                    type="button"
                    onClick={() => setAddQty((q) => String((Math.floor(Number(q) || 0)) + 1))}
                    className="mlb-focus-ring inline-flex size-8 items-center justify-center rounded-md border border-[var(--mlb-border-strong)] text-[var(--mlb-text-muted)] transition-colors hover:text-[var(--mlb-text-primary)]"
                    aria-label="Más"
                  >
                    <Plus className="size-3.5" />
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void scanPromptAddStock()}
                className="mlb-focus-ring inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[var(--mlb-accent)] px-4 text-[13px] font-semibold text-white transition-colors hover:bg-[var(--mlb-accent-hover)]"
              >
                <Plus className="size-4" strokeWidth={2.5} /> Agregar {Math.max(1, Math.floor(Number(addQty) || 1))} al stock
              </button>
              <button
                type="button"
                onClick={scanPromptEdit}
                className="mlb-focus-ring inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-[var(--mlb-border-strong)] bg-[var(--mlb-bg-input)] px-4 text-[13px] font-medium text-[var(--mlb-text-primary)] transition-colors hover:bg-[var(--mlb-bg-hover)]"
              >
                <Pencil className="size-4" strokeWidth={1.75} /> Editar
              </button>
              <button
                type="button"
                onClick={closeScanPrompt}
                className="mlb-focus-ring inline-flex h-9 w-full items-center justify-center rounded-lg px-4 text-[12.5px] text-[var(--mlb-text-muted)] transition-colors hover:text-[var(--mlb-text-primary)]"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {scanCaptureOpen && (
        <div className="absolute inset-0 z-[200] flex items-center justify-center bg-black/30 p-4" onClick={() => setScanCaptureOpen(false)}>
          <div
            data-no-barcode="true"
            className="w-full max-w-sm rounded-2xl border border-[var(--mlb-border-strong)] bg-[var(--mlb-bg-panel)] p-5 shadow-[var(--shadow-pop)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col items-center text-center">
              <div className="grid size-12 place-items-center rounded-full bg-[var(--mlb-bg-active)] text-[var(--mlb-accent)]">
                <ScanLine className="size-6" strokeWidth={1.5} />
              </div>
              <h3 className="mt-3 text-[15px] font-semibold text-[var(--mlb-text-primary)]">Escaneá la etiqueta</h3>
              <p className="mt-0.5 text-[12.5px] text-[var(--mlb-text-muted)]">Pasá el lector por la etiqueta. Si no, escribí el código y Enter.</p>
            </div>
            <input
              autoFocus
              type="text"
              value={scanValue}
              onChange={(e) => setScanValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); void processScan(e.currentTarget.value) }
                else if (e.key === 'Escape') setScanCaptureOpen(false)
              }}
              placeholder="Código…"
              className="mt-4 h-11 w-full rounded-xl border border-[var(--mlb-border-strong)] bg-[var(--mlb-bg-input)] px-3.5 text-center font-mono text-[14px] text-[var(--mlb-text-primary)] outline-none transition-colors focus:border-[var(--mlb-border-focus)]"
            />
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => setScanCaptureOpen(false)} className="mlb-focus-ring inline-flex h-9 flex-1 items-center justify-center rounded-lg border border-[var(--mlb-border-strong)] bg-[var(--mlb-bg-input)] px-4 text-[12.5px] text-[var(--mlb-text-secondary)] transition-colors hover:text-[var(--mlb-text-primary)]">Cancelar</button>
              <button type="button" onClick={() => void processScan(scanValue)} className="mlb-focus-ring inline-flex h-9 flex-1 items-center justify-center rounded-lg bg-[var(--mlb-accent)] px-4 text-[12.5px] font-semibold text-white transition-colors hover:bg-[var(--mlb-accent-hover)]">Buscar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** Vista de tarjetas: grilla compacta con imagen opcional, nombre, estado y precio. */
function CardsView({ rows, focusedId, onFocus, onEdit, selectedIds, onToggle, hasSelection, showTags }) {
  return (
    <div
      className="inv-cards-grid grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 pt-3"
      data-has-selection={hasSelection ? '' : undefined}
    >
      {rows.map((r) => {
        const rid = invRowId(r)
        const selected = rid != null && selectedIds.has(rid)
        const active = rid != null && focusedId === rid
        return (
          <article
            key={rid ?? r.id}
            onClick={() => rid != null && onFocus(rid)}
            onDoubleClick={(e) => { e.preventDefault(); void onEdit(r) }}
            className={`group relative cursor-pointer rounded-lg border border-[var(--mlb-border)] p-3 transition-colors ${
              selected
                ? 'border-[var(--mlb-accent)]/40 bg-[var(--mlb-accent-soft)]'
                : active
                  ? 'border-[var(--mlb-border-strong)] bg-[var(--mlb-bg-active)]'
                  : 'border-[var(--mlb-border)] hover:border-[var(--mlb-border-strong)] hover:bg-[var(--mlb-bg-hover)]'
            }`}
          >
            <div data-inv-card-check className="absolute left-2 top-2">
              <Checkbox
                checked={selected}
                onChange={() => rid != null && onToggle(rid)}
                aria={`Seleccionar ${r.codigo}`}
              />
            </div>
            <div className="mb-2 flex items-start justify-between gap-2">
              <span className="font-mono text-[10.5px] text-[var(--mlb-text-muted)]">{r.codigo || '—'}</span>
              <EstadoBadge raw={r.estado} />
            </div>

            {/* Catalog Large Cover Image */}
            <div className="h-32 w-full rounded-md mb-2 bg-[var(--mlb-bg-input)]/50 flex items-center justify-center text-[var(--mlb-text-muted)] border border-[var(--mlb-border)] overflow-hidden shrink-0">
              {r.imagen_path ? (
                <img src={localPathToFileUrl(r.imagen_path)} alt="" className="size-full object-cover animate-in fade-in duration-200" />
              ) : (
                <Package className="size-8" strokeWidth={1.5} />
              )}
            </div>

            <h3 className="mb-2 line-clamp-2 text-[13px] font-bold leading-snug tracking-[-0.005em] text-[var(--mlb-text-primary)]">
              {r.descripcion || '—'}
            </h3>
            {showTags ? (
              <div className="mb-3 text-[11px] leading-relaxed text-[var(--mlb-text-secondary)]">
                <InvTagPills tagsCsv={r.tags} max={4} />
              </div>
            ) : null}

            {/* Price and Stock Indicators */}
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="col-precio text-base font-bold tabular-nums text-[var(--mlb-accent-ink)] [font-family:var(--mlb-font-mono)]">
                {formatPrice(r.precio)}
              </span>
              {(() => {
                const stock = normPiezaUnica(r.pieza_unica) ? 1 : normStock(r)
                const isSold = String(r.estado).toLowerCase() === 'vendido'
                if (isSold || stock === 0) {
                  return <span className="text-[10px] font-bold text-red-500 bg-red-500/10 px-1.5 py-0.5 rounded-md border border-red-500/20">Agotado</span>
                }
                if (stock === 1) {
                  return <span className="text-[10px] font-bold text-[var(--mlb-accent)] bg-[var(--mlb-accent-soft)] px-1.5 py-0.5 rounded-md border border-[var(--mlb-accent-ring)]">Única</span>
                }
                return <span className="text-[10px] font-semibold text-[var(--mlb-text-secondary)] bg-[var(--mlb-bg-input)] px-1.5 py-0.5 rounded-md border border-[var(--mlb-border)] tabular-nums">{stock} Uds</span>
              })()}
            </div>

            <div className="flex items-center justify-between mt-2 pt-2 border-t border-[var(--mlb-border)]/50 text-[10px] text-[var(--mlb-text-muted)]">
              <span>Fecha: {formatFechaIngreso(r.fecha_ingreso ?? r.created_at)}</span>
            </div>
          </article>
        )
      })}
    </div>
  )
}

