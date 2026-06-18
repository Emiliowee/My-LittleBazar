/**
 * Paridad con `barcode_probe.py`: normalización del payload Code128 y texto legible.
 */

/** Caracteres seguros para Code128 (sin control chars), máx. 64 como en Python. */
export function normalizeCode128Payload(raw) {
  let s = String(raw ?? '').trim()
  if (!s) return ''
  // eslint-disable-next-line no-control-regex
  s = s.replace(/[\x00-\x1f\x7f]/g, '')
  return s.slice(0, 64)
}

/**
 * Si el código es solo dígitos, separa cada uno con espacio (lectura en voz).
 * Si mezcla letras y números, se muestra tal cual.
 */
export function codigoLegibleEspaciado(texto) {
  const s = String(texto ?? '').trim()
  if (!s) return ''
  const compact = s.replace(/\s+/g, '')
  if (/^\d+$/.test(compact) && compact.length <= 28) {
    return compact.split('').join(' ')
  }
  return s
}
