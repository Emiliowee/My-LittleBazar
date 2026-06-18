import { Store, Package, Settings as SettingsIcon } from 'lucide-react'

/**
 * Footer del lanzador — atajos con label.
 * Izquierda: navegación rápida a las secciones principales.
 * Derecha: ajustes.
 */
export function MlbFooterNav({ section, onNavigate }) {
  return (
    <footer
      className="flex shrink-0 items-center justify-between gap-2 border-t border-[var(--mlb-border)] bg-[var(--mlb-bg-panel-dark)] px-3 py-2"
      style={{ WebkitAppRegion: 'no-drag' }}
    >
      <div className="flex shrink-0 items-center gap-0.5">
        <NavBtn
          icon={Store}
          label="Inicio"
          active={section === 'inicio'}
          onClick={() => onNavigate('inicio')}
        />
        <NavBtn
          icon={Package}
          label="Inventario"
          active={section === 'inventario'}
          onClick={() => void onNavigate('inventario')}
        />
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        <NavBtn
          icon={SettingsIcon}
          label="Ajustes"
          active={section === 'ajustes'}
          onClick={() => onNavigate('ajustes')}
        />
      </div>
    </footer>
  )
}

function NavBtn({ icon: Icon, label, active, accent, onClick }) {
  const tone = active
    ? accent
      ? 'bg-[var(--mlb-accent-soft)] text-[var(--mlb-accent)]'
      : 'bg-[var(--mlb-bg-active)] text-[var(--mlb-text-primary)]'
    : accent
      ? 'text-[var(--mlb-accent)] hover:bg-[var(--mlb-accent-soft)]'
      : 'text-[var(--mlb-text-secondary)] hover:bg-[var(--mlb-bg-hover)] hover:text-[var(--mlb-text-primary)]'

  return (
    <button
      type="button"
      onClick={onClick}
      className={`mlb-focus-ring inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12.5px] font-medium transition-colors ${tone}`}
      aria-label={label}
      aria-pressed={active ? true : undefined}
    >
      <Icon size={15} strokeWidth={1.6} />
      <span>{label}</span>
    </button>
  )
}
