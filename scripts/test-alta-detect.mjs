// Prueba de detectMarcaCategoria — marca + categoría por frase (multi-palabra).
// Correr: node scripts/test-alta-detect.mjs
import { detectMarcaCategoria, _BRANDS_COUNT, _CATS_COUNT } from '../src/lib/altaDetect.js'

let pass = 0, fail = 0
function check(name, got, expCat, expMarca) {
  const okCat = expCat == null || got.categoria.toLowerCase() === expCat.toLowerCase()
  const okMar = expMarca == null || got.marca.toLowerCase() === expMarca.toLowerCase()
  if (okCat && okMar) { pass++; console.log(`  ok  ${name}  → cat="${got.categoria}" marca="${got.marca}"`) }
  else { fail++; console.log(`  FAIL ${name}\n       esperado cat~="${expCat}" marca~="${expMarca}"\n       obtuvo   cat="${got.categoria}" marca="${got.marca}"`) }
}

console.log(`Diccionario: ${_BRANDS_COUNT} marcas, ${_CATS_COUNT} categorías\n`)

// Single-word
check('pantalon levis', detectMarcaCategoria('pantalon levis'), 'Pantalón', 'Levis')
check('blusa zara', detectMarcaCategoria('blusa zara'), 'Blusa', 'Zara')
check('chamarra nike', detectMarcaCategoria('chamarra nike'), 'Chamarra', 'Nike')
// Multi-word brand (el bug principal)
check('perfume carolina herrera', detectMarcaCategoria('perfume carolina herrera'), 'Perfumería', 'Carolina Herrera')
check('pantalon calvin klein', detectMarcaCategoria('pantalon calvin klein'), 'Pantalón', 'Calvin Klein')
check('perfume tommy hilfiger', detectMarcaCategoria('perfume tommy hilfiger'), 'Perfumería', null)
// Fragancias/maquillaje = sección; calzado = por tipo
check('labial → Maquillaje', detectMarcaCategoria('labial rojo'), 'Maquillaje', null)
check('zapato → tipo', detectMarcaCategoria('zapato negro'), 'Zapato', null)
check('colonia → Perfumería', detectMarcaCategoria('colonia hombre'), 'Perfumería', null)
// Misma marca, distintas categorías → la marca NO depende de la categoría
check('tommy perfume', detectMarcaCategoria('tommy perfume'), 'Perfumería', 'Tommy')
check('tommy pantalon', detectMarcaCategoria('tommy pantalon'), 'Pantalón', 'Tommy')
check('tommy blusa', detectMarcaCategoria('tommy blusa'), 'Blusa', 'Tommy')
check('solo tommy', detectMarcaCategoria('tommy'), '', 'Tommy')
// Solo categoría / solo marca
check('solo pantalon', detectMarcaCategoria('pantalon'), 'Pantalón', '')
check('solo nike', detectMarcaCategoria('nike'), '', 'Nike')
// Aprende de SUS datos (extra): marca/categoría propia que no está en el diccionario
check('marca propia (extra)', detectMarcaCategoria('chamoy especial', { marcas: ['Chamoy'] }), '', 'Chamoy')
check('categoria propia (extra)', detectMarcaCategoria('ropa interior nike', { categorias: ['Ropa interior'] }), 'Ropa interior', 'Nike')
// Robustez: marca mal guardada como categoría NO rompe — la marca gana
check('polución: Tommy como categoría', detectMarcaCategoria('perfume tommy', { categorias: ['Tommy'] }), 'Perfumería', 'Tommy')
check('polución: solo tommy', detectMarcaCategoria('tommy', { categorias: ['Tommy'] }), '', 'Tommy')
// Sin nada reconocible
check('texto libre', detectMarcaCategoria('cosa rara xyz'), '', '')
// Robustez
check('vacío', detectMarcaCategoria(''), '', '')
check('undefined', detectMarcaCategoria(undefined), '', '')
// Acentos / mayúsculas
check('PANTALÓN LEVIS', detectMarcaCategoria('PANTALÓN LEVIS'), 'Pantalón', 'Levis')

// ── Sinónimos → categoría canónica (el bug que reportó la dueña) ──
check('chanclas → Sandalia', detectMarcaCategoria('chanclas'), 'Sandalia', '')
check('chancla (singular)', detectMarcaCategoria('chancla rosa'), 'Sandalia', '')
check('huaraches → Sandalia', detectMarcaCategoria('huaraches piel'), 'Sandalia', '')
check('jeans → Pantalón', detectMarcaCategoria('jeans levis'), 'Pantalón', 'Levis')
check('mezclilla → Pantalón', detectMarcaCategoria('mezclilla azul'), 'Pantalón', '')
check('remera → Playera', detectMarcaCategoria('remera blanca'), 'Playera', '')
check('tenis nike → Tenis', detectMarcaCategoria('tenis nike'), 'Tenis', 'Nike')
check('gorra → Gorra', detectMarcaCategoria('gorra negra'), 'Gorra', '')
check('bolsa → Bolsa', detectMarcaCategoria('bolsa de mano'), 'Bolsa', '')
check('anillo → Joyería', detectMarcaCategoria('anillo de plata'), 'Joyería', '')
check('cinturón → Accesorio', detectMarcaCategoria('cinturon piel'), 'Accesorio', '')
// Plural y puntuación no rompen el match
check('sandalias (plural)', detectMarcaCategoria('sandalias'), 'Sandalia', '')
check('puntuación', detectMarcaCategoria('chanclas, talla 25'), 'Sandalia', '')
check('botines → Bota', detectMarcaCategoria('botines cafe'), 'Bota', '')

console.log(`\n${pass} ok, ${fail} fail`)
process.exit(fail ? 1 : 0)
