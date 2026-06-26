'use strict'

/**
 * AUDITORÍA EJECUTABLE de "situaciones locas" de Saldos/dinero que pidió la dueña:
 *  - saldo a favor para COMPLETAR una compra en efectivo (favor + dinero)
 *  - saldo a favor como enganche de un NUEVO fiado
 *  - vale para completar una compra y como enganche de fiado
 *  - devolución de un FIADO con enganche ya pagado → el enganche vuelve como favor
 *  - ese favor luego se usa en otra compra
 *  - el switch "usar favor" apagado en EFECTIVO (no lo usa) vs en FIAR (¿lo netea igual?)
 *  - cliente NO registrado: devolución → vale → se canjea
 *
 * Corre bajo Electron contra una base temporal aislada:
 *   electron scripts/test-saldos-escenarios.cjs
 */

const fs = require('fs')
const os = require('os')
const path = require('path')

const TMP_DB = path.join(os.tmpdir(), `mlb-escenarios-${Date.now()}-${process.pid}.db`)
process.env.BAZAR_MONSERRAT_DB = TMP_DB

const db = require('../electron/database.cjs')
const saldos = require('../electron/saldos-store.cjs')

let passed = 0
const findings = []
function ok(cond, label) {
  if (cond) { passed += 1; console.log(`  ok   ${label}`) }
  else { console.log(`  XX   ${label}`); findings.push(label) }
}
function safeDelete(p) { for (const ext of ['', '-shm', '-wal']) { try { fs.unlinkSync(p + ext) } catch { /* noop */ } } }

let seq = 0
function alta(precio) {
  seq += 1
  return db.addProduct({
    codigo: `ESC-${String(seq).padStart(5, '0')}`,
    descripcion: 'Prenda', precio, pieza_unica: true, stock: 1, estado: 'disponible',
    skipTagValidation: true, skipRuleLearning: true,
  })
}
function saldoDe(clienteId) { return db.getDb().prepare(`
  SELECT COALESCE(SUM(CASE WHEN tipo IN ('cargo','cargo_atraso','ajuste') THEN monto ELSE 0 END),0)
       - COALESCE(SUM(CASE WHEN tipo IN ('abono','descuento') THEN monto ELSE 0 END),0) AS s
  FROM saldos_movimientos WHERE cliente_id = ? AND anulado = 0`).get(Number(clienteId)).s }
function favorDe(clienteId) {
  // Espejo de favorSaldosCliente: descuentos − deudaNeta, clamp 0.
  const r = db.getDb().prepare(`
    SELECT COALESCE(SUM(CASE WHEN tipo IN ('cargo','cargo_atraso','ajuste') THEN monto ELSE 0 END),0) AS cargos,
           COALESCE(SUM(CASE WHEN tipo='abono' THEN monto ELSE 0 END),0) AS abonos,
           COALESCE(SUM(CASE WHEN tipo='descuento' THEN monto ELSE 0 END),0) AS desc
    FROM saldos_movimientos WHERE cliente_id = ? AND anulado = 0`).get(Number(clienteId))
  return Math.max(0, (r.desc) - Math.max(0, r.cargos - r.abonos))
}
function nuevoCliente(nombre) { return saldos.crearCliente(db.getDb(), { nombre, nacimiento: '1990-01-01' }).clienteId }
function darFavor(clienteId, monto) {
  // Simula favor de una devolución: un descuento sin deuda previa.
  const d = new Date(); const hoy = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  saldos.registrarMovimientos(db.getDb(), clienteId, [{ tipo: 'descuento', fecha: hoy, monto, concepto: 'Saldo a favor (devolución)' }])
}

