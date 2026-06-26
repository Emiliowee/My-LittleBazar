'use strict'

/**
 * Test de ELIMINAR VENTA (db.deleteVenta): deja todo "como antes de la venta".
 *  - venta de contado: la prenda vuelve a inventario y la venta desaparece.
 *  - venta fiada: se anula el cargo + enganche en Saldos (cliente queda en 0).
 *  - venta con prenda YA devuelta: no se repone doble (la devolución ya la repuso).
 *  - venta fiada con prenda devuelta: cuenta limpia, sin doble stock.
 *
 *   electron scripts/test-eliminar-venta.cjs
 */
const fs = require('fs')
const os = require('os')
const path = require('path')

const TMP_DB = path.join(os.tmpdir(), `mlb-del-venta-${Date.now()}-${process.pid}.db`)
process.env.BAZAR_MONSERRAT_DB = TMP_DB

const db = require('../electron/database.cjs')
const saldos = require('../electron/saldos-store.cjs')

let passed = 0
function ok(cond, label) { if (!cond) throw new Error(`ASSERT FALLÓ: ${label}`); passed += 1; console.log(`  ok   ${label}`) }
function safeDelete(p) { for (const ext of ['', '-shm', '-wal']) { try { fs.unlinkSync(p + ext) } catch { /* noop */ } } }

let seq = 0
function alta(precio, { stock = 1, pieza = true } = {}) {
  seq += 1
  return db.addProduct({ codigo: `DV-${String(seq).padStart(5, '0')}`, descripcion: 'Prenda', precio, pieza_unica: pieza, stock, estado: 'disponible', skipTagValidation: true, skipRuleLearning: true })
}
function prodEstado(id) { return db.getDb().prepare('SELECT estado, vendido_en, stock FROM productos WHERE id = ?').get(Number(id)) }
function saldoDe(clienteId) {
  return db.getDb().prepare(`SELECT COALESCE(SUM(CASE WHEN tipo IN ('cargo','cargo_atraso','ajuste') THEN monto ELSE 0 END),0)
    - COALESCE(SUM(CASE WHEN tipo IN ('abono','descuento') THEN monto ELSE 0 END),0) AS s
    FROM saldos_movimientos WHERE cliente_id = ? AND anulado = 0`).get(Number(clienteId)).s
}
function ventaExiste(id) { return !!db.getDb().prepare('SELECT 1 FROM ventas WHERE id = ?').get(Number(id)) }
function itemId(ventaId) { return db.getDb().prepare('SELECT id FROM venta_items WHERE venta_id = ? ORDER BY id LIMIT 1').get(Number(ventaId)).id }

function run() {
  console.log('\n===== Test: eliminar venta =====')

  // 1) contado: la prenda vuelve y la venta desaparece
  console.log('\n[1] Eliminar venta de contado')
  const p1 = alta(300)
  const v1 = db.addSale({ items: [{ productoId: p1.id, cantidad: 1 }], pagos: { efectivo: 300 } })
  ok(prodEstado(p1.id).estado === 'vendido', '1a prenda quedó vendida')
  const r1 = db.deleteVenta(v1.ventaId)
  ok(r1.ok && r1.stockRepuesto === 1, `1b borró y repuso 1 (vino ${r1.stockRepuesto})`)
  ok(prodEstado(p1.id).estado === 'disponible' && prodEstado(p1.id).vendido_en === null, '1c prenda volvió a disponible')
  ok(!ventaExiste(v1.ventaId), '1d la venta ya no existe')

  // 2) multi-stock: repone unidades
  console.log('\n[2] Eliminar venta multi-stock repone unidades')
  const p2 = alta(100, { stock: 5, pieza: false })
  const v2 = db.addSale({ items: [{ productoId: p2.id, cantidad: 2 }], pagos: { efectivo: 200 } })
  ok(prodEstado(p2.id).stock === 3, '2a stock bajó a 3')
  db.deleteVenta(v2.ventaId)
  ok(prodEstado(p2.id).stock === 5 && prodEstado(p2.id).estado === 'disponible', `2b stock repuesto a 5 (vino ${prodEstado(p2.id).stock})`)

  // 3) fiado: anula cargo + enganche (cliente en 0) y repone prenda
  console.log('\n[3] Eliminar venta FIADA revierte Saldos')
  const c3 = saldos.crearCliente(db.getDb(), { nombre: 'Cli3', nacimiento: '1990-01-01' }).clienteId
  const p3 = alta(500)
  const v3 = db.addSale({ items: [{ productoId: p3.id, cantidad: 1 }], pagos: { efectivo: 100 }, clienteId: c3, fiar: true })
  ok(saldoDe(c3) === 400, `3a debe 400 tras fiar (vino ${saldoDe(c3)})`)
  const r3 = db.deleteVenta(v3.ventaId)
  ok(r3.eraFiado && r3.saldosRevertidos >= 2, `3b revirtió cargo+enganche (movs ${r3.saldosRevertidos})`)
  ok(saldoDe(c3) === 0, `3c cuenta del cliente en 0 (vino ${saldoDe(c3)})`)
  ok(prodEstado(p3.id).estado === 'disponible', '3d prenda volvió a disponible')

  // 4) venta con prenda YA devuelta: no repone doble
  console.log('\n[4] Eliminar venta cuya prenda ya se devolvió no duplica stock')
  const p4 = alta(120)
  const v4 = db.addSale({ items: [{ productoId: p4.id, cantidad: 1 }], pagos: { efectivo: 120 } })
  db.registrarDevolucionRapida({ ventaItemId: itemId(v4.ventaId), montoReembolso: 120, metodoReembolso: 'efectivo' })
  ok(prodEstado(p4.id).estado === 'disponible', '4a tras devolver, prenda disponible')
  const r4 = db.deleteVenta(v4.ventaId)
  ok(r4.stockRepuesto === 0, `4b NO repuso de nuevo (vino ${r4.stockRepuesto})`)
  ok(prodEstado(p4.id).estado === 'disponible', '4c sigue disponible (sin doble)')

  // 5) fiado con prenda devuelta: cuenta limpia
  console.log('\n[5] Eliminar venta fiada con prenda devuelta deja cuenta limpia')
  const c5 = saldos.crearCliente(db.getDb(), { nombre: 'Cli5', nacimiento: '1990-01-01' }).clienteId
  const p5 = alta(400)
  const v5 = db.addSale({ items: [{ productoId: p5.id, cantidad: 1 }], pagos: { efectivo: 100 }, clienteId: c5, fiar: true })
  db.registrarDevolucionRapida({ ventaItemId: itemId(v5.ventaId), montoReembolso: 400 }) // cancela fiado + excedente a favor
  db.deleteVenta(v5.ventaId)
  ok(saldoDe(c5) === 0, `5a cuenta en 0 tras borrar (vino ${saldoDe(c5)})`)
  ok(prodEstado(p5.id).estado === 'disponible', '5b prenda disponible')

  console.log(`\nOK  test-eliminar-venta — ${passed} verificaciones pasaron`)
}

try { run(); try { db.closeDb && db.closeDb() } catch { /* noop */ } safeDelete(TMP_DB); process.exit(0) }
catch (e) { console.error(`\nFAIL: ${e.message}`); if (e.stack) console.error(e.stack.split('\n').slice(1, 4).join('\n')); try { db.closeDb && db.closeDb() } catch { /* noop */ } safeDelete(TMP_DB); process.exit(1) }
