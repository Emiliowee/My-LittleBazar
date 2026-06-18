/**
 * Propiedades tipo Notion «Select»: una opción por propiedad, colores de la paleta clásica.
 * Valores legacy en BD (neo, glow, …) se mapean a colores clásicos para UI coherente.
 * @see https://www.notion.so/help/database-properties
 */
import { cn } from '@/lib/utils'

/** Paleta alineada con opciones de color de Notion (Select / Multi-select). */
export const NOTION_TAG_COLOR_CLASSIC = [
  'default',
  'gray',
  'brown',
  'orange',
  'yellow',
  'green',
  'blue',
  'purple',
  'pink',
  'red',
]

const LEGACY_FX_TO_CLASSIC = {
  neo: 'gray',
  glow: 'pink',
  mesh: 'blue',
  prism: 'purple',
  aurora: 'green',
  glass: 'default',
}

/** @param {unknown} raw @param {string} [fallback='default'] */
export function normalizeNotionColorKey(raw, fallback = 'default') {
  const fb = NOTION_TAG_COLOR_CLASSIC.includes(fallback) ? fallback : 'default'
  const v = String(raw ?? fb)
    .toLowerCase()
    .trim()
  if (NOTION_TAG_COLOR_CLASSIC.includes(v)) return v
  if (Object.prototype.hasOwnProperty.call(LEGACY_FX_TO_CLASSIC, v)) return LEGACY_FX_TO_CLASSIC[v]
  return fb
}

export function notionGroupSurfaceClasses(colorKey) {
  const k = normalizeNotionColorKey(colorKey)
  const map = {
    default: 'bg-zinc-100/70 dark:bg-zinc-900/35',
    gray: 'bg-stone-100/80 dark:bg-stone-900/40',
    brown: 'bg-amber-950/8 dark:bg-amber-950/25',
    orange: 'bg-orange-100/70 dark:bg-orange-950/30',
    yellow: 'bg-yellow-100/60 dark:bg-yellow-950/25',
    green: 'bg-emerald-100/65 dark:bg-emerald-950/28',
    blue: 'bg-sky-100/70 dark:bg-sky-950/30',
    purple: 'bg-violet-100/70 dark:bg-violet-950/30',
    pink: 'bg-pink-100/65 dark:bg-pink-950/28',
    red: 'bg-red-100/65 dark:bg-red-950/28',
  }
  return map[k] || map.default
}

/** Portada ancha estilo Notion (banner según color de etiqueta). */
export function notionCoverBannerClasses(colorKey) {
  const k = normalizeNotionColorKey(colorKey)
  const map = {
    default: 'bg-gradient-to-br from-zinc-300/95 via-zinc-200/90 to-zinc-300/85 dark:from-zinc-700 dark:via-zinc-800 dark:to-zinc-900',
    gray: 'bg-gradient-to-br from-stone-300/95 to-stone-200/90 dark:from-stone-700 dark:to-stone-800',
    brown: 'bg-gradient-to-br from-amber-200/95 to-amber-100/90 dark:from-amber-900/80 dark:to-amber-950/90',
    orange: 'bg-gradient-to-br from-orange-300/90 to-orange-200/85 dark:from-orange-900/70 dark:to-orange-950/80',
    yellow: 'bg-gradient-to-br from-yellow-300/85 to-yellow-100/80 dark:from-yellow-900/60 dark:to-yellow-950/75',
    green: 'bg-gradient-to-br from-emerald-300/90 to-emerald-100/85 dark:from-emerald-900/65 dark:to-emerald-950/80',
    blue: 'bg-gradient-to-br from-sky-300/90 to-sky-100/85 dark:from-sky-900/65 dark:to-sky-950/80',
    purple: 'bg-gradient-to-br from-violet-300/90 to-violet-100/85 dark:from-violet-900/65 dark:to-violet-950/80',
    pink: 'bg-gradient-to-br from-pink-300/90 to-pink-100/85 dark:from-pink-900/65 dark:to-pink-950/80',
    red: 'bg-gradient-to-br from-red-300/90 to-red-100/85 dark:from-red-900/65 dark:to-red-950/80',
  }
  return map[k] || map.default
}

