import { getSeedSuggestions } from './altaClassify.js'

/**
 * Arma las sugerencias del autocompletado de la entrada (nombres recientes +
 * opciones del cuaderno + diccionario de seeds). Pura y determinista para poder
 * testearla — el bug "no aparecen las marcas" se caza acá, no en la UI.
 *
 * @param {object} a
 * @param {string} a.smartInput
 * @param {string[]} [a.recentNames]
 * @param {Array<{id:number,name:string,options?:Array<{id:number,name:string}>}>} [a.groups]
 * @param {Set<number>} [a.selectedOptionIds]
 * @returns {Array<{type:'name'|'tag', value:string, group?:string, groupId?:number, optionId?:number}>}
 */
export function buildAltaSuggestions({ smartInput, recentNames = [], groups = [], selectedOptionIds } = {}) {
  const s = String(smartInput || '')
  if (!s.trim()) return []
  const lower = s.toLowerCase()
  const lastWord = lower.split(/\s+/).filter(Boolean).pop() || ''
  const sel = selectedOptionIds instanceof Set ? selectedOptionIds : new Set()
  const out = []

  // 1. Nombres ya guardados que contienen lo escrito.
  for (const name of recentNames) {
    if (out.length >= 4) break
    const nl = String(name).toLowerCase()
    if (nl.includes(lower) && nl !== lower) out.push({ type: 'name', value: String(name) })
  }

  if (lastWord.length >= 2) {
    // 2. Opciones reales del cuaderno que empiezan con la última palabra.
    for (const g of groups || []) {
      for (const o of (Array.isArray(g?.options) ? g.options : [])) {
        const on = String(o?.name || '')
        if (on.toLowerCase().startsWith(lastWord) && on.toLowerCase() !== lastWord && !sel.has(Number(o.id))) {
          if (!out.some((it) => it.type === 'tag' && it.value === on && it.group === g.name)) {
            out.push({ type: 'tag', value: on, group: g.name, groupId: g.id, optionId: o.id })
          }
        }
      }
    }
    // 3. Diccionario de seeds (marcas, tipos, tallas…) — built-in, viaja con la app.
    for (const seed of getSeedSuggestions(lastWord)) {
      if (!out.some((it) => it.type === 'tag' && it.value.toLowerCase() === seed.value.toLowerCase())) out.push(seed)
    }
  }

  return out.slice(0, 8)
}
