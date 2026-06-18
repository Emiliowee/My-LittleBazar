import { cn } from '@/lib/utils'

export function EmptyState({ icon, title, description, action, className, size = 'default' }) {
  return (
    <div
      className={cn(
        'mx-auto flex max-w-md flex-col items-center gap-3 text-center',
        size === 'compact' ? 'py-10' : 'py-20',
        className,
      )}
    >
      <div
        aria-hidden
        className={cn(
          'inline-flex items-center justify-center rounded-2xl bg-[var(--mlb-bg-input)] text-[var(--mlb-text-muted)]',
          size === 'compact' ? 'size-10' : 'size-14',
        )}
      >
        {icon}
      </div>
      <div className="space-y-1">
        <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-[var(--mlb-text-primary)]">{title}</h3>
        {description ? (
          <p className="text-[12.5px] leading-relaxed text-[var(--mlb-text-secondary)]">{description}</p>
        ) : null}
      </div>
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  )
}
