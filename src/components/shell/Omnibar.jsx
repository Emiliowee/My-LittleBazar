import { useState } from 'react'
import { Search, Sparkles, Command } from 'lucide-react'

/**
 * Omnibar — barra de búsqueda hero (h-9, rounded-md, focus ring premium).
 * Sugerencias inline con NLP simulado (intents: vender, agregar, buscar).
 */
export function Omnibar() {
  const [query, setQuery] = useState('')

  const parsed = parseQuery(query)

  return (
    <div className="relative w-full" style={{ WebkitAppRegion: 'no-drag' }}>
      <div className="flex h-9 items-center gap-2 rounded-md border border-[var(--mlb-border)] bg-[var(--mlb-bg-input)] px-3 transition-[border-color,box-shadow] focus-within:border-[var(--mlb-border-focus)] focus-within:shadow-[0_0_0_3px_var(--mlb-bg-active)]">
        <Search size={14} className="shrink-0 text-[var(--mlb-text-muted)]" strokeWidth={1.6} />
        <input
          type="text"
          className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--mlb-text-primary)] outline-none placeholder:text-[var(--mlb-text-muted)]"
          placeholder='Buscá, escribí "am 650 pantalón" o "vender MSR-12"…'
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
          spellCheck={false}
          autoComplete="off"
        />
        <kbd className="hidden shrink-0 items-center gap-0.5 rounded-sm border border-[var(--mlb-border)] bg-[var(--mlb-bg-panel)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--mlb-text-muted)] sm:flex">
          <Command size={10} strokeWidth={2} />
          <span>K</span>
        </kbd>
      </div>

      {query && parsed ? (
        <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 overflow-hidden rounded-md border border-[var(--mlb-border-strong)] bg-[var(--mlb-bg-panel)] p-1.5 shadow-[var(--mlb-shadow-card)]">
          <div className="flex items-center gap-2.5 rounded-sm bg-[var(--mlb-bg-active)] px-2.5 py-2">
            <Sparkles
              size={14}
              className={
                parsed.tone === 'success'
                  ? 'text-[var(--mlb-success)]'
                  : parsed.tone === 'accent'
                    ? 'text-[var(--mlb-accent)]'
                    : 'text-[var(--mlb-text-muted)]'
              }
              strokeWidth={1.6}
            />
            <div className="flex min-w-0 flex-1 flex-col text-left">
              <span className="text-[12.5px] font-medium text-[var(--mlb-text-primary)]">{parsed.title}</span>
              {parsed.detail ? (
                <span className="mt-0.5 truncate text-[11.5px] text-[var(--mlb-text-secondary)]">
                  {parsed.detail}
                </span>
              ) : null}
            </div>
            <span className="shrink-0 rounded-sm border border-[var(--mlb-border)] bg-[var(--mlb-bg-panel-dark)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--mlb-text-muted)]">
              Enter
            </span>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function parseQuery(q) {
  if (!q) return null
  const lower = q.toLowerCase().trim()
  if (lower.startsWith('vender ')) {
    return { tone: 'success', title: 'Vender', detail: lower.slice(7) || 'completá el código…' }
  }
  if (/^[a-z]{1,3}\s\d+/.test(lower)) {
    const [zona, precio, ...resto] = q.trim().split(/\s+/)
    return {
      tone: 'accent',
      title: 'Agregar al inventario',
      detail: `Zona ${zona.toUpperCase()} · $${precio}${resto.length ? ' · ' + resto.join(' ') : ''}`,
    }
  }
  return { tone: 'muted', title: 'Buscar en inventario', detail: `«${q}»` }
}
