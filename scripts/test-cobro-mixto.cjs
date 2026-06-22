'use strict'

/**
 * Test del COBRO NUEVO en el PDV: pago mixto (efectivo + transferencia),
 * saldo a favor aplicado automáticamente, y fiar con enganche — todo con el
 * contrato nuevo `pagos: { efectivo, transferencia }` + `clienteId` + `fiar`.
 *
 * Verifica que:
 *  · una venta mixta pagada guarda el desglose y NO toca Saldos;
 *  · el saldo a favor previo baja lo que se paga hoy (sin casilla manual);
 *  · fiar deja el resto a cuenta como deuda exacta;
 *  · pagar de menos sin «fiar» se rechaza.
 *
 * Corre bajo Electron contra una base temporal aislada:
 *   npm run test:cobro
 */

const fs = require('fs')
const os = require('os')
const path = require('path')

const TMP_DB = path.join(os.tmpdir(), `mlb-cobro-mixto-${Date.now()}-${process.pid}.db`)
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
function alta(precio) {
  seq += 1
  return db.addProduct({
    codigo: `CM-${String(seq).padStart(5, '0')}`,
    descripcion: 'Prenda', precio, pieza_unica: true, stock: 1, estado: 'disponible',
    skipTagValidation: true, skipRuleLearning: true,
  })
}
function ventaRow(database, id) {
  return database.prepare('SELECT metodo, monto_efectivo, monto_transferencia, monto_credito, saldos_cliente_id, cambio FROM ventas WHERE id = ?').get(Number(id))
}
function saldoDe(database, clienteId) {
  const r = database.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN tipo IN ('cargo','cargo_atraso','ajuste') THEN monto ELSE 0 END), 0) AS cargos,
      COALESCE(SUM(CASE WHEN tipo IN ('abono','descuento') THEN monto ELSE 0 END), 0) AS pagos
    FROM saldos_movimientos WHERE cliente_id = ? AND anulado = 0
  `).get(Number(clienteId))
  return Math.round(((Number(r.cargos) || 0) - (Number(r.pagos) || 0)) * 100) / 100
}

function run() {
  const database = db.getDb()
  const hoy = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })()

  // ── Caso 1: pago mixto (efectivo + transferencia), sin cuenta de Saldos ──
  console.log('\n[Caso 1] Pago mixto efectivo + transferencia (venta pagada)')
  const p1 = alta(480)
  const v1 = db.addSale({ items: [{ productoId: p1.id, cantidad: 1 }], pagos: { efectivo: 300, transferencia: 180 }, cuentaBancaria: 'BBVA' })
  assert(v1.ok && v1.faltante === 0, 'venta mixta confirmada sin faltante')
  assert(v1.metodo === 'mixto', `metodo = mixto (vino ${v1.metodo})`)
  assert(v1.saldosClienteId == null, 'no toca Saldos (venta pagada)')
  const r1 = ventaRow(database, v1.ventaId)
  assert(r1.monto_efectivo === 300 && r1.monto_transferencia === 180, `desglose guardado 300/180 (vino ${r1.monto_efectivo}/${r1.monto_transferencia})`)
  assert(r1.monto_credito === 0 && r1.saldos_cliente_id == null, 'sin crédito ni cuenta')

  // ── Caso 2: transferencia sin cuenta bancaria se rechaza ──
  console.log('\n[Caso 2] Transferencia sin cuenta bancaria se rechaza')
  const p2 = alta(100)
  assertThrows(
    () => db.addSale({ items: [{ productoId: p2.id, cantidad: 1 }], pagos: { transferencia: 100 } }),
    'cuenta bancaria', 'transferencia sin cuenta se rechaza',
  )

  // ── Caso 3: saldo a favor previo se aplica AUTOMÁTICAMENTE ──
  console.log('\n[Caso 3] Saldo a favor previo baja lo que se paga hoy')
  const ana = saldos.crearCliente(database, { nombre: 'Ana', nacimiento: '1985-03-03' }).clienteId
  saldos.registrarMovimientos(database, ana, [{ tipo: 'abono', fecha: hoy, monto: 100, medio: 'efectivo', concepto: 'Saldo a favor inicial' }])
  assert(saldoDe(database, ana) === -100, 'Ana arranca con 100 a favor (saldo neto -100)')
  const p3 = alta(480)
  const v3 = db.addSale({ items: [{ productoId: p3.id, cantidad: 1 }], pagos: { efectivo: 380 }, clienteId: ana })
  assert(v3.ok && v3.favorAplicado === 100 && v3.faltante === 0, `usó 100 a favor, faltante 0 (vino favor ${v3.favorAplicado}, faltante ${v3.faltante})`)
  assert(saldoDe(database, ana) === 0, `Ana queda en 0 (sin deuda ni favor), vino ${saldoDe(database, ana)}`)

  // ── Caso 4: fiar con enganche (contrato nuevo) deja deuda exacta ──
  console.log('\n[Caso 4] Fiar con enganche por el contrato nuevo')
  const luz = saldos.crearCliente(database, { nombre: 'Luz', nacimiento: '1990-09-09' }).clienteId
  const p4 = alta(200)
  const v4 = db.addSale({ items: [{ productoId: p4.id, cantidad: 1 }], pagos: { efectivo: 50 }, clienteId: luz, fiar: true })
  assert(v4.ok && v4.faltante === 150, `faltante 150 (vino ${v4.faltante})`)
  assert(saldoDe(database, luz) === 150, `Luz debe 150 (vino ${saldoDe(database, luz)})`)

  // ── Caso 5: pagar de menos SIN fiar se rechaza ──
  console.log('\n[Caso 5] Pago insuficiente sin «fiar» se rechaza')
  const noe = saldos.crearCliente(database, { nombre: 'Noe', nacimiento: '1992-02-02' }).clienteId
  const p5 = alta(300)
  assertThrows(
    () => db.addSale({ items: [{ productoId: p5.id, cantidad: 1 }], pagos: { efectivo: 100 }, clienteId: noe, fiar: false }),
    'fiar', 'pago insuficiente sin fiar se rechaza',
  )

  console.log(`\nOK  test-cobro-mixto — ${passed} verificaciones pasaron`)
  console.log('    Pago mixto + saldo a favor automático + fiar, todo con el contrato nuevo.')
}

try {
  run()
  try { db.closeDb && db.closeDb() } catch { /* noop */ }
  safeDelete(TMP_DB)
  process.exit(0)
} catch (e) {
  console.error(`\nFAIL test-cobro-mixto: ${e.message}`)
  if (e.stack) console.error(e.stack.split('\n').slice(1, 4).join('\n'))
  try { db.closeDb && db.closeDb() } catch { /* noop */ }
  safeDelete(TMP_DB)
  process.exit(1)
}
