/**
 * Verifica el parser de la Entrada Inteligente (src/lib/altaParse.js).
 * Corre con Node puro (es lógica pura, sin Electron): `npm run test:alta`.
 *
 * Cada caso documenta un bug de la auditoría 2026-05-30 que NO debe volver.
 */
import { parseSmartInput } from '../src/lib/altaParse.js'

let pass = 0
let fail = 0
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  \x1b[32mOK\x1b[0m  ' + name) }
  else { fail++; console.log('  \x1b[31mXX\x1b[0m  ' + name + (detail ? '   -> ' + detail : '')) }
}

// Con cuaderno vacío, todo lo clasificable cae en pendingTags (sin ids reales).
const hasTag = (r, term, group) =>
  r.pendingTags.some(
    (p) =>
      p.term.toLowerCase().includes(term.toLowerCase()) &&
      p.groupName.toLowerCase() === group.toLowerCase(),
  )

console.log('\n— Caso ejemplo de la UI: "perfume tommy en caja 3 850 2" —')
let r = parseSmartInput('perfume tommy en caja 3 850 2', [])
check('precio = 850', r.precio === '850', JSON.stringify(r))
check('stock = 2', r.stock === '2')
check('zona "Caja 3"', hasTag(r, 'Caja 3', 'Zona'))
check('marca tommy', hasTag(r, 'tommy', 'Marca'))

console.log('\n— Bug 1: marcas/perfumes de varias palabras —')
r = parseSmartInput('blusa calvin klein roja 250', [])
check('detecta "calvin klein" como Marca', hasTag(r, 'calvin klein', 'Marca'), JSON.stringify(r.pendingTags))
check('precio = 250', r.precio === '250')
r = parseSmartInput('perfume carolina herrera 212 vip 900', [])
check('detecta "carolina herrera"', hasTag(r, 'carolina herrera', 'Marca') || hasTag(r, 'carolina herrera', 'Perfume'), JSON.stringify(r.pendingTags))
check('precio = 900 (no se come el 212)', r.precio === '900', JSON.stringify(r))

console.log('\n— Bug 2: talla numérica NO se roba como precio —')
r = parseSmartInput('jean mezclilla 32', [])
check('precio vacío (32 es talla)', r.precio === '', JSON.stringify(r))
check('talla 32', hasTag(r, '32', 'Talla'), JSON.stringify(r.pendingTags))
r = parseSmartInput('jean mezclilla 350', [])
check('precio = 350 (350 no es talla)', r.precio === '350', JSON.stringify(r))

console.log('\n— Bug 3: palabras del diccionario NO se confunden con Zona —')
r = parseSmartInput('tops blanco 120', [])
check('"tops" NO es zona', !hasTag(r, 'TOPS', 'Zona'), JSON.stringify(r.pendingTags))
check('precio = 120', r.precio === '120')

console.log('\n— Zona real sigue funcionando —')
r = parseSmartInput('blusa AM 80', [])
check('"AM" sí es zona', hasTag(r, 'AM', 'Zona'), JSON.stringify(r.pendingTags))

console.log('\n— Prefijos explícitos del usuario (gana sobre la heurística) —')
r = parseSmartInput('jean $32', [])
check('"$32" = precio explícito (no talla)', r.precio === '32', JSON.stringify(r))
r = parseSmartInput('perfume tommy $850 x3', [])
check('$850 = precio', r.precio === '850', JSON.stringify(r))
check('x3 = stock', r.stock === '3' && r.piezaUnica === false)
r = parseSmartInput('blusa 32 x5', [])
check('x5 = stock (32 sigue siendo talla)', r.stock === '5' && hasTag(r, '32', 'Talla'), JSON.stringify(r))
r = parseSmartInput('blusa $250', [])
check('precio explícito al inicio funciona', r.precio === '250', JSON.stringify(r))

console.log('\n— Nombre robusto: Title Case + recupera marca multi-palabra —')
r = parseSmartInput('blusa roja $250', [])
check('"blusa roja" → "Blusa Roja"', r.nombre === 'Blusa Roja', JSON.stringify(r.nombre))
r = parseSmartInput('blusa calvin klein roja M $250', [])
check('recupera "Calvin Klein" perdida', /Calvin Klein/i.test(r.nombre), JSON.stringify(r.nombre))
r = parseSmartInput('blusa de algodón M $250', [])
check('stopword "de" en minúscula', r.nombre === 'Blusa de Algodón', JSON.stringify(r.nombre))
r = parseSmartInput('calvin klein $250', [])
check('vacío + marca → "Calvin Klein"', r.nombre === 'Calvin Klein', JSON.stringify(r.nombre))
r = parseSmartInput('perfume tommy $850', [])
check('"perfume tommy" → "Perfume Tommy"', r.nombre === 'Perfume Tommy', JSON.stringify(r.nombre))
r = parseSmartInput('blusa,  ,  $250', [])
check('limpia puntuación + espacios dobles', r.nombre === 'Blusa', JSON.stringify(r.nombre))

console.log(`\nResultado: ${pass} OK / ${fail} fallidos\n`)
process.exit(fail === 0 ? 0 : 1)
