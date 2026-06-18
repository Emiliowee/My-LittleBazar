/**
 * Indica si el valor guardado en `tag_icon` es una ruta de imagen en disco (p. ej. copiada a `tag_icons/`).
 * Los iconos Lucide y los emoji no pasan esta prueba.
 */
export function isTagIconImagePath(icon) {
  if (!icon || typeof icon !== 'string') return false
  const s = icon.trim()
  if (!s) return false
  const slash = s.replace(/\\/g, '/').toLowerCase()
  if (slash.includes('/tag_icons/')) return true
  if (/\.(png|jpe?g|gif|webp)$/i.test(s) && (s.startsWith('/') || /^[a-z]:[/\\]/i.test(s))) return true
  return false
}
