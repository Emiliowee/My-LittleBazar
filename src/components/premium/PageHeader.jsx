import { ChevronLeft, MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

/**
 * Encabezado de página al estilo Notion + cajita MLB:
 * ícono + eyebrow + título sobre tokens --mlb-* (hub operaciones).
 */
export function PageHeader({ icon, title, eyebrow, description, count, actions, menuItems, back, className }) {
  const hasMenu = Array.isArray(menuItems) && menuItems.length > 0
  return (
    <header className={cn('relative px-10 pb-3 pt-9', className)}>
      {back ? (
        <button
          type="button"
          onClick={back.onClick}
          className="group mb-4 inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-[12px] font-medium text-[var(--mlb-text-secondary)] transition-colors hover:bg-[var(--mlb-bg-hover)] hover:text-[var(--mlb-text-primary)]"
        >
          <ChevronLeft className="size-3.5 opacity-70" strokeWidth={1.75} />
          <span className="tracking-[-0.005em]">{back.label}</span>
        </button>
      ) : null}

      <div className="flex items-start justify-between gap-6">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          {icon ? (
            <span
              className="mt-2 inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--mlb-bg-panel)] text-[var(--mlb-text-primary)] shadow-[0_1px_0_0_var(--mlb-border)]"
              aria-hidden
            >
              {icon}
            </span>
          ) : null}
          <div className="min-w-0 flex-1">
            {eyebrow ? (
              <span className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--mlb-text-muted)]">
                <span className="size-1.5 rounded-full bg-[var(--mlb-accent)]" aria-hidden />
                {eyebrow}
              </span>
            ) : null}
            <h1
              className="flex min-w-0 items-baseline gap-2.5 truncate text-[27px] font-bold leading-[1.15] tracking-[-0.022em] text-[var(--mlb-text-primary)]"
              style={{ fontFamily: 'var(--mlb-font-display)' }}
            >
              <span className="truncate">{title}</span>
              {count != null && count !== '' ? (
                <span className="shrink-0 text-[13.5px] font-normal tabular-nums text-[var(--mlb-text-muted)]">
                  {count}
                </span>
              ) : null}
            </h1>
            {description ? (
              <p className="mt-1.5 max-w-[58ch] text-[12.5px] leading-relaxed text-[var(--mlb-text-secondary)]">
                {description}
              </p>
            ) : null}
          </div>
        </div>

        {(actions || hasMenu) && (
          <div className="flex shrink-0 items-center gap-1.5 pt-1">
            {actions}
            {hasMenu ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  className="mlb-focus-ring inline-flex size-7 items-center justify-center rounded-md text-[var(--mlb-text-muted)] transition-colors hover:bg-[var(--mlb-bg-hover)] hover:text-[var(--mlb-text-primary)]"
                  aria-label="Más opciones"
                >
                  <MoreHorizontal className="size-4" strokeWidth={1.75} />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" sideOffset={6} className="min-w-[220px]">
                  {menuItems.map((mi, i) => (
                    <div key={mi.id}>
                      {mi.separatorBefore && i > 0 ? <DropdownMenuSeparator /> : null}
                      <DropdownMenuItem
                        inset={false}
                        variant={mi.destructive ? 'destructive' : 'default'}
                        disabled={Boolean(mi.disabled)}
                        onClick={mi.disabled ? undefined : mi.onClick}
                        className="gap-2.5 py-1.5 text-[12.5px]"
                      >
                        {mi.icon ? <span className="text-[var(--mlb-text-muted)]">{mi.icon}</span> : null}
                        {mi.label}
                      </DropdownMenuItem>
                    </div>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        )}
      </div>
    </header>
  )
}

/** Separador entre encabezado y contenido — token MLB. */
export function PageHeaderDivider({ className }) {
  return <div className={cn('mx-10 h-px bg-[var(--mlb-border)]', className)} aria-hidden />
}
