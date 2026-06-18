import { ChevronDown, Check, X } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export function ChipFilter({ label, options, value, onChange, allowClear = true, placeholder = 'Todos' }) {
  const current = options.find((o) => String(o.value) === String(value))
  const active = !!current
  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          'group inline-flex h-7 max-w-[240px] items-center gap-1.5 rounded-md border px-2 text-[11.5px] font-medium leading-none tracking-[-0.003em] transition-[background-color,border-color,color] duration-120',
          active
            ? 'border-[var(--mlb-accent)]/30 bg-[var(--mlb-accent-soft)] text-[var(--mlb-text-primary)] hover:bg-[color-mix(in_oklab,var(--mlb-accent-soft)_85%,transparent)]'
            : 'border-[var(--mlb-border-strong)] bg-transparent text-[var(--mlb-text-secondary)] hover:border-[var(--mlb-border-strong)] hover:bg-[var(--mlb-bg-hover)] hover:text-[var(--mlb-text-primary)]',
        )}
      >
        <span className="shrink-0 text-[var(--mlb-text-muted)] group-hover:text-[var(--mlb-text-secondary)]">
          {label}
        </span>
        <span className="min-w-0 truncate text-[var(--mlb-text-primary)]">
          {current ? current.label : placeholder}
        </span>
        {active && allowClear ? (
          <span
            role="button"
            tabIndex={-1}
            aria-label={`Limpiar ${label}`}
            onClick={(e) => {
              e.stopPropagation()
              e.preventDefault()
              onChange(null)
            }}
            className="ml-0.5 inline-flex size-3.5 shrink-0 items-center justify-center rounded-sm text-[var(--mlb-text-muted)] hover:bg-[var(--mlb-bg-active)] hover:text-[var(--mlb-text-primary)]"
          >
            <X className="size-3" strokeWidth={2} />
          </span>
        ) : (
          <ChevronDown className="size-3 shrink-0 opacity-55" strokeWidth={2} />
        )}
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="w-[220px] p-1">
        <div className="max-h-[280px] overflow-auto">
          {options.map((o) => {
            const isSel = String(o.value) === String(value)
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => onChange(o.value)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[12.5px] transition-colors',
                  'hover:bg-[var(--mlb-bg-hover)]',
                  isSel && 'bg-[var(--mlb-bg-active)]',
                )}
              >
                <span className="min-w-0 flex-1 truncate text-[var(--mlb-text-primary)]">{o.label}</span>
                {o.hint ? (
                  <span className="shrink-0 text-[10.5px] tabular-nums text-[var(--mlb-text-muted)]">{o.hint}</span>
                ) : null}
                {isSel ? <Check className="size-3.5 shrink-0 text-[var(--mlb-text-secondary)]" strokeWidth={1.75} /> : null}
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
