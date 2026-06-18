'use strict'

/**
 * Test end-to-end del FIADO UNIFICADO: fiar en el PDV escribe en el módulo
 * Saldos (saldos_clientes / saldos_movimientos), no en la libreta vieja.
 *
 * Verifica que:
 *  · fiar crea un `cargo` (y un `abono` por el enganche) en Saldos, atómico
 *    con la venta;
 *  · el saldo calculado (cargos − pagos, clamp 0) cuadra;
 *  · devolver una prenda fiada cancela el fiado en Saldos (un `descuento`),
 *    y el enganche pagado de más vuelve como excedente en efectivo;
 *  · si la venta a crédito falla, NO queda cargo suelto (atomicidad).
 *
 * Corre bajo Electron contra una base temporal aislada. Uso:
 *   npm run test:fiado-saldos
 */

const fs = require('fs')
const os = require('os')
const path = require('path')

const TMP_DB = path.join(os.tmpdir(), `mlb-fiado-saldos-${Date.now()}-${process.pid}.db`)
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
  console.log(`  ok   ${label} (rechazó: "${threw.message.slice(0, 48)}…")`)
}
function safeDelete(p) { for (const ext of ['', '-shm', '-wal']) { try { fs.unlinkSync(p + ext) } catch { /* noop */ } } }

let seq = 0
function alta(precio, extra = {}) {
  seq += 1
  return db.addProduct({
    codigo: `FS-${String(seq).padStart(5, '0')}`,
    descripcion: 'Prenda', precio, pieza_unica: true, stock: 1, estado: 'disponible',
    skipTagValidation: true, skipRuleLearning: true, ...extra,
  })
}
function codeOf(id) { return db.getProductById(Number(id)).codigo }
function estadoDe(id) { return String(db.getProductById(Number(id)).estado || '').toLowerCase() }

