/** Hash de entrada para ventana independiente (`loadURL(...#pdv)`). */
export function isPdvStandaloneWindow() {
  if (typeof window === 'undefined') return false
  const leaf = window.location.hash?.replace(/^#/, '').split(/[?&]/)[0] ?? ''
  return leaf === 'pdv'
}

export function isDevicesStandaloneWindow() {
  if (typeof window === 'undefined') return false
  const leaf = window.location.hash?.replace(/^#/, '').split(/[?&]/)[0] ?? ''
  return leaf === 'devices'
}
