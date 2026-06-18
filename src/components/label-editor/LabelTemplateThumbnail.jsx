import { Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { LabelRender } from './LabelRender'
import { THUMBNAIL_DATA } from './labelThumbnailConstants'

/** Zona sólo-visual de la vista previa (sin botón). */
export function TemplateThumbnailPreview({ template, compact, previewSize }) {
  const w = template?.width_mm || 50
  const h = template?.height_mm || 35
  const tier = previewSize || (compact ? 'compact' : 'default')
  const caps =
    tier === 'hub'
      ? { mw: 108, mh: 48 }
      : compact || tier === 'compact'
        ? { mw: 156, mh: 72 }
        : { mw: 224, mh: 108 }
  const { mw: MAX_W, mh: MAX_H } = caps
  const scale = Math.min(MAX_W / w, MAX_H / h)
  return (
    <div
      className={cn(
        'flex items-center justify-center overflow-hidden rounded border',
        tier === 'hub'
          ? 'border-[var(--mlb-border)] bg-[var(--mlb-bg-panel-dark)]'
          : 'border-border/40 bg-[#fafaf9] dark:bg-zinc-900/40',
        compact || tier === 'hub' ? 'p-1' : 'rounded-md p-1.5',
      )}
    >
      <div style={{ width: w * scale, height: h * scale }} className="overflow-hidden bg-white shadow-sm ring-1 ring-black/5">
        <LabelRender template={template} data={THUMBNAIL_DATA} scale={scale} />
      </div>
    </div>
  )
}

/**
 * Tarjeta / fila compacta con vista previa SVG de una plantilla.
 * Usado en el editor (lista lateral) y en {@link LabelTemplatesHub}.
 */
export function TemplateThumb({ template, isActive, isCurrent, isBuiltin, onSelect, compact }) {
  const w = template?.width_mm || 50
  const h = template?.height_mm || 35
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'group relative flex flex-col gap-1 rounded-md border text-left transition-all',
        compact ? 'p-1.5' : 'gap-1.5 rounded-lg p-2',
        isCurrent
          ? 'border-foreground/40 bg-background shadow-[0_1px_0_rgba(0,0,0,0.03)]'
          : 'border-border/60 bg-background/70 hover:border-border hover:bg-background',
      )}
    >
      <TemplateThumbnailPreview template={template} compact={compact} />
      <div className="flex min-w-0 items-center gap-1.5">
        <span className={cn('min-w-0 flex-1 truncate font-medium leading-tight text-foreground/90', compact ? 'text-[11px]' : 'text-[12px]')}>
          {template.name}
        </span>
        {isBuiltin ? (
          <span className="shrink-0 rounded bg-muted/60 px-1 py-0.5 text-[8.5px] font-medium uppercase tracking-wider text-muted-foreground/80">
            incl.
          </span>
        ) : null}
        {isActive ? (
          <span className="inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-success/[0.14] text-success" title="Plantilla activa">
            <Sparkles className="size-2.5" strokeWidth={2} />
          </span>
        ) : null}
      </div>
      <span className={cn('truncate tabular-nums text-muted-foreground/65', compact ? 'text-[10px]' : 'text-[10.5px]')}>
        {w.toFixed(0)} × {h.toFixed(0)} mm · {template.blocks?.length ?? 0} bloques
      </span>
    </button>
  )
}
