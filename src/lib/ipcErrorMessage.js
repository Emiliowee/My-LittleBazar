/**
 * Electron envuelve el error real en `Error invoking remote method '…': Error: …`.
 * Mostramos solo el mensaje útil para toasts y logs.
 */
export function ipcErrorMessage(err) {
  const s = String(err?.message ?? err ?? '')
  const m = s.match(/Error invoking remote method '[^']+':\s*(.+)/i)
  if (!m) return s || 'Error desconocido'
  let inner = String(m[1] ?? '').trim()
  if (inner.startsWith('Error: ')) inner = inner.slice(7).trim()
  return inner || s
}
