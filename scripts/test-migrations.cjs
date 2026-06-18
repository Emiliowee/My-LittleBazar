'use strict'

/**
 * Test end-to-end del sistema de migraciones.
 *
 * Crea una base SQLite temporal en %TEMP%, aplica el schema base de
 * monserrat, corre todas las migraciones pendientes y verifica que el
 * estado resultante es el esperado (columnas correctas, tablas creadas,
 * user_version bumpeada, idempotencia ante segunda corrida).
 *
 * Uso:  node scripts/test-migrations.cjs
 * Exit: 0 si pasa, 1 si falla.
 *
 * Este script existe porque cada migración tiene que ser verificable
 * antes de tocar la base real de la clienta. Si rompe acá, no llega
 * a producción.
 */

const fs = require('fs')
const os = require('os')
const path = require('path')
const Database = require('better-sqlite3')

const { ensureMonserratSchema } = require('../electron/monserrat-schema.cjs')
const { runMigrations, currentVersion } = require('../electron/migrate.cjs')

function tempDbPath() {
  return path.join(os.tmpdir(), `mlb-migration-test-${Date.now()}-${process.pid}.db`)
}

function safeDelete(p) {
  for (const ext of ['', '-shm', '-wal']) {
    try { fs.unlinkSync(p + ext) } catch { /* archivo no existe */ }
  }
}

function assertEqual(label, actual, expected) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}: esperaba ${JSON.stringify(expected)}, vino ${JSON.stringify(actual)}`)
  }
}

function assertIncludes(label, list, expected) {
  for (const e of expected) {
    if (!list.includes(e)) {
      throw new Error(`${label}: falta "${e}". Lista actual: [${list.join(', ')}]`)
    }
  }
}

function tableInfo(db, table) {
  return db.pragma(`table_info(${table})`).map((r) => r.name)
}

function listTables(db) {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all()
    .map((r) => r.name)
}

function run() {
  const dbPath = tempDbPath()
  let db
  try {
    db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')

    ensureMonserratSchema(db)
    assertEqual('user_version inicial', currentVersion(db), 0)

    const result = runMigrations(db)
    assertEqual('migraciones aplicadas', result.applied,
      ['001_bazar_mixto_v1.sql', '002_saldos_v1.sql', '003_saldos_v2.sql', '004_devoluciones_detalle.sql'])
    assertEqual('user_version tras migraciones', currentVersion(db), 4)

    const productosCols = tableInfo(db, 'productos')
    assertIncludes('productos.columns', productosCols,
      ['categoria', 'marca', 'genero', 'precio_original', 'paca_id'])

    assertIncludes('tablas presentes', listTables(db),
      ['pacas', 'saldos_clientes', 'saldos_movimientos'])
    const pacasCols = tableInfo(db, 'pacas')
    assertIncludes('pacas.columns', pacasCols,
      ['id', 'nombre', 'fecha_compra', 'costo_total', 'cantidad_aprox',
       'lugar_compra', 'notas', 'created_at', 'updated_at'])

    assertIncludes('saldos_clientes.columns', tableInfo(db, 'saldos_clientes'),
      ['id', 'nombre', 'telefono', 'nacimiento', 'direccion',
       'identificacion_estado', 'identificacion_motivo', 'identificacion_imagen',
       'etiquetas', 'archivada'])
    assertIncludes('saldos_movimientos.columns', tableInfo(db, 'saldos_movimientos'),
      ['id', 'cliente_id', 'tipo', 'fecha', 'monto', 'concepto', 'medio',
       'quien_pago', 'referencia_ids', 'anulado', 'anulado_motivo'])
    assertIncludes('tablas presentes (saldos v2)', listTables(db), ['saldos_recordatorios'])
    assertIncludes('saldos_recordatorios.columns', tableInfo(db, 'saldos_recordatorios'),
      ['id', 'cliente_id', 'tipo', 'texto', 'fecha', 'hecho', 'created_at'])
    assertIncludes('venta_items.columns', tableInfo(db, 'venta_items'),
      ['devuelto_en', 'devolucion_monto', 'devolucion_metodo',
       'devolucion_cuenta_bancaria', 'devolucion_excedente', 'devolucion_excedente_metodo'])

    const second = runMigrations(db)
    assertEqual('segunda corrida idempotente', second.applied, [])
    assertEqual('user_version no cambia tras re-correr', currentVersion(db), 4)

    console.log('OK  test-migrations')
    console.log(`    user_version: 0 -> 4 (4 migraciones aplicadas)`)
    console.log(`    productos +5 columnas: categoria, marca, genero, precio_original, paca_id`)
    console.log(`    tabla pacas creada con ${pacasCols.length} columnas`)
    console.log(`    saldos: clientes (+foto ID, etiquetas) + movimientos + recordatorios`)
    console.log(`    devoluciones POS: monto, metodo, cuenta y excedente`)
    console.log(`    idempotencia OK (segunda corrida no reaplica)`)
  } finally {
    if (db) db.close()
    safeDelete(dbPath)
  }
}

try {
  run()
  process.exit(0)
} catch (err) {
  console.error('FAIL test-migrations:', err.message)
  if (err.stack) console.error(err.stack)
  process.exit(1)
}
