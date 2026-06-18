/**
 * Compat shim — la fuente real vive en `src/lib/modules/registry.js`.
 *
 * Antiguamente este archivo era el catálogo "del sidebar" (forma `APP_MODULES`
 * con `label / iconName / features`). Hoy todo arranca del manifest registry
 * y este archivo solo traduce al formato viejo para no romper consumidores.
 */

import {
  listAllManifests,
  CORE_MODULE_IDS as REG_CORE_IDS,
  DEFAULT_ENABLED_MODULES as REG_DEFAULTS,
  isCoreModule as regIsCore,
} from './modules/registry.js'

function toAppModule(m) {
  return {
    id: m.id,
    label: m.name,
    iconName: m.icon,
    tagline: m.tagline,
    description: m.description,
    features: [], // ya no se usa para guiar UX; capabilities lo reemplaza
    category: m.coreLevel === 'core' ? 'core' : m.coreLevel === 'soon' ? 'soon' : 'optional',
    accent: m.accent,
  }
}

export const APP_MODULES = listAllManifests().map(toAppModule)

export const CORE_MODULE_IDS = REG_CORE_IDS
export const DEFAULT_ENABLED_MODULES = REG_DEFAULTS

export function buildModuleIndex() {
  const idx = new Map()
  for (const m of APP_MODULES) idx.set(m.id, m)
  return idx
}

export function isCoreModule(id) {
  return regIsCore(id)
}