export function notionColorDotClass(colorKey) {
  const k = normalizeNotionColorKey(colorKey)
  const map = {
    default: 'bg-zinc-400',
    gray: 'bg-stone-500',
    brown: 'bg-amber-800',
    orange: 'bg-orange-500',
    yellow: 'bg-yellow-400',
    green: 'bg-emerald-500',
    blue: 'bg-sky-500',
    purple: 'bg-violet-500',
    pink: 'bg-pink-500',
    red: 'bg-red-500',
  }
  return map[k] || map.default
}

export function notionTagChipReadonlyClasses(colorKey) {
  const k = normalizeNotionColorKey(colorKey)
  const map = {
    default:
      'border-zinc-200/90 bg-zinc-100/90 text-zinc-800 dark:border-zinc-700 dark:bg-zinc-800/85 dark:text-zinc-100',
    gray: 'border-stone-200/90 bg-stone-100/90 text-stone-900 dark:border-stone-700 dark:bg-stone-800/80 dark:text-stone-100',
    brown:
      'border-amber-900/15 bg-amber-100/90 text-amber-950 dark:border-amber-800/40 dark:bg-amber-950/45 dark:text-amber-50',
    orange:
      'border-orange-200/90 bg-orange-100/90 text-orange-950 dark:border-orange-800/50 dark:bg-orange-950/40 dark:text-orange-50',
    yellow:
      'border-yellow-200/90 bg-yellow-100/90 text-yellow-950 dark:border-yellow-800/45 dark:bg-yellow-950/35 dark:text-yellow-50',
    green:
      'border-emerald-200/90 bg-emerald-100/90 text-emerald-950 dark:border-emerald-800/45 dark:bg-emerald-950/35 dark:text-emerald-50',
    blue: 'border-sky-200/90 bg-sky-100/90 text-sky-950 dark:border-sky-800/45 dark:bg-sky-950/35 dark:text-sky-50',
    purple:
      'border-violet-200/90 bg-violet-100/90 text-violet-950 dark:border-violet-800/45 dark:bg-violet-950/35 dark:text-violet-50',
    pink: 'border-pink-200/90 bg-pink-100/90 text-pink-950 dark:border-pink-800/45 dark:bg-pink-950/35 dark:text-pink-50',
    red: 'border-red-200/90 bg-red-100/90 text-red-950 dark:border-red-800/45 dark:bg-red-950/35 dark:text-red-50',
  }
  return map[k] || map.default
}

