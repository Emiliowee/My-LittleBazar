/**
 * Parser de la "Entrada Inteligente" del alta de productos.
 *
 * Toma la línea que escribe Monserrat ("perfume tommy en caja 3 850 2") y la
 * descompone en: nombre, precio, stock y tags del cuaderno. Es una función
 * PURA (sin React, sin IPC) para poder testearla con `scripts/test-alta-parse`.
 *
 * Mejoras sobre la versión inline anterior (auditoría 2026-05-30):
 *  - Detecta marcas/perfumes de varias palabras (calvin klein, carolina
 *    herrera, acqua di gio) — antes se partía por palabras y no matcheaba.
 *  - Las tallas numéricas (jean 32) ya no se roban como precio.
 *  - Las palabras del diccionario (tops, vans) ya no se confunden con Zona.
 */

import { SEED_TERMS, STD_GROUPS, detectDomain, classifyTerm } from './altaClassify.js'

function norm(s) {
  return String(s ?? '').trim().toLowerCase()
}

function normAcc(s) {
  return norm(s).normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/* Frases del diccionario con 2+ palabras (marcas, perfumes), ordenadas de más
 * larga a más corta para hacer "longest match" — "212 vip black" antes que "212". */
const SEED_PHRASES = (() => {
  const out = []
  for (const [group, terms] of Object.entries(SEED_TERMS)) {
    for (const term of terms) {
      if (normAcc(term).includes(' ')) out.push({ group, display: term, key: normAcc(term) })
    }
  }
  out.sort((a, b) => b.key.length - a.key.length)
  return out
})()

/* Tallas numéricas conocidas (ropa adulto MX + calzado/niños), para distinguir
 * "talla 32" de "precio 32". */
const NUMERIC_SIZES = (() => {
  const set = new Set()
  for (const t of SEED_TERMS[STD_GROUPS.TALLA] || []) {
    if (/^\d{1,2}(\.5)?$/.test(t)) set.add(t)
  }
  return set
})()

/**
 * @param {string} rawInput  La línea cruda que escribe el usuario.
 * @param {Array<{id:number,name:string,options:Array<{id:number,name:string}>}>} groups  Cuaderno actual.
 * @returns {{ nombre:string, precio:string, stock:string, piezaUnica:boolean,
 *            tags: Record<number, number>, pendingTags: Array<{term:string,groupName:string,groupId:number|null}> }}
 */
export function parseSmartInput(rawInput, groups = []) {
  const empty = { nombre: '', precio: '', stock: '1', piezaUnica: true, tags: {}, pendingTags: [] }
  const val = String(rawInput ?? '')
  if (!val.trim()) return empty

  let remaining = val.trim()
  let price = ''
  let stock = '1'
  let piezaUnica = true
  const tags = {}
  const pendingTags = []
  const domain = detectDomain(val)

  const findGroupByName = (name) =>
    (groups || []).find((g) => norm(g?.name) === norm(name))
  const findOptionInGroup = (group, optName) =>
    group?.options?.find((o) => norm(o?.name) === norm(optName)) || null

  const addTag = (groupName, optValue) => {
    const group = findGroupByName(groupName)
    if (group) {
      const opt = findOptionInGroup(group, optValue)
      if (opt) {
        tags[group.id] = opt.id
        return
      }
    }
    const gName = group ? group.name : groupName
    const gId = group ? group.id : null
    const dup = pendingTags.some(
      (p) => norm(p.groupName) === norm(gName) && norm(p.term) === norm(optValue),
    )
    if (!dup) pendingTags.push({ term: optValue, groupName: gName, groupId: gId })
  }

  // 0. Prefijos explícitos del usuario: ganan SIEMPRE sobre la heurística.
  //    `$N` = precio (anywhere); `xN` = stock (anywhere). Resuelven la
  //    ambigüedad cuando un número podría ser talla, volumen o precio.
  let explicitPrice = false
  let explicitStock = false
  const explicitPriceRegex = /(?:^|\s)\$(\d+(?:\.\d+)?)(?=\s|$)/
  const ep = remaining.match(explicitPriceRegex)
  if (ep) {
    price = ep[1]
    explicitPrice = true
    remaining = remaining.replace(explicitPriceRegex, ' ').replace(/\s+/g, ' ').trim()
  }
  const explicitStockRegex = /(?:^|\s)x(\d+)(?=\s|$)/i
  const es = remaining.match(explicitStockRegex)
  if (es) {
    stock = es[1]
    piezaUnica = Number(stock) === 1
    explicitStock = true
    remaining = remaining.replace(explicitStockRegex, ' ').replace(/\s+/g, ' ').trim()
  }

  // 1. Precio (+ stock) al final — SOLO si el usuario no los dio explícitos.
  //    Guarda: si el número es una talla numérica conocida (jean 32), no lleva
  //    $ ni stock, y el dominio es ropa/calzado, NO es precio — lo deja para
  //    el paso de tallas.
  const priceStockRegex = /\s+(\$)?(\d+(?:\.\d+)?)(?:\s*(?:pesos|mxn))?(?:\s+(\d+))?\s*$/i
  const m = (explicitPrice && explicitStock) ? null : remaining.match(priceStockRegex)
  if (m) {
    const hasDollar = !!m[1]
    const first = m[2]
    const second = m[3]
    const looksLikeSize =
      !hasDollar &&
      !second &&
      NUMERIC_SIZES.has(first) &&
      (domain === 'ropa' || domain === 'calzado')
    if (!looksLikeSize) {
      if (!explicitPrice) price = first
      if (second && !explicitStock) {
        stock = second
        piezaUnica = Number(stock) === 1
      }
      remaining = remaining.slice(0, m.index).trim()
    }
  }

  // 2. Zonas explícitas: "caja 3", "zona A", "exhibidor 2", "repisa 4".
  const advZoneRegex = /(?:en\s+)?\b(zona|caja|exhibidor|estante|repisa)\s+([a-zA-Z0-9_-]+)\b/gi
  const advZones = []
  let az
  while ((az = advZoneRegex.exec(remaining)) !== null) {
    const type = az[1].charAt(0).toUpperCase() + az[1].slice(1).toLowerCase()
    advZones.push(`${type} ${az[2].toUpperCase()}`)
  }
  if (advZones.length) {
    advZones.forEach((z) => addTag(STD_GROUPS.ZONA, z))
    remaining = remaining.replace(advZoneRegex, '').replace(/\s+/g, ' ').trim()
  }

  // 3. Frases del diccionario de 2+ palabras (marcas/perfumes multi-palabra).
  //    Longest-match: se prueban de la más larga a la más corta.
  const remAcc = normAcc(remaining)
  for (const ph of SEED_PHRASES) {
    const re = new RegExp(`(?:^|\\s)${escapeRegex(ph.key)}(?=\\s|$)`, 'i')
    if (re.test(normAcc(remaining))) {
      addTag(ph.group, ph.display)
      // Remueve la frase del remaining (case-insensitive, espacios flexibles).
      const words = ph.display.split(/\s+/).map(escapeRegex).join('\\s+')
      remaining = remaining.replace(new RegExp(`\\b${words}\\b`, 'i'), '').replace(/\s+/g, ' ').trim()
    }
  }
  void remAcc

  // 4. Volúmenes ("100ml", "50gr", "1 litro"). En perfume/cosmético → Volumen.
  const volRegex = /\b(\d+(?:\.\d+)?)\s*(mililitros?|kilogramos?|miligramos?|gramos?|litros?|onzas?|kilos?|lts|ml|kg|gr|oz|mg|g|l)\b/gi
  const vols = []
  let vm
  while ((vm = volRegex.exec(remaining)) !== null) vols.push(vm[0])
  if (vols.length) {
    const volumeGroup =
      domain === 'perfume' || domain === 'cosmetico' ? STD_GROUPS.VOLUMEN : STD_GROUPS.TALLA
    vols.forEach((v) => addTag(volumeGroup, v))
    remaining = remaining.replace(volRegex, '').replace(/\s+/g, ' ').trim()
  }

  // 5. Tallas por letra (CH, M, G, XL, ...).
  const sizeRegex = /\b(CH|M|G|XG|XXG|XL|XXL|S|L|XS|UNITALLA)\b/gi
  const sizes = []
  let sm
  while ((sm = sizeRegex.exec(remaining)) !== null) sizes.push(sm[0].toUpperCase())
  if (sizes.length) {
    sizes.forEach((s) => addTag(STD_GROUPS.TALLA, s))
    remaining = remaining.replace(sizeRegex, '').replace(/\s+/g, ' ').trim()
  }

  // 6. Tallas numéricas (jean 32, tenis 26). Solo si el dominio es ropa/calzado,
  //    para no taguear números sueltos de otros productos.
  if (domain === 'ropa' || domain === 'calzado') {
    const numSizes = []
    for (const w of remaining.split(/\s+/).filter(Boolean)) {
      if (NUMERIC_SIZES.has(w)) numSizes.push(w)
    }
    if (numSizes.length) {
      numSizes.forEach((s) => addTag(STD_GROUPS.TALLA, s))
      for (const s of numSizes) {
        remaining = remaining.replace(new RegExp(`\\b${escapeRegex(s)}\\b`), '')
      }
      remaining = remaining.replace(/\s+/g, ' ').trim()
    }
  }

  // 7. Zonas "old-school" (AM, BS). FIX: no taguear si la palabra es un término
  //    conocido del diccionario (tops, vans) — solo si NO se reconoce de otra forma.
  const zoneRegex = /\b([a-zA-Z]{1,3}[msMS])\b/g
  const bareZones = []
  let zm
  while ((zm = zoneRegex.exec(remaining)) !== null) {
    const tok = zm[0]
    const guess = classifyTerm(tok, groups)
    // Si el token matchea/sugiere otro grupo del diccionario, NO es zona.
    if (guess.type === 'unknown') bareZones.push(tok.toUpperCase())
  }
  if (bareZones.length) {
    bareZones.forEach((z) => addTag(STD_GROUPS.ZONA, z))
    for (const z of bareZones) {
      remaining = remaining.replace(new RegExp(`\\b${escapeRegex(z)}\\b`, 'i'), '')
    }
    remaining = remaining.replace(/\s+/g, ' ').trim()
  }

  // 8. Palabras restantes → clasificar (marca, tipo, color...). NO se quitan del
  //    nombre, para que el nombre quede descriptivo.
  for (const word of remaining.split(/\s+/).filter(Boolean)) {
    const decision = classifyTerm(word, groups)
    if (decision.type === 'match') {
      tags[decision.groupId] = decision.optionId
    } else if (decision.type === 'suggest') {
      const dup = pendingTags.some(
        (p) => norm(p.groupName) === norm(decision.groupName) && norm(p.term) === norm(word),
      )
      if (!dup) pendingTags.push({ term: word, groupName: decision.groupName, groupId: decision.groupId })
    }
  }

  const nombre = composeName(remaining, tags, pendingTags, groups)
  return { nombre, precio: price, stock, piezaUnica, tags, pendingTags }
}

/* Stopwords del español que NO se capitalizan (salvo si arrancan el nombre). */
const STOPWORDS = new Set([
  'de', 'del', 'la', 'el', 'los', 'las', 'y', 'o', 'u',
  'en', 'con', 'sin', 'por', 'para', 'al', 'a',
])

/** Title case respetando stopwords y conservando acentos. */
function titleCase(s) {
  return String(s || '')
    .split(/\s+/)
    .map((word, i) => {
      if (!word) return word
      const lower = word.toLowerCase()
      if (i > 0 && STOPWORDS.has(lower)) return lower
      // Conservar mayúsculas internas si la palabra ya tiene (siglas: "XL", "USA").
      if (/[A-ZÁÉÍÓÚÑ]{2,}/.test(word)) return word
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    })
    .join(' ')
}

/**
 * Compone el nombre final del producto. Toma el "remaining" (lo que sobró del
 * texto original) y lo enriquece:
 *   - Title Case en español (Blusa de Algodón, no "blusa de algodón")
 *   - Si una marca multi-palabra fue detectada pero NO está en el remaining
 *     (porque se quitó al matchear el diccionario), la agrega al final
 *   - Si el remaining está vacío y hay marca, usa la marca como nombre
 *   - Normaliza espacios y limpia puntuación al final
 */
function composeName(remaining, tags, pendingTags, groups) {
  let base = String(remaining || '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[,;:.\-_/\s]+|[,;:.\-_/\s]+$/g, '')

  const baseNorm = normAcc(base)
  const isBrandGroup = (name) => {
    const n = norm(name)
    return n === 'marca' || n === 'perfume' || n === 'brand'
  }

  // Marcas detectadas pero que NO aparecen ya en el remaining.
  const faltantes = []

  // 1) De pendingTags (la marca/perfume es nueva, no estaba en el cuaderno).
  for (const p of pendingTags || []) {
    if (!isBrandGroup(p.groupName)) continue
    const termNorm = normAcc(p.term)
    if (!termNorm || baseNorm.includes(termNorm)) continue
    if (!faltantes.some((f) => normAcc(f) === termNorm)) faltantes.push(p.term)
  }

  // 2) De `tags` (matches contra el cuaderno: necesitamos resolver nombre).
  for (const [gIdStr, optId] of Object.entries(tags || {})) {
    const gId = Number(gIdStr)
    const grp = (groups || []).find((g) => Number(g?.id) === gId)
    if (!grp || !isBrandGroup(grp.name)) continue
    const opt = (grp.options || []).find((o) => Number(o?.id) === Number(optId))
    if (!opt?.name) continue
    const optNorm = normAcc(opt.name)
    if (baseNorm.includes(optNorm)) continue
    if (!faltantes.some((f) => normAcc(f) === optNorm)) faltantes.push(opt.name)
  }

  if (faltantes.length) {
    base = base ? `${base} ${faltantes.join(' ')}` : faltantes.join(' ')
  }

  return titleCase(base)
}
