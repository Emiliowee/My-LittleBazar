import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  Clock3,
  Download,
  FileSpreadsheet,
  FileText,
  Package,
  ReceiptText,
  RefreshCw,
  Table2,
  WalletCards,
} from 'lucide-react'
import { toast } from 'sonner'
import { formatPrice } from '@/lib/format'
import { diaLocalDeVenta, prendasEstancadas } from '@/lib/reportes'
import { calcularCuentaSaldos } from '@/lib/saldosLedger'
import { buildReportePdfHtml } from '@/lib/reportePdf'
import {
  ChipFilter,
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
  DataTableShell,
  EmptyState,
  PageHeader,
  PageHeaderDivider,
  SearchField,
} from '@/components/premium'

const REPORTES = [
  {
    id: 'ventas',
    nombre: 'Ventas',
    archivo: 'ventas',
    icon: ReceiptText,
    descripcion: 'Tickets emitidos, metodo de pago y total del periodo.',
    responde: 'Cuanto se vendio y por que medio.',
    filtros: ['Fechas', 'Metodo', 'Busqueda'],
  },
  {
    id: 'saldos',
    nombre: 'Saldos pendientes',
    archivo: 'saldos-pendientes',
    icon: WalletCards,
    descripcion: 'Cuentas abiertas, saldadas, identificacion y etiquetas.',
    responde: 'Quien debe, cuanto y que expediente falta.',
    filtros: ['Saldo', 'Identificacion', 'Etiqueta', 'Cliente'],
  },
  {
    id: 'inventario',
    nombre: 'Inventario activo',
    archivo: 'inventario-activo',
    icon: Package,
    descripcion: 'Existencias disponibles, estados, categorias y precios.',
    responde: 'Que hay en inventario y cuanto vale.',
    filtros: ['Estado', 'Categoria', 'Stock', 'Tipo'],
  },
  {
    id: 'sin-movimiento',
    nombre: 'Prendas sin movimiento',
    archivo: 'prendas-sin-movimiento',
    icon: Clock3,
    descripcion: 'Articulos disponibles que llevan muchos dias quietos.',
    responde: 'Que puede ir a promocion, rebaja o banqueta.',
    filtros: ['Dias minimos', 'Categoria', 'Estado'],
  },
]

const METODOS_VENTA = [
  { value: 'todos', label: 'Todos' },
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'credito', label: 'A cuenta' },
]

const SALDOS_ESTADO = [
  { value: 'abiertas', label: 'Abiertas' },
  { value: 'saldadas', label: 'Saldadas' },
  { value: 'todas', label: 'Todas' },
]

const IDENTIFICACION_ESTADO = [
  { value: 'todas', label: 'Todas' },
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'completa', label: 'Completa' },
  { value: 'omitida', label: 'Omitida' },
]

const INVENTARIO_ESTADO = [
  { value: 'todos', label: 'Todos' },
  { value: 'disponible', label: 'Disponible' },
  { value: 'en_banqueta', label: 'En banqueta' },
  { value: 'reservado', label: 'Reservado' },
]

const STOCK_MODO = [
  { value: 'todos', label: 'Todo' },
  { value: 'con-stock', label: 'Con stock' },
  { value: 'agotado', label: 'Agotado' },
]

const PIEZA_TIPO = [
  { value: 'todas', label: 'Todas' },
  { value: 'pieza-unica', label: 'Pieza unica' },
  { value: 'stock-contado', label: 'Stock contado' },
]

const ESTADO_MOVIMIENTO = [
  { value: 'disponible', label: 'Disponible' },
  { value: 'en_banqueta', label: 'En banqueta' },
  { value: 'todos', label: 'Todos' },
]

