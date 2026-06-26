'use strict'

/**
 * Test de getComprasCliente: el expediente debe mostrar QUÉ se llevó el cliente,
 * de qué categoría y cuándo (ventas fiadas con sus renglones + categoría).
 *   electron scripts/test-compras-cliente.cjs
 */
const fs = require('fs')
const os = require('os')
const path = require('path')

const TMP_DB = path.join(os.tmpdir(), `mlb-compras-${Date.now()}-${process.pid}.db`)
process.env.BAZAR_MONSERRAT_DB = TMP_DB

const db = require('../electron/database.cjs')
const saldos = require('../electron/saldos-store.cjs')

let passed = 0
function ok(cond, label) { if (!cond) throw new Error(`ASSERT FALLÓ: ${label}`); passed += 1; console.log(`  ok   ${label}`) }
function safeDelete(p) { for (const ext of ['', '-shm', '-wal']) { try { fs.unlinkSync(p + ext) } catch { /* noop */ } } }

let seq = 0
function alta(precio, categoria, marca) {
  seq += 1
  return db.addProduct({ codigo: `CC-${String(seq).padStart(5, '0')}`, descripcion: `${categoria} ${marca}`.trim(), precio, categoria, marca, pieza_unica: true, stock: 1, estado: 'disponible', skipTagValidation: true, skipRuleLearning: true })
}

function run() {
  console.log('\n===== Test: getComprasCliente =====')
  const c = saldos.crearCliente(db.getDb(), { nombre: 'Tere', nacimiento: '1990-01-01' }).clienteId

  // Compra fiada con dos prendas de distinta categoría
  const p1 = alta(500, 'Pantalón', 'Levis')
  const p2 = alta(200, 'Blusa', '')
  db.addSale({ items: [{ productoId: p1.id, cantidad: 1 }, { productoId: p2.id, cantidad: 1 }], pagos: { efectivo: 100 }, clienteId: c, fiar: true })

  const compras = db.getComprasCliente(c)
  ok(compras.length === 1, `1 compra (vino ${compras.length})`)
  ok(compras[0].items.length === 2, `2 renglones (vino ${compras[0].items.length})`)
  ok(compras[0].total === 700, `total 700 (vino ${compras[0].total})`)
  const cats = compras[0].items.map((i) => i.categoria).sort()
  ok(cats.includes('Pantalón') && cats.includes('Blusa'), `trae categorías Pantalón y Blusa (vino ${cats.join(',')})`)
  ok(compras[0].items.every((i) => i.nombre && i.precio > 0), 'cada renglón trae nombre y precio')
  ok(!!compras[0].fecha, 'trae fecha')

  // Una segunda compra: deben venir 2, la más reciente primero
  const p3 = alta(300, 'Zapato', 'Nike')
  db.addSale({ items: [{ productoId: p3.id, cantidad: 1 }], pagos: { efectivo: 0 }, clienteId: c, fiar: true })
  const compras2 = db.getComprasCliente(c)
  ok(compras2.length === 2, `2 compras tras la segunda (vino ${compras2.length})`)

  // Cliente sin compras fiadas → lista vacía
  const c2 = saldos.crearCliente(db.getDb(), { nombre: 'Vacía', nacimiento: '1990-01-01' }).clienteId
  ok(db.getComprasCliente(c2).length === 0, 'cliente sin fiado → 0 compras')

  console.log(`\nOK  test-compras-cliente — ${passed} verificaciones pasaron`)
}

try { run(); try { db.closeDb && db.closeDb() } catch { /* noop */ } safeDelete(TMP_DB); process.exit(0) }
catch (e) { console.error(`\nFAIL: ${e.message}`); try { db.closeDb && db.closeDb() } catch { /* noop */ } safeDelete(TMP_DB); process.exit(1) }
