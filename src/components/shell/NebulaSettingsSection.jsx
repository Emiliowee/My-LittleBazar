import { Sun, Moon, Monitor } from 'lucide-react'
import { useTheme } from '@/theme/ThemeProvider.jsx'
import { cn } from '@/lib/utils'

/**
 * Apariencia — simple y honesto: Claro, Oscuro o Sistema.
 * (Se quitaron los "temas" extra que no se adaptaban bien a toda la app; el
 *  oscuro base es un dark "Linear" cuidado, no negro total.)
 */
const BASE_THEMES = [
  { id: 'light', Icon: Sun, label: 'Claro', desc: 'Fondo claro, el de siempre.' },
  { id: 'dark', Icon: Moon, label: 'Oscuro', desc: 'Gris pizarra suave, cómodo de noche.' },
  { id: 'system', Icon: Monitor, label: 'Como Windows', desc: 'Sigue el tema de tu computadora.' },
]

export function NebulaSettingsSection() {
  const { themePref, setTheme } = useTheme()

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <header className="shrink-0 border-b border-[var(--mlb-border)] px-6 py-4">
        <h2 className="text-[16px] font-semibold tracking-tight text-[var(--mlb-text-primary)]">Apariencia</h2>
        <p className="mt-0.5 text-[12.5px] text-[var(--mlb-text-secondary)]">Elige cómo se ve la aplicación.</p>
      </header>

      <div className="grid max-w-2xl gap-3 p-6 sm:grid-cols-3">
        {BASE_THEMES.map(({ id, Icon, label, desc }) => {
          const active = themePref === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => void setTheme(id)}
              className={cn(
                'flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-colors',
                active
                  ? 'border-[var(--mlb-accent)] bg-[var(--mlb-accent-soft)]'
                  : 'border-[var(--mlb-border)] bg-[var(--mlb-bg-panel)] hover:border-[var(--mlb-border-strong)] hover:bg-[var(--mlb-bg-hover)]',
              )}
            >
              <span className={cn('grid size-9 place-items-center rounded-lg', active ? 'bg-[var(--mlb-accent)] text-white' : 'bg-[var(--mlb-bg-active)] text-[var(--mlb-text-secondary)]')}>
                <Icon size={18} strokeWidth={1.9} />
              </span>
              <span className="text-[13.5px] font-semibold text-[var(--mlb-text-primary)]">{label}</span>
              <span className="text-[11.5px] leading-snug text-[var(--mlb-text-muted)]">{desc}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
