'use strict'

/**
 * Test del AJUSTE DE PRECIOS por categoría + marca (el modelo de la dueña).
 *   electron scripts/test-ajuste-precio.cjs
 */
const fs = require('fs')
const os = require('os')
const path = require('path')

const TMP_DB = path.join(os.tmpdir(), `mlb-ajuste-${Date.now()}-${process.pid}.db`)
process.env.BAZAR_MONSERRAT_DB = TMP_DB
const db = require('../electron/database.cjs')

let passed = 0
function ok(cond, label) { if (!cond) throw new Error(`ASSERT FALLÓ: ${label}`); passed += 1; console.log(`  ok   ${label}`) }
function safeDelete(p) { for (const ext of ['', '-shm', '-wal']) { try { fs.unlinkSync(p + ext) } catch { /* noop */ } } }
let seq = 0
function alta(precio, categoria, marca) { seq += 1; return db.addProduct({ codigo: `AP-${String(seq).padStart(5, '0')}`, descripcion: `${categoria} ${marca}`.trim(), precio, categoria, marca, pieza_unica: true, stock: 1, estado: 'disponible', skipTagValidation: true, skipRuleLearning: true }) }
function precioDe(id) { return db.getDb().prepare('SELECT precio FROM productos WHERE id = ?').get(Number(id)).precio }

function run() {
  console.log('\n===== Test: ajuste de precios por categoría/marca =====')
  const pant1 = alta(500, 'Pantalón', 'Levis').id
  const pant2 = alta(400, 'Pantalón', 'Levis').id
  const pantSin = alta(300, 'Pantalón', '').id
  const blusa = alta(200, 'Blusa', 'Zara').id

  // Preview por categoría (toda la categoría Pantalón = 3)
  const prev = db.previewPriceAdjust({ categoria: 'Pantalón', adjustMode: 'pct', adjustValue: 10, roundMode: 'centavos' })
  ok(prev.total === 3, `preview categoría Pantalón = 3 (vino ${prev.total})`)

  // Preview por categoría + marca (solo Levis = 2)
  const prevLevis = db.previewPriceAdjust({ categoria: 'Pantalón', marca: 'Levis', adjustMode: 'pct', adjustValue: 10, roundMode: 'centavos' })
  ok(prevLevis.total === 2, `preview Pantalón+Levis = 2 (vino ${prevLevis.total})`)

  // Aplicar +10% a Pantalón Levis: 500→550, 400→440; el sin-marca y la blusa NO cambian
  const res = db.applyPriceAdjust({ categoria: 'Pantalón', marca: 'Levis', adjustMode: 'pct', adjustValue: 10, roundMode: 'centavos' })
  ok(res.updated === 2, `aplicó a 2 (vino ${res.updated})`)
  ok(precioDe(pant1) === 550, `Levis 500→550 (vino ${precioDe(pant1)})`)
  ok(precioDe(pant2) === 440, `Levis 400→440 (vino ${precioDe(pant2)})`)
  ok(precioDe(pantSin) === 300, `Pantalón sin marca intacto 300 (vino ${precioDe(pantSin)})`)
  ok(precioDe(blusa) === 200, `Blusa intacta 200 (vino ${precioDe(blusa)})`)

  // Precio fijo a toda una categoría
  db.applyPriceAdjust({ categoria: 'Blusa', adjustMode: 'fixed', adjustValue: 250 })
  ok(precioDe(blusa) === 250, `Blusa precio fijo 250 (vino ${precioDe(blusa)})`)

  // Categoría inexistente → 0
  const nada = db.previewPriceAdjust({ categoria: 'NoExiste', adjustMode: 'pct', adjustValue: 10 })
  ok(nada.total === 0, `categoría inexistente = 0 (vino ${nada.total})`)

  console.log(`\nOK  test-ajuste-precio — ${passed} verificaciones pasaron`)
}

try { run(); try { db.closeDb && db.closeDb() } catch { /* noop */ } safeDelete(TMP_DB); process.exit(0) }
catch (e) { console.error(`\nFAIL: ${e.message}`); try { db.closeDb && db.closeDb() } catch { /* noop */ } safeDelete(TMP_DB); process.exit(1) }
