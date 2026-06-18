import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

/**
 * Tabla base al estilo database Notion:
 * - header sticky discreto con uppercase 10px
 * - filas 34px con zebra mínima
 * - hover tinte cálido + RowActionStrip revelado a la derecha
 * - selección con borde izquierdo 2px de marca
 * - scroll vertical contenido en wrapper parent
 *
 * Es una tabla sin virtualización; adecuada para hasta ~2k filas.
 * Para más, se puede envolver con @tanstack/react-virtual a futuro.
 */
export const DataTable = forwardRef(function DataTable({ children, className }, ref) {
  return (
    <div ref={ref} className={cn('relative flex min-h-0 flex-1 overflow-auto', className)}>
      <table className="w-full border-separate border-spacing-0 text-[13px]">
        {children}
      </table>
    </div>
  )
})

export function DataTableHeader({ children }) {
  return (
    <thead className="sticky top-0 z-[5] bg-[color-mix(in_oklab,var(--mlb-bg-app)_92%,transparent)] backdrop-blur-[2px]">
      <tr>{children}</tr>
    </thead>
  )
}

export function DataTableHead({ children, className, align = 'left', width }) {
  const style = width ? { width } : undefined
  return (
    <th
      scope="col"
      style={style}
      className={cn(
        'sticky top-0 border-b border-[var(--mlb-border)] px-3 py-1.5 text-[10.5px] font-medium uppercase tracking-[0.06em] text-[var(--mlb-text-muted)]',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        align === 'left' && 'text-left',
        className,
      )}
    >
      {children}
    </th>
  )
}

export function DataTableBody({ children }) {
  return <tbody>{children}</tbody>
}

/**
 * @param {object} p
 * @param {boolean} [p.selected]
 * @param {boolean} [p.active] — resalta sin marcar selección (p. ej. con foco)
 * @param {(e: React.MouseEvent) => void} [p.onClick]
 * @param {(e: React.MouseEvent) => void} [p.onDoubleClick]
 * @param {import('react').ReactNode} p.children
 */
export function DataTableRow({ selected, active, onClick, onDoubleClick, children, className }) {
  return (
    <tr
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      aria-selected={selected || undefined}
      className={cn(
        'group/row relative cursor-pointer transition-colors',
        '[&>td]:border-b [&>td]:border-[var(--mlb-border)]',
        'hover:[&>td]:bg-[var(--mlb-bg-hover)]',
        selected && '[&>td]:bg-[var(--mlb-accent-soft)] hover:[&>td]:bg-[var(--mlb-accent-soft)]',
        active && !selected && '[&>td]:bg-[var(--mlb-bg-active)]',
        className,
      )}
    >
      {children}
    </tr>
  )
}

export function DataTableCell({ children, className, align = 'left', mono = false, muted = false }) {
  return (
    <td
      className={cn(
        'px-3 py-2 align-middle',
        align === 'right' &&
          'text-right tabular-nums [font-feature-settings:"tnum"]',
        align === 'center' && 'text-center',
        mono && 'font-mono text-[11.5px]',
        muted && 'text-[var(--mlb-text-secondary)]',
        className,
      )}
    >
      {children}
    </td>
  )
}

/**
 * Tira flotante de acciones a la derecha de la fila, visible en hover.
 * El contenedor <td> donde se coloque debe tener `position: relative` (ya lo trae).
 */
export function RowActionStrip({ children, className }) {
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className={cn(
        'absolute right-2 top-1/2 -translate-y-1/2 hidden items-center gap-0.5 rounded-md border border-[var(--mlb-border)] bg-[var(--mlb-bg-panel)] p-0.5 shadow-[var(--mlb-shadow-card)] group-hover/row:flex motion-safe:group-hover/row:animate-in motion-safe:group-hover/row:fade-in',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function RowActionButton({ icon, label, onClick, destructive = false, disabled = false, title: titleProp }) {
  const title = titleProp ?? label
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation()
        if (!disabled) onClick?.()
      }}
      className={cn(
        'inline-flex size-6 items-center justify-center rounded text-[var(--mlb-text-muted)] transition-colors',
        destructive
          ? 'hover:bg-[var(--mlb-danger)]/12 hover:text-[var(--mlb-danger)]'
          : 'hover:bg-[var(--mlb-bg-hover)] hover:text-[var(--mlb-text-primary)]',
        disabled &&
          'cursor-not-allowed opacity-40 hover:bg-transparent hover:text-[var(--mlb-text-muted)]',
      )}
    >
      {icon}
    </button>
  )
}

/** Caja que envuelve la tabla para que solo ella tenga scroll (sticky header). */
export function DataTableShell({ children, className }) {
  return <div className={cn('flex min-h-0 flex-1 flex-col', className)}>{children}</div>
}