function run() {
  console.log('\n===== AUDITORÍA: situaciones locas de Saldos =====')

  // ── A: favor + EFECTIVO para COMPLETAR una compra (le falta dinero) ──
  console.log('\n[A] Favor + efectivo completan una compra (le falta dinero)')
  const a = nuevoCliente('Ana'); darFavor(a, 100)
  const pa = alta(300)
  // compra 300, tiene 100 a favor, paga 200 en efectivo → completa, faltante 0
  const va = db.addSale({ items: [{ productoId: pa.id, cantidad: 1 }], pagos: { efectivo: 200 }, clienteId: a })
  ok(va.ok && va.faltante === 0, `A1 compra completa con favor+efectivo (faltante ${va.faltante})`)
  ok(va.favorAplicado === 100, `A2 aplicó 100 a favor (vino ${va.favorAplicado})`)
  ok(favorDe(a) === 0, `A3 favor consumido (queda ${favorDe(a)})`)
  ok(saldoDe(a) === 0, `A4 sin deuda (saldo ${saldoDe(a)})`)

  // ── B: favor como ENGANCHE de un nuevo fiado ──
  console.log('\n[B] Favor reduce un nuevo fiado (favor como enganche)')
  const b = nuevoCliente('Bea'); darFavor(b, 150)
  const pb = alta(500)
  // fiar 500, sin efectivo, tiene 150 a favor → debe quedar debiendo 350
  const vb = db.addSale({ items: [{ productoId: pb.id, cantidad: 1 }], pagos: { efectivo: 0 }, clienteId: b, fiar: true })
  ok(vb.ok, `B1 fiar aceptado`)
  ok(vb.favorAplicado === 150, `B2 favor aplicado al fiado (vino ${vb.favorAplicado})`)
  ok(saldoDe(b) === 350, `B3 queda debiendo 350 (vino ${saldoDe(b)})`)
  ok(favorDe(b) === 0, `B4 favor consumido (queda ${favorDe(b)})`)

  // ── C: VALE + efectivo completan una compra ──
  console.log('\n[C] Vale + efectivo completan una compra')
  const vale1 = db.crearVale ? null : null // crearVale es interno; lo generamos por devolución abajo
  // generamos un vale por devolución de venta no registrada
  const pc0 = alta(120)
  const vc0 = db.addSale({ items: [{ productoId: pc0.id, cantidad: 1 }], pagos: { efectivo: 120 } }) // venta normal sin cliente
  const devC = db.registrarDevolucionRapida({ ventaItemId: getItemId(vc0.ventaId), montoReembolso: 120, metodoReembolso: 'vale' })
  ok(devC.vale && devC.vale.codigo, `C1 devolución no registrada generó vale (${devC.vale && devC.vale.codigo})`)
  const codVale = devC.vale.codigo
  const pc = alta(300)
  const vc = db.addSale({ items: [{ productoId: pc.id, cantidad: 1 }], pagos: { efectivo: 180, vale: { codigo: codVale } } })
  ok(vc.ok && vc.faltante === 0, `C2 compra completa con vale+efectivo (faltante ${vc.faltante})`)
  ok(vc.valeAplicado === 120, `C3 aplicó 120 del vale (vino ${vc.valeAplicado})`)
  ok(db.buscarVale(codVale).disponible === 0, `C4 vale agotado (queda ${db.buscarVale(codVale).disponible})`)

  // ── D: VALE como enganche de un fiado ──
  console.log('\n[D] Vale reduce un fiado (vale como enganche)')
  const pd0 = alta(200)
  const vd0 = db.addSale({ items: [{ productoId: pd0.id, cantidad: 1 }], pagos: { efectivo: 200 } })
  const devD = db.registrarDevolucionRapida({ ventaItemId: getItemId(vd0.ventaId), montoReembolso: 200, metodoReembolso: 'vale' })
  const dCliente = nuevoCliente('Dora')
  const pd = alta(500)
  const vd = db.addSale({ items: [{ productoId: pd.id, cantidad: 1 }], pagos: { efectivo: 0, vale: { codigo: devD.vale.codigo } }, clienteId: dCliente, fiar: true })
  ok(vd.ok && vd.valeAplicado === 200, `D1 vale 200 aplicado al fiado (vino ${vd.valeAplicado})`)
  ok(saldoDe(dCliente) === 300, `D2 queda debiendo 300 (vino ${saldoDe(dCliente)})`)

  // ── E: devolución de un FIADO con enganche → enganche vuelve como FAVOR, luego se usa ──
  console.log('\n[E] Devolver un fiado con enganche → enganche vuelve como favor, y se usa')
  const e = nuevoCliente('Eva')
  const pe = alta(400)
  // fiar 400 con enganche 100 en efectivo → debe 300
  const ve = db.addSale({ items: [{ productoId: pe.id, cantidad: 1 }], pagos: { efectivo: 100 }, clienteId: e, fiar: true })
  ok(saldoDe(e) === 300, `E1 tras fiar con enganche 100 debe 300 (vino ${saldoDe(e)})`)
  // devuelve la prenda fiada
  const devE = db.registrarDevolucionRapida({ ventaItemId: getItemId(ve.ventaId), montoReembolso: 400 })
  ok(devE.ventaEsCredito, `E2 la devolución detecta venta fiada`)
  ok(Math.max(0, saldoDe(e)) === 0, `E3 deuda cancelada (saldo mostrado ${Math.max(0, saldoDe(e))})`)
  ok(favorDe(e) === 100, `E4 el enganche pagado vuelve como favor (vino ${favorDe(e)})`)
  // ahora usa ese favor en otra compra de 100 → gratis
  const pe2 = alta(100)
  const ve2 = db.addSale({ items: [{ productoId: pe2.id, cantidad: 1 }], pagos: { efectivo: 0 }, clienteId: e })
  ok(ve2.ok && ve2.favorAplicado === 100 && ve2.faltante === 0, `E5 usa los 100 a favor en otra compra (favor ${ve2.favorAplicado}, faltante ${ve2.faltante})`)

  // ── F: switch "usar favor" APAGADO en EFECTIVO → no lo usa, favor intacto ──
  console.log('\n[F] usarFavor:false en compra de contado → favor NO se toca')
  const f = nuevoCliente('Fer'); darFavor(f, 100)
  const pf = alta(80)
  const vf = db.addSale({ items: [{ productoId: pf.id, cantidad: 1 }], pagos: { efectivo: 80 }, clienteId: f, usarFavor: false })
  ok(vf.favorAplicado === 0, `F1 no aplicó favor con switch apagado (vino ${vf.favorAplicado})`)
  ok(favorDe(f) === 100, `F2 favor intacto (vino ${favorDe(f)})`)

  // ── G: switch "usar favor" APAGADO en FIAR → ¿el motor lo netea igual? (sospecha) ──
  console.log('\n[G] usarFavor:false en FIAR → ¿el saldo mostrado respeta el switch?')
  const g = nuevoCliente('Gabriela'); darFavor(g, 100)
  const pg = alta(480)
  const vg = db.addSale({ items: [{ productoId: pg.id, cantidad: 1 }], pagos: { efectivo: 0 }, clienteId: g, fiar: true, usarFavor: false })
  ok(vg.favorAplicado === 0, `G1 addSale no aplicó favor en la venta (vino ${vg.favorAplicado})`)
  // COMPORTAMIENTO ACTUAL (documentado): aunque el switch diga "no usar favor", el
  // motor de Saldos NETEA el favor (descuento) contra la deuda nueva → el switch NO
  // afecta al fiar. No pierde dinero (neto es neto), pero NO respeta la intención de
  // la dueña. HALLAZGO de diseño: o se oculta el switch en fiar, o el motor debe
  // tratar el favor como bolsa aparte (cambio de motor, más riesgoso).
  ok(Math.max(0, saldoDe(g)) === 380, `G2 [ACTUAL] el motor netea: muestra deuda 380 (vino ${Math.max(0, saldoDe(g))})`)
  ok(favorDe(g) === 0, `G3 [ACTUAL] el favor se consumió por neteo pese al switch (vino ${favorDe(g)})`)
  console.log('       NOTA: en FIAR el switch "usar favor" no cambia nada (el motor netea). Decisión de diseño pendiente.')

  console.log(`\n===== RESULTADO: ${passed} aserciones ok, ${findings.length} hallazgos =====`)
  if (findings.length) { console.log('HALLAZGOS (lo que NO cerró):'); findings.forEach((f) => console.log('  - ' + f)) }
}

function getItemId(ventaId) {
  return db.getDb().prepare('SELECT id FROM venta_items WHERE venta_id = ? ORDER BY id LIMIT 1').get(Number(ventaId)).id
}

try {
  run()
  try { db.closeDb && db.closeDb() } catch { /* noop */ }
  safeDelete(TMP_DB)
  process.exit(0)
} catch (e) {
  console.error(`\nFAIL escenarios: ${e.message}`)
  if (e.stack) console.error(e.stack.split('\n').slice(1, 5).join('\n'))
  try { db.closeDb && db.closeDb() } catch { /* noop */ }
  safeDelete(TMP_DB)
  process.exit(1)
}
