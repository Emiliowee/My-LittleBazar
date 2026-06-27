import { useEffect, useState } from 'react'
import {
  ScanLine, Shirt, SunMedium, Moon, MonitorCog, ArrowUpRight,
  Settings as SettingsIcon, Plus, WalletCards,
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
    <div className="ini">
      {/* Greeting */}
      <div className="ini-greet" style={{ position: 'relative', overflow: 'hidden' }}>
        <div className="ini-greet__pattern" style={{ backgroundImage: HANGER_PATTERN, backgroundRepeat: 'repeat', backgroundSize: '60px' }} aria-hidden />
        
        {/* Decoración removida por petición del usuario para una vista más limpia */}

        <div className="ini-greet__content">
          <span className="ini-greet__logo">
            {logoUrl
              ? <img src={logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <HangerIcon size={30} />}
          </span>
          <div className="ini-greet__text">
            <span className="ini-greet__eyebrow">{workspaceName} · saldos, ropa y más…</span>
            <h1 className="ini-greet__title">{greeting}</h1>
            <span className="ini-greet__date">{dateLine}{plan ? ` · ${plan.name}` : ''}</span>
          </div>
        </div>
        <div className="ini-greet__actions">
          <button type="button" className="ini-iconbtn" title={themeTitle} aria-label={themeTitle} onClick={cycleTheme}><ThemeIcon size={19} strokeWidth={1.7} /></button>
          <button type="button" className="ini-iconbtn" title="Ajustes" aria-label="Abrir ajustes" onClick={() => onNavigate?.('ajustes')}><SettingsIcon size={19} strokeWidth={1.7} /></button>
        </div>
      </div>

      {/* Métricas */}
      {resumen ? (
        <div className="ini-metrics">
          <button type="button" className="ini-metric ini-metric--btn" onClick={() => void onNavigate?.('inventario')}>
            <span className="ini-metric__label">Prendas disponibles</span>
            <span className="ini-metric__value">{Number(resumen.productosDisponibles) || 0}</span>
          </button>
          <button type="button" className="ini-metric ini-metric--btn" onClick={() => void onNavigate?.('saldos')}>
            <span className="ini-metric__label">Clientes con saldo</span>
            <span className="ini-metric__value">{Number(resumen.clientesConSaldo) || 0}</span>
          </button>
          <button type="button" className="ini-metric ini-metric--btn ini-metric--oro" onClick={() => void onNavigate?.('saldos')}>
            <span className="ini-metric__label">Por cobrar en la calle</span>
            <span className="ini-metric__value">{formatPrice(Number(resumen.saldoTotalPendiente) || 0)}</span>
          </button>
        </div>
      ) : null}

      {/* Atajos */}
      <div className="ini-block">
        <h3 className="ini-title">Atajos</h3>
        <div className="ini-shortcuts">
          <button type="button" className="ini-shortcut" onClick={() => void openPdvWindowAction()}>
            <span className="ini-shortcut__icon is-pink"><ScanLine size={23} strokeWidth={1.7} /></span>
            <span className="ini-shortcut__info"><h4>Punto de venta</h4><span>Cobrar al momento</span></span>
            <span className="ini-shortcut__meta"><kbd>F1</kbd><ArrowUpRight size={15} strokeWidth={1.8} /></span>
          </button>
          <button type="button" className="ini-shortcut" onClick={() => void onNavigate?.('inventario')}>
            <span className="ini-shortcut__icon"><Shirt size={23} strokeWidth={1.7} /></span>
            <span className="ini-shortcut__info"><h4>Inventario</h4><span>Catálogo de prendas</span></span>
            <span className="ini-shortcut__meta"><kbd>F2</kbd><ArrowUpRight size={15} strokeWidth={1.8} /></span>
          </button>
          <button type="button" className="ini-shortcut" onClick={() => void onNavigate?.('saldos')}>
            <span className="ini-shortcut__icon"><WalletCards size={23} strokeWidth={1.7} /></span>
            <span className="ini-shortcut__info"><h4>Saldos</h4><span>Cuentas de clientes</span></span>
            <span className="ini-shortcut__meta"><ArrowUpRight size={15} strokeWidth={1.8} /></span>
          </button>
        </div>
      </div>

      {/* Ingresos recientes */}
      <div className="ini-block" style={{ flex: 1, minHeight: 0 }}>
        <div className="ini-block__head">
          <h3 className="ini-title">{recientes.length > 0 ? 'Ingresos recientes' : 'Empezá a registrar tu inventario'}</h3>
          <button type="button" className="ini-link" onClick={() => void onNavigate?.('inventario')}>Ver inventario</button>
        </div>
        {recientes.length > 0 ? (
          <div className="ini-recent">
            {recientes.map((r, i) => {
              const ic = emojiDeCategoria(r.categoria, categoriasMeta)
              const fecha = String(r?.fecha_ingreso ?? r?.created_at ?? '').slice(0, 10)
              return (
                <button key={r.id ?? i} type="button" className="ini-recent__item" onClick={() => void onNavigate?.('inventario')}>
                  <span className="ini-recent__emoji">{esRutaImagen(ic) ? <img src={rutaAFileUrl(ic)} alt="" /> : ic}</span>
                  <span className="ini-recent__info">
                    <h4>{r?.descripcion || r?.codigo || 'Sin nombre'}</h4>
                    <span>{r?.codigo}{fecha ? ` · ${fecha}` : ''}</span>
                  </span>
                  <span className="ini-recent__amount">{formatPrice(Number(r?.precio) || 0)}</span>
                </button>
              )
            })}
          </div>
        ) : (
          <button type="button" className="ini-shortcut" style={{ marginTop: 4 }} onClick={() => void onNavigate?.('inventario')}>
            <span className="ini-shortcut__icon is-pink"><Plus size={22} strokeWidth={1.8} /></span>
            <span className="ini-shortcut__info"><h4>Registrá tu primera prenda</h4><span>Abrí el inventario para empezar el catálogo.</span></span>
            <span className="ini-shortcut__meta"><ArrowUpRight size={15} strokeWidth={1.8} /></span>
          </button>
        )}
      </div>
    </div>
  )
}
