/**
 * Radix Dialog a veces deja `pointer-events: none` en `body` si el cierre coincide con
 * `window.confirm`, HMR o modales anidados. Eso deja la app “muerta” (clics/teclado no
 * llegan a los inputs aunque no haya overlay visible).
 *
 * Solo quitamos `pointer-events` para no romper el scroll-lock (`overflow`) de otro
 * diálogo Radix que siga abierto.
 */
export function releaseModalBodyLocks() {
  document.body.style.removeProperty('pointer-events')
}

/**
 * `window.confirm` y luego quitar `pointer-events: none` del `body` si Radix lo dejó colgado.
 * Usar cuando haya modales (Radix) montados y se mezcle con el diálogo nativo del SO.
 */
export function nativeConfirm(message) {
  const ok = window.confirm(message)
  queueMicrotask(() => releaseModalBodyLocks())
  return ok
}
