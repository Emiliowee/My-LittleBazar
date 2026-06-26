import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Search, MoreHorizontal, BadgeDollarSign, UserPlus, WalletCards,
  CircleDollarSign, CalendarDays, ArrowLeft, ArrowRight, Users, ListTodo,
  MessageCircle, IdCard, Tag, Bell, Camera, X, Check, Archive, ArchiveRestore,
  Trash2, Pencil, FileText, Banknote, Smartphone, ReceiptText, Handshake,
  Settings, Download, Ticket, Printer, Copy,
} from 'lucide-react'
import { toast } from 'sonner'
import { SALDOS_CONFIG_DEFAULT, calcularCuentaSaldos, daysAgoIso, todayIso } from '@/lib/saldosLedger'
import { imprimirVale } from '@/lib/valeTicket'
import { formatPrice } from '@/lib/format'
import { cn } from '@/lib/utils'
import './saldos.css'

/* ─────────────────────────────────────────────────────────────────────
 * Saldos — la libreta digital de cuentas de clientas.
 *
 * Estructura: HUB (panel + accesos rápidos + tabla de cuentas) → HOJA del
 * cliente (tarjeta con saldo + métricas + acciones + pestañas) → ACCIÓN
 * (formulario enfocado). Diseño boutique rosa.
 *
 * El saldo nunca se guarda: se calcula con el motor puro desde los
 * movimientos. Persistencia real vía window.bazar.saldos; demo en navegador.
 * V2: foto de identificación, etiquetas de cliente, recordatorios, WhatsApp.
 * ──────────────────────────────────────────────────────────────────── */

/* ── Capa de datos: backend real o demo ────────────────────────────── */

function crearApiDemo() {
  let seq = 100
  let cuentas = [
    {
      id: 1, nombre: 'María López', telefono: '662 288 5908', nacimiento: '1992-05-03',
      direccion: 'Col. Centro, cerca de la primaria', identificacion: { estado: 'pendiente', motivo: '', imagen: '' },
      etiquetas: ['Buena paga'], nota: '', archivada: false, createdAt: daysAgoIso(60), recordatorios: [],
      movimientos: [
        { id: 1, tipo: 'cargo', fecha: daysAgoIso(42), concepto: 'Blusa negra', monto: 300, anulado: false },
        { id: 2, tipo: 'abono', fecha: daysAgoIso(36), concepto: 'Enganche', monto: 100, anulado: false },
        { id: 3, tipo: 'cargo', fecha: daysAgoIso(18), concepto: 'Zapatos', monto: 500, anulado: false },
        { id: 4, tipo: 'abono', fecha: daysAgoIso(5), concepto: 'Abono general', monto: 200, medio: 'efectivo', anulado: false },
      ],
    },
    {
      id: 2, nombre: 'Luz Rivera', telefono: '662 410 2211', nacimiento: '1988-11-18',
      direccion: 'Las Quintas', identificacion: { estado: 'completa', motivo: '', imagen: '' },
      etiquetas: ['Mayorista', 'Paga por transferencia'], nota: '', archivada: false, createdAt: daysAgoIso(55), recordatorios: [],
      movimientos: [
        { id: 5, tipo: 'cargo', fecha: daysAgoIso(51), concepto: 'Vestido largo', monto: 980, anulado: false },
        { id: 6, tipo: 'abono', fecha: daysAgoIso(49), concepto: 'Enganche', monto: 180, anulado: false },
      ],
    },
    {
      id: 3, nombre: 'Ana Valdez', telefono: '', nacimiento: '1996-01-21',
      direccion: '', identificacion: { estado: 'omitida', motivo: 'Clienta de confianza', imagen: '' },
      etiquetas: [], nota: '', archivada: false, createdAt: daysAgoIso(20), recordatorios: [],
      movimientos: [
        { id: 7, tipo: 'cargo', fecha: daysAgoIso(12), concepto: 'Bolsa café', monto: 250, anulado: false },
        { id: 8, tipo: 'abono', fecha: daysAgoIso(10), concepto: 'Liquidado', monto: 250, anulado: false },
      ],
    },
  ]
  const norm = (v) => String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
  const find = (id) => cuentas.find((c) => c.id === Number(id))
  return {
    demo: true,
    async listCuentas() { return JSON.parse(JSON.stringify(cuentas)) },
    async buscarParecidos({ nombre, telefono }) {
      const n = norm(nombre); const t = String(telefono || '').replace(/\D/g, '')
      return cuentas.filter((c) => !c.archivada).filter((c) => (n && (norm(c.nombre).includes(n) || n.includes(norm(c.nombre)))) || (t && String(c.telefono).replace(/\D/g, '') === t)).map((c) => ({ id: c.id, nombre: c.nombre, telefono: c.telefono }))
    },
    async crearCliente(p) {
      const id = ++seq
      cuentas.unshift({ id, nombre: p.nombre, telefono: p.telefono || '', nacimiento: p.nacimiento || '', direccion: p.direccion || '', nota: '', archivada: false, createdAt: todayIso(), recordatorios: [], etiquetas: Array.isArray(p.etiquetas) ? p.etiquetas : [], identificacion: { estado: p.identificacionEstado || 'pendiente', motivo: p.identificacionMotivo || '', imagen: p.identificacionImagen || '' }, movimientos: [] })
      return { ok: true, clienteId: id }
    },
    async actualizarCliente(p) {
      const c = find(p.id); if (!c) return { ok: false, message: 'No existe.' }
      Object.assign(c, { nombre: p.nombre, telefono: p.telefono || '', nacimiento: p.nacimiento || '', direccion: p.direccion || '', etiquetas: Array.isArray(p.etiquetas) ? p.etiquetas : c.etiquetas, identificacion: { estado: p.identificacionEstado || 'pendiente', motivo: p.identificacionMotivo || '', imagen: p.identificacionImagen != null ? p.identificacionImagen : c.identificacion.imagen } })
      return { ok: true }
    },
    async setArchivada({ clienteId, archivada }) { const c = find(clienteId); if (c) c.archivada = !!archivada; return { ok: true } },
    async eliminarCliente({ clienteId }) { const c = find(clienteId); if (!c) return { ok: false, message: 'No existe.' }; if (c.movimientos.length) return { ok: false, message: 'Este cliente tiene movimientos: archivalo en lugar de eliminarlo.' }; cuentas = cuentas.filter((x) => x.id !== c.id); return { ok: true } },
    async registrarMovimientos({ clienteId, movimientos }) { const c = find(clienteId); if (!c) return { ok: false, message: 'No existe.' }; for (const m of movimientos) c.movimientos.push({ id: ++seq, anulado: false, ...m }); return { ok: true } },
    async anularMovimiento({ movimientoId, motivo }) { for (const c of cuentas) { const m = c.movimientos.find((x) => x.id === Number(movimientoId)); if (m) { m.anulado = true; m.anuladoMotivo = motivo || ''; return { ok: true } } } return { ok: false } },
    async crearRecordatorio({ clienteId, tipo, texto, fecha }) { const c = find(clienteId); if (!c) return { ok: false }; c.recordatorios.push({ id: ++seq, tipo, texto: texto || '', fecha: fecha || '', hecho: false }); return { ok: true } },
    async completarRecordatorio({ recordatorioId, hecho }) { for (const c of cuentas) { const r = c.recordatorios.find((x) => x.id === Number(recordatorioId)); if (r) { r.hecho = !!hecho; return { ok: true } } } return { ok: false } },
    async eliminarRecordatorio({ recordatorioId }) { for (const c of cuentas) { const i = c.recordatorios.findIndex((x) => x.id === Number(recordatorioId)); if (i >= 0) { c.recordatorios.splice(i, 1); return { ok: true } } } return { ok: false } },
    async elegirImagenId() { return { cancelled: true } },
  }
}

function getSaldosApi() {
  const real = typeof window !== 'undefined' ? window.bazar?.saldos : undefined
  if (real?.listCuentas) return { demo: false, ...real }
  return crearApiDemo()
}

async function llamar(promesa) {
  const r = await promesa
  if (r && r.ok === false) throw new Error(r.message || 'La operación no se pudo completar.')
  return r
}

/* ── Helpers ───────────────────────────────────────────────────────── */

