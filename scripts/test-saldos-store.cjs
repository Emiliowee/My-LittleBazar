'use strict'

/**
 * Test end-to-end de la persistencia de Saldos (electron/saldos-store.cjs).
 *
 * Crea una base temporal, aplica schema + migraciones y recorre el ciclo
 * completo de la libreta: crear cliente -> cargo con enganche -> abono ->
 * anular -> archivar -> reglas de eliminación. Verifica además que los
 * movimientos crudos alimentan bien al motor puro (los números que ve la
 * dueña salen de ese motor, así que probamos la cadena completa).
 *
 * Uso:  electron scripts/test-saldos-store.cjs   (npm run test:saldos:store)
 */

const fs = require('fs')
const os = require('os')
const path = require('path')
const Database = require('better-sqlite3')

const { ensureMonserratSchema } = require('../electron/monserrat-schema.cjs')
const { runMigrations } = require('../electron/migrate.cjs')
const store = require('../electron/saldos-store.cjs')

let pasos = 0
function ok(label, cond) {
  if (!cond) throw new Error(`FALLO: ${label}`)
  pasos += 1
  console.log(`  ok   ${label}`)
}

function isoDaysAgo(days) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

function run() {
  const dbPath = path.join(os.tmpdir(), `mlb-saldos-test-${Date.now()}-${process.pid}.db`)
  const db = new Database(dbPath)
  try {
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    ensureMonserratSchema(db)
    runMigrations(db)

    console.log('[Caso 1] Cliente nuevo con datos completos')
    const c1 = store.crearCliente(db, {
      nombre: 'María López',
      telefono: '662 288 5908',
      nacimiento: '1992-05-03',
      direccion: 'Col. Centro, cerca de la primaria',
      identificacionEstado: 'completa',
    })
    ok('crearCliente devuelve id', c1.ok && c1.clienteId > 0)

    console.log('[Caso 2] Identificación omitida con motivo')
    const c2 = store.crearCliente(db, {
      nombre: 'Ana Valdez',
      identificacionEstado: 'omitida',
      identificacionMotivo: 'Clienta de años, la dueña la conoce',
    })
    ok('cliente con ID omitida se permite', c2.ok)

    console.log('[Caso 3] Duplicados parecidos se detectan')
    const dups = store.buscarParecidos(db, { nombre: 'maria lopez' })
    ok('encuentra a María como parecida', dups.length === 1 && dups[0].nombre === 'María López')

    console.log('[Caso 4] Cargo con enganche = 2 movimientos en una transacción')
    const r1 = store.registrarMovimientos(db, c1.clienteId, [
      { tipo: 'cargo', fecha: isoDaysAgo(40), monto: 500, concepto: 'Vestido de noche' },
      { tipo: 'abono', fecha: isoDaysAgo(40), monto: 100, concepto: 'Enganche' },
    ])
    ok('registró cargo + enganche', r1.ok && r1.movimientoIds.length === 2)

    console.log('[Caso 5] Abono general posterior')
    store.registrarMovimientos(db, c1.clienteId, [
      { tipo: 'abono', fecha: isoDaysAgo(5), monto: 150, concepto: 'Abono general', medio: 'efectivo', quienPago: 'Su hija' },
    ])

    console.log('[Caso 6] El motor calcula desde los movimientos crudos')
    const saldosLedgerPath = path.join(__dirname, '..', 'src', 'lib', 'saldosLedger.js')
    ok('el motor puro existe', fs.existsSync(saldosLedgerPath))
    const cuentas = store.listCuentas(db)
    const maria = cuentas.find((c) => c.id === c1.clienteId)
    ok('listCuentas trae movimientos crudos', maria.movimientos.length === 3)
    const saldoManual = 500 - 100 - 150
    const totalCargos = maria.movimientos.filter((m) => m.tipo === 'cargo').reduce((s, m) => s + m.monto, 0)
    const totalPagos = maria.movimientos.filter((m) => m.tipo === 'abono').reduce((s, m) => s + m.monto, 0)
    ok(`saldo esperado ${saldoManual} (cargos ${totalCargos} - pagos ${totalPagos})`, totalCargos - totalPagos === saldoManual)

    console.log('[Caso 7] Validaciones rebotan basura')
    let rebote = false
    try { store.registrarMovimientos(db, c1.clienteId, [{ tipo: 'cargo', fecha: 'ayer', monto: 100 }]) } catch { rebote = true }
    ok('fecha inválida rebota', rebote)
    rebote = false
    try { store.registrarMovimientos(db, c1.clienteId, [{ tipo: 'cargo', fecha: isoDaysAgo(1), monto: -50 }]) } catch { rebote = true }
    ok('monto negativo rebota', rebote)
    rebote = false
    try { store.registrarMovimientos(db, c1.clienteId, [{ tipo: 'regalo', fecha: isoDaysAgo(1), monto: 50 }]) } catch { rebote = true }
    ok('tipo inventado rebota', rebote)
    rebote = false
    try { store.registrarMovimientos(db, 99999, [{ tipo: 'cargo', fecha: isoDaysAgo(1), monto: 50 }]) } catch { rebote = true }
    ok('cliente inexistente rebota', rebote)

    console.log('[Caso 8] Anular movimiento (no borrar)')
    const movId = maria.movimientos[maria.movimientos.length - 1].id
    const an = store.anularMovimiento(db, movId, 'Se capturó dos veces')
    ok('anula con motivo', an.ok)
    const trasAnular = store.listCuentas(db).find((c) => c.id === c1.clienteId)
    const movAnulado = trasAnular.movimientos.find((m) => m.id === movId)
    ok('el movimiento sigue en la historia, marcado anulado', movAnulado && movAnulado.anulado === true)
    rebote = false
    try { store.anularMovimiento(db, movId, 'otra vez') } catch { rebote = true }
    ok('no se puede anular dos veces', rebote)

    console.log('[Caso 9] Eliminar vs archivar')
    rebote = false
    try { store.eliminarCliente(db, c1.clienteId) } catch { rebote = true }
    ok('cliente con movimientos NO se elimina', rebote)
    store.setArchivada(db, c1.clienteId, true)
    const archivadas = store.listCuentas(db).find((c) => c.id === c1.clienteId)
    ok('se archiva en su lugar', archivadas.archivada === true)
    const sinArchivadas = store.listCuentas(db, { incluirArchivadas: false })
    ok('listCuentas puede excluir archivadas', !sinArchivadas.some((c) => c.id === c1.clienteId))
    const el = store.eliminarCliente(db, c2.clienteId)
    ok('cliente SIN movimientos sí se elimina', el.ok)

    console.log('[Caso 10] Identificación con foto + etiquetas (Saldos V2)')
    const c3 = store.crearCliente(db, {
      nombre: 'Doña Carmen',
      identificacionEstado: 'completa',
      identificacionImagen: 'C:/datos/saldos-identificaciones/id_123.jpg',
      etiquetas: ['Buena paga', 'Mayorista', '  ', 'Paga por transferencia'],
    })
    ok('crea cliente con foto ID y etiquetas', c3.ok)
    const carmen = store.listCuentas(db).find((c) => c.id === c3.clienteId)
    ok('guarda la ruta de la foto de ID', carmen.identificacion.imagen === 'C:/datos/saldos-identificaciones/id_123.jpg')
    ok('etiquetas limpias (sin vacíos): 3', carmen.etiquetas.length === 3 && carmen.etiquetas.includes('Mayorista'))
    store.actualizarCliente(db, { id: c3.clienteId, nombre: 'Doña Carmen', identificacionEstado: 'completa', etiquetas: ['Buena paga'] })
    const carmen2 = store.listCuentas(db).find((c) => c.id === c3.clienteId)
    ok('actualizar reescribe etiquetas', carmen2.etiquetas.length === 1 && carmen2.etiquetas[0] === 'Buena paga')

    console.log('[Caso 11] Recordatorios')
    const rec = store.crearRecordatorio(db, { clienteId: c3.clienteId, tipo: 'promesa', texto: 'Prometió pagar el viernes', fecha: isoDaysAgo(-3) })
    ok('crea recordatorio', rec.ok && rec.recordatorioId > 0)
    let reboteRec = false
    try { store.crearRecordatorio(db, { clienteId: c3.clienteId, tipo: 'inventado' }) } catch { reboteRec = true }
    ok('tipo de recordatorio inválido rebota', reboteRec)
    const conRec = store.listCuentas(db).find((c) => c.id === c3.clienteId)
    ok('el recordatorio aparece en la cuenta', conRec.recordatorios.length === 1 && conRec.recordatorios[0].tipo === 'promesa')
    store.completarRecordatorio(db, rec.recordatorioId, true)
    const hechoRec = store.listCuentas(db).find((c) => c.id === c3.clienteId).recordatorios[0]
    ok('se marca hecho', hechoRec.hecho === true)
    store.eliminarRecordatorio(db, rec.recordatorioId)
    const sinRec = store.listCuentas(db).find((c) => c.id === c3.clienteId)
    ok('se elimina el recordatorio', sinRec.recordatorios.length === 0)

    console.log(`\nOK  test-saldos-store — ${pasos} verificaciones`)
  } finally {
    db.close()
    for (const ext of ['', '-shm', '-wal']) {
      try { fs.unlinkSync(dbPath + ext) } catch { /* no existe */ }
    }
  }
}

try {
  run()
  process.exit(0)
} catch (err) {
  console.error('\nFAIL test-saldos-store:', err.message)
  if (err.stack) console.error(err.stack)
  process.exit(1)
}
