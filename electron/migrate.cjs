'use strict'

/**
 * Sistema de migraciones numeradas para la base SQLite del bazar.
 *
 * Cada archivo en electron/migrations/ con nombre NNN_descripcion.sql se
 * aplica una sola vez, en orden numérico, dentro de una transacción. El
 * número aplicado se persiste en PRAGMA user_version, así que reiniciar
 * la app nunca reaplica una migración ya corrida.
 *
 * Diseñado para que la base de datos de la clienta sobreviva al código:
 * si algún día la app cambia de stack, las migraciones aplicadas quedan
 * registradas en user_version y el archivo .db sigue siendo abrible con
 * cualquier herramienta SQLite (DB Browser, sqlite3 CLI, etc.).
 */

const fs = require('fs')
const path = require('path')

const MIGRATIONS_DIR = path.join(__dirname, 'migrations')
const FILENAME_RE = /^(\d{3})_[a-z0-9_]+\.sql$/i

function currentVersion(db) {
  const v = db.pragma('user_version', { simple: true })
  return typeof v === 'number' ? v : 0
}

function setVersion(db, n) {
  db.pragma(`user_version = ${n}`)
}

function listPendingMigrations(db) {
  if (!fs.existsSync(MIGRATIONS_DIR)) return []
  const current = currentVersion(db)
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => FILENAME_RE.test(f))
    .map((f) => ({ file: f, num: parseInt(f.slice(0, 3), 10) }))
    .filter((m) => m.num > current)
    .sort((a, b) => a.num - b.num)
}

function runMigrations(db) {
  const pending = listPendingMigrations(db)
  if (pending.length === 0) return { applied: [] }
  const applied = []
  for (const { file, num } of pending) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')
    const trx = db.transaction(() => {
      db.exec(sql)
      setVersion(db, num)
    })
    try {
      trx()
      applied.push(file)
      console.log(`[migrate] aplicada ${file} -> user_version=${num}`)
    } catch (err) {
      console.error(`[migrate] FALLO en ${file}: ${err.message}`)
      throw err
    }
  }
  return { applied }
}

module.exports = { runMigrations, currentVersion, listPendingMigrations }
