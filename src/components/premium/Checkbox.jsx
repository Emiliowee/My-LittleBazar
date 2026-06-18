import { Check, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Checkbox visual al estilo Notion database:
 * 14x14, borde 1.25px, estado check/indeterminate con color marca.
 * Wrappea un <button> accesible.
 *
 * @param {object} p
 * @param {boolean | 'indeterminate'} p.checked
 * @param {(next: boolean) => void} p.onChange
 * @param {string} [p.aria]
 */
export function Checkbox({ checked, onChange, aria, className }) {
  const isIndet = checked === 'indeterminate'
  const isOn = checked === true || isIndet
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={isIndet ? 'mixed' : !!checked}
      aria-label={aria}
      onClick={(e) => {
        e.stopPropagation()
        onChange?.(!isOn)
      }}
      className={cn(
        'relative inline-flex size-[14px] shrink-0 items-center justify-center rounded-[3px] border transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
        isOn
          ? 'border-primary/90 bg-primary text-primary-foreground'
          : 'border-border/80 bg-transparent hover:border-foreground/50',
        className,
      )}
    >
      {isIndet ? (
        <Minus className="size-3" strokeWidth={2.25} />
      ) : isOn ? (
        <Check className="size-3" strokeWidth={2.75} />
      ) : null}
    </button>
  )
}
