import { SEED_TERMS, STD_GROUPS } from './altaClassify.js'

/**
 * Detección de Marca + Categoría POR FRASE (no palabra por palabra), e
 * INDEPENDIENTES entre sí: una marca (ej. Tommy) puede ser de muchas categorías
 * (perfume, pantalón…) y cada combinación tiene su precio. Por eso la marca se
 * reconoce sea cual sea la categoría, y la categoría sale de sus propias palabras.
 *
 * Categorías: un mapa de SINÓNIMOS → categoría canónica (con emoji propio). Así
 * "chanclas", "huaraches" o "flip flop" caen todos en **Sandalia**; "jean",
 * "mezclilla" o "pants" en **Pantalón**; "remera" o "polo" en **Playera**. La
 * categoría canónica coincide con CATEGORIAS_BASE / el emoji por defecto, así no
 * se fragmentan ni quedan sin ícono.
 *
 * Robustez: el match es por límite de palabra y tolera plural (chancla↔chanclas)
 * y puntuación. Lo que la dueña ya cargó (sus marcas/categorías) tiene prioridad.
 */

const norm = (s) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')   // saca acentos (ñ → n)
    .replace(/[^a-z0-9\s]/g, ' ')      // puntuación → espacio
    .replace(/\s+/g, ' ')
    .trim()

const titleCase = (s) =>
  String(s).split(' ').map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' ')

const hasAcc = (s) => /[áéíóúüñ]/i.test(s)

/* Categoría canónica ← palabras que la disparan (en mexicano real). Todas las
 * canónicas tienen emoji por defecto en categoriaEmoji.js / CATEGORIAS_BASE. */
const SYNONYMS = {
  'Perfumería': ['perfume', 'fragancia', 'colonia', 'locion', 'loción', 'eau de parfum', 'eau de toilette', 'parfum', 'body mist', 'body splash', 'splash', 'agua de colonia', 'perfumeria', 'perfumería'],
  'Maquillaje': ['labial', 'pintalabios', 'lipstick', 'gloss', 'rimel', 'rímel', 'mascara de pestañas', 'delineador', 'eyeliner', 'sombra', 'paleta de sombras', 'base de maquillaje', 'corrector', 'rubor', 'blush', 'iluminador', 'bronceador', 'primer', 'esmalte', 'pintaunas', 'pintauñas', 'gelish', 'maquillaje', 'cosmetico', 'cosmético', 'brocha', 'polvo compacto', 'mascarilla'],
  'Blusa': ['blusa', 'bluson', 'blusón', 'top', 'crop top'],
  'Camisa': ['camisa', 'guayabera'],
  'Playera': ['playera', 'camiseta', 'remera', 't-shirt', 'tshirt', 'polo'],
  'Suéter': ['sueter', 'suéter', 'jersey', 'pullover', 'cardigan', 'cárdigan', 'chaleco'],
  'Sudadera': ['sudadera', 'hoodie', 'canguro'],
  'Chamarra': ['chamarra', 'chaqueta', 'abrigo', 'campera', 'gabardina', 'rompevientos', 'chaqueton'],
  'Saco': ['saco', 'blazer'],
  'Pantalón': ['pantalon', 'pantalón', 'pants', 'jean', 'jeans', 'mezclilla', 'chino', 'jogger', 'legging', 'leggings', 'leggins', 'mallon', 'mallón'],
  'Short': ['short', 'bermuda'],
  'Falda': ['falda', 'minifalda', 'maxifalda', 'faldon', 'faldón'],
  'Vestido': ['vestido', 'jumpsuit', 'overol', 'enterizo'],
  'Zapato': ['zapato', 'mocasin', 'mocasín', 'zapatilla', 'flat', 'flats', 'balerina', 'oxford'],
  'Tenis': ['tenis', 'sneaker', 'deportivo', 'calzado deportivo'],
  'Sandalia': ['sandalia', 'chancla', 'chancleta', 'huarache', 'alpargata', 'flip flop'],
  'Bota': ['bota', 'botin', 'botín', 'botita', 'bota larga'],
  'Tacón': ['tacon', 'tacón', 'plataforma', 'zapatilla de tacon'],
  'Bolsa': ['bolsa', 'bolso', 'cartera', 'mochila', 'morral', 'backpack', 'rinonera', 'riñonera', 'clutch'],
  'Joyería': ['anillo', 'collar', 'pulsera', 'arete', 'cadena', 'dije', 'gargantilla', 'esclava', 'broquel', 'joyeria', 'joyería'],
  'Accesorio': ['cinturon', 'cinturón', 'cinto', 'lentes', 'gafas', 'bufanda', 'guante', 'sombrero', 'reloj', 'llavero', 'diadema', 'panuelo', 'pañuelo', 'corbata', 'calcetin', 'calcetín', 'mascada'],
  'Gorra': ['gorra', 'cachucha', 'gorro', 'beanie'],
  'Juguete': ['juguete', 'peluche', 'muneca', 'muñeca', 'figura de accion'],
}

