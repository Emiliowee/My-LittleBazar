/** @param {number} [length] */
export function randomNumericPayload(length = 12) {
  const n = Math.max(4, Math.min(28, length))
  let s = ''
  for (let i = 0; i < n; i += 1) s += String(Math.floor(Math.random() * 10))
  return s
}

/** Caracteres seguros para Code128 (misma idea que Python). */
export function normalizeCode128Payload(raw) {
  let s = String(raw || '').trim()
  if (!s) return ''
  // eslint-disable-next-line no-control-regex
  s = s.replace(/[\x00-\x1f\x7f]/g, '')
  return s.slice(0, 64)
}
