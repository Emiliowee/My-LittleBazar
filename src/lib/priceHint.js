const norm = (s) => String(s ?? '').trim().toLowerCase()

/**
 * Precio de referencia EXACTO desde datos reales — cuánto le suele poner a esta
 * COMBINACIÓN. El precio lo define (Categoría + Marca): un "Pantalón Levis" no
 * vale lo mismo que un "Pantalón sin marca".
 *
 * Prioridad de coincidencia:
 *   1. misma Categoría + misma Marca   (lo más relevante)
 *   2. misma Categoría (cualquier marca)
 *   3. misma Marca (cualquier categoría)
 * Devuelve el precio más frecuente, o `null` si no hay con qué sugerir.
 * Determinista (sin async): mismas entradas → misma salida.
 *
 * @param {object} args
 * @param {Array<{id?:number, categoria?:string, marca?:string, precio?:number|string}>} args.rows
 * @param {string} args.categoria
 * @param {string} [args.marca]
 * @param {number|null} [args.excludeId]
 * @returns {{ precio:number, scope:'exacto'|'categoria'|'marca' } | null}
 */
export function suggestRefPrice({ rows, categoria, marca, excludeId } = {}) {
  const cat = norm(categoria)
  const mar = norm(marca)
  if (!cat && !mar) return null

  const priced = (Array.isArray(rows) ? rows : []).filter((r) => {
    const p = Number(r?.precio)
    if (!Number.isFinite(p) || p <= 0) return false
    if (excludeId != null && Number(r?.id) === Number(excludeId)) return false
    return true
  })

  let matches = []
  let scope = 'exacto'
  if (cat && mar) matches = priced.filter((r) => norm(r.categoria) === cat && norm(r.marca) === mar)
  if (matches.length === 0 && cat) { matches = priced.filter((r) => norm(r.categoria) === cat); scope = 'categoria' }
  if (matches.length === 0 && mar) { matches = priced.filter((r) => norm(r.marca) === mar); scope = 'marca' }
  if (matches.length === 0) return null

  // Precio más frecuente (moda). Empate → el más alto (criterio estable).
  const counts = new Map()
  for (const m of matches) {
    const p = Number(m.precio)
    counts.set(p, (counts.get(p) || 0) + 1)
  }
  let best = null
  let bestC = 0
  for (const [p, c] of counts) {
    if (c > bestC || (c === bestC && (best == null || p > best))) { best = p; bestC = c }
  }
  return best == null ? null : { precio: best, scope }
}
