import { useEffect, useState } from 'react'
import {
  Home, Package, ShoppingCart, Tag, WalletCards, Settings,
  UserPlus, BadgeDollarSign, Table2, BarChart3,
} from 'lucide-react'
import { openPdvWindowAction } from '@/lib/openPdvWindow'
import { useEnabledModules } from '@/hooks/useEnabledModules.js'
import { GanchoMark } from '@/components/premium/MonserratMark'
import { esRutaImagen, rutaAFileUrl } from '@/lib/categoriaEmoji'
import { cn } from '@/lib/utils'

/**
 * Sidebar Monserrat — UNA sola navegación para todo el workspace
 * (antes había dos sistemas: un rail de 60px y una sidebar especial de
 * Saldos con botones muertos; se unificaron acá).
 *
 * Cuando la sección activa es Saldos, el item se expande con subacciones
 * REALES: despachan `mlb:saldos-action`, el contrato que SaldosView ya
 * escucha (cuentas / nuevo / abono).
 */

const ITEMS = [
  { id: 'inventario', label: 'Inventario', icon: Package, moduleId: 'inventario' },
  { id: 'saldos', label: 'Saldos', icon: WalletCards, moduleId: 'saldos' },
  { id: 'reportes', label: 'Reportes', icon: BarChart3, always: true },
  { id: 'etiquetas', label: 'Etiquetas', icon: Tag, moduleId: 'label-editor' },
]

const SALDOS_SUBACCIONES = [
  { id: 'cuentas', label: 'Cuentas', icon: Table2 },
  { id: 'nuevo', label: 'Nuevo cliente', icon: UserPlus },
  { id: 'abono', label: 'Registrar abono', icon: BadgeDollarSign },
]

export function MlbWorkspaceRail({ section, onNavigate, onBackHome }) {
  const { isEnabled } = useEnabledModules()
  const items = ITEMS.filter((it) => it.always || isEnabled(it.moduleId))
  const [nombre, setNombre] = useState('Mi Bazar')
  const [logo, setLogo] = useState('')
  const [saldosSub, setSaldosSub] = useState('cuentas')

  useEffect(() => {
    let alive = true
    const cargar = () => window.bazar?.settings?.get?.().then((s) => {
      if (!alive || !s) return
      const n = String(s.workspaceDisplayName || '').trim()
      setNombre(n || 'Mi Bazar')
      setLogo(String(s.workspaceLogoPath || '').trim())
    }).catch(() => {})
    void cargar()
    // Refresca si cambian los ajustes (logo/nombre) en otra pantalla.
    const onChanged = () => void cargar()
    window.addEventListener('mlb:settings-changed', onChanged)
    return () => { alive = false; window.removeEventListener('mlb:settings-changed', onChanged) }
  }, [])

  useEffect(() => {
    if (section !== 'saldos') setSaldosSub('cuentas')
  }, [section])

  const accionSaldos = (id) => {
    setSaldosSub(id)
    window.dispatchEvent(new CustomEvent('mlb:saldos-action', { detail: id }))
  }

  return (
    <nav
      className="flex w-[212px] shrink-0 flex-col overflow-y-auto border-r border-[var(--mlb-border)] bg-[var(--mlb-bg-panel-dark)] px-3 pb-3 pt-4"
      aria-label="Navegación del bazar"
    >
      {/* Identidad */}
      <button
        type="button"
        onClick={onBackHome}
        className="mlb-focus-ring group mb-5 flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-[var(--mlb-bg-hover)]"
        title="Ir al inicio"
      >
        {logo && esRutaImagen(logo) ? (
          <img
            src={rutaAFileUrl(logo)}
            alt=""
            className="size-9 shrink-0 rounded-full object-cover"
            style={{ boxShadow: '0 0 0 2px var(--mlb-oro)' }}
            aria-hidden
          />
        ) : (
          <span
            className="grid size-9 shrink-0 place-items-center rounded-full"
            style={{
              background: 'oklch(0.93 0.035 20)',
              boxShadow: '0 0 0 2px var(--mlb-oro)',
            }}
            aria-hidden
          >
            <GanchoMark size={20} strokeWidth={7} className="text-[oklch(0.24_0.01_25)]" />
          </span>
        )}
        <span className="min-w-0">
          <span className="block truncate text-[14px] font-bold tracking-[-0.01em] text-[var(--mlb-text-primary)]">
            {nombre}
          </span>
          <span className="block truncate text-[10px] font-medium uppercase tracking-[0.13em] text-[var(--mlb-text-muted)]">
            saldos, ropa y más…
          </span>
        </span>
      </button>

      <div className="flex flex-col gap-0.5">
        <SidebarItem icon={Home} label="Inicio" onClick={onBackHome} />
        <SidebarItem
          icon={ShoppingCart}
          label="Punto de venta"
          hint="F1"
          onClick={() => void openPdvWindowAction()}
        />
        {items.map((it) => (
          <div key={it.id}>
            <SidebarItem
              icon={it.icon}
              label={it.label}
              active={section === it.id}
              onClick={() => void onNavigate?.(it.id)}
            />
            {it.id === 'saldos' && section === 'saldos' ? (
              <div className="mb-1 ml-[21px] mt-0.5 flex flex-col gap-0.5 border-l border-[var(--mlb-border)] pl-2.5">
                {SALDOS_SUBACCIONES.map((sub) => {
                  const SubIcon = sub.icon
                  const activa = saldosSub === sub.id
                  return (
                    <button
                      key={sub.id}
                      type="button"
                      onClick={() => accionSaldos(sub.id)}
                      aria-current={activa ? 'true' : undefined}
                      className={cn(
                        'mlb-focus-ring flex h-[30px] w-full items-center gap-2 rounded-lg px-2.5 text-left text-[12.5px] transition-colors',
                        activa
                          ? 'bg-[var(--mlb-accent-soft)] font-semibold text-[var(--mlb-accent)]'
                          : 'font-medium text-[var(--mlb-text-secondary)] hover:bg-[var(--mlb-bg-hover)] hover:text-[var(--mlb-text-primary)]',
                      )}
                    >
                      <SubIcon size={14} strokeWidth={1.9} className="shrink-0" />
                      <span className="min-w-0 truncate">{sub.label}</span>
                    </button>
                  )
                })}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div className="min-h-2 flex-1" aria-hidden />

      <SidebarItem
        icon={Settings}
        label="Ajustes"
        active={section === 'ajustes'}
        onClick={() => void onNavigate?.('ajustes')}
      />
    </nav>
  )
}

function SidebarItem({ icon: Icon, label, hint, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'mlb-focus-ring group flex h-[38px] w-full items-center gap-2.5 rounded-[10px] px-2.5 text-left text-[13.5px] transition-colors',
        active
          ? 'bg-[var(--mlb-bg-panel)] font-semibold text-[var(--mlb-accent)] shadow-[var(--shadow-xs)]'
          : 'font-medium text-[var(--mlb-text-secondary)] hover:bg-[var(--mlb-bg-hover)] hover:text-[var(--mlb-text-primary)]',
      )}
    >
      <Icon
        size={17}
        strokeWidth={1.7}
        className={cn(
          'shrink-0 transition-colors',
          active ? 'text-[var(--mlb-accent)]' : 'text-[var(--mlb-text-muted)] group-hover:text-[var(--mlb-text-secondary)]',
        )}
      />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {hint ? (
        <kbd className="rounded border border-[var(--mlb-border)] bg-[var(--mlb-bg-input)] px-1 py-px font-mono text-[9.5px] text-[var(--mlb-text-muted)]">
          {hint}
        </kbd>
      ) : null}
    </button>
  )
}
