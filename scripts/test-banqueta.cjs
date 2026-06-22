'use strict'

/**
 * Test e2e del módulo BANQUETA:
 *  · armar una salida con pieza única y con stock parcial (multi-stock);
 *  · stock parcial descuenta unidades al salir (la tienda conserva el resto);
 *  · al cerrar: vendidas→vendido / repetible con stock sigue disponible;
 *    NO vendidas→'desactivado' (no vuelven al bazar) con ingreso correcto;
 *  · un producto desactivado NO se puede vender en el PDV;
 *  · reactivar un desactivado lo regresa a 'disponible'.
 *
 *   npm run test:banqueta
 */

const fs = require('fs')
const os = require('os')
const path = require('path')

const TMP_DB = path.join(os.tmpdir(), `mlb-banqueta-${Date.now()}-${process.pid}.db`)
process.env.BAZAR_MONSERRAT_DB = TMP_DB

const db = require('../electron/database.cjs')

let passed = 0
function assert(cond, label) {
  if (!cond) throw new Error(`ASSERT FALLÓ: ${label}`)
  passed += 1
  console.log(`  ok   ${label}`)
}
function assertThrows(fn, fragmento, label) {
  let threw = null
  try { fn() } catch (e) { threw = e }
  if (!threw) throw new Error(`ASSERT FALLÓ: ${label} — se esperaba error y no hubo`)
  if (fragmento && !String(threw.message).toLowerCase().includes(fragmento.toLowerCase())) {
    throw new Error(`ASSERT FALLÓ: ${label} — error fue «${threw.message}», esperaba «${fragmento}»`)
  }
  passed += 1
  console.log(`  ok   ${label} (rechazó: "${threw.message.slice(0, 44)}…")`)
}
function safeDelete(p) { for (const ext of ['', '-shm', '-wal']) { try { fs.unlinkSync(p + ext) } catch { /* noop */ } } }

let seq = 0
function alta(precio, { pieza = true, stock = 1 } = {}) {
  seq += 1
  const codigo = `BQ-${String(seq).padStart(5, '0')}`
  const res = db.addProduct({
    codigo,
    descripcion: pieza ? 'Prenda única' : 'Repetible', precio,
    pieza_unica: pieza, stock, estado: 'disponible',
    skipTagValidation: true, skipRuleLearning: true,
  })
  return { id: Number(res?.id ?? res?.lastInsertRowid ?? res), codigo }
}
function estadoDe(id) { return String(db.getProductById(Number(id)).estado || '').toLowerCase() }
function stockDe(id) { return Number(db.getProductById(Number(id)).stock) || 0 }

function run() {
  // ── Armar salida ────────────────────────────────────────────────────
  console.log('\n[Caso 1] Armar salida con pieza única y stock parcial')
  const p1 = alta(300, { pieza: true })                 // se venderá
  const p2 = alta(100, { pieza: false, stock: 5 })      // saca 3 de 5
  const p3 = alta(200, { pieza: true })                 // NO se venderá → desactivado

  const s = db.createBanquetaSalida({ nombre: 'Prueba', lugar: 'Calle' })
  assert(s?.id, 'createBanquetaSalida devuelve id')

  db.addProductToBanquetaSalida(s.id, p1.codigo)        // pieza → 1
  assert(estadoDe(p1.id) === 'en_banqueta', 'pieza única pasa a en_banqueta')

  db.addProductToBanquetaSalida(s.id, p2.codigo, 3)     // 3 de 5
  assert(stockDe(p2.id) === 2, `repetible conserva 2 en stock (vino ${stockDe(p2.id)})`)
  assert(estadoDe(p2.id) === 'disponible', 'repetible con stock restante sigue disponible')

  db.addProductToBanquetaSalida(s.id, p3.codigo)
  const det = db.getBanquetaSalidaDetail(s.id)
  assert(det.items.length === 3, `la salida tiene 3 ítems (vino ${det.items.length})`)
  const itp2 = det.items.find((i) => i.producto_id === p2.id)
  assert(Number(itp2.cantidad) === 3, `el ítem repetible guarda cantidad 3 (vino ${itp2.cantidad})`)

  // ── Stock parcial: no se puede sacar más de lo que hay ───────────────
  console.log('\n[Caso 2] No se puede sacar más stock del disponible')
  const p4 = alta(50, { pieza: false, stock: 2 })
  assertThrows(() => db.addProductToBanquetaSalida(s.id, p4.codigo, 9), 'solo hay 2', 'sacar 9 de 2 se rechaza')

  // ── Activar + registrar resultados ───────────────────────────────────
  console.log('\n[Caso 3] Activar y registrar lo vendido')
  db.activateBanquetaSalida(s.id)
  const d2 = db.getBanquetaSalidaDetail(s.id)
  const item = (pid) => d2.items.find((i) => i.producto_id === pid)
  db.setBanquetaSalidaItemResult({ itemId: item(p1.id).id, vendido: true, precioVendido: 150 })
  db.setBanquetaSalidaItemResult({ itemId: item(p2.id).id, vendido: true, cantidadVendida: 2, precioVendido: 120 })
  // p3 queda sin vender

  // ── Cerrar → desactivado + ingreso ───────────────────────────────────
  console.log('\n[Caso 4] Cerrar: vendido / desactivado / ingreso')
  const res = db.closeBanquetaSalida(s.id)
  assert(res.ingreso === 270, `ingreso = 150 + 120 = 270 (vino ${res.ingreso})`)
  assert(res.sold === 2, `2 ítems vendidos (vino ${res.sold})`)
  assert(estadoDe(p1.id) === 'vendido', 'pieza vendida → vendido')
  assert(estadoDe(p2.id) === 'disponible' && stockDe(p2.id) === 2, 'repetible con stock sigue disponible')
  assert(estadoDe(p3.id) === 'desactivado', `pieza no vendida → desactivado (vino ${estadoDe(p3.id)})`)

  // ── Desactivado NO se vende ──────────────────────────────────────────
  console.log('\n[Caso 5] Un desactivado no se puede vender en el PDV')
  assertThrows(
    () => db.addSale({ items: [{ productoId: p3.id, cantidad: 1 }], pagos: { efectivo: 200 } }),
    'desactivado', 'vender un desactivado se rechaza',
  )

  // ── Reactivar ────────────────────────────────────────────────────────
  console.log('\n[Caso 6] Reactivar un desactivado lo regresa a disponible')
  db.reactivarProductoBanqueta({ productoId: p3.id })
  assert(estadoDe(p3.id) === 'disponible', 'reactivado → disponible')
  const venta = db.addSale({ items: [{ productoId: p3.id, cantidad: 1 }], pagos: { efectivo: 200 } })
  assert(venta.ok, 'tras reactivar ya se puede vender')

  console.log(`\nOK  test-banqueta — ${passed} verificaciones pasaron`)
  console.log('    Salida con stock parcial, cierre con desactivado e ingreso, reactivación.')
}

try {
  run()
  try { db.closeDb && db.closeDb() } catch { /* noop */ }
  safeDelete(TMP_DB)
  process.exit(0)
} catch (e) {
  console.error(`\nFAIL test-banqueta: ${e.message}`)
  if (e.stack) console.error(e.stack.split('\n').slice(1, 4).join('\n'))
  try { db.closeDb && db.closeDb() } catch { /* noop */ }
  safeDelete(TMP_DB)
  process.exit(1)
}
