import { WindowControls } from '@/components/shell/WindowControls'

const SECTION_LABELS = {
  inicio: 'Inicio',
  inventario: 'Inventario',
  saldos: 'Saldos',
  cuaderno: 'Cuaderno',
  banqueta: 'Banqueta',
  cerebro: 'Cerebro',
  asistente: 'Asistente · conversación',
  actividad: 'Cerebro · historia',
  tienda: 'Tienda',
  ajustes: 'Ajustes',
  etiquetas: 'Etiquetas',
}

/**
 * Franja Win/Linux sólo: layout 3-col (brand · breadcrumb · controles).
 * El centro muestra la sección activa (no el nombre del producto duplicado).
 * La barra entera es arrastrable salvo los controles de ventana.
 */
export function MlbChromeHeader({ section = null, children = null }) {
  const sectionLabel = section ? SECTION_LABELS[section] ?? null : null
  // Si nos pasan children es solo para retro-compat; preferimos `section`.
  const center = sectionLabel ?? children
  return (
    <header
      className="relative z-[100] grid h-9 min-h-[36px] shrink-0 grid-cols-[1fr_auto_1fr] items-stretch border-b border-[var(--mlb-border)] bg-[var(--mlb-bg-panel-dark)] pl-3 pr-1"
    >
      {/* Brand a la izquierda */}
      <div
        className="flex min-w-0 items-center gap-2 select-none"
        style={{ WebkitAppRegion: 'drag' }}
      >
        <span className="mlb-brand-dot shrink-0" aria-hidden />
        <span className="truncate text-[11.5px] font-semibold tracking-[-0.005em] text-[var(--mlb-text-primary)]">
          My Little Bazar
        </span>
      </div>

      {/* Breadcrumb / sección actual */}
      <div
        className="flex cursor-default items-center justify-center px-3 text-[11px] font-medium tracking-[0.02em] text-[var(--mlb-text-muted)] select-none"
        style={{ WebkitAppRegion: 'drag' }}
        onDoubleClick={() => window.bazar?.window?.toggleMaximize?.()}
      >
        <span className="truncate">{center}</span>
      </div>

      {/* Window controls a la derecha */}
      <div
        className="flex shrink-0 items-center justify-end"
        style={{ WebkitAppRegion: 'no-drag' }}
      >
        <WindowControls />
      </div>
    </header>
  )
}
