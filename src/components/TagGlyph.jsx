import {
  Bookmark,
  CircleDot,
  Gem,
  Gift,
  Heart,
  Package,
  Palette,
  Shirt,
  Sparkles,
  Star,
  Tag,
} from 'lucide-react'

import { localPathToFileUrl } from '@/lib/localFileUrl'
import { isTagIconImagePath } from '@/lib/tagIcon'
import { cn } from '@/lib/utils'

const LUCIDE_BY_KEY = {
  Tag,
  Shirt,
  Sparkles,
  Star,
  Heart,
  Bookmark,
  Gem,
  Gift,
  Package,
  Palette,
  CircleDot,
}

const boxBase =
  'inline-flex shrink-0 items-center justify-center overflow-hidden text-foreground/90 opacity-90 [container-type:size]'

/** @param {{ icon?: string | null, className?: string }} props */
export function TagGlyph({ icon, className = 'size-[18px]' }) {
  if (!icon || !String(icon).trim()) return null
  const raw = String(icon).trim()
  const LucideComp = LUCIDE_BY_KEY[raw]
  if (LucideComp) {
    return (
      <span className={cn(boxBase, '[&_svg]:block [&_svg]:h-full [&_svg]:w-full', className)}>
        <LucideComp strokeWidth={2} aria-hidden className="block h-full w-full" />
      </span>
    )
  }
  if (isTagIconImagePath(raw)) {
    const src = localPathToFileUrl(raw)
    if (!src) return null
    return (
      <span className={cn(boxBase, className)}>
        <img src={src} alt="" className="max-h-full max-w-full object-contain" draggable={false} decoding="async" />
      </span>
    )
  }
  return (
    <span className={cn(boxBase, className)} role="img" aria-hidden>
      <span className="leading-none select-none text-[length:clamp(0.8125rem,72cqmin,5.25rem)]">{raw.slice(0, 4)}</span>
    </span>
  )
}

export const TAG_LUCIDE_ICON_KEYS = Object.keys(LUCIDE_BY_KEY)
