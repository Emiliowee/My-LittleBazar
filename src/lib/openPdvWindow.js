import { toast } from 'sonner'

/** Abre la segunda ventana Electron con `#pdv`; no cierra el bazar principal. */
export async function openPdvWindowAction() {
  const fn = typeof window !== 'undefined' ? window.bazar?.window?.openPdvWindow : null
  if (typeof fn !== 'function') {
    toast.error('Punto de venta no disponible fuera de la app de escritorio.')
    return
  }
  try {
    await fn()
  } catch {
    toast.error('No se pudo abrir el punto de venta.')
  }
}
