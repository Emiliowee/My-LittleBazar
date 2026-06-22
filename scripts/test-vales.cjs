'use strict'

/**
 * Test del sistema de VALES (saldo a favor al portador, para clientes NO
 * registrados que devuelven).
 *
 * Verifica que:
 *  · devolver con metodoReembolso='vale' genera un vale por el monto (sin sacar
 *    efectivo del cajón);
 *  · buscarVale reporta el disponible;
 *  · canjear el vale en addSale baja el total y lo marca usado;
 *  · se puede usar parcialmente (queda saldo) y combinado con efectivo;
 *  · un vale agotado se rechaza.
 *
 * Corre bajo Electron contra una base temporal aislada:
 *   npm run test:vales
 */

const fs = require('fs')
const os = require('os')
const path = require('path')

const TMP_DB = path.join(os.tmpdir(), `mlb-vales-${Date.now()}-${process.pid}.db`)
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
  console.log(`  ok   ${label} (rechazó: "${threw.message.slice(0, 46)}…")`)
}
function safeDelete(p) { for (const ext of ['', '-shm', '-wal']) { try { fs.unlinkSync(p + ext) } catch { /* noop */ } } }

let seq = 0
function alta(precio) {
  seq += 1
  return db.addProduct({
    codigo: `VL-${String(seq).padStart(5, '0')}`,
    descripcion: 'Prenda', precio, pieza_unica: true, stock: 1, estado: 'disponible',
    skipTagValidation: true, skipRuleLearning: true,
  })
}
function codeOf(id) { return db.getProductById(Number(id)).codigo }

function run() {
  // ── Caso 1: devolver sin cuenta con vale → genera vale ───────────────
  console.log('\n[Caso 1] Devolución de no registrado genera un vale')
  const a = alta(300)
  db.addSale({ items: [{ productoId: a.id, cantidad: 1 }], pagos: { efectivo: 300 } })
  const dev = db.registrarDevolucionRapida({ codigo: codeOf(a.id), metodoReembolso: 'vale' })
  assert(dev.ok && dev.vale && dev.vale.codigo, 'la devolución devuelve un vale con código')
  assert(dev.vale.monto === 300, `el vale es por 300 (vino ${dev.vale.monto})`)
  const codigoVale = dev.vale.codigo

  // ── Caso 2: buscarVale reporta disponible ────────────────────────────
  console.log('\n[Caso 2] El vale queda guardado y disponible')
  const v1 = db.buscarVale(codigoVale)
  assert(v1 && v1.disponible === 300 && v1.activo, `disponible 300 y activo (vino ${v1 && v1.disponible})`)

  // ── Caso 3: canjear el vale completo en otra compra ──────────────────
  console.log('\n[Caso 3] Canjear el vale baja el total')
  const b = alta(200)
  const vb = db.addSale({ items: [{ productoId: b.id, cantidad: 1 }], pagos: { vale: { codigo: codigoVale, monto: 200 } } })
  assert(vb.ok && vb.faltante === 0, 'venta pagada con vale, sin faltante')
  assert(vb.valeAplicado === 200, `se aplicaron 200 del vale (vino ${vb.valeAplicado})`)
  const v2 = db.buscarVale(codigoVale)
  assert(v2.disponible === 100, `quedan 100 en el vale (vino ${v2.disponible})`)

  // ── Caso 4: usar lo que queda del vale + efectivo ────────────────────
  console.log('\n[Caso 4] Resto del vale combinado con efectivo')
  const c = alta(150)
  const vc = db.addSale({ items: [{ productoId: c.id, cantidad: 1 }], pagos: { efectivo: 50, vale: { codigo: codigoVale, monto: 100 } } })
  assert(vc.ok && vc.faltante === 0, 'venta cubierta con vale + efectivo')
  assert(vc.valeAplicado === 100 && vc.cambio === 0, `aplicó 100 de vale, sin cambio (vino ${vc.valeAplicado}/${vc.cambio})`)
  const v3 = db.buscarVale(codigoVale)
  assert(v3.disponible === 0 && !v3.activo && v3.estado === 'usado', 'el vale quedó agotado y marcado usado')

  // ── Caso 5: vale agotado se rechaza ──────────────────────────────────
  console.log('\n[Caso 5] Un vale agotado ya no se puede usar')
  const d = alta(80)
  assertThrows(
    () => db.addSale({ items: [{ productoId: d.id, cantidad: 1 }], pagos: { vale: { codigo: codigoVale, monto: 50 } } }),
    'saldo', 'vale agotado rechazado',
  )

  // ── Caso 6: vale inexistente se rechaza ──────────────────────────────
  console.log('\n[Caso 6] Vale inexistente se rechaza')
  const e = alta(80)
  assertThrows(
    () => db.addSale({ items: [{ productoId: e.id, cantidad: 1 }], pagos: { vale: { codigo: 'V-NOEXISTE', monto: 80 } } }),
    'no existe', 'vale inexistente rechazado',
  )

  console.log(`\nOK  test-vales — ${passed} verificaciones pasaron`)
  console.log('    Devolución sin cuenta → vale; canje total/parcial; agotado y falso rechazados.')
}

try {
  run()
  try { db.closeDb && db.closeDb() } catch { /* noop */ }
  safeDelete(TMP_DB)
  process.exit(0)
} catch (e) {
  console.error(`\nFAIL test-vales: ${e.message}`)
  if (e.stack) console.error(e.stack.split('\n').slice(1, 4).join('\n'))
  try { db.closeDb && db.closeDb() } catch { /* noop */ }
  safeDelete(TMP_DB)
  process.exit(1)
}
