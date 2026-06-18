import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { releaseModalBodyLocks } from '@/lib/releaseModalBodyLocks'

/**
 * Modal a pantalla grande al estilo Notion “peek view”/“page modal”:
 * backdrop oscuro, panel centrado ~960×80vh, sombra multicapa suave, esquinas redondeadas.
 * Reemplaza a los Dialog pequeños cuando el contenido necesita más aire (wizards, previews, editores).
 *
 * @param {object} p
 * @param {boolean} p.open
 * @param {() => void} p.onClose
 * @param {string} p.title
 * @param {import('react').ReactNode} [p.description]
 * @param {import('react').ReactNode} [p.headerRight]
 * @param {import('react').ReactNode} p.children
 * @param {import('react').ReactNode} [p.footer]
 * @param {'default' | 'wide'} [p.size='default']  — 'wide' ~ 1040px, 'default' ~ 860px
 */
export function ModalPage({ open, onClose, title, description, headerRight, children, footer, size = 'default' }) {
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
      releaseModalBodyLocks()
    }
  }, [open, onClose])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      className="fixed inset-0 z-[160] flex items-center justify-center px-6 py-8"
      data-no-barcode="true"
      role="presentation"
    >
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="absolute inset-0 bg-foreground/10 backdrop-blur-[2px] transition-opacity dark:bg-background/70 dark:backdrop-blur-md"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'relative z-[1] flex max-h-[min(88vh,880px)] w-full flex-col overflow-hidden rounded-xl border border-border/40 bg-background text-foreground',
          'shadow-[0_1px_0_hsl(0_0%_0%/0.03),0_4px_12px_hsl(0_0%_0%/0.04),0_24px_64px_hsl(0_0%_0%/0.12)]',
          'dark:shadow-[0_1px_0_hsl(0_0%_0%/0.5),0_4px_12px_hsl(0_0%_0%/0.35),0_24px_64px_hsl(0_0%_0%/0.55)]',
          size === 'wide' ? 'max-w-[1040px]' : 'max-w-[860px]',
        )}
      >
        <header className="flex shrink-0 items-start justify-between gap-6 border-b border-border/60 px-7 pb-4 pt-5">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[18px] font-semibold leading-tight tracking-[-0.012em] text-foreground">
              {title}
            </h2>
            {description ? (
              <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground/85">{description}</p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {headerRight}
            <button
              type="button"
              onClick={onClose}
              className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground/75 transition-colors hover:bg-muted/70 hover:text-foreground dark:hover:bg-muted/55"
              aria-label="Cerrar"
            >
              <X className="size-4" strokeWidth={1.75} />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>

        {footer ? (
          <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-border/60 bg-[color-mix(in_oklab,var(--muted)_15%,transparent)] px-7 py-3">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}

/** Pequeño helper para un stepper horizontal estilo Notion wizard. */
export function ModalStepper({ steps, current, onStepClick }) {
  return (
    <nav aria-label="Progreso" className="flex items-center gap-1">
      {steps.map((s, i) => {
        const idx = i + 1
        const active = i === current
        const done = i < current
        const canClick = typeof onStepClick === 'function' && (done || active)
        return (
          <div key={s.id} className="flex items-center gap-1">
            <button
              type="button"
              disabled={!canClick}
              onClick={() => canClick && onStepClick(i)}
              className={cn(
                'inline-flex h-7 items-center gap-1.5 rounded-md px-1.5 text-[12px] font-medium transition-colors',
                active && 'bg-primary/10 text-foreground',
                done && 'text-foreground/80 hover:bg-muted/70 dark:hover:bg-muted/55',
                !done && !active && 'text-muted-foreground/70',
                !canClick && 'cursor-default',
              )}
            >
              <span
                className={cn(
                  'inline-flex size-5 items-center justify-center rounded-full text-[10px] font-semibold tabular-nums',
                  active
                    ? 'bg-primary text-primary-foreground'
                    : done
                      ? 'bg-foreground/75 text-background'
                      : 'bg-muted/60 text-muted-foreground',
                )}
              >
                {idx}
              </span>
              <span>{s.label}</span>
            </button>
            {i < steps.length - 1 ? (
              <span aria-hidden className="text-muted-foreground/40">
                <ChevronRight className="size-3.5" strokeWidth={1.75} />
              </span>
            ) : null}
          </div>
        )
      })}
    </nav>
  )
}

/** Botón de navegación usado en el footer de ModalPage. */
export function ModalNavButton({ direction = 'next', label, onClick, disabled = false, variant = 'secondary' }) {
  const isNext = direction === 'next'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[12.5px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'primary'
          ? 'bg-foreground text-background hover:bg-foreground/90'
          : 'border border-border/70 bg-transparent text-foreground/85 hover:bg-muted/70 dark:hover:bg-muted/55',
      )}
    >
      {!isNext ? <ChevronLeft className="size-3.5" strokeWidth={1.75} /> : null}
      <span>{label}</span>
      {isNext ? <ChevronRight className="size-3.5" strokeWidth={1.75} /> : null}
    </button>
  )
}
