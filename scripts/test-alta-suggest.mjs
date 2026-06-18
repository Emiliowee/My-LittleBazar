// Prueba del armador de sugerencias del autocompletado.
// Correr: node scripts/test-alta-suggest.mjs
import { buildAltaSuggestions } from '../src/lib/altaSuggest.js'

let pass = 0, fail = 0
function check(name, cond) {
  if (cond) { pass++; console.log(`  ok  ${name}`) }
  else { fail++; console.log(`  FAIL ${name}`) }
}
const hasTag = (arr, v) => arr.some((x) => x.type === 'tag' && x.value.toLowerCase() === v.toLowerCase())
const hasName = (arr, v) => arr.some((x) => x.type === 'name' && x.value === v)

// Diccionario built-in (seeds) DEBE aparecer:
check('"nik" → nike', hasTag(buildAltaSuggestions({ smartInput: 'nik' }), 'nike'))
check('"tom" → tommy', hasTag(buildAltaSuggestions({ smartInput: 'tom' }), 'tommy'))
check('"adi" → adidas', hasTag(buildAltaSuggestions({ smartInput: 'adi' }), 'adidas'))
check('"lev" → levis', hasTag(buildAltaSuggestions({ smartInput: 'lev' }), 'levis'))
check('"cal" → calvin klein', hasTag(buildAltaSuggestions({ smartInput: 'cal' }), 'calvin klein'))
check('"lab" → labial', hasTag(buildAltaSuggestions({ smartInput: 'lab' }), 'labial'))

// Última palabra de una frase también dispara seeds:
check('"pantalon nik" → nike', hasTag(buildAltaSuggestions({ smartInput: 'pantalon nik' }), 'nike'))

// 1 sola letra → no dispara seeds (evita ruido)
check('"n" → sin seeds', buildAltaSuggestions({ smartInput: 'n' }).length === 0)

// Nombres guardados aparecen:
check('nombre guardado', hasName(buildAltaSuggestions({ smartInput: 'panta', recentNames: ['Pantalón Levis'] }), 'Pantalón Levis'))

// Opción del cuaderno aparece y respeta ya-seleccionados:
const groups = [{ id: 7, name: 'Zona', options: [{ id: 70, name: 'Mishou' }] }]
check('opción cuaderno "mish" → Mishou', hasTag(buildAltaSuggestions({ smartInput: 'mish', groups }), 'Mishou'))
check('oculta opción ya elegida', !hasTag(buildAltaSuggestions({ smartInput: 'mish', groups, selectedOptionIds: new Set([70]) }), 'Mishou'))

// Robustez: vacío / undefined no explota
check('vacío → []', buildAltaSuggestions({ smartInput: '' }).length === 0)
check('sin args → []', buildAltaSuggestions().length === 0)

// Máximo 8
check('máx 8', buildAltaSuggestions({ smartInput: 'ca', recentNames: ['Camisa A','Camisa B','Camisa C','Camisa D','Camisa E'] }).length <= 8)

console.log(`\n${pass} ok, ${fail} fail`)
process.exit(fail ? 1 : 0)
