import { useEffect, useState } from 'react'

/**
 * Frameless Win/Linux: minimize / maximize / cerrar — 32×32 (Win11 native size),
 * sin rounded para preservar la grilla del título nativa, hovers diferenciados.
 */
export function WindowControls() {
  const api = typeof window !== 'undefined' ? window.bazar?.window : undefined
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    if (!api?.isMaximized) return
    api.isMaximized().then(setMaximized).catch(() => {})
  }, [api])

  useEffect(() => {
    if (!api?.onState) return
    const off = api.onState((state) => {
      if (state && typeof state.maximized === 'boolean') setMaximized(state.maximized)
    })
    return off
  }, [api])

  if (!api) return null

  const btn =
    'inline-flex h-8 w-[44px] items-center justify-center text-[var(--mlb-text-muted)] transition-colors hover:bg-[var(--mlb-bg-hover)] hover:text-[var(--mlb-text-primary)]'

  return (
    <div className="flex shrink-0 items-center" style={{ WebkitAppRegion: 'no-drag' }}>
      <button type="button" className={btn} aria-label="Minimizar" onClick={() => api.minimize?.()}>
        <svg width="10" height="1" viewBox="0 0 10 1">
          <rect width="10" height="1" fill="currentColor" />
        </svg>
      </button>
      <button
        type="button"
        className={btn}
        aria-label={maximized ? 'Restaurar' : 'Maximizar'}
        onClick={() => api.toggleMaximize?.()}
      >
        {maximized ? (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <rect x="2.5" y="2.5" width="5" height="5" stroke="currentColor" strokeWidth="1" />
            <path d="M3.5 1.5H8.5V6.5" stroke="currentColor" strokeWidth="1" fill="none" />
          </svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <rect x="1" y="1" width="8" height="8" stroke="currentColor" strokeWidth="1" />
          </svg>
        )}
      </button>
      <button
        type="button"
        className="inline-flex h-8 w-[44px] items-center justify-center text-[var(--mlb-text-muted)] transition-colors hover:bg-[var(--mlb-danger)] hover:text-white"
        aria-label="Cerrar"
        onClick={() => api.close?.()}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M1.5 1.5L8.5 8.5M8.5 1.5L1.5 8.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  )
}
