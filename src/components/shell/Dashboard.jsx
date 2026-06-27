import { useEffect, useState } from 'react'
import {
  ScanLine, Shirt, SunMedium, Moon, MonitorCog, ArrowUpRight,
  Settings as SettingsIcon, Plus, WalletCards, LineChart, Tag
} from 'lucide-react'
import { formatPrice } from '@/lib/format'
import { openPdvWindowAction } from '@/lib/openPdvWindow'
import { useTheme } from '@/theme/ThemeProvider.jsx'
import { findPlan } from '@/lib/plansCatalog'
import { emojiDeCategoria, esRutaImagen, rutaAFileUrl } from '@/lib/categoriaEmoji'
import './inicio-monserrat.css'


/**
 * Inicio Monserrat — dashboard boutique del mock pos-ui aprobado.
 *   · Greeting card: gradiente rosa + patrón de ganchos + logo del gancho
 *     + saludo en display itálica.
 *   · Métricas (disponibles / ventas hoy / total).
 *   · Atajos grandes (PDV · Inventario · Saldos).
 *   · Ingresos recientes con emoji de categoría.
 *
 * Conserva el cableado real: getWelcomeSnapshot + getInventoryList.
 */

const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

const HANGER_PATTERN = "url(\"data:image/svg+xml;utf8,<svg viewBox='0 0 24 24' fill='none' stroke='%23ff6b9e' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round' xmlns='http://www.w3.org/2000/svg'><path d='M12 3a2.5 2.5 0 0 0-2.5 2.5c0 1.25.5 2.25 1.5 3L8 11.5 2 17h20l-6-5.5-3-3c1-.75 1.5-1.75 1.5-3A2.5 2.5 0 0 0 12 3z'/><path d='M12 5.5v3'/><path d='M2 17h20v2H2z'/></svg>\")"

function HangerIcon({ size = 32 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3a2.5 2.5 0 0 0-2.5 2.5c0 1.25.5 2.25 1.5 3L8 11.5 2 17h20l-6-5.5-3-3c1-.75 1.5-1.75 1.5-3A2.5 2.5 0 0 0 12 3z" />
      <path d="M12 5.5v3" /><path d="M2 17h20v2H2z" />
    </svg>
  )
}

