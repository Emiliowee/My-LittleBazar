'use strict'

/**
 * Test end-to-end del CRÉDITO (fiado) — el corazón del negocio de la clienta.
 *
 * Desde la unificación, fiar en el PDV escribe en el módulo **Saldos**
 * (saldos_clientes / saldos_movimientos): NO existe ya una libreta de crédito
 * aparte. Verifica que la venta fiada y el movimiento de Saldos sean atómicos
 * y que el saldo quede exacto, con y sin enganche. Ejercita el código real de
 * electron/database.cjs contra una base temporal aislada (BAZAR_MONSERRAT_DB).
 *
 * Por qué importa: fiar es lo que más le hacen a la señora. Si el saldo queda
 * mal aunque sea por un peso, el negocio pierde plata o pierde la confianza.
 *
 * Uso:  npm run test:credito
 */

const fs = require('fs')
const os = require('os')
const path = require('path')

const TMP_DB = path.join(os.tmpdir(), `mlb-credito-test-${Date.now()}-${process.pid}.db`)
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
  console.log(`  ok   ${label}`)
}
function safeDelete(p) { for (const ext of ['', '-shm', '-wal']) { try { fs.unlinkSync(p + ext) } catch { /* noop */ } } }

function saldoDe(database, id) {
  const r = database.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN tipo IN ('cargo','cargo_atraso','ajuste') THEN monto ELSE 0 END), 0) AS cargos,
      COALESCE(SUM(CASE WHEN tipo IN ('abono','descuento') THEN monto ELSE 0 END), 0) AS pagos
    FROM saldos_movimientos WHERE cliente_id = ? AND anulado = 0
  `).get(Number(id))
  return Math.max(0, Math.round(((Number(r.cargos) || 0) - (Number(r.pagos) || 0)) * 100) / 100)
}
function movsDe(database, id) {
  return database.prepare('SELECT tipo FROM saldos_movimientos WHERE cliente_id = ? AND anulado = 0').all(Number(id))
}
function nuevoProducto(precio) {
  return {
    codigo: `C-${Math.random().toString(36).slice(2, 9).toUpperCase()}`,
    descripcion: 'Producto fiado', precio, pieza_unica: true, stock: 1, estado: 'disponible',
    skipTagValidation: true, skipRuleLearning: true,
  }
}

function run() {
  const database = db.getDb()

  // ── Cuenta nueva arranca en cero ─────────────────────────────────────
  console.log('\n[Caso 1] Alta de cuenta de Saldos y saldo inicial')
  const cli = saldos.crearCliente(database, { nombre: 'Marta Prueba', telefono: '5512345678', nacimiento: '1980-01-01' }).clienteId
  assert(Number(cli) > 0, 'crearCliente devuelve id')
  assert(saldoDe(database, cli) === 0, 'cuenta nueva arranca con saldo 0')

  // ── Venta a crédito CON enganche ─────────────────────────────────────
  console.log('\n[Caso 2] Venta fiada con enganche')
  const p1 = db.addProduct(nuevoProducto(300))
  const v1 = db.addSale({
    metodo: 'credito',
    items: [{ productoId: Number(p1.id), cantidad: 1 }],
    creditoMovimiento: { saldosClienteId: cli, monto: 300, enganche: 100, engancheMetodo: 'efectivo' },
  })
  assert(v1 && v1.ok === true, 'addSale a crédito devuelve ok')
  assert(saldoDe(database, cli) === 200, `saldo = total - enganche = 300 - 100 = 200 (vino ${saldoDe(database, cli)})`)

  // ── Venta a crédito SIN enganche ─────────────────────────────────────
  console.log('\n[Caso 3] Venta fiada sin enganche (omitible)')
  const p2 = db.addProduct(nuevoProducto(150))
  db.addSale({
    metodo: 'credito',
    items: [{ productoId: Number(p2.id), cantidad: 1 }],
    creditoMovimiento: { saldosClienteId: cli, monto: 150, enganche: 0 },
  })
  assert(saldoDe(database, cli) === 350, `saldo acumula el total completo: 200 + 150 = 350 (vino ${saldoDe(database, cli)})`)

  // ── Los movimientos quedaron en Saldos ───────────────────────────────
  console.log('\n[Caso 4] Trazabilidad de movimientos en Saldos')
  const lista = movsDe(database, cli)
  const cargos = lista.filter((m) => m.tipo === 'cargo').length
  const abonos = lista.filter((m) => m.tipo === 'abono').length
  assert(cargos === 2, `2 cargos registrados (vino ${cargos})`)
  assert(abonos === 1, `1 abono (el enganche del caso 2) (vino ${abonos})`)

  // ── Edge: crédito sin cuenta de Saldos válida es rechazado ───────────
  console.log('\n[Caso 5] Edge: crédito sin cuenta válida')
  const p3 = db.addProduct(nuevoProducto(100))
  assertThrows(
    () => db.addSale({
      metodo: 'credito',
      items: [{ productoId: Number(p3.id), cantidad: 1 }],
      creditoMovimiento: { saldosClienteId: 0, monto: 100 },
    }),
    'cliente',
    'rechaza venta a crédito sin cuenta de Saldos',
  )

  console.log(`\nOK  test-flujo-credito — ${passed} verificaciones pasaron`)
  console.log('    El fiado vive en Saldos (cargo + abono), atómico y exacto.')
}

try {
  run()
  db.closeDb?.()
  safeDelete(TMP_DB)
  process.exit(0)
} catch (err) {
  console.error(`\nFAIL test-flujo-credito: ${err.message}`)
  if (err.stack) console.error(err.stack.split('\n').slice(1, 4).join('\n'))
  try { db.closeDb?.() } catch { /* noop */ }
  safeDelete(TMP_DB)
  process.exit(1)
}