function termsOf(...groupKeys) {
  const out = []
  for (const k of groupKeys) for (const t of (SEED_TERMS[k] || [])) out.push(t)
  return out
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

/* Matcher por límite de palabra con plural tolerante en la última palabra
 * (chancla↔chanclas, bota↔botas, botin↔botines). */
function matcherOf(n) {
  const words = n.split(' ').filter(Boolean).map(escapeRe)
  if (!words.length) return null
  words[words.length - 1] += '(?:e?s)?'
  return new RegExp(`(?:^|\\s)${words.join('\\s+')}(?:\\s|$)`)
}

// Frase más larga primero (más palabras → más específica).
const byLenDesc = (a, b) => (b.n.split(' ').length - a.n.split(' ').length) || (b.n.length - a.n.length)
const toEntries = (map) => [...map.entries()]
  .map(([n, canon]) => ({ n, canon, re: matcherOf(n) }))
  .filter((e) => e.re)
  .sort(byLenDesc)

/* catMap: norm(disparador) → categoría canónica. Sinónimos primero (mandan); los
 * términos TIPO del seed que no estén ya cubiertos se agregan tal cual para no
 * perder cobertura. */
const catMap = new Map()
for (const [canon, triggers] of Object.entries(SYNONYMS)) {
  for (const t of triggers) { const n = norm(t); if (n) catMap.set(n, canon) }
}
for (const c of termsOf(STD_GROUPS.TIPO)) {
  const n = norm(c)
  if (n && !catMap.has(n)) catMap.set(n, titleCase(c))
}
const catStatic = toEntries(catMap)

/* Una palabra que el detector reconoce como CATEGORÍA (con plural tolerante)
 * nunca puede ser marca — así "chanclas"/"botines" del seed de calzado no se
 * cuelan como marca. */
function esPalabraCategoria(n) {
  const hay = ` ${n} `
  return catStatic.some((e) => e.re.test(hay))
}

const brandMap = new Map()
for (const b of termsOf(STD_GROUPS.MARCA, STD_GROUPS.PERFUME, STD_GROUPS.COSMETICO, STD_GROUPS.CALZADO)) {
  const n = norm(b)
  if (!n || esPalabraCategoria(n)) continue
  const existing = brandMap.get(n)
  if (!existing || (hasAcc(b) && !hasAcc(existing))) brandMap.set(n, b)
}
const brandStatic = toEntries(brandMap)

function prepExtra(list) {
  const map = new Map()
  for (const t of (list || [])) { const n = norm(t); if (n && !map.has(n)) map.set(n, titleCase(String(t).trim()) || t) }
  return toEntries(map)
}

function findPhrase(hay, entries, minLen, exclude) {
  for (const e of entries) {
    if (e.n.length < minLen) continue
    if (exclude && exclude.has(e.n)) continue
    if (e.re.test(hay)) return e.canon
  }
  return ''
}

/**
 * @param {string} text
 * @param {{ marcas?: string[], categorias?: string[] }} [extra] datos de la dueña (prioridad)
 * @returns {{ categoria: string, marca: string }}
 *
 * Regla anti-confusión: LAS MARCAS GANAN. Una marca conocida nunca se toma como
 * categoría, y una palabra de categoría que no es marca nunca se toma como marca.
 */
export function detectMarcaCategoria(text, extra = {}) {
  const hay = ` ${norm(text)} `
  const extraCat = prepExtra(extra.categorias)
  const extraBrand = prepExtra(extra.marcas)

  const brandNorms = new Set([...brandStatic.map((e) => e.n), ...extraBrand.map((e) => e.n)])
  const catExclude = new Set()
  for (const e of [...catStatic, ...extraCat]) if (!brandNorms.has(e.n)) catExclude.add(e.n)

  // Categoría: nunca una marca. Marca: nunca una palabra de categoría (no-marca).
  const categoria =
    findPhrase(hay, extraCat, 3, brandNorms) ||
    findPhrase(hay, catStatic, 3, brandNorms)
  const marca =
    findPhrase(hay, extraBrand, 2, catExclude) ||
    titleCase(findPhrase(hay, brandStatic, 2, catExclude))
  return { categoria, marca }
}

/**
 * Categorías "de fábrica" que ofrece el sistema (editor de Configuración y POS).
 * En forma canónica — coinciden con lo que detecta el alta, así no se duplican.
 */
export const CATEGORIAS_BASE = [
  'Perfumería', 'Maquillaje',
  'Blusa', 'Camisa', 'Playera', 'Suéter', 'Sudadera', 'Chamarra', 'Saco',
  'Pantalón', 'Short', 'Falda', 'Vestido',
  'Zapato', 'Tenis', 'Sandalia', 'Bota', 'Tacón',
  'Bolsa', 'Joyería', 'Accesorio', 'Gorra', 'Juguete',
]

export const _BRANDS_COUNT = brandStatic.length
export const _CATS_COUNT = catStatic.length
