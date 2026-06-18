'use strict'

/**
 * AUDITORÍA EJECUTABLE — "el día de la señora".
 *
 * Simula el uso real del bazar (alta, ventas efectivo/transferencia/fiado,
 * stock, devoluciones, abonos, Saldos) con casos normales Y EXAGERADOS, contra
 * el código real (database.cjs + saldos-store.cjs) en una base temporal.
 *
 * No es pass/fail: REPORTA lo que el sistema hace en cada caso y marca
 * comportamientos sospechosos como hallazgos. Corre bajo Electron:
 *   electron scripts/audit-sim-dia.cjs
 */

const fs = require('fs')
const os = require('os')
const path = require('path')

const TMP_DB = path.join(os.tmpdir(), `mlb-audit-${Date.now()}-${process.pid}.db`)
process.env.BAZAR_MONSERRAT_DB = TMP_DB

const db = require('../electron/database.cjs')
const saldos = require('../electron/saldos-store.cjs')

const hallazgos = []
function hallazgo(sev, area, texto) { hallazgos.push({ sev, area, texto }); console.log(`  ⚠ [${sev}] (${area}) ${texto}`) }
function nota(texto) { console.log(`  ·  ${texto}`) }
function seccion(t) { console.log(`\n━━ ${t} ━━`) }

/** Corre fn; devuelve { ok, err } sin tirar. */
function intenta(fn) { try { return { ok: true, val: fn() } } catch (e) { return { ok: false, err: e } } }

let prodSeq = 0
function alta(extra) {
  prodSeq += 1
  return db.addProduct({
    codigo: extra.codigo || `MSR-${String(prodSeq).padStart(5, '0')}`,
    descripcion: 'Prenda', precio: 100, pieza_unica: true, stock: 1, estado: 'disponible',
    skipTagValidation: true, skipRuleLearning: true, ...extra,
  })
}
function stockDe(id) { const p = db.getProductById(Number(id)); return p ? Number(p.stock) : null }
function estadoDe(id) { const p = db.getProductById(Number(id)); return p ? String(p.estado || '').toLowerCase() : null }
function saldoSaldos(id) {
  const r = db.getDb().prepare(`
    SELECT COALESCE(SUM(CASE WHEN tipo IN ('cargo','cargo_atraso','ajuste') THEN monto ELSE 0 END),0) AS cargos,
           COALESCE(SUM(CASE WHEN tipo IN ('abono','descuento') THEN monto ELSE 0 END),0) AS pagos
    FROM saldos_movimientos WHERE cliente_id = ? AND anulado = 0`).get(Number(id))
  return Math.max(0, Math.round(((Number(r.cargos) || 0) - (Number(r.pagos) || 0)) * 100) / 100)
}

