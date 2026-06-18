'use strict'

/**
 * Test de DEVOLUCIONES en efectivo/transferencia e INTERCAMBIOS de prendas
 * pagadas. (Las devoluciones de prendas FIADAS viven en test-fiado-saldos,
 * porque el fiado está unificado en el módulo Saldos.)
 *
 * Verifica el código real de electron/database.cjs contra una base temporal
 * aislada. Uso: npm run test:devoluciones
 */

const fs = require('fs')
const os = require('os')
const path = require('path')

const TMP_DB = path.join(os.tmpdir(), `mlb-dev-test-${Date.now()}-${process.pid}.db`)
process.env.BAZAR_MONSERRAT_DB = TMP_DB

const db = require('../electron/database.cjs')
const saldos = require('../electron/saldos-store.cjs')

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
  console.log(`  ok   ${label} (rechazó: "${threw.message.slice(0, 50)}…")`)
}
function safeDelete(p) { for (const ext of ['', '-shm', '-wal']) { try { fs.unlinkSync(p + ext) } catch { /* noop */ } } }

let seq = 0
function alta(precio, extra = {}) {
  seq += 1
  return db.addProduct({
    codigo: `D-${String(seq).padStart(5, '0')}`,
    descripcion: 'Prenda', precio, pieza_unica: true, stock: 1, estado: 'disponible',
    skipTagValidation: true, skipRuleLearning: true, ...extra,
  })
}
function codeOf(id) { return db.getProductById(Number(id)).codigo }
function estadoDe(id) { return String(db.getProductById(Number(id)).estado || '').toLowerCase() }
function saldoSaldos(database, id) {
  const r = database.prepare(`
    SELECT COALESCE(SUM(CASE WHEN tipo IN ('cargo','cargo_atraso','ajuste') THEN monto ELSE 0 END),0) AS cargos,
           COALESCE(SUM(CASE WHEN tipo IN ('abono','descuento') THEN monto ELSE 0 END),0) AS pagos
    FROM saldos_movimientos WHERE cliente_id = ? AND anulado = 0`).get(Number(id))
  return Math.max(0, Math.round(((Number(r.cargos) || 0) - (Number(r.pagos) || 0)) * 100) / 100)
}

