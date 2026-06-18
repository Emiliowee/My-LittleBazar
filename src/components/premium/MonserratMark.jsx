import { cn } from '@/lib/utils'

/**
 * Biblioteca gráfica de Monserrat — contenido creado para el bazar.
 *
 *   <GanchoMark />        el gancho del logo a vector (hereda currentColor)
 *   <SelloMonserrat />    gancho en sello rosa con aro dorado; con
 *                         `dibujar` el trazo se dibuja solo al montar
 *   <PatronGanchos />     textura de fondo: lluvia de ganchitos en diagonal
 *   <PerchaVacia />       ilustración para estados vacíos (riel + gancho
 *                         + destellos): "acá todavía no hay nada colgado"
 */

export function GanchoMark({ size = 48, strokeWidth = 5.5, dibujar = false, className }) {
  const pathProps = dibujar
    ? { pathLength: 1, className: 'mlb-trazo-dibujar' }
    : {}
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M50 14c7 0 12 5 12 11 0 5-3 8-7 10-3 1.5-5 3.5-5 7v4"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        {...pathProps}
      />
      <path
        d="M50 46 L12 72 Q9 74 12 76 L88 76 Q91 74 88 72 Z"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        fill="none"
        {...pathProps}
      />
    </svg>
  )
}

export function SelloMonserrat({ size = 88, dibujar = false, className }) {
  return (
    <span
      className={cn('relative inline-grid place-items-center rounded-full', className)}
      style={{
        width: size,
        height: size,
        background: 'oklch(0.93 0.035 20)',
        boxShadow: `0 0 0 ${Math.max(2, size * 0.045)}px var(--mlb-oro), 0 0 0 ${Math.max(3, size * 0.075)}px color-mix(in srgb, var(--mlb-oro) 35%, transparent)`,
      }}
      aria-hidden="true"
    >
      <GanchoMark size={size * 0.62} dibujar={dibujar} className="text-[oklch(0.24_0.01_25)]" />
    </span>
  )
}

/* Ganchito mínimo para el patrón (una sola pasada de trazo). */
const GANCHITO = encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 56 56" fill="none">'
  + '<g stroke="black" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" opacity="0.5">'
  + '<path d="M28 12c3.4 0 5.8 2.3 5.8 5.2 0 2.4-1.5 3.9-3.4 4.8-1.5 0.7-2.4 1.7-2.4 3.4v1.8"/>'
  + '<path d="M28 27.5 L11 39 Q9.6 40 11 41 L45 41 Q46.4 40 45 39 Z"/>'
  + '</g></svg>',
)

/**
 * Textura de marca: ganchitos en retícula diagonal, casi invisibles.
 * Va posicionada absoluta dentro de un contenedor relative.
 */
export function PatronGanchos({ opacity = 0.05, className }) {
  return (
    <div
      aria-hidden="true"
      className={cn('pointer-events-none absolute inset-0', className)}
      style={{
        backgroundImage: `url("data:image/svg+xml,${GANCHITO}")`,
        backgroundSize: '56px 56px',
        opacity,
        maskImage: 'linear-gradient(115deg, black 30%, transparent 78%)',
        WebkitMaskImage: 'linear-gradient(115deg, black 30%, transparent 78%)',
      }}
    />
  )
}

/** Ilustración de estado vacío: riel con un gancho esperando mercancía. */
export function PerchaVacia({ size = 132, className }) {
  return (
    <svg
      width={size}
      height={size * 0.72}
      viewBox="0 0 180 130"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      {/* Riel */}
      <line x1="14" y1="22" x2="166" y2="22" stroke="var(--mlb-border-strong)" strokeWidth="5" strokeLinecap="round" />
      <circle cx="22" cy="22" r="4" fill="var(--mlb-border-strong)" />
      <circle cx="158" cy="22" r="4" fill="var(--mlb-border-strong)" />
      {/* Gancho colgado del riel */}
      <g stroke="var(--mlb-accent)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M90 24c0-2 1-4 3-4 3.6 0 6.4 2.6 6.4 5.8 0 2.6-1.6 4.3-3.8 5.3-1.6 0.8-2.6 1.9-2.6 3.7v2" />
        <path d="M93 39 L62 60 Q59.6 61.6 62 63 L124 63 Q126.4 61.6 124 60 Z" />
      </g>
      {/* Destellos dorados */}
      <g fill="var(--mlb-oro)">
        <path d="M40 84l2.2 5 5 2.2-5 2.2-2.2 5-2.2-5-5-2.2 5-2.2z" opacity="0.85" />
        <path d="M138 78l1.6 3.6 3.6 1.6-3.6 1.6-1.6 3.6-1.6-3.6-3.6-1.6 3.6-1.6z" opacity="0.6" />
        <circle cx="118" cy="98" r="2.4" opacity="0.5" />
      </g>
    </svg>
  )
}