const norm = (v) => String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
const initials = (name) => {
  const p = String(name || '').trim().split(/\s+/).filter(Boolean)
  return p.length ? p.slice(0, 2).map((x) => x[0]?.toUpperCase() || '').join('') : '—'
}
const fechaCorta = (v) => {
  if (!v) return '—'
  try { return new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short' }).format(new Date(`${String(v).slice(0, 10)}T12:00:00`)) }
  catch { return String(v) }
}
const movsVivos = (c) => (c.movimientos || []).filter((m) => !m.anulado)
const idEstado = (c) => c?.identificacion?.estado || 'pendiente'

const LABEL_TIPO = { cargo: 'Cargo', abono: 'Abono', descuento: 'Descuento', cargo_atraso: 'Cargo por atraso', ajuste: 'Ajuste', nota: 'Nota' }
const ID_LABEL = { completa: 'ID completa', pendiente: 'ID pendiente', omitida: 'ID omitida' }

const ETIQUETAS_SUGERIDAS = ['Buena paga', 'Revisar', 'No insistir', 'Familiar paga', 'Mayorista', 'Le gustan ofertas', 'Paga por transferencia']
const RECORDATORIO_TIPOS = [
  { id: 'promesa', label: 'Prometió pagar' },
  { id: 'revisar', label: 'Revisar cuenta' },
  { id: 'no_insistir', label: 'No insistir' },
  { id: 'llamar', label: 'Llamar' },
  { id: 'whatsapp', label: 'Mandar WhatsApp' },
  { id: 'nota', label: 'Nota' },
]

const WA_PLANTILLAS = [
  { id: 'recordatorio', label: 'Recordatorio suave', texto: 'Hola {nombre}, te saluda {bazar}. Te recuerdo con cariño que tenés un saldito pendiente de {saldo}. ¡Cuando puedas pasás! 🌸' },
  { id: 'saldo', label: 'Saldo pendiente', texto: 'Hola {nombre}, de {bazar}. Tu saldo actual es de {saldo}. Cualquier abono lo podés dejar cuando gustes. ¡Gracias!' },
  { id: 'gracias', label: 'Gracias por tu abono', texto: '¡Gracias {nombre}! Recibimos tu abono. Tu saldo quedó en {saldo}. Saludos de {bazar} 💕' },
  { id: 'libre', label: 'Mensaje personalizado', texto: 'Hola {nombre}, ' },
]

function estadoCuenta(c, r) {
  if (c.archivada) return 'archivada'
  if (r.requiereCargoAtraso) return 'atraso'
  if (r.saldo <= 0 && movsVivos(c).length > 0) return 'saldada'
  if (r.saldo > 0) return 'abierta'
  return 'nueva'
}

/* ── Root ──────────────────────────────────────────────────────────── */

export function SaldosView() {
  const apiRef = useRef(null)
  if (!apiRef.current) apiRef.current = getSaldosApi()
  const api = apiRef.current

  const [cuentas, setCuentas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [config, setConfig] = useState(SALDOS_CONFIG_DEFAULT)
  const [workspace, setWorkspace] = useState('Monserrat')
  const [modo, setModo] = useState('cuentas') // cuentas | nuevo | hoja
  const [selectedId, setSelectedId] = useState(null)
  const [filtroInicial, setFiltroInicial] = useState('todas')
  const [configOpen, setConfigOpen] = useState(false)
  const [valesOpen, setValesOpen] = useState(false)

  const recargar = useCallback(async () => {
    try { setCuentas(await llamar(api.listCuentas({}))) }
    catch (err) { toast.error(String(err?.message || 'No se pudieron cargar las cuentas.')) }
    finally { setCargando(false) }
  }, [api])

  useEffect(() => { void recargar() }, [recargar])

  useEffect(() => {
    let alive = true
    void window.bazar?.settings?.get?.().then((s) => {
      if (!alive || !s) return
      if (s.workspaceDisplayName) setWorkspace(String(s.workspaceDisplayName))
      if (s.saldosConfig) {
        const dias = Number(s.saldosConfig.diasAtraso); const pct = Number(s.saldosConfig.porcentajeAtraso)
        setConfig({
          diasAtraso: Number.isFinite(dias) && dias > 0 ? dias : SALDOS_CONFIG_DEFAULT.diasAtraso,
          porcentajeAtraso: Number.isFinite(pct) && pct > 0 ? pct / 100 : SALDOS_CONFIG_DEFAULT.porcentajeAtraso,
          interesAutomatico: !!s.saldosConfig.interesAutomatico,
        })
      }
    }).catch(() => {})
    return () => { alive = false }
  }, [])

  const rows = useMemo(() => cuentas.map((cuenta) => {
    const resumen = calcularCuentaSaldos({ ...cuenta, movimientos: movsVivos(cuenta) }, config)
    return { cuenta, resumen, estado: estadoCuenta(cuenta, resumen) }
  }), [cuentas, config])

  /* Interés AUTOMÁTICO (opt-in en Config): al cargar, si está activado, agrega el
   * cargo de interés a las cuentas vencidas. Guardado: el motor excluye los cargos
   * que ya tienen un cargo_atraso (referenciaIds), así no se cobra dos veces; y un
   * ref evita re-correrlo en esta sesión. */
  const interesAplicadoRef = useRef(false)
  useEffect(() => {
    if (!config.interesAutomatico || cargando || interesAplicadoRef.current) return
    const pendientes = rows.filter((r) => !r.cuenta.archivada && r.resumen.requiereCargoAtraso && r.resumen.cargoAtrasoSugerido > 0)
    if (pendientes.length === 0) return
    interesAplicadoRef.current = true
    void (async () => {
      const d = new Date()
      const hoy = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      let n = 0
      for (const r of pendientes) {
        try {
          await llamar(api.registrarMovimientos({ clienteId: r.cuenta.id, movimientos: [{ tipo: 'cargo_atraso', fecha: hoy, monto: r.resumen.cargoAtrasoSugerido, concepto: 'Interés por atraso (automático)', referenciaIds: r.resumen.cargosVencidos.map((c) => c.id) }] }))
          n += 1
        } catch { /* sigue con las demás */ }
      }
      if (n > 0) { toast.info(`Se aplicó interés por atraso a ${n} cuenta${n === 1 ? '' : 's'}.`); await recargar() }
    })()
  }, [config.interesAutomatico, cargando, rows, api, recargar])

  const seleccionada = rows.find((r) => r.cuenta.id === selectedId) || null
  const abrirHoja = (id) => { setSelectedId(id); setModo('hoja') }
  const irFiltro = (f) => { setFiltroInicial(f); setModo('cuentas') }
  const guardarConfig = async ({ diasAtraso, porcentajeAtraso, interesAutomatico }) => {
    try {
      await window.bazar?.settings?.set?.({ saldosConfig: { diasAtraso, porcentajeAtraso, interesAutomatico: !!interesAutomatico } })
      setConfig({ diasAtraso, porcentajeAtraso: porcentajeAtraso / 100, interesAutomatico: !!interesAutomatico })
      setConfigOpen(false)
      toast.success('Listo. El interés por atraso se actualizó.')
    } catch { toast.error('No se pudieron guardar los ajustes.') }
  }

  useEffect(() => {
    const handler = (e) => {
      const action = e.detail
      if (action === 'inicio' || action === 'cuentas') { setModo('cuentas'); return }
      if (action === 'nuevo') { setModo('nuevo'); return }
      if (action === 'abono') {
        const conSaldo = rows.filter((r) => !r.cuenta.archivada && r.resumen.saldo > 0).sort((a, b) => b.resumen.saldo - a.resumen.saldo)
        if (conSaldo.length === 0) { setModo('cuentas'); toast.info('No hay cuentas con saldo.'); return }
        abrirHoja(conSaldo[0].cuenta.id)
      }
    }
    window.addEventListener('mlb:saldos-action', handler)
    return () => window.removeEventListener('mlb:saldos-action', handler)
  }, [rows])

  if (modo === 'nuevo') {
    return <NuevoClienteScreen api={api} onBack={() => setModo('cuentas')} onCreado={async (id) => { await recargar(); abrirHoja(id) }} />
  }
  if (modo === 'hoja' && seleccionada) {
    return <HojaScreen api={api} row={seleccionada} workspace={workspace} config={config} onBack={() => { setModo('cuentas'); void recargar() }} onChanged={recargar} />
  }
  return (
    <>
      <CuentasScreen rows={rows} cargando={cargando} demo={api.demo} workspace={workspace} filtroInicial={filtroInicial} onNew={() => setModo('nuevo')} onOpen={abrirHoja} onFiltro={irFiltro} onAjustes={() => setConfigOpen(true)} onVales={() => setValesOpen(true)} />
      {configOpen && <SaldosConfigModal config={config} onClose={() => setConfigOpen(false)} onSave={guardarConfig} />}
      {valesOpen && <ValesModal api={api} workspace={workspace} onClose={() => setValesOpen(false)} />}
    </>
  )
}

/* ── HUB ───────────────────────────────────────────────────────────── */

function CuentasScreen({ rows, cargando, demo, workspace, filtroInicial, onNew, onOpen, onFiltro, onAjustes, onVales }) {
  const [query, setQuery] = useState('')
  const [filtro, setFiltro] = useState(filtroInicial || 'todas')

  useEffect(() => {
    try {
      const val = localStorage.getItem('navigate_to')
      if (val) {
        const data = JSON.parse(val)
        if (data.path === 'saldos' && data.search && Date.now() - (data.ts || 0) < 5000) {
          setQuery(data.search)
          localStorage.removeItem('navigate_to')
        }
      }
    } catch { /* navigate_to corrupto: ignorar */ }
  }, [])

  const activas = rows.filter((r) => !r.cuenta.archivada)
  const saldoCalle = activas.reduce((s, r) => s + r.resumen.saldo, 0)
  const conAtraso = activas.filter((r) => r.resumen.requiereCargoAtraso).length
  const sinId = activas.filter((r) => idEstado(r.cuenta) === 'pendiente').length
  const focus = activas.find((r) => r.resumen.requiereCargoAtraso) || activas.find((r) => r.resumen.saldo > 0) || activas[0]

  const visible = useMemo(() => {
    let lista = rows
    switch (filtro) {
      case 'consaldo': lista = lista.filter((r) => !r.cuenta.archivada && r.resumen.saldo > 0); break
      case 'atraso': lista = lista.filter((r) => !r.cuenta.archivada && r.resumen.requiereCargoAtraso); break
      case 'id': lista = lista.filter((r) => !r.cuenta.archivada && idEstado(r.cuenta) === 'pendiente'); break
      case 'archivadas': lista = lista.filter((r) => r.cuenta.archivada); break
      default: lista = lista.filter((r) => !r.cuenta.archivada)
    }
    const q = norm(query)
    if (q) lista = lista.filter((r) => norm([r.cuenta.nombre, r.cuenta.telefono, r.cuenta.direccion].join(' ')).includes(q))
    return [...lista].sort((a, b) => {
      const pa = (a.resumen.requiereCargoAtraso ? 1000 : 0) + (a.resumen.saldo > 0 ? 100 : 0)
      const pb = (b.resumen.requiereCargoAtraso ? 1000 : 0) + (b.resumen.saldo > 0 ? 100 : 0)
      return pb - pa || b.resumen.saldo - a.resumen.saldo
    })
  }, [rows, filtro, query])

  const FILTROS = [
    { id: 'todas', label: 'Todas' }, { id: 'consaldo', label: 'Con saldo' },
    { id: 'atraso', label: 'Atraso' }, { id: 'id', label: 'Sin ID' }, { id: 'archivadas', label: 'Archivadas' },
  ]

  return (
    <div className="sld-hub">
      <main className="sld-main">
        <header className="sld-head">
          <div className="sld-head__info">
            <span className="sld-head__count">{activas.length} cuenta{activas.length === 1 ? '' : 's'}</span>
            <span className="sld-head__sep" />
            <span className="sld-head__muted">{conAtraso} por revisar</span>
            <span className="sld-head__pill">{formatPrice(saldoCalle)} en la calle</span>
          </div>
          <div className="sld-head__right">
            <div className="sld-head__search">
              <Search size={15} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar cliente, teléfono…" />
            </div>
            <button className="sld-head__icon" aria-label="Vales emitidos" title="Vales" onClick={onVales}><Ticket size={18} strokeWidth={1.8} /></button>
            <button className="sld-head__icon" aria-label="Ajustes de interés por atraso" title="Interés por atraso" onClick={onAjustes}><Settings size={18} strokeWidth={1.8} /></button>
            <button className="sld-head__icon" aria-label="Nuevo cliente" onClick={onNew}><UserPlus size={18} strokeWidth={1.8} /></button>
          </div>
        </header>

        <div className="sld-scroll">
          <div className="sld-container">
            {/* Panel hero rosa boutique */}
            <section className="sld-deck">
              <div className="sld-deck__left">
                <span className="sld-deck__identity">
                  <span className="sld-deck__mark">{initials(workspace)}</span>
                  <span className="sld-deck__eyebrow">Saldos · {workspace}</span>
                </span>
                <p className="sld-deck__hi">{formatPrice(saldoCalle)}</p>
                <p className="sld-deck__sub">por cobrar en {activas.length} cuenta{activas.length === 1 ? '' : 's'}{demo ? ' · modo demo' : ''}</p>
              </div>
              <div className="sld-deck__apps">
                <DeckApp icon={ListTodo} label="Atrasos" tone="danger" count={conAtraso} onClick={() => onFiltro('atraso')} />
                <DeckApp icon={IdCard} label="Sin ID" tone="violet" count={sinId} onClick={() => onFiltro('id')} />
                <DeckApp icon={Users} label="Con saldo" tone="accent" count={activas.filter((r) => r.resumen.saldo > 0).length} onClick={() => onFiltro('consaldo')} />
              </div>
            </section>

            <section className="sld-block">
              <h2 className="sld-h2">Acciones rápidas</h2>
              <div className="sld-tiles">
                <QuickTile primary icon={BadgeDollarSign} title="Cobrar abono" detail={focus?.cuenta?.nombre || 'Pago rápido'} onClick={() => focus && onOpen(focus.cuenta.id)} />
                <QuickTile icon={UserPlus} title="Nuevo cliente" detail="Abrir una cuenta" onClick={onNew} />
                <QuickTile icon={ListTodo} title="Pendientes" detail={`${conAtraso} por revisar`} badge={conAtraso || null} onClick={() => onFiltro('atraso')} />
              </div>
            </section>

            <section className="sld-block">
              <div className="sld-block__head">
                <div className="sld-block__title">
                  <h2 className="sld-h2 sld-h2--tight">Hoja de cuentas</h2>
                  <span className="sld-chip">{visible.length} de {activas.length}</span>
                </div>
                <div className="sld-filtros">
                  {FILTROS.map((f) => (
                    <button key={f.id} type="button" className={cn('sld-filtro', filtro === f.id && 'is-active')} onClick={() => setFiltro(f.id)}>{f.label}</button>
                  ))}
                </div>
              </div>
              <div className="sld-tablewrap">
                <table className="sld-table">
                  <thead><tr><th className="c w40">#</th><th>Cliente</th><th>Teléfono</th><th>Último</th><th className="r">Saldo</th><th>Estado</th></tr></thead>
                  <tbody>
                    {visible.length === 0 && !cargando ? (
                      <tr><td colSpan={6}><div className="sld-empty"><Users size={26} strokeWidth={1.6} /><p>{rows.length === 0 ? 'Todavía no hay cuentas. Creá la primera con «Nuevo cliente».' : 'Nada con ese filtro.'}</p></div></td></tr>
                    ) : visible.map((row, i) => <FilaCuenta key={row.cuenta.id} index={i} row={row} onClick={() => onOpen(row.cuenta.id)} />)}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  )
}

function DeckApp({ icon: Icon, label, tone, count, onClick }) {
  return (
    <button type="button" className="sld-app" onClick={onClick}>
      <span className={`sld-app__icon sld-app__icon--${tone}`}>
        <Icon size={22} strokeWidth={1.7} />
        {count > 0 ? <span className="sld-app__badge">{count}</span> : null}
      </span>
      <span className="sld-app__label">{label}</span>
    </button>
  )
}

function QuickTile({ icon: Icon, title, detail, badge, primary, onClick }) {
  return (
    <button type="button" className="sld-tile" data-primary={primary ? 'true' : 'false'} onClick={onClick}>
      <span className="sld-tile__icon"><Icon size={20} strokeWidth={1.6} />{badge ? <span className="sld-tile__badge">{badge}</span> : null}</span>
      <span className="sld-tile__text"><span className="sld-tile__title">{title}</span><span className="sld-tile__detail">{detail}</span></span>
      <span className="sld-tile__arrow"><ArrowRight size={16} strokeWidth={2} /></span>
    </button>
  )
}

function FilaCuenta({ row, index, onClick }) {
  const { cuenta, resumen, estado } = row
  const e = { atraso: ['Revisar', 'revisar'], abierta: ['Abierta', 'abierta'], saldada: ['Saldada', 'lista'], archivada: ['Archivada', 'lista'], nueva: ['Nueva', 'lista'] }[estado] || ['Abierta', 'abierta']
  const stateCls = idEstado(cuenta) === 'pendiente' && estado !== 'atraso' ? 'id' : e[1]
  const stateLabel = idEstado(cuenta) === 'pendiente' && estado !== 'atraso' ? 'ID pendiente' : e[0]
  return (
    <tr className="sld-row" onClick={onClick}>
      <td className="c muted">{index + 1}</td>
      <td>
        <div className="sld-row__cli">
          <span className="sld-row__avatar">{initials(cuenta.nombre)}</span>
          <div className="sld-row__cli-main">
            <div className="sld-row__name">{cuenta.nombre || 'Sin nombre'}</div>
            <div className="sld-row__addr">{cuenta.direccion || 'Sin dirección'}</div>
          </div>
        </div>
      </td>
      <td className="muted nowrap">{cuenta.telefono || '—'}</td>
      <td className="muted nowrap">{resumen.ultimoAbono ? fechaCorta(resumen.ultimoAbono.fecha) : '—'}</td>
      <td className="r strong nowrap">{formatPrice(resumen.saldo)}</td>
      <td><span className={`sld-state sld-state--${stateCls}`}>{stateLabel}</span></td>
    </tr>
  )
}

/* ── HOJA del cliente ──────────────────────────────────────────────── */

const ACCIONES = [
  { id: 'cargo', label: 'Cargo', icon: BadgeDollarSign },
  { id: 'abono', label: 'Abono', icon: WalletCards, primary: true },
  { id: 'descuento', label: 'Descuento', icon: CircleDollarSign },
  { id: 'cargo_atraso', label: 'Atraso', icon: CalendarDays },
]

function HojaScreen({ api, row, workspace, config, onBack, onChanged }) {
  const { cuenta, resumen } = row
  const [accionModal, setAccionModal] = useState(null)
  const [waOpen, setWaOpen] = useState(false)
  const [compras, setCompras] = useState([])

  const diasAtraso = Number(config?.diasAtraso) || 30
  const pctAtraso = Math.round((Number(config?.porcentajeAtraso) || 0.2) * 100)

  /* "Lo que se llevó": traemos las compras (ventas fiadas) con sus prendas y
   * categoría. Se recarga cuando cambian los totales (tras abono/cargo). */
  useEffect(() => {
    let alive = true
    const fn = window.bazar?.db?.getComprasCliente
    if (fn) Promise.resolve(fn(cuenta.id)).then((r) => { if (alive) setCompras(Array.isArray(r) ? r : []) }).catch(() => {})
    return () => { alive = false }
  }, [cuenta.id, resumen.totalCargos, resumen.totalAplicado])

  // Mapa ventaId → cargo (saldo pendiente, días) para enlazar cada compra.
  const cargoPorVenta = useMemo(() => {
    const m = new Map()
    for (const c of resumen.cargos || []) {
      const refs = Array.isArray(c.referenciaIds) ? c.referenciaIds : (c.referenciaId != null ? [c.referenciaId] : [])
      for (const r of refs) m.set(Number(r), c)
    }
    return m
  }, [resumen])

  // Cuenta regresiva al recargo: el cargo abierto más próximo a vencer.
  const proximoRecargo = useMemo(() => {
    const abiertos = (resumen.cargos || []).filter((c) => c.atrasable && c.saldo > 0)
    if (abiertos.length === 0) return null
    return abiertos.reduce((min, c) => {
      const restante = Math.ceil(diasAtraso - c.dias)
      return min == null || restante < min ? restante : min
    }, null)
  }, [resumen, diasAtraso])

  const registrar = async (movs) => {
    try {
      await llamar(api.registrarMovimientos({ clienteId: cuenta.id, movimientos: movs }))
      toast.success('Movimiento registrado.')
      setAccionModal(null); await onChanged()
    } catch (err) { toast.error(String(err?.message || 'No se pudo registrar.')) }
  }

  return (
    <div className="sld-shell">
      <header className="sld-shell__head is-transparent">
        <button type="button" className="sld-shell__back" onClick={onBack}>
          <ArrowLeft size={14} strokeWidth={1.9} /> Volver a cuentas
        </button>
        <button type="button" className="sld-settings-btn" onClick={() => setAccionModal('expediente')}>
          <Pencil size={14} strokeWidth={1.9} /> Editar Perfil
        </button>
      </header>

      <main className="sld-shell__main" style={{ padding: 0 }}>
        
        {/* PREMIUM HERO SECTION */}
        <section className="sld-hero">
          <div className="sld-hero-name">{cuenta.nombre || 'Sin nombre'}</div>
          
          <div className={`sld-hero-balance ${resumen.saldo <= 0 ? 'is-ok' : ''}`}>
            {resumen.saldo > 0 ? formatPrice(resumen.saldo) : (resumen.saldoAFavor > 0 ? formatPrice(resumen.saldoAFavor) : '$0.00')}
          </div>
          <div style={{ color: 'var(--mlb-text-secondary)', fontWeight: 600, marginTop: '-20px', marginBottom: '24px' }}>
            {resumen.saldo > 0 ? 'DEUDA ACTUAL' : (resumen.saldoAFavor > 0 ? 'SALDO A FAVOR' : 'CUENTA SALDADA')}
          </div>

          <div className="sld-hero-actions">
            <button type="button" className="sld-hero-btn sld-hero-btn-primary" onClick={() => setAccionModal('abono')}>
              <Banknote size={20}/> Registrar Abono
            </button>
            <button type="button" className="sld-hero-btn sld-hero-btn-secondary" onClick={() => setAccionModal('cargo')}>
              <ReceiptText size={20}/> Nuevo Cargo
            </button>
            <button type="button" className="sld-hero-btn sld-hero-btn-secondary" disabled={!cuenta.telefono} onClick={() => setWaOpen(true)}>
              <MessageCircle size={20}/> WhatsApp
            </button>
          </div>
        </section>

        {compras.length > 0 && (
          <div className="sld-history-container">
            <h3 className="sld-module-title">Lo que se llevó</h3>
            {proximoRecargo != null && resumen.saldo > 0 && (
              <div className={cn('sld-llevo-aviso', proximoRecargo <= 0 && 'is-vencido')}>
                {proximoRecargo > 0
                  ? <>Faltan <strong>{proximoRecargo} día{proximoRecargo === 1 ? '' : 's'}</strong> para el recargo del {pctAtraso}%. Buen momento para recordarle.</>
                  : <>Ya corresponde el recargo del <strong>{pctAtraso}%</strong> (sugerido). Conviene cobrarle o avisarle.</>}
              </div>
            )}
            <div className="sld-llevo-list">
              {compras.map((compra) => {
                const cargo = cargoPorVenta.get(compra.ventaId)
                const saldo = cargo ? cargo.saldo : 0
                const restante = cargo && cargo.atrasable && saldo > 0 ? Math.ceil(diasAtraso - cargo.dias) : null
                return (
                  <div key={compra.ventaId} className="sld-llevo-card">
                    <div className="sld-llevo-card__top">
                      <span className="sld-llevo-fecha">{fechaCorta(compra.fecha)}</span>
                      {saldo > 0
                        ? <span className="sld-llevo-badge is-debe">Debe {formatPrice(saldo)}</span>
                        : <span className="sld-llevo-badge is-ok">Pagado</span>}
                    </div>
                    <div className="sld-llevo-items">
                      {compra.items.map((it, i) => (
                        <div key={i} className={cn('sld-llevo-item', it.devuelto && 'is-dev')}>
                          <span className="sld-llevo-qty">{it.cantidad}×</span>
                          <span className="sld-llevo-name">{it.nombre}{it.devuelto ? ' · devuelto' : ''}</span>
                          {it.categoria ? <span className="sld-llevo-cat">{it.categoria}</span> : null}
                          <span className="sld-llevo-precio">{formatPrice(it.precio * it.cantidad)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="sld-llevo-card__foot">
                      <span className="sld-llevo-total">Total {formatPrice(compra.total)}</span>
                      {restante != null && (
                        <span className={cn('sld-llevo-venc', restante <= 0 && 'is-vencido')}>
                          {restante > 0 ? `Faltan ${restante} día${restante === 1 ? '' : 's'} para recargo` : 'Recargo sugerido'}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div className="sld-history-container">
           <h3 className="sld-module-title">Historial de Movimientos</h3>
           <MovimientosPanel api={api} cuenta={cuenta} resumen={resumen} onChanged={onChanged} />
        </div>
      </main>

      {/* OVERLAY MODALS PARA ACCIONES PREMIUM */}
      {accionModal && (
        <div className="sld-modal-overlay" onClick={() => setAccionModal(null)}>
          <div className="sld-modal-content" onClick={e => e.stopPropagation()}>
             {accionModal === 'expediente' ? (
                <ExpedientePanel api={api} cuenta={cuenta} onBack={() => setAccionModal(null)} onChanged={onChanged} />
             ) : (
                <MovimientoForm tipo={accionModal} resumen={resumen} onSubmit={registrar} onCancel={() => setAccionModal(null)} />
             )}
          </div>
        </div>
      )}

      {waOpen ? <WhatsAppModal cuenta={cuenta} resumen={resumen} workspace={workspace} onClose={() => setWaOpen(false)} /> : null}
    </div>
  )
}

function ResumenPanel({ resumen }) {
  const abiertos = resumen.cargos.filter((c) => c.saldo > 0)
  return (
    <div className="sld-resumen">
      <div>
        <div className="sld-panel__head"><h2 className="sld-panel__title">Renglones abiertos</h2><span className="sld-panel__count">{abiertos.length} pendiente{abiertos.length === 1 ? '' : 's'}</span></div>
        <div className="sld-list">
          {abiertos.length === 0 ? <div className="sld-list__empty">No debe nada: todo saldado.</div> : abiertos.map((c) => (
            <div key={c.id} className="sld-list__row sld-list__row--3">
              <div className="sld-list__main"><div className="sld-list__name">{c.concepto || 'Cargo'}</div><div className="sld-list__sub">{fechaCorta(c.fecha)} · {c.dias} días</div></div>
              <div className="sld-list__amt">{formatPrice(c.saldo)}</div>
              <div className="sld-list__tag">{c.aplicado > 0 ? `pagó ${formatPrice(c.aplicado)}` : 'abierto'}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="sld-side-card">
        <h2 className="sld-panel__title">Seguimiento</h2>
        <div className="sld-side-card__stack">
          <Metric label="Base vencida" value={resumen.baseAtraso > 0 ? formatPrice(resumen.baseAtraso) : '—'} warn={resumen.baseAtraso > 0} />
          <Metric label="Total cargado" value={formatPrice(resumen.totalCargos)} />
          <Metric label="Total abonado" value={formatPrice(resumen.totalAplicado)} />
        </div>
      </div>
    </div>
  )
}

function MovimientosPanel({ api, cuenta, resumen, onChanged }) {
  const [anulando, setAnulando] = useState(null)
  const [motivo, setMotivo] = useState('')
  const anulados = (cuenta.movimientos || []).filter((m) => m.anulado)
  const todos = [...resumen.movimientos.map((m) => ({ ...m, anulado: false })), ...anulados].sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)) || Number(b.id) - Number(a.id))

  const confirmar = async (id) => {
    try { await llamar(api.anularMovimiento({ movimientoId: id, motivo: motivo.trim() || 'Error de captura' })); toast.success('Movimiento anulado.'); setAnulando(null); setMotivo(''); await onChanged() }
    catch (err) { toast.error(String(err?.message || 'No se pudo anular.')) }
  }

  return (
    <div>
      <div className="sld-panel__head"><h2 className="sld-panel__title">Movimientos</h2><span className="sld-panel__count">{todos.length} registro{todos.length === 1 ? '' : 's'}</span></div>
      <div className="sld-list">
        {todos.length === 0 ? <div className="sld-list__empty">Sin movimientos. Registrá el primer cargo arriba.</div> : todos.map((m) => (
          <div key={`${m.anulado ? 'x' : 'v'}-${m.id}`}>
            <div className={cn('sld-mov', m.anulado && 'is-anulado')}>
              <div className="sld-mov__date">{fechaCorta(m.fecha)}</div>
              <StatusBadge estado={m.anulado ? 'archivada' : m.tipo} />
              <div className="sld-mov__concept">{m.concepto || LABEL_TIPO[m.tipo]}{m.medio ? ` · ${m.medio}` : ''}{m.anulado ? ' · anulado' : ''}</div>
              <div className={cn('sld-mov__amt', !m.anulado && (m.tipo === 'abono' || m.tipo === 'descuento') && 'is-pos')}>{m.tipo === 'nota' ? '' : `${m.tipo === 'abono' || m.tipo === 'descuento' ? '−' : '+'}${formatPrice(m.monto)}`}</div>
              <div className="sld-mov__after">{m.anulado ? '' : <button type="button" className="sld-mov__anular" title="Anular" onClick={() => { setAnulando(anulando === m.id ? null : m.id); setMotivo('') }}><X size={13} strokeWidth={2} /></button>}</div>
            </div>
            {anulando === m.id ? (
              <div className="sld-mov__confirm">
                <span>Anular este {LABEL_TIPO[m.tipo]?.toLowerCase()} de <strong>{formatPrice(m.monto)}</strong>. No se borra: queda marcado.</span>
                <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo (ej. se capturó dos veces)" autoFocus />
                <div className="sld-mov__confirm-row">
                  <button type="button" className="sld-form__cancel" onClick={() => setAnulando(null)}>Cancelar</button>
                  <button type="button" className="sld-actbtn sld-actbtn--danger" onClick={() => confirmar(m.id)}>Anular movimiento</button>
                </div>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Recordatorios ─────────────────────────────────────────────────── */

function RecordatoriosPanel({ api, cuenta, onChanged }) {
  const [tipo, setTipo] = useState('promesa')
  const [texto, setTexto] = useState('')
  const [fecha, setFecha] = useState('')
  const recs = [...(cuenta.recordatorios || [])].sort((a, b) => Number(a.hecho) - Number(b.hecho) || String(a.fecha).localeCompare(String(b.fecha)))

  const agregar = async (e) => {
    e.preventDefault()
    try { await llamar(api.crearRecordatorio({ clienteId: cuenta.id, tipo, texto: texto.trim(), fecha })); setTexto(''); setFecha(''); await onChanged(); toast.success('Recordatorio agregado.') }
    catch (err) { toast.error(String(err?.message || 'No se pudo agregar.')) }
  }
  const completar = async (id, hecho) => { try { await llamar(api.completarRecordatorio({ recordatorioId: id, hecho })); await onChanged() } catch { /* noop */ } }
  const eliminar = async (id) => { try { await llamar(api.eliminarRecordatorio({ recordatorioId: id })); await onChanged() } catch { /* noop */ } }

  return (
    <div>
      <div className="sld-panel__head"><h2 className="sld-panel__title">Recordatorios</h2><span className="sld-panel__count">{recs.filter((r) => !r.hecho).length} activo{recs.filter((r) => !r.hecho).length === 1 ? '' : 's'}</span></div>
      <form className="sld-rec-form" onSubmit={agregar}>
        <select className="sld-input sld-input--sm" value={tipo} onChange={(e) => setTipo(e.target.value)}>
          {RECORDATORIO_TIPOS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        <input className="sld-input sld-input--sm" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Detalle (opcional)" />
        <input className="sld-input sld-input--sm sld-input--date" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        <button type="submit" className="sld-form__submit">Agregar</button>
      </form>
      <div className="sld-list" style={{ marginTop: 14 }}>
        {recs.length === 0 ? <div className="sld-list__empty">Sin recordatorios.</div> : recs.map((r) => {
          const t = RECORDATORIO_TIPOS.find((x) => x.id === r.tipo)
          return (
            <div key={r.id} className={cn('sld-rec', r.hecho && 'is-done')}>
              <button type="button" className="sld-rec__check" onClick={() => completar(r.id, !r.hecho)} aria-label={r.hecho ? 'Reactivar' : 'Marcar hecho'}>{r.hecho ? <Check size={13} strokeWidth={2.6} /> : null}</button>
              <div className="sld-rec__body">
                <span className="sld-rec__tipo"><Bell size={12} strokeWidth={2} />{t?.label || 'Nota'}</span>
                {r.texto ? <span className="sld-rec__texto">{r.texto}</span> : null}
              </div>
              {r.fecha ? <span className="sld-rec__fecha">{fechaCorta(r.fecha)}</span> : null}
              <button type="button" className="sld-rec__del" onClick={() => eliminar(r.id)} aria-label="Eliminar"><Trash2 size={14} strokeWidth={1.9} /></button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── Expediente (editar datos + foto ID + etiquetas + archivar) ────── */

function ExpedientePanel({ api, cuenta, onBack, onChanged }) {
  const [editando, setEditando] = useState(false)
  const tieneMovs = (cuenta.movimientos || []).length > 0

  const archivar = async (a) => { try { await llamar(api.setArchivada({ clienteId: cuenta.id, archivada: a })); toast.success(a ? 'Cuenta archivada.' : 'Cuenta reactivada.'); await onChanged() } catch (err) { toast.error(String(err?.message || 'No se pudo.')) } }
  const eliminar = async () => { try { await llamar(api.eliminarCliente({ clienteId: cuenta.id })); toast.success('Cliente eliminado.'); onBack() } catch (err) { toast.error(String(err?.message || 'No se pudo eliminar.')) } }

  if (editando) return <ClienteForm api={api} cuenta={cuenta} onCancel={() => setEditando(false)} onSaved={async () => { setEditando(false); await onChanged() }} />

  return (
    <div>
      <div className="sld-panel__head">
        <h2 className="sld-panel__title">Expediente</h2>
        <button type="button" className="sld-actbtn sld-actbtn--sm" onClick={() => setEditando(true)}><Pencil size={13} strokeWidth={2} />Editar</button>
      </div>
      <div className="sld-exp-grid">
        <div className="sld-exp-data">
          <div className="sld-exp"><Metric label="Cliente" value={cuenta.nombre || '—'} /><Metric label="Nacimiento" value={cuenta.nacimiento || '—'} /><Metric label="Teléfono" value={cuenta.telefono || '—'} /><Metric label="Identificación" value={ID_LABEL[idEstado(cuenta)] || 'Pendiente'} /></div>
          <div className="sld-exp__addr"><div className="sld-exp__addr-label">Dirección</div><div className="sld-exp__addr-value">{cuenta.direccion || 'Sin dirección'}</div></div>
          {(cuenta.etiquetas || []).length > 0 ? (
            <div className="sld-exp__tags"><div className="sld-exp__addr-label">Etiquetas</div><div className="sld-card__tags">{cuenta.etiquetas.map((t) => <span key={t} className="sld-tagchip">{t}</span>)}</div></div>
          ) : null}
        </div>
        <IdImagen ruta={cuenta.identificacion?.imagen} />
      </div>

      <div className="sld-zona-baja">
        {cuenta.archivada ? (
          <button type="button" className="sld-actbtn sld-actbtn--sm" onClick={() => archivar(false)}><ArchiveRestore size={13} strokeWidth={2} />Reactivar</button>
        ) : (
          <button type="button" className="sld-actbtn sld-actbtn--sm" onClick={() => archivar(true)}><Archive size={13} strokeWidth={2} />Archivar</button>
        )}
        {!tieneMovs ? (
          <button type="button" className="sld-actbtn sld-actbtn--sm sld-actbtn--danger-ghost" onClick={eliminar}><Trash2 size={13} strokeWidth={2} />Eliminar</button>
        ) : <span className="sld-zona-baja__nota">Las cuentas con movimientos no se eliminan: se archivan.</span>}
      </div>
    </div>
  )
}

/** Muestra la foto de identificación (la lee como dataUrl en Electron). */
function IdImagen({ ruta }) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    let alive = true
    const r = String(ruta || '').trim()
    if (!r) { setSrc(''); return }
    const api = typeof window !== 'undefined' ? window.bazar?.assets?.imageFileDataUrl : null
    if (api) { api(r).then((res) => { if (alive && res?.ok) setSrc(res.dataUrl) }).catch(() => {}) }
    return () => { alive = false }
  }, [ruta])
  const descargar = async () => {
    const api = typeof window !== 'undefined' ? window.bazar?.clientImage?.save : null
    if (!api) { toast.error('La descarga es solo en la app de escritorio.'); return }
    try {
      const r = await api(ruta)
      if (r?.ok) toast.success('Identificación descargada.')
      else if (!r?.cancelled) toast.error(r?.message || r?.error || 'No se pudo descargar.')
    } catch { toast.error('No se pudo descargar.') }
  }
  if (!ruta) return <div className="sld-idfoto sld-idfoto--vacia"><IdCard size={26} strokeWidth={1.5} /><span>Sin foto de ID</span></div>
  if (!src) return <div className="sld-idfoto sld-idfoto--vacia"><IdCard size={26} strokeWidth={1.5} /><span>Cargando…</span></div>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
      <div className="sld-idfoto"><img src={src} alt="Identificación" /></div>
      <button type="button" className="sld-actbtn sld-actbtn--sm" onClick={() => void descargar()}><Download size={14} strokeWidth={1.9} /> Descargar</button>
    </div>
  )
}

/* ── Formularios ───────────────────────────────────────────────────── */

const FORM_CFG = {
  cargo: { titulo: 'Registrar cargo', conceptoLabel: 'Artículo o concepto', placeholder: 'Ej. Vestido rojo talla M' },
  abono: { titulo: 'Registrar abono', conceptoLabel: 'Concepto', placeholder: 'Abono general' },
  descuento: { titulo: 'Registrar descuento', conceptoLabel: 'Motivo', placeholder: 'Ej. Promoción' },
  cargo_atraso: { titulo: 'Cargo por atraso', conceptoLabel: 'Concepto', placeholder: 'Cargo por atraso' },
}

function MovimientoForm({ tipo, resumen, onSubmit, onCancel }) {
  const cfg = FORM_CFG[tipo] || FORM_CFG.cargo
  const [form, setForm] = useState({ fecha: todayIso(), concepto: tipo === 'abono' ? 'Abono general' : tipo === 'cargo_atraso' ? 'Cargo por atraso' : '', monto: tipo === 'cargo_atraso' && resumen.cargoAtrasoSugerido > 0 ? String(resumen.cargoAtrasoSugerido) : '', enganche: '', medio: 'Efectivo', quienPago: '', nota: '' })
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }))
  const monto = Number(form.monto)
  const enganche = Number(form.enganche) || 0

  const submit = async (e) => {
    e.preventDefault()
    if (!Number.isFinite(monto) || monto <= 0) { toast.error('Poné un monto mayor a cero.'); return }
    if (tipo === 'cargo' && enganche > monto) { toast.error('El enganche no puede ser mayor al cargo.'); return }
    
    setBusy(true)
    try {
      const base = { tipo, fecha: form.fecha, monto, concepto: form.concepto.trim(), nota: form.nota.trim() }
      const movs = []
      if (tipo === 'cargo') { movs.push(base); if (enganche > 0) movs.push({ tipo: 'abono', fecha: form.fecha, monto: enganche, concepto: 'Enganche', medio: form.medio.trim() }) }
      else if (tipo === 'cargo_atraso') movs.push({ ...base, referenciaIds: resumen.cargosVencidos.map((c) => c.id) })
      else movs.push({ ...base, medio: form.medio.trim(), quienPago: form.quienPago.trim() })
      await onSubmit(movs)
    } finally { setBusy(false) }
  }

  // ==== DISEÑO PREMIUM EXCLUSIVO PARA ABONOS ====
  if (tipo === 'abono') {
    return (
      <form onSubmit={submit} className="sld-premium-abono">
        <div className="sld-form__head">
          <div><div className="sld-form__eyebrow">Pagar deuda</div><h2 className="sld-form__title">Abonar a cuenta</h2></div>
          <button type="button" className="sld-form__cancel" onClick={onCancel}>Cancelar</button>
        </div>

        <div className="sld-amount-wrapper">
          <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--mlb-text-secondary)', marginBottom: '8px' }}>Monto a abonar</div>
          <div className="sld-amount-input-group">
            <span>$</span>
            <input type="number" min="0" step="0.5" value={form.monto} onChange={(e) => set('monto', e.target.value)} placeholder="0.00" autoFocus />
          </div>
          {resumen.saldo > 0 && (
            <div className="sld-amount-chips">
              <div className="sld-chip" onClick={() => set('monto', String(resumen.saldo))}><Check size={14}/> Liquidar todo ({formatPrice(resumen.saldo)})</div>
              {resumen.saldo >= 100 && (
                <div className="sld-chip" onClick={() => set('monto', String(Math.round(resumen.saldo / 2)))}>Pagar la mitad ({formatPrice(Math.round(resumen.saldo / 2))})</div>
              )}
            </div>
          )}
        </div>

        <div>
          <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--mlb-text-secondary)', marginBottom: '12px' }}>¿Cómo paga?</div>
          <div className="sld-pay-methods">
            <div className={`sld-method-btn ${form.medio === 'Efectivo' ? 'is-active' : ''}`} onClick={() => set('medio', 'Efectivo')}>
              <Banknote size={24} strokeWidth={2}/> Efectivo
            </div>
            <div className={`sld-method-btn ${form.medio === 'Tarjeta' ? 'is-active is-card' : ''}`} onClick={() => set('medio', 'Tarjeta')}>
              <Smartphone size={24} strokeWidth={2}/> Tarjeta / Transf.
            </div>
          </div>
        </div>

        <div className="sld-modern-row">
          <Field label="Fecha de abono"><input className="sld-input" type="date" value={form.fecha} onChange={(e) => set('fecha', e.target.value)} /></Field>
          <Field label="Quién pagó (Opcional)"><input className="sld-input" value={form.quienPago} onChange={(e) => set('quienPago', e.target.value)} placeholder="Ej. Su hermana" /></Field>
        </div>
        
        <Field label="Nota (Opcional)"><input className="sld-input" value={form.nota} onChange={(e) => set('nota', e.target.value)} placeholder="Agrega un comentario sobre este pago..." /></Field>

        <div className="sld-form__foot"><button type="submit" className="sld-form__submit" disabled={busy}>{busy ? 'Procesando...' : 'Confirmar Abono'}</button></div>
      </form>
    )
  }

  // ==== DISEÑO MODERNO (CARGOS, DESCUENTOS, ATRASOS) ====
  return (
    <form onSubmit={submit} className="sld-form-modern">
      <div className="sld-form__head"><div><div className="sld-form__eyebrow">Registrar</div><h2 className="sld-form__title">{cfg.titulo}</h2></div><button type="button" className="sld-form__cancel" onClick={onCancel}>Cancelar</button></div>
      <div className="sld-form__grid">
        <Field label={cfg.conceptoLabel}><input className="sld-input" value={form.concepto} onChange={(e) => set('concepto', e.target.value)} placeholder={cfg.placeholder} /></Field>
        <Field label="Monto"><input className="sld-input" type="number" min="0" step="0.01" value={form.monto} onChange={(e) => set('monto', e.target.value)} placeholder="0.00" autoFocus={tipo !== 'cargo_atraso'} /></Field>
        <Field label="Fecha"><input className="sld-input" type="date" value={form.fecha} onChange={(e) => set('fecha', e.target.value)} /></Field>
        {tipo === 'cargo' ? <Field label="Enganche (dejó a cuenta hoy)"><input className="sld-input" type="number" min="0" step="0.01" value={form.enganche} onChange={(e) => set('enganche', e.target.value)} placeholder="Opcional" /></Field> : null}
        <Field label="Nota" full><textarea className="sld-textarea" value={form.nota} onChange={(e) => set('nota', e.target.value)} placeholder="Opcional" /></Field>
      </div>
      <div className="sld-form__foot"><button type="submit" className="sld-form__submit" disabled={busy}>{busy ? 'Guardando…' : 'Registrar'}</button></div>
    </form>
  )
}

/** Form compartido para crear y editar cliente (con foto ID + etiquetas). */
function ClienteForm({ api, cuenta, onCancel, onSaved, onSubmit, onCampoChange }) {
  const editar = !!cuenta
  const [form, setForm] = useState({
    nombre: cuenta?.nombre || '', nacimiento: cuenta?.nacimiento || '', telefono: cuenta?.telefono || '',
    direccion: cuenta?.direccion || '', identificacionEstado: cuenta?.identificacion?.estado === 'omitida' ? 'omitida' : 'completa',
    identificacionMotivo: cuenta?.identificacion?.motivo || '', identificacionImagen: cuenta?.identificacion?.imagen || '',
    etiquetas: cuenta?.etiquetas || [],
  })
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }))

  useEffect(() => { onCampoChange?.(form.nombre, form.telefono) }, [form.nombre, form.telefono]) // eslint-disable-line react-hooks/exhaustive-deps
  const toggleTag = (t) => setForm((p) => ({ ...p, etiquetas: p.etiquetas.includes(t) ? p.etiquetas.filter((x) => x !== t) : [...p.etiquetas, t] }))

  const subirFoto = async () => {
    const pick = window.bazar?.saldos?.elegirImagenId
    if (!pick) { toast.info('Subir foto funciona en la app de escritorio.'); return }
    try { const r = await pick(); if (r?.cancelled) return; if (r?.ok && r.path) { set('identificacionImagen', r.path); set('identificacionEstado', 'completa') } else if (r?.message) toast.error(r.message) }
    catch (err) { toast.error(String(err?.message || err)) }
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!form.nombre.trim()) { toast.error('Escribí el nombre del cliente.'); return }
    if (!editar && !form.nacimiento) { toast.error('La fecha de nacimiento es obligatoria.'); return }
    if (form.identificacionEstado === 'omitida') {
      if (!form.identificacionMotivo.trim()) { toast.error('Si omites la identificación, escribí el motivo.'); return }
    } else if (!form.identificacionImagen) {
      toast.error('La identificación es obligatoria: subí la foto del ID o elegí «Omitir» con un motivo.'); return
    }
    setBusy(true)
    try {
      if (editar) { await llamar(api.actualizarCliente({ id: cuenta.id, ...form })); toast.success('Expediente actualizado.'); await onSaved?.() }
      else { const r = await llamar(api.crearCliente(form)); toast.success(`Cuenta de ${form.nombre.trim()} creada.`); await onSubmit?.(r.clienteId) }
    } catch (err) { toast.error(String(err?.message || 'No se pudo guardar.')) }
    finally { setBusy(false) }
  }

  return (
    <form className="sld-clientform" onSubmit={submit}>
      <div className="sld-form__head"><div><div className="sld-form__eyebrow">{editar ? 'Editar' : 'Nuevo'}</div><h2 className="sld-form__title">{editar ? 'Editar expediente' : 'Nuevo cliente'}</h2></div><button type="button" className="sld-form__cancel" onClick={onCancel}>Cancelar</button></div>

      <div className="sld-clientform__body">
        <div className="sld-form__grid sld-form__grid--2">
          <Field label="Nombre completo"><input className="sld-input" value={form.nombre} onChange={(e) => set('nombre', e.target.value)} placeholder="Como la conoce la dueña" autoFocus /></Field>
          <Field label={editar ? 'Nacimiento' : 'Nacimiento (obligatorio)'}><input className="sld-input" type="date" value={form.nacimiento} onChange={(e) => set('nacimiento', e.target.value)} /></Field>
          <Field label="Teléfono"><input className="sld-input" value={form.telefono} onChange={(e) => set('telefono', e.target.value)} placeholder="Opcional" /></Field>
          <Field label="Identificación">
            <select className="sld-input" value={form.identificacionEstado} onChange={(e) => set('identificacionEstado', e.target.value)}>
              <option value="completa">Con identificación (foto)</option><option value="omitida">Omitir (con motivo)</option>
            </select>
          </Field>
          {form.identificacionEstado === 'omitida' ? (
            <Field label="Motivo de la omisión" full><input className="sld-input" value={form.identificacionMotivo} onChange={(e) => set('identificacionMotivo', e.target.value)} placeholder="Ej. clienta de confianza" /></Field>
          ) : null}
          <Field label="Dirección" full><textarea className="sld-textarea" value={form.direccion} onChange={(e) => set('direccion', e.target.value)} placeholder="Calle, colonia o referencia (puede quedar incompleta)" /></Field>
        </div>

        {/* Foto de identificación */}
        <div className="sld-idupload">
          <span className="sld-field__label">Foto de la identificación</span>
          <div className="sld-idupload__row">
            <IdImagen ruta={form.identificacionImagen} />
            <div className="sld-idupload__actions">
              <button type="button" className="sld-actbtn sld-actbtn--sm" onClick={subirFoto}><Camera size={14} strokeWidth={1.9} />{form.identificacionImagen ? 'Cambiar foto' : 'Subir foto'}</button>
              {form.identificacionImagen ? <button type="button" className="sld-form__cancel" onClick={() => set('identificacionImagen', '')}>Quitar</button> : null}
              <p className="sld-idupload__hint">Se guarda solo en esta computadora. No se sube a internet.</p>
            </div>
          </div>
        </div>

        {/* Etiquetas */}
        <div className="sld-tagpick">
          <span className="sld-field__label">Etiquetas</span>
          <div className="sld-tagpick__row">
            {ETIQUETAS_SUGERIDAS.map((t) => (
              <button key={t} type="button" className={cn('sld-tagpick__tag', form.etiquetas.includes(t) && 'is-on')} onClick={() => toggleTag(t)}>{t}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="sld-clientform__foot"><button type="button" className="sld-form__cancel" onClick={onCancel}>Cancelar</button><button type="submit" className="sld-form__submit" disabled={busy}>{busy ? 'Guardando…' : editar ? 'Guardar cambios' : 'Abrir cuenta'}</button></div>
    </form>
  )
}

function NuevoClienteScreen({ api, onBack, onCreado }) {
  const [parecidos, setParecidos] = useState([])
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')

  useEffect(() => {
    if (nombre.trim().length < 3 && telefono.trim().length < 7) { setParecidos([]); return }
    const t = setTimeout(() => { Promise.resolve(api.buscarParecidos({ nombre, telefono })).then((r) => setParecidos(Array.isArray(r) ? r : [])).catch(() => setParecidos([])) }, 350)
    return () => clearTimeout(t)
  }, [api, nombre, telefono])

  return (
    <div className="sld-shell">
      <header className="sld-shell__head">
        <button type="button" className="sld-shell__back" onClick={onBack}><ArrowLeft size={14} strokeWidth={1.9} /> Cuentas</button>
        <div className="sld-shell__lead"><span className="sld-shell__icon"><UserPlus size={20} strokeWidth={2} /></span><div><div className="sld-shell__eyebrow">Saldos · Cuentas</div><h1 className="sld-shell__title">Nuevo cliente</h1></div></div>
      </header>
      <main className="sld-shell__main">
        <div className="sld-detail" style={{ maxWidth: 820 }}>
          {parecidos.length > 0 ? (
            <div className="sld-dup"><span>Ojo: ya {parecidos.length === 1 ? 'existe una cuenta parecida' : `existen ${parecidos.length} parecidas`}: <strong>{parecidos.slice(0, 3).map((p) => p.nombre).join(', ')}</strong>. Revisá antes de duplicar.</span></div>
          ) : null}
          <ClienteForm api={api} cuenta={null} onCancel={onBack} onSubmit={onCreado} onCampoChange={(n, t) => { setNombre(n); setTelefono(t) }} />
        </div>
      </main>
    </div>
  )
}

/* ── Piezas chicas ─────────────────────────────────────────────────── */

function StatusBadge({ estado }) {
  const cfg = { abierta: ['Abierta', 'accent'], atraso: ['Atraso', 'sec'], saldada: ['Saldada', 'ok'], archivada: ['—', 'muted'], nueva: ['Nueva', 'muted'], cargo: ['Cargo', 'accent'], abono: ['Abono', 'ok'], descuento: ['Descuento', 'sky'], cargo_atraso: ['Atraso', 'sec'], ajuste: ['Ajuste', 'muted'], nota: ['Nota', 'muted'] }[estado] || ['Normal', 'muted']
  return <span className="sld-status"><span className={`sld-status__dot sld-status__dot--${cfg[1]}`} />{cfg[0]}</span>
}
function BadgeId({ estado }) {
  const tone = estado === 'completa' ? 'ok' : estado === 'pendiente' ? 'sec' : 'muted'
  return <span className="sld-status"><span className={`sld-status__dot sld-status__dot--${tone}`} />{ID_LABEL[estado] || 'ID pendiente'}</span>
}
function Metric({ label, value, warn }) {
  return <div className="sld-metric"><div className="sld-metric__label">{label}</div><div className={cn('sld-metric__value', warn && 'is-warn')}>{value}</div></div>
}
function Field({ label, children, full }) {
  return <label className="sld-field" data-full={full ? 'true' : 'false'}><span className="sld-field__label">{label}</span>{children}</label>
}

/* ── WhatsApp manual ───────────────────────────────────────────────── */

function SaldosConfigModal({ config, onClose, onSave }) {
  const [dias, setDias] = useState(String(config?.diasAtraso ?? 30))
  const [pct, setPct] = useState(String(Math.round((config?.porcentajeAtraso ?? 0.2) * 100)))
  const [auto, setAuto] = useState(!!config?.interesAutomatico)
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    const d = Math.floor(Number(dias))
    const p = Number(pct)
    if (!Number.isFinite(d) || d <= 0) { toast.error('Los días deben ser mayores a 0.'); return }
    if (!Number.isFinite(p) || p < 0 || p > 100) { toast.error('El interés debe estar entre 0 y 100%.'); return }
    setBusy(true)
    try { await onSave({ diasAtraso: d, porcentajeAtraso: p, interesAutomatico: auto }) } finally { setBusy(false) }
  }
  return (
    <div className="sld-modal-overlay" onClick={onClose} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="sld-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Interés por atraso" style={{ margin: 'auto' }}>
        <div className="sld-modal__head">
          <h2><Settings size={18} strokeWidth={2} /> Interés por atraso</h2>
          <button type="button" className="sld-head__icon" onClick={onClose}><X size={18} /></button>
        </div>
        <p style={{ fontSize: 13, color: 'var(--mlb-text-secondary)', margin: '0 0 16px', lineHeight: 1.5 }}>
          Si una clienta no abona nada en los días que fijes, el sistema te <b>sugiere</b> cobrar este % sobre lo que aún debe. Tú decides si lo aplicas — nunca se cobra solo.
        </p>
        <form onSubmit={submit}>
          <div style={{ display: 'flex', gap: 12 }}>
            <Field label="Días sin abonar"><input className="sld-input" type="number" min="1" step="1" value={dias} onChange={(e) => setDias(e.target.value)} autoFocus /></Field>
            <Field label="Interés sugerido (%)"><input className="sld-input" type="number" min="0" max="100" step="1" value={pct} onChange={(e) => setPct(e.target.value)} /></Field>
          </div>
          <p style={{ fontSize: 12, color: 'var(--mlb-text-muted)', margin: '8px 2px 14px' }}>
            Hoy: {Number(pct) || 0}% después de {Number(dias) || 0} días sin abono.
          </p>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, padding: '12px 14px', border: '1px solid var(--mlb-border)', borderRadius: 10, marginBottom: 18, cursor: 'pointer' }}>
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} style={{ marginTop: 2 }} />
            <span style={{ fontSize: 13, color: 'var(--mlb-text-primary)', lineHeight: 1.45 }}>
              <b>Cobrar el interés automáticamente</b><br />
              <span style={{ color: 'var(--mlb-text-muted)' }}>Al cumplirse los días, el sistema agrega el cargo de interés solo (sin preguntar). Si lo dejas apagado, solo te lo sugiere.</span>
            </span>
          </label>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="sld-form__cancel" onClick={onClose}>Cancelar</button>
            <button type="submit" className="sld-actbtn" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

/** Vales emitidos: ver, copiar y reimprimir (PDF o impresora). */
function ValesModal({ workspace, onClose }) {
  const [vales, setVales] = useState([])
  const [cargando, setCargando] = useState(true)
  const [query, setQuery] = useState('')
  const disponible = !!window.bazar?.listVales

  useEffect(() => {
    let alive = true
    if (!disponible) { setCargando(false); return }
    Promise.resolve(window.bazar.listVales())
      .then((rows) => { if (alive) setVales(Array.isArray(rows) ? rows : []) })
      .catch(() => { if (alive) toast.error('No se pudieron cargar los vales.') })
      .finally(() => { if (alive) setCargando(false) })
    return () => { alive = false }
  }, [disponible])

  const filtrados = useMemo(() => {
    const q = query.trim().toUpperCase()
    if (!q) return vales
    return vales.filter((v) => [v.codigo, v.origen, v.nota].some((x) => String(x || '').toUpperCase().includes(q)))
  }, [vales, query])

  const activos = vales.filter((v) => v.activo)
  const totalDisp = activos.reduce((s, v) => s + (Number(v.disponible) || 0), 0)

  const copiar = async (codigo) => {
    try { await navigator.clipboard.writeText(codigo); toast.success(`Código ${codigo} copiado.`) }
    catch { toast.error('No se pudo copiar el código.') }
  }

  return (
    <div className="sld-modal-overlay" onClick={onClose} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="sld-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Vales emitidos" style={{ margin: 'auto', maxWidth: 680, width: '92vw' }}>
        <div className="sld-modal__head">
          <h2><Ticket size={18} strokeWidth={2} /> Vales emitidos</h2>
          <button type="button" className="sld-head__icon" onClick={onClose}><X size={18} /></button>
        </div>
        <p style={{ fontSize: 13, color: 'var(--mlb-text-secondary)', margin: '0 0 12px', lineHeight: 1.5 }}>
          Crédito al portador que entregas al devolver sin cuenta. No vencen.{' '}
          {activos.length > 0
            ? <b>{activos.length} activo{activos.length === 1 ? '' : 's'} · {formatPrice(totalDisp)} disponible.</b>
            : 'Por ahora no hay vales activos.'}
        </p>
        <div className="sld-head__search" style={{ marginBottom: 14 }}>
          <Search size={15} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por código u origen…" />
        </div>
        {cargando ? (
          <p style={{ fontSize: 13, color: 'var(--mlb-text-muted)', padding: '12px 2px' }}>Cargando…</p>
        ) : !disponible ? (
          <p style={{ fontSize: 13, color: 'var(--mlb-text-muted)', padding: '12px 2px' }}>Los vales solo están disponibles en la app de escritorio.</p>
        ) : filtrados.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--mlb-text-muted)', padding: '12px 2px' }}>
            {vales.length === 0 ? 'Todavía no se ha emitido ningún vale.' : 'Ningún vale coincide con la búsqueda.'}
          </p>
        ) : (
          <div className="sld-vales">
            {filtrados.map((v) => (
              <div key={v.codigo} className={cn('sld-vale', !v.activo && 'is-usado')}>
                <div className="sld-vale__main">
                  <span className="sld-vale__code">{v.codigo}</span>
                  <span className="sld-vale__meta">{fechaCorta(v.createdAt)}{v.nota ? ` · ${v.nota}` : (v.origen ? ` · ${v.origen}` : '')}</span>
                </div>
                <div className="sld-vale__amount">
                  <span className="sld-vale__disp">{formatPrice(v.disponible)}</span>
                  {Math.abs((Number(v.disponible) || 0) - (Number(v.monto) || 0)) > 0.005
                    ? <span className="sld-vale__of">de {formatPrice(v.monto)}</span> : null}
                </div>
                <span className={cn('sld-vale__badge', v.activo ? 'is-on' : 'is-off')}>
                  {v.activo ? 'Activo' : ((Number(v.disponible) || 0) <= 0.005 ? 'Usado' : 'Inactivo')}
                </span>
                <div className="sld-vale__actions">
                  <button type="button" className="sld-head__icon" title="Copiar código" onClick={() => copiar(v.codigo)}><Copy size={15} /></button>
                  <button type="button" className="sld-head__icon" title="Reimprimir o guardar PDF" onClick={() => imprimirVale(v, { negocio: workspace })}><Printer size={15} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function WhatsAppModal({ cuenta, resumen, workspace, onClose }) {
  const [plantilla, setPlantilla] = useState('recordatorio')
  const tpl = WA_PLANTILLAS.find((p) => p.id === plantilla) || WA_PLANTILLAS[0]
  const armar = (texto) => String(texto)
    .replaceAll('{nombre}', String(cuenta.nombre || '').split(/\s+/)[0] || cuenta.nombre || '')
    .replaceAll('{saldo}', formatPrice(resumen.saldo))
    .replaceAll('{bazar}', workspace)
    .replaceAll('{fecha_ultimo_abono}', resumen.ultimoAbono ? fechaCorta(resumen.ultimoAbono.fecha) : '—')
  const [mensaje, setMensaje] = useState(armar(tpl.texto))

  useEffect(() => { setMensaje(armar(WA_PLANTILLAS.find((p) => p.id === plantilla)?.texto || '')) }, [plantilla]) // eslint-disable-line react-hooks/exhaustive-deps

  const abrir = () => {
    const tel = String(cuenta.telefono || '').replace(/\D/g, '')
    if (!tel) { toast.error('El cliente no tiene teléfono.'); return }
    const numero = tel.length === 10 ? `52${tel}` : tel
    const url = `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`
    if (window.bazar?.shell?.openExternal) window.bazar.shell.openExternal(url)
    else window.open(url, '_blank', 'noopener')
    onClose()
  }

  return (
    <div className="sld-modal-overlay" onClick={onClose} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="sld-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="WhatsApp" style={{ margin: 'auto' }}>
        <div className="sld-modal__head"><h2><MessageCircle size={18} strokeWidth={2} /> WhatsApp a {cuenta.nombre}</h2><button type="button" className="sld-head__icon" onClick={onClose}><X size={18} /></button></div>
        <div className="sld-wa-tpls">
          {WA_PLANTILLAS.map((p) => <button key={p.id} type="button" className={cn('sld-wa-tpl', plantilla === p.id && 'is-on')} onClick={() => setPlantilla(p.id)}>{p.label}</button>)}
        </div>
        <textarea className="sld-textarea" value={mensaje} onChange={(e) => setMensaje(e.target.value)} rows={5} />
        <p className="sld-wa-hint">Revisá y editá el mensaje. Al tocar «Abrir WhatsApp» se abre el chat con el texto listo — vos lo enviás.</p>
        <div className="sld-form__foot" style={{ border: 'none', paddingTop: 8 }}>
          <button type="button" className="sld-form__cancel" onClick={onClose}>Cancelar</button>
          <button type="button" className="sld-actbtn sld-actbtn--primary" onClick={abrir}><MessageCircle size={15} strokeWidth={2} />Abrir WhatsApp</button>
        </div>
      </div>
    </div>
  )
}
