import { useCallback, useEffect, useMemo, useState } from 'react'
import { APP_MODULES, CORE_MODULE_IDS, isCoreModule } from '@/lib/moduleRegistry'

const KNOWN_MODULE_IDS = new Set(APP_MODULES.map((m) => m.id))

/**
 * Hook reactivo para saber qué módulos están activos y mutarlos.
 *
 * Lectura: `enabled` es un Set<string> con los IDs activos (siempre incluye
 * los core, aunque no estén en settings). El componente puede preguntar
 * `enabled.has('banqueta')` directamente.
 *
 * Escritura: `setModuleEnabled(id, on)` persiste en settings + dispara
 * `bazar:modules-changed` para que otras vistas re-rendericen sin que el
 * usuario tenga que recargar.
 *
 * Nota: los core no se pueden desactivar — silenciosamente la mutación se
 * ignora si se intenta apagar uno.
 */
export function useEnabledModules() {
  const [stored, setStored] = useState(() => new Set(CORE_MODULE_IDS))
  const [loaded, setLoaded] = useState(false)

  const reload = useCallback(async () => {
    const api = window.bazar?.settings
    if (!api?.get) return
    try {
      const all = await api.get()
      const fromSettings = Array.isArray(all?.enabledModules)
        ? all.enabledModules.filter((id) => KNOWN_MODULE_IDS.has(id))
        : CORE_MODULE_IDS
      const next = new Set([...CORE_MODULE_IDS, ...fromSettings])
      setStored(next)
      setLoaded(true)
    } catch {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    const onChanged = () => { void reload() }
    window.addEventListener('bazar:modules-changed', onChanged)
    return () => window.removeEventListener('bazar:modules-changed', onChanged)
  }, [reload])

  const setModuleEnabled = useCallback(async (id, on) => {
    const api = window.bazar?.settings
    if (!api?.get || !api?.set) return
    if (!KNOWN_MODULE_IDS.has(id)) return
    if (isCoreModule(id) && !on) return // no se desactivan los core
    try {
      const all = await api.get()
      const current = Array.isArray(all?.enabledModules)
        ? all.enabledModules.filter((moduleId) => KNOWN_MODULE_IDS.has(moduleId))
        : CORE_MODULE_IDS
      const set = new Set(current)
      const wasEnabled = set.has(id)
      if (on) set.add(id)
      else set.delete(id)
      // Garantizar que core siempre está en settings.
      for (const c of CORE_MODULE_IDS) set.add(c)
      const nextArr = [...set]
      await api.set({ enabledModules: nextArr })
      setStored(new Set(nextArr))
      window.dispatchEvent(new CustomEvent('bazar:modules-changed'))
      // Evento específico para que el Asistente reaccione con narrativa de
      // "inteligencia emergente". Solo lo disparamos si el estado cambió.
      if (wasEnabled !== Boolean(on)) {
        window.dispatchEvent(new CustomEvent('bazar:module-toggled', {
          detail: { moduleId: id, action: on ? 'enabled' : 'disabled' },
        }))
      }
    } catch {
      /* noop */
    }
  }, [])

  const enabledIds = useMemo(() => stored, [stored])

  return { enabled: enabledIds, isEnabled: (id) => enabledIds.has(id), setModuleEnabled, loaded, reload }
}
