import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { NEBULA_PRESETS } from './NebulaPresets.js'

const ThemeContext = createContext(null)

/**
 * My Little Bazar — ThemeProvider.
 * Maneja tema base (light/dark/system), presets Nebula, y CSS personalizado.
 */
function resolvePref(pref) {
  if (pref === 'dark') return 'dark'
  if (pref === 'light') return 'light'
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyDom(scheme) {
  const r = typeof scheme === 'string' && (scheme === 'dark' || scheme === 'light')
    ? scheme
    : resolvePref(scheme)
  document.documentElement.setAttribute('data-theme', r)
  document.documentElement.classList.toggle('dark', r === 'dark')
  document.documentElement.style.colorScheme = r
  return r
}

export function ThemeProvider({ children }) {
  const [themePref, setThemePrefState] = useState('light')
  const [resolvedTheme, setResolvedTheme] = useState('light')
  const [nebulaThemeId, setNebulaThemeId] = useState(null)
  const [customNebulaCss, setCustomNebulaCss] = useState('')

  useEffect(() => {
    applyDom('light')
  }, [])

  useEffect(() => {
    let cancel = false
    ;(async () => {
      const s = await window.bazar?.settings?.get?.()
      if (cancel) return
      const p =
        s?.theme === 'light' || s?.theme === 'dark' || s?.theme === 'system'
          ? s.theme
          : 'light'
      setThemePrefState(p)
      setNebulaThemeId(s?.nebulaThemeId || null)
      setCustomNebulaCss(s?.customNebulaCss || '')

      // Si hay un preset activo, forzar su esquema
      const preset = NEBULA_PRESETS.find(pr => pr.id === (s?.nebulaThemeId || null))
      if (preset?.scheme) {
        setResolvedTheme(applyDom(preset.scheme))
      } else {
        setResolvedTheme(applyDom(p))
      }
    })()
    return () => {
      cancel = true
    }
  }, [])

  // Cuando cambia themePref o nebulaThemeId, re-evaluar el esquema DOM
  useEffect(() => {
    const preset = NEBULA_PRESETS.find(p => p.id === nebulaThemeId)
    if (preset?.scheme) {
      // El preset fuerza su propio esquema
      setResolvedTheme(applyDom(preset.scheme))
    } else {
      setResolvedTheme(applyDom(themePref))
    }
    if (themePref !== 'system' || (preset?.scheme)) return undefined
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setResolvedTheme(applyDom('system'))
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [themePref, nebulaThemeId])

  const setTheme = useCallback(async (next) => {
    setThemePrefState(next)
    // Solo aplicar al DOM si no hay preset con esquema forzado
    const preset = NEBULA_PRESETS.find(p => p.id === nebulaThemeId)
    if (!preset?.scheme) {
      setResolvedTheme(applyDom(next))
    }
    try {
      await window.bazar?.settings?.set?.({ theme: next })
    } catch {
      /* ignore */
    }
  }, [nebulaThemeId])

  const setNebulaTheme = useCallback(async (id) => {
    setNebulaThemeId(id)
    // Si el nuevo preset tiene esquema, forzarlo
    const preset = NEBULA_PRESETS.find(p => p.id === id)
    if (preset?.scheme) {
      setResolvedTheme(applyDom(preset.scheme))
    } else {
      // Sin preset → volver al tema base del usuario
      setResolvedTheme(applyDom(themePref))
    }
    try {
      await window.bazar?.settings?.set?.({ nebulaThemeId: id })
    } catch {
      /* ignore */
    }
  }, [themePref])

  const setCustomCss = useCallback(async (css) => {
    setCustomNebulaCss(css)
    try {
      await window.bazar?.settings?.set?.({ customNebulaCss: css })
    } catch {
      /* ignore */
    }
  }, [])

  /** Ciclo: light → dark → system */
  const cycleTheme = useCallback(() => {
    const seq = ['light', 'dark', 'system']
    const i = seq.indexOf(themePref)
    void setTheme(seq[(i + 1) % seq.length])
  }, [themePref, setTheme])

  const value = useMemo(
    () => ({
      themePref, resolvedTheme, setTheme, cycleTheme,
      nebulaThemeId, setNebulaTheme,
      customNebulaCss, setCustomCss
    }),
    [themePref, resolvedTheme, setTheme, cycleTheme, nebulaThemeId, setNebulaTheme, customNebulaCss, setCustomCss],
  )

  const preset = NEBULA_PRESETS.find(p => p.id === nebulaThemeId)

  return (
    <ThemeContext.Provider value={value}>
      {preset || customNebulaCss ? (
        <style id="nebula-engine" dangerouslySetInnerHTML={{ __html: `
          :root, [data-theme="light"], [data-theme="dark"] {
            ${preset ? preset.css : ''}
            ${customNebulaCss}
          }
        ` }} />
      ) : null}
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const v = useContext(ThemeContext)
  if (!v) throw new Error('useTheme fuera de ThemeProvider')
  return v
}
