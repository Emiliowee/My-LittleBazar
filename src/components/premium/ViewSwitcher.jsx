import { cn } from '@/lib/utils'

export function ViewSwitcher({ views, current, onChange }) {
  return (
    <div role="tablist" className="relative flex items-center gap-px">
      {views.map((v) => {
        const active = v.id === current
        return (
          <button
            key={v.id}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => onChange(v.id)}
            className={cn(
              'group relative inline-flex h-7 items-center gap-1.5 rounded-sm px-2 text-[12px] font-medium leading-none tracking-[-0.005em] transition-colors duration-120',
              active
                ? 'text-[var(--mlb-text-primary)]'
                : 'text-[var(--mlb-text-muted)] hover:bg-[var(--mlb-bg-hover)] hover:text-[var(--mlb-text-secondary)]',
            )}
          >
            {v.icon ? (
              <span className={`shrink-0 ${active ? 'text-[var(--mlb-accent)]' : ''}`}>{v.icon}</span>
            ) : null}
            <span>{v.label}</span>
            {v.hint != null && v.hint !== '' ? (
              <span className="shrink-0 rounded px-1 text-[10px] tabular-nums text-[var(--mlb-text-muted)]">
                {v.hint}
              </span>
            ) : null}
            {active ? (
              <span
                aria-hidden
                className="absolute -bottom-[9px] left-1 right-1 h-[2px] rounded-full bg-[var(--mlb-accent)]"
              />
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