export function Dashboard({ onNavigate, settings }) {
  const [recientes, setRecientes] = useState([])
  const [resumen, setResumen] = useState(null)
  const { themePref, cycleTheme } = useTheme()

  useEffect(() => {
    const api = window?.bazar?.db
    if (!api?.getInventoryList) return
    let alive = true
    api.getInventoryList({ search: '', estadoIndex: 0, vistaIndex: 0, listTab: 'main' })
      .then((rows) => { if (alive && Array.isArray(rows)) setRecientes(rows.slice(0, 4)) })
      .catch(() => {})
    if (api.getWelcomeSnapshot) {
      api.getWelcomeSnapshot().then((s) => { if (alive && s) setResumen(s) }).catch(() => {})
    }
    return () => { alive = false }
  }, [])

  const now = new Date()
  const hour = now.getHours()
  const greeting = hour < 6 ? 'Buenas noches' : hour < 13 ? 'Buen día' : hour < 20 ? 'Buenas tardes' : 'Buenas noches'
  const dateLine = `${DAYS[now.getDay()]} · ${now.getDate()} de ${MONTHS[now.getMonth()]}`

  const ThemeIcon = themePref === 'light' ? SunMedium : themePref === 'dark' ? Moon : MonitorCog
  const themeTitle = themePref === 'light' ? 'Tema claro (clic: oscuro)' : themePref === 'dark' ? 'Tema oscuro (clic: sistema)' : 'Tema del sistema (clic: claro)'

  const workspaceName = String(settings?.workspaceDisplayName || 'Mi Bazar').trim() || 'Mi Bazar'
  const logoUrl = esRutaImagen(settings?.workspaceLogoPath) ? rutaAFileUrl(settings.workspaceLogoPath) : ''
  const categoriasMeta = settings?.categoriasMeta && typeof settings.categoriasMeta === 'object' ? settings.categoriasMeta : {}
  const plan = findPlan(settings?.selectedPlan)

  if (settings?.dashboardLayout === 'manga') {
    return (
      <div className="flex h-full bg-[#fceef2] dark:bg-[#1f1015]">
        {/* Lado Izquierdo: Sistema y Acciones */}
        <div className="flex flex-col flex-1 p-10 overflow-y-auto z-10">
          <div className="flex justify-between items-start mb-14">
            <div className="flex items-center gap-5">
               <div className="size-[72px] rounded-full overflow-hidden border-2 border-white/40 dark:border-white/10 shadow-[0_8px_30px_rgba(255,107,158,0.15)] bg-white/60 dark:bg-black/40 backdrop-blur-md flex items-center justify-center">
                 <img src="branding/logo.jpg" alt="Logo" className="w-[95%] h-[95%] object-contain scale-105" />
               </div>
               <div className="flex flex-col justify-center">
                 <span className="text-[11px] font-bold tracking-[0.15em] text-[#d53f8c] dark:text-[#ff9cbd] uppercase">
                   {workspaceName} <span className="text-[var(--mlb-oro)] ml-1">· Boutique</span>
                 </span>
                 <h1 className="text-[40px] font-extrabold italic leading-none text-black/80 dark:text-white/90 font-display mt-0.5">{greeting}</h1>
                 <p className="text-[13.5px] font-medium text-black/50 dark:text-white/50 mt-1">{dateLine}</p>
               </div>
            </div>
            <div className="flex gap-2">
              <button onClick={cycleTheme} className="size-[42px] rounded-full bg-white/40 dark:bg-black/30 backdrop-blur-md flex items-center justify-center text-black/60 dark:text-white/60 hover:bg-white/80 dark:hover:bg-white/10 hover:text-black dark:hover:text-white transition-all shadow-sm">
                <ThemeIcon size={20} strokeWidth={1.7} />
              </button>
              <button onClick={() => onNavigate?.('ajustes')} className="size-[42px] rounded-full bg-white/40 dark:bg-black/30 backdrop-blur-md flex items-center justify-center text-black/60 dark:text-white/60 hover:bg-white/80 dark:hover:bg-white/10 hover:text-black dark:hover:text-white transition-all shadow-sm">
                <SettingsIcon size={20} strokeWidth={1.7} />
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-4 max-w-[440px] mt-4">
            <h3 className="text-[11.5px] font-bold tracking-[0.1em] text-black/40 dark:text-white/40 uppercase mb-1 ml-2">Accesos Rápidos</h3>
            
            <button onClick={() => void openPdvWindowAction()} className="group relative flex items-center gap-5 p-5 rounded-[22px] bg-white/50 dark:bg-black/20 backdrop-blur-xl border border-white/60 dark:border-white/5 shadow-[0_8px_20px_rgba(0,0,0,0.03)] text-left transition-all duration-300 hover:bg-white/80 dark:hover:bg-black/40 hover:-translate-y-1 hover:shadow-[0_12px_30px_rgba(255,107,158,0.15)] hover:border-[#ff6b9e]/30">
              <div className="size-14 rounded-2xl bg-gradient-to-br from-[#ff6b9e] to-[#ff8fab] text-white flex items-center justify-center group-hover:scale-105 transition-transform shadow-md shadow-[#ff6b9e]/30">
                <ScanLine size={26} strokeWidth={1.8} />
              </div>
              <div>
                <h4 className="text-[17px] font-bold text-black/80 dark:text-white/90">Punto de venta</h4>
                <p className="text-[13.5px] text-black/50 dark:text-white/50 mt-0.5">Cobrar al momento</p>
              </div>
              <ArrowUpRight size={22} className="ml-auto text-black/20 dark:text-white/20 group-hover:text-[#ff6b9e] transition-colors" />
            </button>

            <button onClick={() => void onNavigate?.('inventario')} className="group relative flex items-center gap-5 p-5 rounded-[22px] bg-white/50 dark:bg-black/20 backdrop-blur-xl border border-white/60 dark:border-white/5 shadow-[0_8px_20px_rgba(0,0,0,0.03)] text-left transition-all duration-300 hover:bg-white/80 dark:hover:bg-black/40 hover:-translate-y-1 hover:shadow-xl">
              <div className="size-14 rounded-2xl bg-white/60 dark:bg-white/5 text-black/60 dark:text-white/80 flex items-center justify-center group-hover:scale-105 transition-transform border border-black/5 dark:border-white/5">
                <Shirt size={26} strokeWidth={1.8} />
              </div>
              <div>
                <h4 className="text-[17px] font-bold text-black/80 dark:text-white/90">Inventario</h4>
                <p className="text-[13.5px] text-black/50 dark:text-white/50 mt-0.5">Catálogo de prendas</p>
              </div>
              <ArrowUpRight size={22} className="ml-auto text-black/20 dark:text-white/20 group-hover:text-black/60 dark:group-hover:text-white/60 transition-colors" />
            </button>

            <button onClick={() => void onNavigate?.('saldos')} className="group relative flex items-center gap-5 p-5 rounded-[22px] bg-white/50 dark:bg-black/20 backdrop-blur-xl border border-white/60 dark:border-white/5 shadow-[0_8px_20px_rgba(0,0,0,0.03)] text-left transition-all duration-300 hover:bg-white/80 dark:hover:bg-black/40 hover:-translate-y-1 hover:shadow-xl">
              <div className="size-14 rounded-2xl bg-white/60 dark:bg-white/5 text-black/60 dark:text-white/80 flex items-center justify-center group-hover:scale-105 transition-transform border border-black/5 dark:border-white/5">
                <WalletCards size={26} strokeWidth={1.8} />
              </div>
              <div>
                <h4 className="text-[17px] font-bold text-black/80 dark:text-white/90">Saldos</h4>
                <p className="text-[13.5px] text-black/50 dark:text-white/50 mt-0.5">Cuentas de clientes</p>
              </div>
              <ArrowUpRight size={22} className="ml-auto text-black/20 dark:text-white/20 group-hover:text-black/60 dark:group-hover:text-white/60 transition-colors" />
            </button>
          </div>
        </div>

        {/* Lado Derecho: Póster Manga */}
        <div className="relative w-1/2 min-w-[400px] h-full overflow-hidden shadow-[-30px_0_50px_rgba(255,107,158,0.08)] bg-white dark:bg-black rounded-l-[40px] border-l border-white/40 dark:border-white/5 z-20">
          <img src="branding/imagen1.jpg" alt="Manga Protagonista" className="absolute inset-0 w-full h-full object-cover object-[center_20%]" />
          
          {/* Overlay suave para integrar colores */}
          <div className="absolute inset-0 bg-gradient-to-tr from-[#fceef2]/40 to-transparent dark:from-[#1f1015]/80 mix-blend-multiply dark:mix-blend-normal"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="keeby-replica-wrapper">
      
      {/* HEADER (Top Nav) */}
      <header className="keeby-nav">
        <div className="keeby-nav-left">
          <span className="keeby-logo-text">my little bazar</span>
          <span className="keeby-trophy">👑 #1 Top Boutique App (MX)</span>
        </div>
        
        <div className="keeby-nav-center">
          {greeting} — {dateLine}
        </div>
        
        <div className="keeby-nav-right">
          <button className="keeby-pill" onClick={cycleTheme}>
            <ThemeIcon size={14} /> Tema
          </button>
          <button className="keeby-pill" onClick={() => void onNavigate?.('ajustes')}>
            <SettingsIcon size={14} /> Ajustes
          </button>
          <button className="keeby-pill black-pill" onClick={() => void onNavigate?.('inventario')}>
            <Shirt size={14} /> Ver Catálogo
          </button>
        </div>
      </header>

      {/* METRICS (Huge Typography like 0 100%) */}
      <main className="keeby-main-metrics">
        {resumen ? (
          <div className="keeby-huge-numbers">
            <div className="keeby-metric-group">
              <span className="keeby-huge-val">{Number(resumen.productosDisponibles) || 0}</span>
              <span className="keeby-huge-label">Prendas</span>
            </div>
            <div className="keeby-metric-group">
              <span className="keeby-huge-val">{Number(resumen.clientesTotal) || 0}</span>
              <span className="keeby-huge-label">Clientes{Number(resumen.clientesConSaldo) > 0 ? ` · ${Number(resumen.clientesConSaldo)} deben` : ''}</span>
            </div>
            <div className="keeby-metric-group">
              <span className="keeby-huge-val">{formatPrice(Number(resumen.saldoTotalPendiente) || 0)}</span>
              <span className="keeby-huge-label">Por cobrar</span>
            </div>
          </div>
        ) : (
          <div className="keeby-huge-numbers">
            <div className="keeby-metric-group">
              <span className="keeby-huge-val">0</span>
              <span className="keeby-huge-label">Prendas Registradas</span>
            </div>
          </div>
        )}
      </main>

      {/* THE BOUTIQUE GRID (Minimalist Action Tiles) */}
      <section className="boutique-grid-section">
        <div className="boutique-grid">
          
          {/* Main Card: Vender (Accent Soft) */}
          <button className="boutique-card boutique-card-accent" onClick={() => void openPdvWindowAction()}>
            <div className="boutique-card-content large-content">
              <div className="boutique-icon-ring"><ScanLine size={36} strokeWidth={2} /></div>
              <div className="boutique-text-wrap">
                <span className="boutique-title">Punto de Venta</span>
                <span className="boutique-sub">Registrar ventas o apartados rápidos</span>
              </div>
            </div>
            <div className="boutique-card-glow"></div>
          </button>

          <div className="boutique-column">
            {/* Card: Inventario */}
            <button className="boutique-card" onClick={() => void onNavigate?.('inventario')}>
              <div className="boutique-card-content row-content">
                <div className="boutique-icon"><Shirt size={24} strokeWidth={1.5} /></div>
                <div className="boutique-text-wrap">
                  <span className="boutique-title">Catálogo</span>
                  <span className="boutique-sub">Gestionar prendas</span>
                </div>
              </div>
            </button>

            {/* Card: Saldos */}
            <button className="boutique-card" onClick={() => void onNavigate?.('saldos')}>
              <div className="boutique-card-content row-content">
                <div className="boutique-icon"><WalletCards size={24} strokeWidth={1.5} /></div>
                <div className="boutique-text-wrap">
                  <span className="boutique-title">Saldos</span>
                  <span className="boutique-sub">Cuentas por cobrar</span>
                </div>
              </div>
            </button>
          </div>
          
          <div className="boutique-column">
            {/* Card: Reportes */}
            <button className="boutique-card" onClick={() => void onNavigate?.('reportes')}>
              <div className="boutique-card-content row-content">
                <div className="boutique-icon"><LineChart size={24} strokeWidth={1.5} /></div>
                <div className="boutique-text-wrap">
                  <span className="boutique-title">Reportes</span>
                  <span className="boutique-sub">Ventas e ingresos</span>
                </div>
              </div>
            </button>

            {/* Card: Etiquetas */}
            <button className="boutique-card" onClick={() => void onNavigate?.('etiquetas')}>
              <div className="boutique-card-content row-content">
                <div className="boutique-icon"><Tag size={24} strokeWidth={1.5} /></div>
                <div className="boutique-text-wrap">
                  <span className="boutique-title">Etiquetas</span>
                  <span className="boutique-sub">Imprimir códigos</span>
                </div>
              </div>
            </button>
          </div>

        </div>
      </section>

      {/* FOOTER (Bottom Nav) */}
      <footer className="keeby-footer">
        <div className="keeby-footer-left">
          <div className="keeby-pill gray-pill">
            <span className="dot" style={{ background: '#ff453a' }}></span> Actividad: {recientes.length}
          </div>
        </div>
        
        <div className="keeby-footer-center">
          <button className="keeby-pill black-pill" onClick={() => void onNavigate?.('reportes')}>
            <LineChart size={14} /> Ver Reportes
          </button>
        </div>
        
        <div className="keeby-footer-right">
          <button className="keeby-icon-btn" onClick={() => window.location.reload()}>
            ↻ Restart
          </button>
        </div>
      </footer>

    </div>
  )
}
