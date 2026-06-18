import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export function SelectionToolbar({ count, actions, onClear, countLabel = 'seleccionados', underLay = false }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    if (count > 0) setMounted(true)
    else {
      const t = setTimeout(() => setMounted(false), 220)
      return () => clearTimeout(t)
    }
  }, [count])

  if (!mounted) return null

  const visible = count > 0
  return (
    <div
      aria-live="polite"
      className={cn(
        'pointer-events-none fixed inset-x-0 bottom-6 flex justify-center transition-[opacity,transform] duration-200',
        underLay ? 'z-[25]' : 'z-40',
        visible
          ? 'translate-y-0 opacity-100 ease-out motion-reduce:transition-none'
          : 'translate-y-3 opacity-0 ease-out',
      )}
    >
      <div
        role="toolbar"
        aria-label="Acciones para la selección"
        className={cn(
          'pointer-events-auto flex items-center gap-1 rounded-xl border border-[var(--mlb-border)] px-2 py-1.5 text-[12.5px]',
          'bg-[var(--mlb-bg-panel)]/92 shadow-[var(--mlb-shadow-panel)] backdrop-blur-md',
        )}
      >
        <div className="flex items-center gap-1.5 pl-1.5 pr-2">
          <span className="inline-flex size-5 items-center justify-center rounded-md bg-[var(--mlb-accent-soft)] text-[11px] font-semibold tabular-nums text-[var(--mlb-accent)]">
            {count}
          </span>
          <span className="text-[12px] text-[var(--mlb-text-secondary)]">{countLabel}</span>
        </div>
        <span className="h-4 w-px bg-[var(--mlb-border)]" aria-hidden />
        <div className="flex items-center gap-0.5">{actions}</div>
        <span className="h-4 w-px bg-[var(--mlb-border)]" aria-hidden />
        <button
          type="button"
          onClick={onClear}
          className="inline-flex size-6 items-center justify-center rounded-md text-[var(--mlb-text-muted)] transition-colors hover:bg-[var(--mlb-bg-hover)] hover:text-[var(--mlb-text-primary)]"
          aria-label="Quitar selección"
          title="Quitar selección"
        >
          <X className="size-3.5" strokeWidth={1.75} />
        </button>
      </div>
    </div>
  )
}

export function SelectionToolbarButton({ icon, label, onClick, destructive = false, disabled = false, title }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] font-medium transition-colors',
        destructive
          ? 'text-[var(--mlb-danger)] hover:bg-[var(--mlb-danger)]/10'
          : 'text-[var(--mlb-text-primary)] hover:bg-[var(--mlb-bg-hover)]',
        'disabled:cursor-not-allowed disabled:opacity-50',
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}
