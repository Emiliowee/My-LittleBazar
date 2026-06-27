/**
 * Copia texto al portapapeles de forma confiable.
 * En la app instalada usa el portapapeles de Electron (window.bazar.clipboard),
 * porque navigator.clipboard suele fallar en contexto file://. En el navegador
 * (desarrollo) cae a la API web. Devuelve true si copió.
 */
export async function copyText(text) {
  const t = String(text ?? '')
  try {
    if (typeof window !== 'undefined' && window.bazar?.clipboard?.writeText) {
      if (window.bazar.clipboard.writeText(t)) return true
    }
  } catch { /* noop */ }
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(t)
      return true
    }
  } catch { /* noop */ }
  return false
}