function run() {
  const database = db.getDb()

  // ── Caso 1: devolución de una venta en EFECTIVO ──────────────────────
  console.log('\n[Caso 1] Devolución de venta en efectivo')
  const p1 = alta(250)
  db.addSale({ metodo: 'efectivo', pagoCon: 250, items: [{ productoId: p1.id, cantidad: 1 }] })
  assert(estadoDe(p1.id) === 'vendido', 'tras vender queda "vendido"')
  const r1 = db.registrarDevolucionRapida({ codigo: codeOf(p1.id), metodoReembolso: 'efectivo', montoReembolso: 250 })
  assert(r1.ok && Number(r1.reembolso) === 250, 'reembolsa el precio en efectivo')
  assert(estadoDe(p1.id) === 'disponible', 'la prenda vuelve a "disponible"')
  assert(r1.ventaEsCredito === false, 'marca la venta como NO crédito')

  // ── Caso 1b: devolver el RENGLÓN EXACTO (mismo código en 2 tickets) ──
  console.log('\n[Caso 1b] Devuelve el renglón exacto por ventaItemId, no el último')
  const pm = alta(80, { pieza_unica: false, stock: 10 })
  const vA = db.addSale({ metodo: 'efectivo', pagoCon: 80, items: [{ productoId: pm.id, cantidad: 1 }] })
  const vB = db.addSale({ metodo: 'efectivo', pagoCon: 80, items: [{ productoId: pm.id, cantidad: 1 }] })
  const itemA = db.getVentaDetalle(vA.ventaId).items[0]
  const rExacto = db.registrarDevolucionRapida({ ventaItemId: itemA.id, metodoReembolso: 'efectivo', montoReembolso: 80 })
  assert(rExacto.ok && rExacto.ventaId === vA.ventaId, `devolvió el renglón del ticket A #${vA.ventaId} (vino #${rExacto.ventaId})`)
  assert(db.getVentaDetalle(vA.ventaId).items[0].devuelto_en != null, 'el renglón del ticket A quedó devuelto')
  assert(db.getVentaDetalle(vB.ventaId).items[0].devuelto_en == null, 'el renglón del ticket B NO se tocó')

  // ── Caso 2: no se puede devolver dos veces ───────────────────────────
  console.log('\n[Caso 2] No devolver dos veces / no devolver lo no vendido')
  assertThrows(() => db.registrarDevolucionRapida({ codigo: codeOf(p1.id), metodoReembolso: 'efectivo' }), 'no figura', 'segunda devolución rechazada')
  const pNunca = alta(100)
  assertThrows(() => db.registrarDevolucionRapida({ codigo: codeOf(pNunca.id), metodoReembolso: 'efectivo' }), 'no figura', 'devolver prenda nunca vendida rechazada')

  // ── Caso 3: INTERCAMBIO en efectivo (devuelve y se lleva otra igual) ──
  console.log('\n[Caso 3] Intercambio de venta en efectivo, mismo precio')
  const x1 = alta(300), x2 = alta(300)
  db.addSale({ metodo: 'efectivo', pagoCon: 300, items: [{ productoId: x1.id, cantidad: 1 }] })
  const ix1 = db.addIntercambio({ entra: [{ codigo: codeOf(x1.id) }], sale: [{ codigo: codeOf(x2.id) }], limiteDias: 30 })
  assert(ix1 && (ix1.ok || ix1.intercambioId), 'intercambio efectivo same-price OK')
  assert(estadoDe(x1.id) === 'disponible', 'la devuelta vuelve a disponible')
  assert(estadoDe(x2.id) === 'vendido', 'la que se lleva queda vendida')

  // ── Caso 4: INTERCAMBIO se lleva algo MÁS CARO, paga diferencia ──────
  console.log('\n[Caso 4] Intercambio por algo más caro (paga diferencia en efectivo)')
  const y1 = alta(300), y2 = alta(500)
  db.addSale({ metodo: 'efectivo', pagoCon: 300, items: [{ productoId: y1.id, cantidad: 1 }] })
  const ix2 = db.addIntercambio({ entra: [{ codigo: codeOf(y1.id) }], sale: [{ codigo: codeOf(y2.id) }], diferenciaMetodo: 'efectivo', limiteDias: 30 })
  assert(ix2 && (ix2.ok || ix2.intercambioId), 'intercambio con diferencia positiva OK')
  assert(estadoDe(y2.id) === 'vendido', 'la más cara queda vendida')

  // ── Caso 5: el atajo de intercambio NO se usa con prendas FIADAS ─────
  console.log('\n[Caso 5] El intercambio rápido rechaza prendas fiadas (se hace devolución + venta)')
  const nora = saldos.crearCliente(database, { nombre: 'Nora', nacimiento: '1980-09-09' }).clienteId
  const f1 = alta(400), f2 = alta(400)
  db.addSale({ metodo: 'credito', items: [{ productoId: f1.id, cantidad: 1 }], creditoMovimiento: { saldosClienteId: nora, monto: 400, enganche: 0 } })
  assertThrows(
    () => db.addIntercambio({ entra: [{ codigo: codeOf(f1.id) }], sale: [{ codigo: codeOf(f2.id) }], limiteDias: 30 }),
    'fiada',
    'cambiar una prenda fiada por el atajo se rechaza con mensaje claro',
  )
  // Y la vía correcta (devolución que cancela el fiado en Saldos) sí funciona:
  const rf = db.registrarDevolucionRapida({ codigo: codeOf(f1.id), montoReembolso: 400 })
  assert(saldoSaldos(database, nora) === 0 && rf.ventaEsCredito === true, 'la devolución cancela el fiado de Nora en Saldos (vía correcta para el cambio)')

  console.log(`\nOK  test-devoluciones — ${passed} verificaciones pasaron`)
  console.log('    Devoluciones en efectivo + intercambios de prendas pagadas; el fiado se cambia por devolución + venta.')
}

try {
  run()
  db.closeDb?.()
  safeDelete(TMP_DB)
  process.exit(0)
} catch (err) {
  console.error(`\nFAIL test-devoluciones: ${err.message}`)
  if (err.stack) console.error(err.stack.split('\n').slice(1, 4).join('\n'))
  try { db.closeDb?.() } catch { /* noop */ }
  safeDelete(TMP_DB)
  process.exit(1)
}
