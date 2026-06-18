import { useCallback, useEffect, useState } from 'react'

/**
 * Visibilidad de la "carpeta Banqueta" en la barra lateral.
 *
 * Antes vivía en `components/shell/AppSidebar.jsx` (sidebar legacy). Lo
 * extrajimos acá porque el sidebar viejo se eliminó pero esta preferencia
 * sigue siendo útil: cuando el usuario oculta la carpeta, queremos
 * recordarlo entre sesiones.
 *
 * Persiste en localStorage. Cambios se transmiten vía CustomEvent
 * (`bazar:banqueta-folder-visibility`) y storage event, así dos vistas
 * abiertas a la vez se mantienen sincronizadas.
 */

const KEY_HIDDEN = 'bazar.banquetaFolderHidden'

function read() {
  try { return localStorage.getItem(KEY_HIDDEN) === '1' } catch { return false }
}

export function useBanquetaFolderVisibility() {
  const [hidden, setHidden] = useState(() => (typeof window !== 'undefined' ? read() : false))

  useEffect(() => {
    const h = () => setHidden(read())
    window.addEventListener('bazar:banqueta-folder-visibility', h)
    window.addEventListener('storage', h)
    return () => {
      window.removeEventListener('bazar:banqueta-folder-visibility', h)
      window.removeEventListener('storage', h)
    }
  }, [])

  const setVisible = useCallback((visible) => {
    try { localStorage.setItem(KEY_HIDDEN, visible ? '0' : '1') } catch { /* noop */ }
    setHidden(!visible)
    window.dispatchEvent(new CustomEvent('bazar:banqueta-folder-visibility'))
  }, [])

  return { hidden, setVisible }
}
