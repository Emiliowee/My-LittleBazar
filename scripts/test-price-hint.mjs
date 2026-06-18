// Prueba de suggestRefPrice — aviso de precio por (categoría + marca).
// Correr: node scripts/test-price-hint.mjs
import { suggestRefPrice } from '../src/lib/priceHint.js'

let pass = 0, fail = 0
function eq(name, got, exp) {
  const g = JSON.stringify(got), e = JSON.stringify(exp)
  if (g === e) { pass++; console.log(`  ok  ${name}`) }
  else { fail++; console.log(`  FAIL ${name}\n       esperado ${e}\n       obtuvo   ${g}`) }
}

const rows = [
  { id: 1, categoria: 'Pantalón', marca: 'Levis', precio: 800 },
  { id: 2, categoria: 'Pantalón', marca: 'Levis', precio: 800 },
  { id: 3, categoria: 'Pantalón', marca: 'Levis', precio: 900 }, // minoría
  { id: 4, categoria: 'Pantalón', marca: 'Sin marca', precio: 400 },
  { id: 5, categoria: 'Blusa', marca: 'Zara', precio: 300 },
  { id: 6, categoria: 'Perfume', marca: 'Tommy', precio: 0 }, // sin precio válido
]

// 1. Exacto (categoría + marca) → moda 800
eq('exacto cat+marca', suggestRefPrice({ rows, categoria: 'Pantalón', marca: 'Levis' }), { precio: 800, scope: 'exacto' })
// 2. Misma categoría, otra marca → su propio precio
eq('cat+marca sin marca', suggestRefPrice({ rows, categoria: 'Pantalón', marca: 'Sin marca' }), { precio: 400, scope: 'exacto' })
// 3. Marca que no existe en esa categoría → cae a categoría (mezcla: 800x2,900,400 → 800)
eq('marca nueva → categoria', suggestRefPrice({ rows, categoria: 'Pantalón', marca: 'Nike' }), { precio: 800, scope: 'categoria' })
// 4. Solo categoría
eq('solo categoria', suggestRefPrice({ rows, categoria: 'Blusa' }), { precio: 300, scope: 'categoria' })
// 5. Solo marca (cualquier categoría)
eq('solo marca', suggestRefPrice({ rows, categoria: '', marca: 'Zara' }), { precio: 300, scope: 'marca' })
// 6. Case / espacios
eq('case/espacios', suggestRefPrice({ rows, categoria: '  pantalón ', marca: ' levis ' }), { precio: 800, scope: 'exacto' })
// 7. Nada que matchee → null
eq('sin match', suggestRefPrice({ rows, categoria: 'Saco', marca: 'Gucci' }), null)
// 8. Sin categoría ni marca → null
eq('sin datos', suggestRefPrice({ rows, categoria: '', marca: '' }), null)
// 9. rows vacío / undefined → null
eq('rows vacío', suggestRefPrice({ rows: [], categoria: 'Pantalón', marca: 'Levis' }), null)
eq('rows undefined', suggestRefPrice({ categoria: 'Pantalón' }), null)
// 10. Excluir el propio (edición)
eq('excluye self', suggestRefPrice({ rows, categoria: 'Pantalón', marca: 'Levis', excludeId: 3 }), { precio: 800, scope: 'exacto' })
// 11. Precio 0 ignorado
eq('ignora precio 0', suggestRefPrice({ rows, categoria: 'Perfume', marca: 'Tommy' }), null)
// 12. precio como string
eq('precio string', suggestRefPrice({ rows: [{ id: 1, categoria: 'X', marca: 'Y', precio: '250' }], categoria: 'X', marca: 'Y' }), { precio: 250, scope: 'exacto' })
// 13. Empate → más alto
eq('empate → más alto', suggestRefPrice({ rows: [
  { id: 1, categoria: 'X', marca: 'Y', precio: 100 },
  { id: 2, categoria: 'X', marca: 'Y', precio: 200 },
], categoria: 'X', marca: 'Y' }), { precio: 200, scope: 'exacto' })

console.log(`\n${pass} ok, ${fail} fail`)
process.exit(fail ? 1 : 0)
