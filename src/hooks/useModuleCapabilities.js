import { useCallback, useEffect, useMemo, useState } from 'react'
import { getManifest } from '@/lib/modules/registry'

function isObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function normalizeStored(raw) {
  if (!isObject(raw)) return {}
  const out = {}
  for (const [moduleId, config] of Object.entries(raw)) {
    if (!isObject(config)) continue
    const next = {}
    for (const [featureId, enabled] of Object.entries(config)) {
      if (typeof enabled === 'boolean') next[featureId] = enabled
    }
    out[moduleId] = next
  }
  return out
}

function defaultsForModule(moduleId) {
  const m = getManifest(moduleId)
  if (!m || !Array.isArray(m.featurePacks)) return {}
  const out = {}
  for (const f of m.featurePacks) {
    if (!f?.id) continue
    out[f.id] = f.defaultEnabled !== false
  }
  return out
}

export function useModuleCapabilities() {
  const [stored, setStored] = useState({})

  const reload = useCallback(async () => {
    const api = window.bazar?.settings
    if (!api?.get) return
    try {
      const all = await api.get()
      setStored(normalizeStored(all?.moduleCapabilityFlags))
    } catch {
      setStored({})
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    const onChanged = () => { void reload() }
    window.addEventListener('bazar:module-capabilities-changed', onChanged)
    return () => window.removeEventListener('bazar:module-capabilities-changed', onChanged)
  }, [reload])

  const readModuleState = useCallback((moduleId) => {
    if (!moduleId) return {}
    return {
      ...defaultsForModule(moduleId),
      ...(isObject(stored[moduleId]) ? stored[moduleId] : {}),
    }
  }, [stored])

  const isCapabilityEnabled = useCallback((moduleId, featureId) => {
    if (!moduleId || !featureId) return false
    const merged = readModuleState(moduleId)
    if (!Object.prototype.hasOwnProperty.call(merged, featureId)) return false
    return merged[featureId] !== false
  }, [readModuleState])

  const setCapabilityEnabled = useCallback(async (moduleId, featureId, enabled) => {
    if (!moduleId || !featureId) return
    const api = window.bazar?.settings
    if (!api?.get || !api?.set) return false
    try {
      const all = await api.get()
      const current = normalizeStored(all?.moduleCapabilityFlags)
      const next = {
        ...current,
        [moduleId]: {
          ...(isObject(current[moduleId]) ? current[moduleId] : {}),
          [featureId]: Boolean(enabled),
        },
      }
      await api.set({ moduleCapabilityFlags: next })
      setStored(next)
      window.dispatchEvent(new CustomEvent('bazar:module-capabilities-changed'))
      return true
    } catch {
      return false
    }
  }, [])

  return useMemo(() => ({
    readModuleState,
    isCapabilityEnabled,
    setCapabilityEnabled,
    reload,
  }), [isCapabilityEnabled, readModuleState, reload, setCapabilityEnabled])
}
