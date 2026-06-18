/** Vista previa `file://` en Electron (ruta absoluta Windows o POSIX). */
export function localPathToFileUrl(absPath) {
  if (!absPath || typeof absPath !== 'string') return ''
  const normalized = absPath.trim().replace(/\\/g, '/')
  if (!normalized) return ''
  const prefixed = /^[A-Za-z]:\//.test(normalized) ? `/${normalized}` : normalized.startsWith('/') ? normalized : `/${normalized}`
  return `file://${encodeURI(prefixed).replace(/#/g, '%23')}`
}