function isoLocal(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function fmtDate(iso) {
  if (!iso) return '-'
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return String(iso)
  return new Date(y, m - 1, d).toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function cleanText(v) {
  return String(v ?? '').replace(/\s+/g, ' ').trim()
}

function normalizar(v) {
  return cleanText(v)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function money(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100) / 100
}

function ventaNumero(id) {
  const n = Number(id)
  if (!Number.isFinite(n)) return String(id || '-')
  return `#${String(n).padStart(5, '0')}`
}

function metodoVenta(metodo) {
  const m = normalizar(metodo)
  if (m.startsWith('intercambio:')) return m.split(':')[1] || 'intercambio'
  if (m === 'credito') return 'a cuenta'
  return m || 'sin metodo'
}

function estadoInventario(p) {
  return normalizar(p?.estado || 'disponible') || 'disponible'
}

function categoriaDe(p) {
  return cleanText(p?.categoria || p?.tags || p?.tipo || '')
}

function articuloDe(p) {
  return cleanText(p?.descripcion || p?.nombre || p?.nombre_snapshot || p?.codigo_snapshot || '')
}

function inText(row, query) {
  const q = normalizar(query)
  if (!q) return true
  return Object.values(row).some((v) => normalizar(v).includes(q))
}

function safeNumber(value, fallback) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function buildCsv(reporte, periodoTexto) {
  const lines = []
  lines.push([reporte.titulo])
  lines.push(['Periodo', periodoTexto])
  lines.push(['Generado', new Date().toLocaleString('es-MX')])
  lines.push([])
  lines.push(['Resumen'])
  for (const m of reporte.metricas) lines.push([m.label, m.value])
  lines.push([])
  lines.push(reporte.columnas.map((c) => c.label))
  for (const row of reporte.filas) lines.push(reporte.columnas.map((c) => row[c.key] ?? ''))
  return lines.map((row) => row.map(csvCell).join(',')).join('\n')
}

function csvCell(v) {
  const s = String(v ?? '')
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function fallbackDownload(filename, content, type) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function isMissingReportHandler(err) {
  const msg = String(err?.message || err || '')
  return msg.includes('No handler registered') || msg.includes('reportes:exportar')
}

function getInitialFilters() {
  const hoy = isoLocal()
  return {
    desde: hoy,
    hasta: hoy,
    metodo: 'todos',
    saldoEstado: 'abiertas',
    identificacion: 'todas',
    etiqueta: 'todas',
    estadoInventario: 'todos',
    categoria: 'todas',
    stockModo: 'todos',
    piezaTipo: 'todas',
    umbralStock: '2',
    diasSinMovimiento: '21',
    estadoMovimiento: 'disponible',
    q: '',
  }
}

function validarFiltros(tipo, filtros) {
  if (tipo === 'ventas') {
    if (!filtros.desde || !filtros.hasta) return 'Completa la fecha inicial y final.'
    if (String(filtros.desde) > String(filtros.hasta)) return 'La fecha inicial no puede ser mayor a la fecha final.'
  }
  if (tipo === 'sin-movimiento') {
    const n = Number(filtros.diasSinMovimiento)
    if (!Number.isFinite(n) || n < 1) return 'Los dias sin movimiento deben ser 1 o mas.'
  }
  return ''
}

function filtrosVentaParaDb(tipo, filtros) {
  if (tipo !== 'ventas') return { limit: 1000 }
  return {
    limit: 1000,
    from: filtros.desde,
    to: filtros.hasta,
    metodo: tipo === 'ventas' && filtros.metodo !== 'todos' ? filtros.metodo : 'todos',
    query: filtros.q,
  }
}

function getPeriodoTexto(tipo, filtros) {
  if (tipo === 'ventas') {
    return `${fmtDate(filtros.desde)} - ${fmtDate(filtros.hasta)}`
  }
  if (tipo === 'sin-movimiento') return `Actual, ${Number(filtros.diasSinMovimiento) || 21} dias o mas`
  return 'Actual'
}

function getMovimientoResumen(cuenta) {
  const movimientos = Array.isArray(cuenta?.movimientos) ? cuenta.movimientos : []
  const vigentes = movimientos.filter((mov) => !(mov.anulada || mov.anulado))
  const ultimo = [...vigentes].sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')))[0]
  return {
    ultimo: ultimo?.fecha || '',
    cargos: vigentes.filter((m) => m.tipo === 'cargo' || m.tipo === 'cargo_atraso').reduce((s, m) => s + money(m.monto), 0),
    abonos: vigentes.filter((m) => m.tipo === 'abono').reduce((s, m) => s + money(m.monto), 0),
  }
}

function crearReporteVentas(ventas, filtros) {
  let filasBase = ventas.map((v) => {
    const totalDevuelto = money(v.returned_total)
    return {
      fecha: fmtDate(diaLocalDeVenta(v.created_at)),
      ticket: ventaNumero(v.id),
      metodo: metodoVenta(v.metodo),
      articulos: String(Number(v.item_count) || 0),
      total: formatPrice(v.total),
      _total: money(v.total),
      _devuelto: totalDevuelto,
    }
  })

  filasBase = filasBase.filter((r) => inText(r, filtros.q))

  const total = filasBase.reduce((s, r) => s + r._total, 0)
  const devuelto = filasBase.reduce((s, r) => s + r._devuelto, 0)
  const promedio = filasBase.length > 0 ? total / filasBase.length : 0
  const filas = filasBase.map(({ _total, _devuelto, ...row }) => row)

  return {
    titulo: 'Ventas',
    descripcion: 'Tickets emitidos dentro del periodo configurado.',
    metricas: [
      { label: 'Tickets', value: String(filas.length) },
      { label: 'Vendido', value: formatPrice(total) },
      { label: 'Promedio', value: formatPrice(promedio) },
    ],
    columnas: [
      { key: 'fecha', label: 'Fecha' },
      { key: 'ticket', label: 'Ticket' },
      { key: 'metodo', label: 'Metodo' },
      { key: 'articulos', label: 'Articulos', align: 'right' },
      { key: 'total', label: 'Total', align: 'right' },
    ],
    filas,
    nota: devuelto > 0
      ? `Hay ${formatPrice(devuelto)} en ajustes dentro de estas ventas.`
      : 'El reporte muestra ventas con los filtros aplicados. PDF y CSV exportan esta misma vista.',
  }
}

function crearReporteSaldos(cuentas, filtros) {
  let filasBase = (Array.isArray(cuentas) ? cuentas : []).map((cuenta) => {
    const calculo = calcularCuentaSaldos(cuenta)
    const resumen = getMovimientoResumen(cuenta)
    const idEstado = cuenta?.identificacion?.estado || 'pendiente'
    const etiquetas = Array.isArray(cuenta.etiquetas) ? cuenta.etiquetas : []
    return {
      cliente: cleanText(cuenta.nombre) || '-',
      telefono: cleanText(cuenta.telefono) || '-',
      saldo: formatPrice(calculo.saldo),
      identificacion: idEstado,
      etiquetas: etiquetas.join(', ') || '-',
      ultimo: resumen.ultimo ? fmtDate(resumen.ultimo) : '-',
      _saldo: money(calculo.saldo),
      _identificacion: idEstado,
      _etiquetas: etiquetas.map(normalizar),
    }
  })

  if (filtros.saldoEstado === 'abiertas') filasBase = filasBase.filter((r) => r._saldo > 0)
  if (filtros.saldoEstado === 'saldadas') filasBase = filasBase.filter((r) => r._saldo <= 0)
  if (filtros.identificacion !== 'todas') filasBase = filasBase.filter((r) => r._identificacion === filtros.identificacion)
  if (filtros.etiqueta !== 'todas') filasBase = filasBase.filter((r) => r._etiquetas.includes(normalizar(filtros.etiqueta)))
  filasBase = filasBase.filter((r) => inText(r, filtros.q)).sort((a, b) => b._saldo - a._saldo)

  const porCobrar = filasBase.reduce((s, r) => s + r._saldo, 0)
  const idPendiente = filasBase.filter((r) => r._identificacion === 'pendiente').length
  const filas = filasBase.map(({ _saldo, _identificacion, _etiquetas, ...row }) => row)

  return {
    titulo: 'Saldos pendientes',
    descripcion: 'Cuentas de clientas con saldo, identificacion y etiquetas.',
    metricas: [
      { label: 'Cuentas', value: String(filas.length) },
      { label: 'Por cobrar', value: formatPrice(porCobrar) },
      { label: 'ID pendiente', value: String(idPendiente) },
    ],
    columnas: [
      { key: 'cliente', label: 'Cliente' },
      { key: 'telefono', label: 'Telefono' },
      { key: 'saldo', label: 'Saldo', align: 'right' },
      { key: 'identificacion', label: 'Identificacion' },
      { key: 'etiquetas', label: 'Etiquetas' },
      { key: 'ultimo', label: 'Ultimo mov.' },
    ],
    filas,
    nota: 'Los saldos se calculan desde movimientos vigentes; no se editan como numero suelto.',
  }
}

function crearReporteInventario(productos, filtros) {
  let filasBase = productos.map((p) => {
    const stock = Number(p.stock) || 0
    const piezaUnica = Number(p.pieza_unica) === 1
    return {
      codigo: cleanText(p.codigo) || '-',
      articulo: articuloDe(p) || '-',
      categoria: categoriaDe(p) || '-',
      estado: estadoInventario(p),
      stock: piezaUnica ? 'Pieza unica' : String(stock),
      tipo: piezaUnica ? 'Pieza unica' : 'Stock contado',
      precio: formatPrice(p.precio),
      ingreso: fmtDate(String(p.fecha_ingreso || p.created_at || '').slice(0, 10)),
      _estado: estadoInventario(p),
      _categoria: normalizar(categoriaDe(p)),
      _stock: stock,
      _piezaUnica: piezaUnica,
      _valor: money(p.precio) * (piezaUnica ? 1 : Math.max(0, stock)),
    }
  })

  if (filtros.estadoInventario !== 'todos') filasBase = filasBase.filter((r) => r._estado === filtros.estadoInventario)
  if (filtros.categoria !== 'todas') filasBase = filasBase.filter((r) => r._categoria === normalizar(filtros.categoria))
  if (filtros.piezaTipo === 'pieza-unica') filasBase = filasBase.filter((r) => r._piezaUnica)
  if (filtros.piezaTipo === 'stock-contado') filasBase = filasBase.filter((r) => !r._piezaUnica)
  if (filtros.stockModo === 'con-stock') filasBase = filasBase.filter((r) => r._piezaUnica || r._stock > 0)
  if (filtros.stockModo === 'agotado') filasBase = filasBase.filter((r) => !r._piezaUnica && r._stock <= 0)
  if (filtros.stockModo === 'bajo') {
    const umbral = safeNumber(filtros.umbralStock, 2)
    filasBase = filasBase.filter((r) => !r._piezaUnica && r._stock > 0 && r._stock <= umbral)
  }
  filasBase = filasBase.filter((r) => inText(r, filtros.q))

  const valor = filasBase.reduce((s, r) => s + r._valor, 0)
  const agotados = filasBase.filter((r) => !r._piezaUnica && r._stock <= 0).length
  const filas = filasBase.map(({ _estado, _categoria, _stock, _piezaUnica, _valor, ...row }) => row)

  return {
    titulo: 'Inventario activo',
    descripcion: 'Existencias visibles en el inventario actual.',
    metricas: [
      { label: 'Articulos', value: String(filas.length) },
      { label: 'Valor estimado', value: formatPrice(valor) },
      { label: 'Agotados', value: String(agotados) },
    ],
    columnas: [
      { key: 'codigo', label: 'Codigo' },
      { key: 'articulo', label: 'Articulo' },
      { key: 'categoria', label: 'Categoria' },
      { key: 'estado', label: 'Estado' },
      { key: 'stock', label: 'Stock', align: 'right' },
      { key: 'tipo', label: 'Tipo' },
      { key: 'precio', label: 'Precio', align: 'right' },
    ],
    filas,
    nota: 'Usa la lista de inventario activo. No incluye el cierre de caja ni modifica existencias.',
  }
}

function crearReporteSinMovimiento(productos, filtros) {
  const dias = safeNumber(filtros.diasSinMovimiento, 21)
  let seleccion = prendasEstancadas(productos, { dias, hoy: isoLocal(), limite: 1000 })
  if (filtros.estadoMovimiento !== 'todos') seleccion = seleccion.filter((p) => estadoInventario(p) === filtros.estadoMovimiento)
  if (filtros.categoria !== 'todas') seleccion = seleccion.filter((p) => normalizar(categoriaDe(p)) === normalizar(filtros.categoria))
  seleccion = seleccion.filter((p) => inText(p, filtros.q))

  const filas = seleccion.map((p) => ({
    codigo: cleanText(p.codigo) || '-',
    articulo: articuloDe(p) || '-',
    categoria: categoriaDe(p) || '-',
    estado: estadoInventario(p),
    dias: String(Number(p._dias) || 0),
    ingreso: fmtDate(String(p.fecha_ingreso || p.created_at || '').slice(0, 10)),
    precio: formatPrice(p.precio),
  }))

  return {
    titulo: 'Prendas sin movimiento',
    descripcion: 'Articulos disponibles que llevan demasiado tiempo sin venderse.',
    metricas: [
      { label: 'Por revisar', value: String(filas.length) },
      { label: 'Mas antigua', value: filas[0]?.dias ? `${filas[0].dias} dias` : '-' },
      { label: 'Criterio', value: `${dias} dias` },
    ],
    columnas: [
      { key: 'codigo', label: 'Codigo' },
      { key: 'articulo', label: 'Articulo' },
      { key: 'categoria', label: 'Categoria' },
      { key: 'estado', label: 'Estado' },
      { key: 'dias', label: 'Dias', align: 'right' },
      { key: 'ingreso', label: 'Ingreso' },
      { key: 'precio', label: 'Precio', align: 'right' },
    ],
    filas,
    nota: 'Sirve para decidir promocion, rebaja o banqueta. No cambia los productos.',
  }
}

function crearReporte({ tipo, ventas, productos, cuentas, filtros, busquedaVista }) {
  const filtrosVista = { ...filtros, q: busquedaVista || filtros.q }
  if (tipo === 'ventas') return crearReporteVentas(ventas, filtrosVista)
  if (tipo === 'saldos') return crearReporteSaldos(cuentas, filtrosVista)
  if (tipo === 'inventario') return crearReporteInventario(productos, filtrosVista)
  return crearReporteSinMovimiento(productos, filtrosVista)
}

function opcionesCategorias(productos) {
  const set = new Set()
  for (const p of Array.isArray(productos) ? productos : []) {
    const cat = categoriaDe(p)
    if (cat) set.add(cat)
  }
  return [{ value: 'todas', label: 'Todas' }, ...[...set].sort((a, b) => a.localeCompare(b)).map((c) => ({ value: c, label: c }))]
}

function opcionesEtiquetas(cuentas) {
  const set = new Set()
  for (const c of Array.isArray(cuentas) ? cuentas : []) {
    for (const e of Array.isArray(c.etiquetas) ? c.etiquetas : []) if (e) set.add(e)
  }
  return [{ value: 'todas', label: 'Todas' }, ...[...set].sort((a, b) => a.localeCompare(b)).map((e) => ({ value: e, label: e }))]
}

function InputBase({ value, onChange, type = 'text', min, placeholder, className = '' }) {
  return (
    <input
      type={type}
      min={min}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={`h-8 rounded-md border border-[var(--mlb-border-strong)] bg-[var(--mlb-bg-input)] px-2.5 text-[12.5px] text-[var(--mlb-text-primary)] outline-none transition-colors focus:border-[var(--mlb-accent)]/45 focus:bg-[var(--mlb-bg-panel)] focus:shadow-[inset_0_0_0_1px_var(--mlb-accent-ring)] ${className}`}
    />
  )
}

function Button({ children, variant = 'secondary', icon, className = '', ...props }) {
  const base =
    'mlb-focus-ring inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-[12.5px] font-medium tracking-[-0.003em] transition-colors disabled:pointer-events-none disabled:opacity-45 active:scale-[0.99]'
  const styles =
    variant === 'primary'
      ? 'bg-[var(--mlb-text-primary)] text-[var(--mlb-bg-panel)] hover:bg-[color-mix(in_oklab,var(--mlb-text-primary)_88%,transparent)]'
      : variant === 'ghost'
        ? 'text-[var(--mlb-text-secondary)] hover:bg-[var(--mlb-bg-hover)] hover:text-[var(--mlb-text-primary)]'
        : 'border border-[var(--mlb-border-strong)] bg-[var(--mlb-bg-panel)] text-[var(--mlb-text-primary)] hover:bg-[var(--mlb-bg-hover)]'
  return (
    <button type="button" className={`${base} ${styles} ${className}`} {...props}>
      {icon}
      {children}
    </button>
  )
}

function ReportCard({ reporte, active, onClick }) {
  const Icon = reporte.icon
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group grid w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-3 border-b border-[var(--mlb-border)] px-3 py-3 text-left transition-colors hover:bg-[var(--mlb-bg-hover)] sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:gap-4 sm:px-4 sm:py-4 ${
        active ? 'bg-[var(--mlb-bg-active)]' : 'bg-transparent'
      }`}
    >
      <span className="inline-flex size-9 items-center justify-center rounded-lg bg-[var(--mlb-bg-input)] text-[var(--mlb-text-primary)] shadow-[0_1px_0_0_var(--mlb-border)]">
        <Icon className="size-4" strokeWidth={1.8} />
      </span>
      <span className="min-w-0">
        <span className="block text-[14px] font-semibold tracking-[-0.01em] text-[var(--mlb-text-primary)]">{reporte.nombre}</span>
        <span className="mt-1 block text-[12.5px] leading-relaxed text-[var(--mlb-text-secondary)]">{reporte.descripcion}</span>
        <span className="mt-2 hidden flex-wrap gap-1 sm:flex">
          {reporte.filtros.map((f) => (
            <span key={f} className="rounded-md bg-[var(--mlb-bg-input)] px-1.5 py-1 text-[10.5px] font-medium text-[var(--mlb-text-muted)]">
              {f}
            </span>
          ))}
        </span>
      </span>
      <span className="col-span-2 inline-flex items-center gap-2 pl-12 text-[12px] font-medium text-[var(--mlb-text-secondary)] group-hover:text-[var(--mlb-text-primary)] sm:col-span-1 sm:pl-0">
        Configurar
        <Table2 className="size-3.5" strokeWidth={1.8} />
      </span>
    </button>
  )
}

function FieldGroup({ title, description, children }) {
  return (
    <section className="border-b border-[var(--mlb-border)] px-5 py-4 last:border-b-0">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-[13.5px] font-semibold tracking-[-0.006em] text-[var(--mlb-text-primary)]">{title}</h3>
          {description ? <p className="mt-0.5 text-[12px] leading-relaxed text-[var(--mlb-text-secondary)]">{description}</p> : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </section>
  )
}

function SummaryChip({ label, value }) {
  return (
    <span className="inline-flex h-7 items-center gap-1.5 rounded-md border border-[var(--mlb-border)] bg-[var(--mlb-bg-panel)] px-2 text-[11.5px]">
      <span className="text-[var(--mlb-text-muted)]">{label}</span>
      <span className="font-medium text-[var(--mlb-text-primary)]">{value}</span>
    </span>
  )
}

function filtrosResumen(tipo, filtros) {
  const chips = []
  if (tipo === 'ventas') {
    chips.push(['Periodo', `${fmtDate(filtros.desde)} - ${fmtDate(filtros.hasta)}`])
  }
  if (tipo === 'ventas') {
    chips.push(['Metodo', METODOS_VENTA.find((m) => m.value === filtros.metodo)?.label || 'Todos'])
  }
  if (tipo === 'saldos') {
    chips.push(['Saldo', SALDOS_ESTADO.find((m) => m.value === filtros.saldoEstado)?.label || 'Abiertas'])
    chips.push(['ID', IDENTIFICACION_ESTADO.find((m) => m.value === filtros.identificacion)?.label || 'Todas'])
  }
  if (tipo === 'inventario') {
    chips.push(['Estado', INVENTARIO_ESTADO.find((m) => m.value === filtros.estadoInventario)?.label || 'Todos'])
    chips.push(['Stock', STOCK_MODO.find((m) => m.value === filtros.stockModo)?.label || 'Todo'])
  }
  if (tipo === 'sin-movimiento') chips.push(['Dias', `${filtros.diasSinMovimiento || 21}+`])
  if (filtros.categoria !== 'todas') chips.push(['Categoria', filtros.categoria])
  if (filtros.etiqueta !== 'todas') chips.push(['Etiqueta', filtros.etiqueta])
  if (filtros.q) chips.push(['Busqueda', filtros.q])
  return chips
}

export function ReportesView() {
  const db = typeof window !== 'undefined' ? window.bazar?.db : undefined
  const saldosApi = typeof window !== 'undefined' ? window.bazar?.saldos : undefined
  const reportesApi = typeof window !== 'undefined' ? window.bazar?.reportes : undefined

  const [pantalla, setPantalla] = useState('inicio')
  const [tipo, setTipo] = useState('ventas')
  const [filtros, setFiltros] = useState(() => getInitialFilters())
  const [ventas, setVentas] = useState([])
  const [productos, setProductos] = useState([])
  const [cuentas, setCuentas] = useState([])
  const [busquedaVista, setBusquedaVista] = useState('')
  const [loading, setLoading] = useState(true)
  const [exportando, setExportando] = useState('')
  const [bazarNombre, setBazarNombre] = useState('Bazar Monserrat')
  const [actualizado, setActualizado] = useState(null)
  const [limiteVentas, setLimiteVentas] = useState(false)

  const meta = REPORTES.find((r) => r.id === tipo) || REPORTES[0]
  const categoriaOptions = useMemo(() => opcionesCategorias(productos), [productos])
  const etiquetaOptions = useMemo(() => opcionesEtiquetas(cuentas), [cuentas])

  const setFiltro = useCallback((key, value) => {
    setFiltros((prev) => ({ ...prev, [key]: value ?? (key === 'q' ? '' : 'todas') }))
  }, [])

  const cargarDatos = useCallback(async ({ modo = 'inicio', tipoActual = 'ventas', filtrosActuales = getInitialFilters() } = {}) => {
    setLoading(true)
    try {
      const salesFilters = modo === 'vista' ? filtrosVentaParaDb(tipoActual, filtrosActuales) : { limit: 1000 }
      const [vs, ps, cs, settings] = await Promise.all([
        db?.getSales?.(salesFilters) ?? [],
        db?.getInventoryList?.({ search: '', estadoIndex: 0, vistaIndex: 0, listTab: 'main' }) ?? db?.getProducts?.({}) ?? [],
        saldosApi?.listCuentas?.({ incluirArchivadas: false }) ?? [],
        window.bazar?.settings?.get?.().catch(() => null),
      ])

      const ventasRows = Array.isArray(vs) ? vs : []
      setVentas(ventasRows)
      setLimiteVentas(ventasRows.length >= 1000)
      setProductos(Array.isArray(ps) ? ps : [])
      setCuentas(Array.isArray(cs) ? cs : [])
      const nombre = cleanText(settings?.workspaceDisplayName)
      if (nombre) setBazarNombre(nombre)

      setActualizado(new Date())
    } catch (err) {
      toast.error(err?.message || 'No se pudieron cargar los datos de reportes.')
    } finally {
      setLoading(false)
    }
  }, [db, saldosApi])

  useEffect(() => {
    void cargarDatos({ modo: 'inicio' })
  }, [cargarDatos])

  useEffect(() => {
    const handler = () => {
      void cargarDatos({ modo: pantalla, tipoActual: tipo, filtrosActuales: filtros })
    }
    const unsub = window.bazar?.runtime?.subscribeCuentasChanged?.(handler)
    window.addEventListener('bazar:cuentas-changed', handler)
    return () => {
      unsub?.()
      window.removeEventListener('bazar:cuentas-changed', handler)
    }
  }, [cargarDatos, filtros, pantalla, tipo])

  const reporte = useMemo(() => crearReporte({
    tipo,
    ventas,
    productos,
    cuentas,
    filtros,
    busquedaVista,
  }), [busquedaVista, cuentas, filtros, productos, tipo, ventas])

  const errorFiltros = validarFiltros(tipo, filtros)
  const periodoTexto = getPeriodoTexto(tipo, filtros)
  const filenameBase = `${meta.archivo}-${isoLocal()}`

  const seleccionarReporte = (id) => {
    setTipo(id)
    setPantalla('configurar')
    setBusquedaVista('')
  }

  const generarVista = async () => {
    const err = validarFiltros(tipo, filtros)
    if (err) {
      toast.error(err)
      return
    }
    setBusquedaVista('')
    await cargarDatos({ modo: 'vista', tipoActual: tipo, filtrosActuales: filtros })
    setPantalla('vista')
  }

  const guardarPdf = async () => {
    setExportando('pdf')
    const html = buildReportePdfHtml({
      bazarNombre,
        titulo: reporte.titulo,
        descripcion: reporte.descripcion,
        periodoTexto,
        criterios: filtrosResumen(tipo, filtros).map(([label, value]) => ({ label, value })),
        metricas: reporte.metricas,
      columnas: reporte.columnas,
      filas: reporte.filas,
      nota: reporte.nota,
    })
    const filename = `${filenameBase}.pdf`
    try {
      if (reportesApi?.exportarPdf) {
        const res = await reportesApi.exportarPdf({ html, filename, direct: true })
        if (res?.ok) toast.success(`PDF guardado: ${res.path || filename}`)
        else if (!res?.cancelled) throw new Error(res?.message || 'No se pudo guardar el PDF.')
      } else {
        throw new Error('PDF no disponible hasta reiniciar Electron.')
      }
    } catch (err) {
      if (isMissingReportHandler(err)) {
        toast.error('Reinicia Electron para activar PDF en hoja Carta.')
        return
      }
      toast.error(err?.message || 'No se pudo generar el PDF.')
    } finally {
      setExportando('')
    }
  }

  const guardarCsv = async () => {
    setExportando('csv')
    const csv = buildCsv(reporte, periodoTexto)
    const filename = `${filenameBase}.csv`
    try {
      if (reportesApi?.exportarCsv) {
        const res = await reportesApi.exportarCsv({ csv, filename, direct: true })
        if (res?.ok) toast.success(`CSV guardado: ${res.path || filename}`)
        else if (!res?.cancelled) throw new Error(res?.message || 'No se pudo guardar el CSV.')
      } else {
        fallbackDownload(filename, `\uFEFF${csv}`, 'text/csv;charset=utf-8')
        toast.success('CSV descargado.')
      }
    } catch (err) {
      if (isMissingReportHandler(err)) {
        fallbackDownload(filename, `\uFEFF${csv}`, 'text/csv;charset=utf-8')
        toast.success('CSV descargado. Reinicia Electron para guardarlo directo en Descargas.')
        return
      }
      toast.error(err?.message || 'No se pudo generar el CSV.')
    } finally {
      setExportando('')
    }
  }

  const headerTitle = pantalla === 'inicio' ? 'Reportes' : pantalla === 'configurar' ? `Configurar ${meta.nombre}` : reporte.titulo
  const headerDescription =
    pantalla === 'inicio'
      ? 'Elige un reporte, configura sus filtros y despues revisa la tabla antes de exportar.'
      : pantalla === 'configurar'
        ? meta.responde
        : `Vista previa lista para PDF o CSV. ${reporte.filas.length} registro${reporte.filas.length === 1 ? '' : 's'}.`

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--mlb-bg-app)] text-[var(--mlb-text-primary)]">
      <PageHeader
        icon={<FileText className="size-4.5" strokeWidth={1.8} />}
        eyebrow={pantalla === 'inicio' ? 'Administracion' : `Paso ${pantalla === 'configurar' ? '2' : '3'} de 3`}
        title={headerTitle}
        description={headerDescription}
        back={pantalla === 'inicio' ? null : { label: pantalla === 'configurar' ? 'Reportes' : 'Cambiar filtros', onClick: () => setPantalla(pantalla === 'configurar' ? 'inicio' : 'configurar') }}
        actions={
          <div className="flex items-center gap-1.5">
            {actualizado ? (
              <span className="hidden text-[11.5px] text-[var(--mlb-text-muted)] md:inline">
                Actualizado {actualizado.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
              </span>
            ) : null}
            <Button icon={<RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} strokeWidth={1.8} />} onClick={() => void cargarDatos({ modo: pantalla, tipoActual: tipo, filtrosActuales: filtros })}>
              Actualizar
            </Button>
          </div>
        }
      />
      <PageHeaderDivider />

      {pantalla === 'inicio' ? (
        <DataTableShell className="min-h-0 flex-1 px-4 pb-4 pt-4 sm:px-6 lg:px-10 lg:pb-6">
          <div className="mb-3 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-[14px] font-semibold tracking-[-0.01em]">Reportes disponibles</h2>
              <p className="mt-0.5 text-[12.5px] text-[var(--mlb-text-secondary)]">Solo se muestran reportes que pueden salir con datos reales actuales.</p>
            </div>
            <span className="rounded-md border border-[var(--mlb-border)] bg-[var(--mlb-bg-panel)] px-2 py-1 text-[11.5px] text-[var(--mlb-text-muted)]">
              {REPORTES.length} reportes
            </span>
          </div>

          <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-[var(--mlb-border)] bg-[var(--mlb-bg-panel)] shadow-[var(--mlb-shadow-card)]">
            <div className="h-full overflow-auto">
              {REPORTES.map((reporteItem) => (
                <ReportCard
                  key={reporteItem.id}
                  reporte={reporteItem}
                  active={reporteItem.id === tipo}
                  onClick={() => seleccionarReporte(reporteItem.id)}
                />
              ))}
            </div>
          </div>
        </DataTableShell>
      ) : null}

      {pantalla === 'configurar' ? (
        <DataTableShell className="min-h-0 flex-1 px-4 pb-4 pt-4 sm:px-6 lg:px-10 lg:pb-6">
          <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-[var(--mlb-border)] bg-[var(--mlb-bg-panel)] shadow-[var(--mlb-shadow-card)]">
              <div className="border-b border-[var(--mlb-border)] px-5 py-4">
                <div className="flex items-start gap-3">
                  <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--mlb-bg-input)] text-[var(--mlb-text-primary)]">
                    <meta.icon className="size-4" strokeWidth={1.8} />
                  </span>
                  <div>
                    <h2 className="text-[15px] font-semibold tracking-[-0.01em]">{meta.nombre}</h2>
                    <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--mlb-text-secondary)]">{meta.descripcion}</p>
                  </div>
                </div>
              </div>

              {tipo === 'ventas' ? (
                <FieldGroup title="Periodo" description="El reporte se genera con estas fechas.">
                  <label className="flex items-center gap-2 text-[12.5px] text-[var(--mlb-text-secondary)]">
                    Desde
                    <InputBase type="date" value={filtros.desde} onChange={(v) => setFiltro('desde', v)} />
                  </label>
                  <label className="flex items-center gap-2 text-[12.5px] text-[var(--mlb-text-secondary)]">
                    Hasta
                    <InputBase type="date" value={filtros.hasta} onChange={(v) => setFiltro('hasta', v)} />
                  </label>
                </FieldGroup>
              ) : null}

              {tipo === 'ventas' ? (
                <>
                  <FieldGroup title="Venta" description="Filtra tickets por metodo de pago.">
                    <ChipFilter label="Metodo" options={METODOS_VENTA} value={filtros.metodo} onChange={(v) => setFiltro('metodo', v || 'todos')} allowClear={false} />
                  </FieldGroup>
                  <FieldGroup title="Busqueda" description="Ticket, articulo o codigo si lo recuerdas.">
                    <SearchField value={filtros.q} onChange={(v) => setFiltro('q', v)} placeholder="Buscar ticket o articulo" width="w-full max-w-[420px]" />
                  </FieldGroup>
                </>
              ) : null}

              {tipo === 'saldos' ? (
                <>
                  <FieldGroup title="Cuenta" description="Revisa deuda abierta, saldadas o todas.">
                    <ChipFilter label="Saldo" options={SALDOS_ESTADO} value={filtros.saldoEstado} onChange={(v) => setFiltro('saldoEstado', v || 'abiertas')} allowClear={false} />
                    <ChipFilter label="Identificacion" options={IDENTIFICACION_ESTADO} value={filtros.identificacion} onChange={(v) => setFiltro('identificacion', v || 'todas')} allowClear={false} />
                    <ChipFilter label="Etiqueta" options={etiquetaOptions} value={filtros.etiqueta} onChange={(v) => setFiltro('etiqueta', v || 'todas')} allowClear={false} />
                  </FieldGroup>
                  <FieldGroup title="Cliente" description="Nombre, telefono o etiqueta.">
                    <SearchField value={filtros.q} onChange={(v) => setFiltro('q', v)} placeholder="Buscar cliente" width="w-full max-w-[420px]" />
                  </FieldGroup>
                </>
              ) : null}

              {tipo === 'inventario' ? (
                <>
                  <FieldGroup title="Inventario" description="Filtra la hoja por estado, categoria y tipo de stock.">
                    <ChipFilter label="Estado" options={INVENTARIO_ESTADO} value={filtros.estadoInventario} onChange={(v) => setFiltro('estadoInventario', v || 'todos')} allowClear={false} />
                    <ChipFilter label="Categoria" options={categoriaOptions} value={filtros.categoria} onChange={(v) => setFiltro('categoria', v || 'todas')} allowClear={false} />
                    <ChipFilter label="Stock" options={STOCK_MODO} value={filtros.stockModo} onChange={(v) => setFiltro('stockModo', v || 'todos')} allowClear={false} />
                    <ChipFilter label="Tipo" options={PIEZA_TIPO} value={filtros.piezaTipo} onChange={(v) => setFiltro('piezaTipo', v || 'todas')} allowClear={false} />
                  </FieldGroup>
                  <FieldGroup title="Busqueda" description="Codigo, articulo, categoria o estado.">
                    <SearchField value={filtros.q} onChange={(v) => setFiltro('q', v)} placeholder="Buscar inventario" width="w-full max-w-[420px]" />
                  </FieldGroup>
                </>
              ) : null}

              {tipo === 'sin-movimiento' ? (
                <>
                  <FieldGroup title="Criterio" description="Marca cuantos dias debe llevar una prenda sin moverse.">
                    <label className="flex items-center gap-2 text-[12.5px] text-[var(--mlb-text-secondary)]">
                      Dias minimos
                      <InputBase type="number" min="1" value={filtros.diasSinMovimiento} onChange={(v) => setFiltro('diasSinMovimiento', v)} className="w-24" />
                    </label>
                    <ChipFilter label="Categoria" options={categoriaOptions} value={filtros.categoria} onChange={(v) => setFiltro('categoria', v || 'todas')} allowClear={false} />
                    <ChipFilter label="Estado" options={ESTADO_MOVIMIENTO} value={filtros.estadoMovimiento} onChange={(v) => setFiltro('estadoMovimiento', v || 'disponible')} allowClear={false} />
                  </FieldGroup>
                  <FieldGroup title="Busqueda" description="Codigo, articulo o categoria.">
                    <SearchField value={filtros.q} onChange={(v) => setFiltro('q', v)} placeholder="Buscar prenda" width="w-full max-w-[420px]" />
                  </FieldGroup>
                </>
              ) : null}
              <div className="border-t border-[var(--mlb-border)] px-4 py-3 sm:px-5">
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {filtrosResumen(tipo, filtros).map(([label, value]) => (
                    <SummaryChip key={`${label}-${value}`} label={label} value={value} />
                  ))}
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className={`text-[12.5px] leading-relaxed ${errorFiltros ? 'text-[var(--mlb-danger)]' : 'text-[var(--mlb-text-secondary)]'}`}>
                    {errorFiltros || 'Filtros listos. La siguiente pantalla muestra la tabla antes de exportar.'}
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
                    <Button variant="ghost" icon={<ArrowLeft className="size-3.5" strokeWidth={1.8} />} onClick={() => setPantalla('inicio')}>
                      Volver
                    </Button>
                    <Button variant="primary" disabled={!!errorFiltros || loading} onClick={() => void generarVista()}>
                      Generar vista
                    </Button>
                  </div>
                </div>
              </div>
          </div>
        </DataTableShell>
      ) : null}

      {pantalla === 'vista' ? (
        <DataTableShell className="min-h-0 flex-1 px-4 pb-4 pt-4 sm:px-6 lg:px-10 lg:pb-6">
          <div className="mb-3 flex flex-col gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              {filtrosResumen(tipo, filtros).map(([label, value]) => (
                <SummaryChip key={`${label}-${value}`} label={label} value={value} />
              ))}
              {limiteVentas && tipo === 'ventas' ? (
                <span className="inline-flex h-7 items-center rounded-md border border-[var(--mlb-accent)]/35 bg-[var(--mlb-accent-soft)] px-2 text-[11.5px] font-medium text-[var(--mlb-accent-ink)]">
                  Resultado limitado; acota el periodo o busqueda.
                </span>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
              <SearchField value={busquedaVista} onChange={setBusquedaVista} placeholder="Buscar en resultado" width="col-span-2 w-full sm:w-64" />
              <Button onClick={() => setPantalla('configurar')}>Cambiar filtros</Button>
              <Button icon={<FileSpreadsheet className="size-3.5" strokeWidth={1.8} />} disabled={loading || exportando !== ''} onClick={() => void guardarCsv()}>
                {exportando === 'csv' ? 'Guardando...' : 'Guardar CSV'}
              </Button>
              <Button variant="primary" className="col-span-2 sm:col-span-1" icon={<Download className="size-3.5" strokeWidth={1.8} />} disabled={loading || exportando !== ''} onClick={() => void guardarPdf()}>
                {exportando === 'pdf' ? 'Guardando...' : 'Guardar PDF'}
              </Button>
            </div>
          </div>

          <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {reporte.metricas.map((m) => (
              <div key={m.label} className="rounded-lg border border-[var(--mlb-border)] bg-[var(--mlb-bg-panel)] px-3 py-2 shadow-[var(--mlb-shadow-xs)]">
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--mlb-text-muted)]">{m.label}</div>
                <div className="mt-0.5 font-mono text-[15px] font-semibold tabular-nums text-[var(--mlb-text-primary)]">{m.value}</div>
              </div>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-[var(--mlb-border)] bg-[var(--mlb-bg-panel)] shadow-[var(--mlb-shadow-card)]">
            {loading ? (
              <EmptyState
                size="compact"
                icon={<RefreshCw className="size-5 animate-spin" strokeWidth={1.7} />}
                title="Cargando reporte"
                description="Preparando la vista con los filtros aplicados."
              />
            ) : reporte.filas.length === 0 ? (
              <EmptyState
                size="compact"
                icon={<Table2 className="size-5" strokeWidth={1.7} />}
                title="Sin resultados"
                description="Cambia los filtros o amplia el periodo para ver registros."
              />
            ) : (
              <DataTable>
                <caption className="sr-only">{reporte.titulo}</caption>
                <DataTableHeader>
                  {reporte.columnas.map((col) => (
                    <DataTableHead key={col.key} align={col.align || 'left'}>
                      {col.label}
                    </DataTableHead>
                  ))}
                </DataTableHeader>
                <DataTableBody>
                  {reporte.filas.map((row, idx) => (
                    <DataTableRow key={`${tipo}-${idx}`}>
                      {reporte.columnas.map((col) => (
                        <DataTableCell key={col.key} align={col.align || 'left'} mono={col.align === 'right'} muted={col.key === 'fecha' || col.key === 'codigo'}>
                          {row[col.key]}
                        </DataTableCell>
                      ))}
                    </DataTableRow>
                  ))}
                </DataTableBody>
              </DataTable>
            )}
          </div>
        </DataTableShell>
      ) : null}
    </div>
  )
}