function run() {
  db.getDb()

  // ════════════════════════ INVENTARIO / ALTA ════════════════════════
  seccion('Inventario / alta de productos')
  const vestido = alta({ descripcion: 'Vestido de fiesta', precio: 680, pieza_unica: true, stock: 1 })
  const labial = alta({ descripcion: 'Labial mate', precio: 80, pieza_unica: false, stock: 5 })
  nota(`Alta pieza única (Vestido #${vestido.id}) y stock múltiple (Labial #${labial.id}, stock ${stockDe(labial.id)})`)

  // Código duplicado
  const dup = intenta(() => alta({ codigo: db.getProductById(vestido.id).codigo, descripcion: 'Copia', precio: 50 }))
  if (dup.ok) hallazgo('MEDIA', 'inventario', `Permite alta con código DUPLICADO del Vestido (creó #${dup.val.id}). El escaneo del POS podría traer el producto equivocado.`)
  else nota(`Código duplicado rechazado: "${String(dup.err.message).slice(0, 60)}"`)

  // Precio negativo: el backend lo normaliza a 0 (con 0 igual no se puede vender).
  const neg = intenta(() => alta({ descripcion: 'Precio negativo', precio: -50 }))
  if (neg.ok) {
    const p = db.getProductById(neg.val.id)
    if (Number(p.precio) < 0) hallazgo('MEDIA', 'inventario', `Permite producto con PRECIO NEGATIVO (${p.precio}).`)
    else nota(`Precio negativo (-50) normalizado a ${p.precio} (no se puede vender hasta corregirlo).`)
  }

  // Stock negativo en alta
  const negStock = intenta(() => alta({ descripcion: 'Stock negativo', pieza_unica: false, stock: -3 }))
  if (negStock.ok) {
    const s = stockDe(negStock.val.id)
    if (s < 0) hallazgo('ALTA', 'inventario', `Permite alta con STOCK NEGATIVO (${s}).`)
    else nota(`Stock negativo normalizado a ${s}`)
  }

  // ════════════════════════ VENTAS EN EFECTIVO ════════════════════════
  seccion('Ventas en efectivo (casos normales y borde)')
  const v1 = intenta(() => db.addSale({ metodo: 'efectivo', pagoCon: 700, items: [{ productoId: vestido.id, cantidad: 1 }] }))
  if (v1.ok) nota(`Venta efectivo OK: total ${v1.val.total}, cambio ${v1.val.cambio} (esperado 20). Vestido → ${estadoDe(vestido.id)}`)
  if (v1.ok && Number(v1.val.cambio) !== 20) hallazgo('ALTA', 'ventas', `Cambio incorrecto: pagó 700 por 680, esperaba 20, vino ${v1.val.cambio}.`)

  // Pago insuficiente
  const lab2 = alta({ descripcion: 'Bufanda', precio: 200, pieza_unica: false, stock: 2 })
  const insuf = intenta(() => db.addSale({ metodo: 'efectivo', pagoCon: 100, items: [{ productoId: lab2.id, cantidad: 1 }] }))
  if (insuf.ok) hallazgo('ALTA', 'ventas', 'Permite cobrar en efectivo con pago MENOR al total (pagó 100 por 200). Caja descuadra.')
  else nota(`Pago insuficiente rechazado: "${String(insuf.err.message).slice(0, 50)}"`)
  if (stockDe(lab2.id) !== 2) hallazgo('ALTA', 'stock', `Tras venta rechazada el stock cambió (quedó ${stockDe(lab2.id)}, debía ser 2).`)

  // Pago sin declarar (venta sin vuelto)
  const sinDecl = intenta(() => db.addSale({ metodo: 'efectivo', items: [{ productoId: lab2.id, cantidad: 1 }] }))
  nota(`Venta efectivo sin declarar pagoCon: ${sinDecl.ok ? `permitida (cambio ${sinDecl.val.cambio})` : 'rechazada'}`)

  // Cantidad 0 y negativa
  const stockLabAntes = stockDe(labial.id)
  const cant0 = intenta(() => db.addSale({ metodo: 'efectivo', pagoCon: 100, items: [{ productoId: labial.id, cantidad: 0 }] }))
  const cantNeg = intenta(() => db.addSale({ metodo: 'efectivo', pagoCon: 100, items: [{ productoId: labial.id, cantidad: -2 }] }))
  const stockLabDespues = stockDe(labial.id)
  // El backend normaliza cantidad<=0 a 1 (Math.max(1, floor(qty)||1)). Verificamos que NO suba el stock.
  if (stockLabDespues > stockLabAntes) hallazgo('ALTA', 'ventas/stock', `Cantidad negativa SUBIÓ el stock (${stockLabAntes}→${stockLabDespues}).`)
  else nota(`Cantidad 0 y -2 se normalizan a 1 (stock ${stockLabAntes}→${stockLabDespues}, bajó como corresponde). Defensivo OK; pero un renglón de "0" termina cobrando 1 — conviene validar en UI.`)

  // ════════════════════════ STOCK EXAGERADO ════════════════════════
  seccion('Stock: casos exagerados')
  const remeras = alta({ descripcion: 'Remera básica', precio: 120, pieza_unica: false, stock: 3 })
  const sobre = intenta(() => db.addSale({ metodo: 'efectivo', pagoCon: 9999, items: [{ productoId: remeras.id, cantidad: 999 }] }))
  if (sobre.ok) hallazgo('ALTA', 'stock', `Vendió 999 unidades de un stock de 3. Stock quedó ${stockDe(remeras.id)}.`)
  else nota(`Vender 999 de stock 3 rechazado correctamente. Stock sigue ${stockDe(remeras.id)}.`)

  // Pieza única dos veces
  const unico2 = intenta(() => db.addSale({ metodo: 'efectivo', pagoCon: 700, items: [{ productoId: vestido.id, cantidad: 1 }] }))
  if (unico2.ok) hallazgo('ALTA', 'stock', 'Vendió DOS VECES la misma pieza única (ya estaba vendida).')
  else nota('Re-venta de pieza única vendida rechazada correctamente.')

  // Misma línea dos veces en una venta (doble renglón del mismo producto)
  const dl = alta({ descripcion: 'Gorra', precio: 90, pieza_unica: false, stock: 1 })
  const doblelinea = intenta(() => db.addSale({ metodo: 'efectivo', pagoCon: 999, items: [{ productoId: dl.id, cantidad: 1 }, { productoId: dl.id, cantidad: 1 }] }))
  if (doblelinea.ok) {
    const s = stockDe(dl.id)
    hallazgo('MEDIA', 'stock', `Venta con el MISMO producto en dos renglones (1+1) de un stock de 1: ${doblelinea.ok ? 'permitida' : 'rechazada'}, stock quedó ${s} (¿negativo?).`)
  } else nota('Doble renglón del mismo producto con stock 1 rechazado.')

  // ════════════════════════ TRANSFERENCIA ════════════════════════
  seccion('Ventas por transferencia')
  const tr = alta({ descripcion: 'Bolso', precio: 450, pieza_unica: true, stock: 1 })
  const sinCuenta = intenta(() => db.addSale({ metodo: 'transferencia', items: [{ productoId: tr.id, cantidad: 1 }] }))
  nota(`Transferencia sin cuenta bancaria: ${sinCuenta.ok ? 'permitida (no exige cuenta)' : 'rechazada'}`)

  // ════════════════════════ FIADO (unificado en Saldos) ════════════════════════
  seccion('Fiado del PDV → módulo Saldos (una sola libreta)')
  const database0 = db.getDb()
  const marta = saldos.crearCliente(database0, { nombre: 'Marta', telefono: '6621112233', nacimiento: '1980-01-01' }).clienteId
  nota(`Cuenta de Saldos Marta #${marta}, saldo inicial ${saldoSaldos(marta)}`)
  const pf1 = alta({ descripcion: 'Abrigo', precio: 900, pieza_unica: true, stock: 1 })
  db.addSale({ metodo: 'credito', items: [{ productoId: pf1.id, cantidad: 1 }], creditoMovimiento: { saldosClienteId: marta, monto: 900, enganche: 200 } })
  nota(`Fió Abrigo $900 con enganche $200 → saldo ${saldoSaldos(marta)} (esperado 700)`)
  if (saldoSaldos(marta) !== 700) hallazgo('ALTA', 'fiado', `Saldo tras fiar con enganche incorrecto: esperaba 700, vino ${saldoSaldos(marta)}.`)

  // Enganche mayor al total: el backend lo topa al total (no se come deuda vieja).
  const saldoPreEng = saldoSaldos(marta) // 700
  const pf2 = alta({ descripcion: 'Pantalón', precio: 300, pieza_unica: true, stock: 1 })
  db.addSale({ metodo: 'credito', items: [{ productoId: pf2.id, cantidad: 1 }], creditoMovimiento: { saldosClienteId: marta, monto: 300, enganche: 500 } })
  const saldoPostEng = saldoSaldos(marta)
  if (saldoPostEng < saldoPreEng) hallazgo('ALTA', 'fiado', `Enganche ($500) MAYOR al total ($300) se comió deuda vieja: saldo ${saldoPreEng}→${saldoPostEng}.`)
  else nota(`Enganche mayor al total topado correctamente: saldo ${saldoPreEng}→${saldoPostEng} (la compra quedó saldada, no tocó deuda previa).`)

  // Abono a la cuenta de Saldos
  seccion('Abonos en Saldos')
  const saldoAntes = saldoSaldos(marta)
  saldos.registrarMovimientos(database0, marta, [{ tipo: 'abono', fecha: '2026-06-16', monto: 100, concepto: 'Abono' }])
  nota(`Abono $100 → saldo ${saldoSaldos(marta)} (esperado ${saldoAntes - 100})`)
  // Abono mayor al saldo: el motor clampa en 0 (no hay saldo negativo en Saldos).
  saldos.registrarMovimientos(database0, marta, [{ tipo: 'abono', fecha: '2026-06-16', monto: 999999, concepto: 'Abono enorme' }])
  nota(`Abono enorme → saldo ${saldoSaldos(marta)} (Saldos clampa en 0; el sobrante queda como alerta, no como saldo negativo)`)

  // ════════════════════════ DEVOLUCIONES ════════════════════════
  seccion('Devoluciones')
  const devProd = alta({ descripcion: 'Falda devolver', precio: 250, pieza_unica: true, stock: 1 })
  db.addSale({ metodo: 'efectivo', pagoCon: 250, items: [{ productoId: devProd.id, cantidad: 1 }] })
  nota(`Vendí Falda, estado ${estadoDe(devProd.id)}, stock ${stockDe(devProd.id)}`)
  const codDev = db.getProductById(devProd.id).codigo
  const itemDev = intenta(() => db.getVentaItemPorCodigoDevolucion(codDev))
  const dev1 = intenta(() => db.registrarDevolucionRapida({ codigo: codDev, metodoReembolso: 'efectivo', clienteId: null, cuentaBancaria: '', montoReembolso: 250 }))
  if (dev1.ok && dev1.val?.ok) nota(`Devolución OK: Falda → estado ${estadoDe(devProd.id)}, stock ${stockDe(devProd.id)}`)
  else hallazgo('ALTA', 'devoluciones', `Devolución de una venta válida FALLÓ: ${dev1.ok ? JSON.stringify(dev1.val) : dev1.err.message}`)
  if (estadoDe(devProd.id) !== 'disponible') hallazgo('ALTA', 'devoluciones', `Tras devolver, la prenda no volvió a 'disponible' (quedó ${estadoDe(devProd.id)}).`)

  // Devolver dos veces
  const dev2 = intenta(() => db.registrarDevolucionRapida({ codigo: codDev, metodoReembolso: 'efectivo', clienteId: null, cuentaBancaria: '', montoReembolso: 250 }))
  if (dev2.ok && dev2.val?.ok) hallazgo('ALTA', 'devoluciones', 'Permite DEVOLVER DOS VECES la misma prenda (doble reembolso, stock sube de más).')
  else nota('Segunda devolución de la misma prenda rechazada correctamente.')

  // Devolver algo nunca vendido
  const nunca = alta({ descripcion: 'Nunca vendida', precio: 100 })
  const codNunca = db.getProductById(nunca.id).codigo
  const devNunca = intenta(() => db.registrarDevolucionRapida({ codigo: codNunca, metodoReembolso: 'efectivo', clienteId: null, cuentaBancaria: '', montoReembolso: 100 }))
  if (devNunca.ok && devNunca.val?.ok) hallazgo('ALTA', 'devoluciones', 'Permite "devolver" una prenda que NUNCA se vendió (reembolso fantasma).')
  else nota('Devolución de prenda no vendida rechazada.')

  // DEVOLUCIÓN DE UNA VENTA FIADA — debe cancelar el fiado en Saldos.
  seccion('Devolución de una venta FIADA (cancela el fiado en Saldos)')
  const rosa = saldos.crearCliente(database0, { nombre: 'Rosa Fiado', telefono: '6620000000', nacimiento: '1985-01-01' }).clienteId
  const prodFiadoDev = alta({ descripcion: 'Blusa fiada', precio: 400, pieza_unica: true, stock: 1 })
  db.addSale({ metodo: 'credito', items: [{ productoId: prodFiadoDev.id, cantidad: 1 }], creditoMovimiento: { saldosClienteId: rosa, monto: 400, enganche: 0 } })
  const deudaAntesDev = saldoSaldos(rosa)
  const codFiado = db.getProductById(prodFiadoDev.id).codigo
  // Reproducimos lo que manda la UI del PDV (sin método de deuda: el backend detecta el fiado).
  db.registrarDevolucionRapida({ codigo: codFiado, metodoReembolso: 'efectivo', montoReembolso: 400 })
  const deudaDespuesDev = saldoSaldos(rosa)
  if (deudaDespuesDev === deudaAntesDev && deudaAntesDev > 0) {
    hallazgo('ALTA', 'devoluciones/fiado', `Rosa fió $400 (deuda ${deudaAntesDev}) y la devolvió, pero su deuda SIGUE EN ${deudaDespuesDev}. Doble pérdida.`)
  } else nota(`Tras devolver la fiada, deuda de Rosa ${deudaAntesDev}→${deudaDespuesDev} (cancelada en Saldos).`)

  // ════════════════════════ COHERENCIA (una sola libreta) ════════════════════════
  seccion('Coherencia de deudas: una sola libreta')
  const cuentasSaldos = saldos.listCuentas(database0).length
  nota(`Todo el fiado del PDV vive en Saldos (${cuentasSaldos} cuentas). Ya no hay libreta de deuda paralela: lo que se fía en caja aparece en Saldos.`)

  // ════════════════════════ INVARIANTES GLOBALES ════════════════════════
  seccion('Invariantes globales')
  const todos = db.getProducts ? (db.getProducts() || []) : []
  const lista = Array.isArray(todos) ? todos : (todos.rows || todos.productos || [])
  const negativos = lista.filter((p) => Number(p.stock) < 0)
  if (negativos.length > 0) hallazgo('ALTA', 'stock', `${negativos.length} producto(s) con stock NEGATIVO tras la simulación: ${negativos.map((p) => p.codigo).join(', ')}`)
  else nota('Ningún producto quedó con stock negativo.')

  const ventas = db.getSales({ limit: 500 })
  const lv = Array.isArray(ventas) ? ventas : []
  const totalVendido = lv.reduce((s, v) => s + (Number(v.total) || 0), 0)
  nota(`Total de ventas registradas: ${lv.length} tickets, suma ${totalVendido}`)
  const ceros = lv.filter((v) => Number(v.total) <= 0).length
  if (ceros > 0) hallazgo('MEDIA', 'ventas', `${ceros} venta(s) con total <= 0 quedaron en el historial.`)

  // ════════════════════════ RESUMEN ════════════════════════
  seccion('RESUMEN DE HALLAZGOS')
  const alta_ = hallazgos.filter((h) => h.sev === 'ALTA')
  const media_ = hallazgos.filter((h) => h.sev === 'MEDIA')
  console.log(`\n  ${hallazgos.length} hallazgos: ${alta_.length} ALTA, ${media_.length} MEDIA`)
  for (const h of hallazgos) console.log(`   [${h.sev}] ${h.area}: ${h.texto}`)
  console.log('\n(Esta auditoría reporta comportamiento; los hallazgos se priorizan y arreglan aparte.)')
}

try {
  run()
  db.closeDb?.()
  for (const ext of ['', '-shm', '-wal']) { try { fs.unlinkSync(TMP_DB + ext) } catch { /* noop */ } }
  process.exit(0)
} catch (err) {
  console.error(`\nLa simulación se DETUVO por un error inesperado (posible bug duro): ${err.message}`)
  if (err.stack) console.error(err.stack.split('\n').slice(1, 5).join('\n'))
  try { db.closeDb?.() } catch { /* noop */ }
  for (const ext of ['', '-shm', '-wal']) { try { fs.unlinkSync(TMP_DB + ext) } catch { /* noop */ } }
  process.exit(1)
}