function notionTagPillInteractiveClasses(colorKey, selected) {
  const k = normalizeNotionColorKey(colorKey)
  if (!selected) {
    const idle = {
      default:
        'border-zinc-200/90 bg-zinc-50/90 text-zinc-700 hover:bg-zinc-100/95 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-200 dark:hover:bg-zinc-800/70',
      gray: 'border-stone-200/90 bg-stone-50/90 text-stone-700 hover:bg-stone-100/95 dark:border-stone-700 dark:bg-stone-900/45 dark:text-stone-200 dark:hover:bg-stone-800/65',
      brown:
        'border-amber-900/12 bg-amber-50/95 text-amber-950 hover:bg-amber-100/90 dark:border-amber-800/35 dark:bg-amber-950/30 dark:text-amber-100 dark:hover:bg-amber-950/45',
      orange:
        'border-orange-200/90 bg-orange-50/95 text-orange-950 hover:bg-orange-100/90 dark:border-orange-800/40 dark:bg-orange-950/28 dark:text-orange-100 dark:hover:bg-orange-950/40',
      yellow:
        'border-yellow-200/90 bg-yellow-50/95 text-yellow-950 hover:bg-yellow-100/85 dark:border-yellow-800/35 dark:bg-yellow-950/25 dark:text-yellow-100 dark:hover:bg-yellow-950/38',
      green:
        'border-emerald-200/90 bg-emerald-50/95 text-emerald-950 hover:bg-emerald-100/85 dark:border-emerald-800/35 dark:bg-emerald-950/25 dark:text-emerald-100 dark:hover:bg-emerald-950/38',
      blue: 'border-sky-200/90 bg-sky-50/95 text-sky-950 hover:bg-sky-100/85 dark:border-sky-800/35 dark:bg-sky-950/25 dark:text-sky-100 dark:hover:bg-sky-950/38',
      purple:
        'border-violet-200/90 bg-violet-50/95 text-violet-950 hover:bg-violet-100/85 dark:border-violet-800/35 dark:bg-violet-950/25 dark:text-violet-100 dark:hover:bg-violet-950/38',
      pink: 'border-pink-200/90 bg-pink-50/95 text-pink-950 hover:bg-pink-100/85 dark:border-pink-800/35 dark:bg-pink-950/25 dark:text-pink-100 dark:hover:bg-pink-950/38',
      red: 'border-red-200/90 bg-red-50/95 text-red-950 hover:bg-red-100/85 dark:border-red-800/35 dark:bg-red-950/25 dark:text-red-100 dark:hover:bg-red-950/38',
    }
    return idle[k] || idle.default
  }
  const on = {
    default:
      'border-transparent bg-zinc-900 text-white shadow-sm dark:bg-zinc-100 dark:text-zinc-900',
    gray: 'border-transparent bg-stone-700 text-white shadow-sm dark:bg-stone-200 dark:text-stone-900',
    brown: 'border-transparent bg-amber-900 text-amber-50 shadow-sm dark:bg-amber-700 dark:text-white',
    orange: 'border-transparent bg-orange-600 text-white shadow-sm dark:bg-orange-500 dark:text-white',
    yellow: 'border-transparent bg-yellow-500 text-yellow-950 shadow-sm dark:bg-yellow-400 dark:text-yellow-950',
    green: 'border-transparent bg-emerald-600 text-white shadow-sm dark:bg-emerald-500 dark:text-white',
    blue: 'border-transparent bg-sky-600 text-white shadow-sm dark:bg-sky-500 dark:text-white',
    purple: 'border-transparent bg-violet-600 text-white shadow-sm dark:bg-violet-500 dark:text-white',
    pink: 'border-transparent bg-pink-600 text-white shadow-sm dark:bg-pink-500 dark:text-white',
    red: 'border-transparent bg-red-600 text-white shadow-sm dark:bg-red-500 dark:text-white',
  }
  return on[k] || on.default
}

export function notionTagPillInventoryClasses(colorKey, selected) {
  return cn(
    notionTagPillInteractiveClasses(colorKey, selected),
    selected && 'ring-1 ring-white/80 ring-offset-1 ring-offset-background shadow-md dark:ring-white/30',
  )
}

/** Píldoras al elegir valor (pastel, sin invertir a negro como “seleccionado”). */
export function notionPastelSelectPillClasses(colorKey, selected) {
  const k = normalizeNotionColorKey(colorKey)
  const pastel = {
    default:
      'bg-zinc-100/95 text-zinc-800 dark:bg-zinc-800/85 dark:text-zinc-100',
    gray: 'bg-stone-100/95 text-stone-800 dark:bg-stone-800/78 dark:text-stone-100',
    brown: 'bg-amber-100/85 text-amber-950 dark:bg-amber-950/45 dark:text-amber-50',
    orange: 'bg-orange-100/90 text-orange-950 dark:bg-orange-950/42 dark:text-orange-50',
    yellow: 'bg-yellow-100/85 text-yellow-950 dark:bg-yellow-950/38 dark:text-yellow-50',
    green: 'bg-emerald-100/88 text-emerald-950 dark:bg-emerald-950/38 dark:text-emerald-50',
    blue: 'bg-sky-100/90 text-sky-950 dark:bg-sky-950/38 dark:text-sky-50',
    purple: 'bg-violet-100/90 text-violet-950 dark:bg-violet-950/38 dark:text-violet-50',
    pink: 'bg-pink-100/88 text-pink-950 dark:bg-pink-950/38 dark:text-pink-50',
    red: 'bg-red-100/88 text-red-950 dark:bg-red-950/38 dark:text-red-50',
  }
  return cn(
    'inline-flex max-w-full items-center gap-1 rounded-full border px-2.5 py-1 text-[13px] font-medium leading-tight tracking-tight transition-all duration-150',
    pastel[k] || pastel.default,
    selected
      ? 'border-black/[0.12] shadow-[0_1px_2px_rgba(0,0,0,0.06)] ring-1 ring-black/[0.06] dark:border-white/18 dark:ring-white/10'
      : 'border-transparent opacity-95 hover:opacity-100',
  )
}