function saldoDe(database, clienteId) {
  const r = database.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN tipo IN ('cargo','cargo_atraso','ajuste') THEN monto ELSE 0 END), 0) AS cargos,
      COALESCE(SUM(CASE WHEN tipo IN ('abono','descuento') THEN monto ELSE 0 END), 0) AS pagos
    FROM saldos_movimientos WHERE cliente_id = ? AND anulado = 0
  `).get(Number(clienteId))
  return Math.max(0, Math.round(((Number(r.cargos) || 0) - (Number(r.pagos) || 0)) * 100) / 100)
}
function movimientosDe(database, clienteId) {
  return database.prepare('SELECT tipo, monto FROM saldos_movimientos WHERE cliente_id = ? AND anulado = 0 ORDER BY id').all(Number(clienteId))
}

function run() {
  const database = db.getDb()

  // ── Caso 1: fiar escribe en Saldos (cargo) ───────────────────────────
  console.log('\n[Caso 1] Fiar sin enganche → cargo en Saldos')
  const rosa = saldos.crearCliente(database, { nombre: 'Rosa', nacimiento: '1980-05-05' }).clienteId
  assert(saldoDe(database, rosa) === 0, 'cuenta nueva arranca en 0')
  const p1 = alta(400)
  const v1 = db.addSale({ metodo: 'credito', items: [{ productoId: p1.id, cantidad: 1 }], creditoMovimiento: { saldosClienteId: rosa, monto: 400, enganche: 0 } })
  assert(v1.ok && v1.saldosClienteId === rosa, 'addSale devuelve la cuenta de Saldos')
  assert(saldoDe(database, rosa) === 400, `Rosa debe 400 en Saldos (vino ${saldoDe(database, rosa)})`)
  const movs1 = movimientosDe(database, rosa)
  assert(movs1.length === 1 && movs1[0].tipo === 'cargo' && movs1[0].monto === 400, 'se creó un único movimiento cargo de 400')

  // ── Caso 2: fiar con enganche → cargo + abono ────────────────────────
  console.log('\n[Caso 2] Fiar con enganche → cargo + abono')
  const luz = saldos.crearCliente(database, { nombre: 'Luz', nacimiento: '1979-01-01' }).clienteId
  const p2 = alta(500)
  db.addSale({ metodo: 'credito', items: [{ productoId: p2.id, cantidad: 1 }], creditoMovimiento: { saldosClienteId: luz, monto: 500, enganche: 150 } })
  assert(saldoDe(database, luz) === 350, `Luz debe 350 (500 - 150 enganche), vino ${saldoDe(database, luz)}`)
  const movs2 = movimientosDe(database, luz)
  assert(movs2.some((m) => m.tipo === 'cargo' && m.monto === 500), 'hay cargo de 500')
  assert(movs2.some((m) => m.tipo === 'abono' && m.monto === 150), 'hay abono (enganche) de 150')

  // ── Caso 3: cuenta de Saldos inexistente es rechazada ────────────────
  console.log('\n[Caso 3] Fiar a una cuenta que no existe se rechaza')
  const p3 = alta(100)
  assertThrows(
    () => db.addSale({ metodo: 'credito', items: [{ productoId: p3.id, cantidad: 1 }], creditoMovimiento: { saldosClienteId: 99999, monto: 100 } }),
    'no existe',
    'cuenta de Saldos inexistente rechazada',
  )
  assert(estadoDe(p3.id) === 'disponible', 'tras el rechazo la prenda sigue disponible (atómico)')

  // ── Caso 4: atomicidad — si la venta falla, no queda cargo ───────────
  console.log('\n[Caso 4] Atomicidad: venta de pieza ya vendida no deja cargo')
  const bea = saldos.crearCliente(database, { nombre: 'Bea', nacimiento: '1985-02-02' }).clienteId
  const p4 = alta(300)
  db.addSale({ metodo: 'efectivo', pagoCon: 300, items: [{ productoId: p4.id, cantidad: 1 }] }) // ya vendida
  assertThrows(
    () => db.addSale({ metodo: 'credito', items: [{ productoId: p4.id, cantidad: 1 }], creditoMovimiento: { saldosClienteId: bea, monto: 300 } }),
    'vendido',
    'fiar una pieza ya vendida se rechaza',
  )
  assert(saldoDe(database, bea) === 0 && movimientosDe(database, bea).length === 0, 'Bea no quedó con ningún movimiento (no hay cargo huérfano)')

  // ── Caso 5: devolver una fiada SIN enganche cancela el fiado ─────────
  console.log('\n[Caso 5] Devolver fiada sin enganche → descuento que cancela')
  const datos5 = db.getVentaItemPorCodigoDevolucion(codeOf(p1.id))
  assert(datos5.credito && datos5.credito.saldosClienteId === rosa, 'getVentaItem detecta la cuenta de Saldos de la fiada')
  assert(datos5.credito.saldoPendiente === 400 && datos5.credito.enganchePagado === 0, 'reporta saldo 400 y enganche 0')
  const r5 = db.registrarDevolucionRapida({ codigo: codeOf(p1.id), montoReembolso: 400 })
  assert(r5.ventaEsCredito === true && r5.deudaCancelada === 400, 'cancela 400 del fiado de Rosa')
  assert(saldoDe(database, rosa) === 0, `Rosa queda en 0 (vino ${saldoDe(database, rosa)})`)
  assert(Number(r5.excedente) === 0, 'sin enganche no hay excedente (no sale plata del cajón)')
  assert(movimientosDe(database, rosa).some((m) => m.tipo === 'descuento' && m.monto === 400), 'quedó un descuento de 400 en su cuenta')

  // ── Caso 6: devolver fiada CON enganche → excedente en efectivo ──────
  console.log('\n[Caso 6] Devolver fiada con enganche → cancela deuda + excedente efectivo')
  const r6 = db.registrarDevolucionRapida({ codigo: codeOf(p2.id), montoReembolso: 500, excedenteMetodo: 'efectivo' })
  assert(saldoDe(database, luz) === 0, `Luz queda en 0 (vino ${saldoDe(database, luz)})`)
  assert(Number(r6.deudaCancelada) === 350, `cancela 350 (lo que aún debía), vino ${r6.deudaCancelada}`)
  assert(Number(r6.excedente) === 150 && r6.excedenteMetodo === 'efectivo', `devuelve 150 en efectivo (el enganche), vino ${r6.excedente} ${r6.excedenteMetodo}`)

  // ── Caso 7: fiar de a varios + devolver uno baja solo su parte ───────
  console.log('\n[Caso 7] Fía dos prendas, devuelve una')
  const ana = saldos.crearCliente(database, { nombre: 'Ana', nacimiento: '1990-03-03' }).clienteId
  const a = alta(300), b = alta(500)
  db.addSale({ metodo: 'credito', items: [{ productoId: a.id, cantidad: 1 }], creditoMovimiento: { saldosClienteId: ana, monto: 300, enganche: 0 } })
  db.addSale({ metodo: 'credito', items: [{ productoId: b.id, cantidad: 1 }], creditoMovimiento: { saldosClienteId: ana, monto: 500, enganche: 0 } })
  assert(saldoDe(database, ana) === 800, 'Ana debe 800 por las dos')
  db.registrarDevolucionRapida({ codigo: codeOf(a.id), montoReembolso: 300 })
  assert(saldoDe(database, ana) === 500, `tras devolver la de 300 debe 500 (vino ${saldoDe(database, ana)})`)

  console.log(`\nOK  test-fiado-saldos — ${passed} verificaciones pasaron`)
  console.log('    El fiado del PDV vive en Saldos: una sola libreta, atómica y exacta.')
}

try {
  run()
  db.closeDb?.()
  safeDelete(TMP_DB)
  process.exit(0)
} catch (err) {
  console.error(`\nFAIL test-fiado-saldos: ${err.message}`)
  if (err.stack) console.error(err.stack.split('\n').slice(1, 4).join('\n'))
  try { db.closeDb?.() } catch { /* noop */ }
  safeDelete(TMP_DB)
  process.exit(1)
}
