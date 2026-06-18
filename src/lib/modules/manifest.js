/**
 * Module Manifest — contrato declarativo de qué hace cada módulo.
 *
 * Cada módulo de My Little Bazar (Inventario, Cuaderno, PDV,
 * Banqueta, Asistente, …) declara aquí qué eventos del ledger emite,
 * cuáles consume, sobre qué entidades de dominio escribe, y de qué otros
 * módulos depende. Esto convierte la "modularidad" de declaración cosmética
 * a contrato auditable.
 *
 * El manifest es lo que vuelve a la modularidad **real**:
 *   - El agente IA puede leer manifests y filtrar tools por capability.
 *   - La UI de Tienda muestra capacidades reales, no copy estético.
 *   - Podés correr un test "¿qué pasa si desactivo Cuaderno?" preguntando
 *     al registry qué eventos dejan de emitirse y quién los consume.
 *   - Los permisos sobre la BD son declarativos; un módulo no debería
 *     poder escribir sobre entidades que no declaró.
 *
 * Forma:
 *   {
 *     id: string,            // único, kebab-case
 *     name: string,
 *     tagline: string,
 *     description: string,
 *     icon: string,          // nombre lucide-react
 *     accent: string,        // color token
 *     coreLevel: 'core' | 'free' | 'premium' | 'soon',
 *     installable: boolean,  // si false, está siempre activo (core)
 *     featured?: boolean,
 *     price?: string,
 *     trial?: string,
 *     capabilities: {
 *       reads: string[],     // entidades de dominio que LEE
 *       writes: string[],    // entidades que ESCRIBE (mutaciones)
 *       emits: string[],     // tipos de evento que produce
 *       consumes: string[],  // tipos de evento que escucha
 *     },
 *     requires: string[],    // ids de módulos requeridos
 *     conflictsWith?: string[],
 *   }
 *
 * Validación: validateManifest() devuelve { ok, errors[] }.
 */

const REQUIRED_KEYS = ['id', 'name', 'tagline', 'description', 'coreLevel', 'capabilities']
const COREL_LEVELS = new Set(['core', 'free', 'premium', 'soon'])

export function validateManifest(m) {
  const errors = []
  if (!m || typeof m !== 'object') {
    return { ok: false, errors: ['manifest no es un objeto'] }
  }
  for (const k of REQUIRED_KEYS) {
    if (m[k] == null || m[k] === '') errors.push(`falta campo "${k}"`)
  }
  if (m.coreLevel && !COREL_LEVELS.has(m.coreLevel)) {
    errors.push(`coreLevel inválido: ${m.coreLevel}`)
  }
  if (m.capabilities && typeof m.capabilities === 'object') {
    for (const k of ['reads', 'writes', 'emits', 'consumes']) {
      if (m.capabilities[k] != null && !Array.isArray(m.capabilities[k])) {
        errors.push(`capabilities.${k} debe ser array`)
      }
    }
  }
  if (m.requires != null && !Array.isArray(m.requires)) {
    errors.push('requires debe ser array')
  }
  if (m.featurePacks != null && !Array.isArray(m.featurePacks)) {
    errors.push('featurePacks debe ser array')
  }
  return { ok: errors.length === 0, errors }
}

/**
 * Crea un manifest dándole defaults razonables.
 * No tira si los datos están incompletos: los marca y deja que el registry decida.
 */
export function defineManifest(input) {
  const m = {
    id: String(input?.id || '').trim(),
    name: String(input?.name || '').trim(),
    tagline: String(input?.tagline || '').trim(),
    description: String(input?.description || '').trim(),
    icon: String(input?.icon || 'Box'),
    accent: String(input?.accent || 'gray'),
    coreLevel: input?.coreLevel || 'free',
    installable: input?.installable != null ? Boolean(input.installable) : input?.coreLevel !== 'core',
    featured: Boolean(input?.featured),
    price: input?.price || null,
    trial: input?.trial || null,
    capabilities: {
      reads: Array.isArray(input?.capabilities?.reads) ? input.capabilities.reads : [],
      writes: Array.isArray(input?.capabilities?.writes) ? input.capabilities.writes : [],
      emits: Array.isArray(input?.capabilities?.emits) ? input.capabilities.emits : [],
      consumes: Array.isArray(input?.capabilities?.consumes) ? input.capabilities.consumes : [],
    },
    requires: Array.isArray(input?.requires) ? input.requires : [],
    conflictsWith: Array.isArray(input?.conflictsWith) ? input.conflictsWith : [],
    featurePacks: Array.isArray(input?.featurePacks)
      ? input.featurePacks
        .filter((f) => f && typeof f === 'object' && String(f.id || '').trim() !== '')
        .map((f) => ({
          id: String(f.id || '').trim(),
          name: String(f.name || '').trim() || String(f.id || '').trim(),
          description: String(f.description || '').trim(),
          tier: String(f.tier || 'free').trim(),
          defaultEnabled: f.defaultEnabled !== false,
        }))
      : [],
  }
  m.validation = validateManifest(m)
  return Object.freeze(m)
}
