/**
 * SQLite: mismo archivo y esquema que Python (`data/monserrat.db`).
 * Tablas extra solo para funciones Electron (clientes / app_meta) — CREATE IF NOT EXISTS.
 */
const fs = require('fs')
const path = require('path')
const Database = require('better-sqlite3')
const { resolveMonserratDbPath, ensureDirForFile } = require('./monserrat-path.cjs')
const { ensureMonserratSchema } = require('./monserrat-schema.cjs')
const { runFactorySeed } = require('./monserrat-seed.cjs')
const alta = require('./producto-alta.cjs')
const ledger = require('./event-ledger.cjs')
const migrate = require('./migrate.cjs')
const saldosStore = require('./saldos-store.cjs')

let _db = null
let _backupDone = false

function backupDatabaseSilently(dbPath) {
  if (_backupDone) return
  _backupDone = true
  try {
    if (!fs.existsSync(dbPath)) return
    const backupDir = path.join(path.dirname(dbPath), 'backups')
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true })
    }
    const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
    const backupPath = path.join(backupDir, `monserrat_backup_${today}.db`)
    if (!fs.existsSync(backupPath)) {
      fs.copyFileSync(dbPath, backupPath)
      console.log(`[db] Silent backup created at: ${backupPath}`)
      
      // Limpiar backups de más de 30 días
      const files = fs.readdirSync(backupDir)
      const now = Date.now()
      for (const file of files) {
        if (!file.endsWith('.db')) continue
        const fp = path.join(backupDir, file)
        const stat = fs.statSync(fp)
        if (now - stat.mtimeMs > 30 * 24 * 60 * 60 * 1000) {
          fs.unlinkSync(fp)
        }
      }
    }
  } catch (err) {
    console.error('[db] Silent backup failed:', err)
  }
}

function getDb() {
  if (_db) return _db
  const dbPath = resolveMonserratDbPath()
  ensureDirForFile(dbPath)
  backupDatabaseSilently(dbPath)
  _db = new Database(dbPath, { timeout: 7000 })
  _db.pragma('journal_mode = WAL')
  _db.pragma('foreign_keys = ON')
  ensureMonserratSchema(_db)
  ensureTagPriceRuleMigration(_db)
  ensureInvPricingRulesSchema(_db)
  ensureTagNotionStyleMigration(_db)
  ensureProductosColumns(_db)
  ensureInventarioActivoView(_db)
  ensureElectronExtras(_db)
  ensureBanquetaSalidasSchema(_db)
  _cleanupOrphanTipoOptions(_db)
  ensureCreditoSchema(_db)
  ledger.ensureSchema(_db)
  migrate.runMigrations(_db)
  return _db
}

/* ────────────────────────── EVENT LEDGER ──────────────────────────
 * Wrappers no invasivos: si algo falla NUNCA propaga. El ledger es
 * un observador que registra historia, no debe poder romper el flujo
 * operativo. Toda escritura de dominio (venta, alta, abono, ...) llama
 * a recordEvent al final, fuera de la transacción de negocio.
 * ──────────────────────────────────────────────────────────────── */
function recordEvent(evt) {
  try {
    return ledger.appendEvent(getDb(), evt)
  } catch {
    return null
  }
}

function ledgerQuery(opts) {
  try {
    return ledger.queryEvents(getDb(), opts || {})
  } catch {
    return []
  }
}

function ledgerStats() {
  try {
    return ledger.ledgerStats(getDb())
  } catch {
    return { total: 0, last24h: 0, byType: [], first: null, last: null }
  }
}

/**
 * Limpia opciones del grupo "Tipo" que no están asociadas a NINGÚN producto.
 * Es una migración silenciosa para borrar la basura que dejó un bug previo
 * (cada letra que la usuaria tipeaba creaba un tag — "B", "Bo", "Bot", …).
 *
 * Se ejecuta una vez por proceso al abrir la BD. Solo toca opciones huérfanas
 * dentro del grupo Tipo; el resto del cuaderno queda intacto. Si el grupo
 * Tipo quedara vacío, lo elimina también — se recreará limpio en la próxima
 * alta de prenda real.
 */
function _cleanupOrphanTipoOptions(database) {
  try {
    const tipoGroup = findTipoGroup(database, false)
    if (!tipoGroup) return
    database
      .prepare(
        `DELETE FROM tag_options
         WHERE group_id = ?
           AND id NOT IN (SELECT DISTINCT tag_option_id FROM producto_tags)`,
      )
      .run(tipoGroup.id)
    const remaining = database
      .prepare('SELECT COUNT(*) AS n FROM tag_options WHERE group_id = ?')
      .get(tipoGroup.id)
    if (Number(remaining?.n) === 0) {
      database.prepare('DELETE FROM tag_groups WHERE id = ?').run(tipoGroup.id)
    }
  } catch {
    /* en BDs muy viejas las tablas pueden no existir; no es crítico */
  }
}

/** Columna is_price_rule + tablas de combinaciones por tag ancla (reglas de precio). */
function ensureTagPriceRuleMigration(database) {
  try {
    const cols = database.prepare('PRAGMA table_info(tag_options)').all()
    const names = new Set(cols.map((c) => c.name))
    if (!names.has('is_price_rule')) {
      database.exec('ALTER TABLE tag_options ADD COLUMN is_price_rule INTEGER NOT NULL DEFAULT 0')
    }
    if (!names.has('rule_priority')) {
      database.exec('ALTER TABLE tag_options ADD COLUMN rule_priority INTEGER NOT NULL DEFAULT 0')
    }
  } catch {
    /* tag_options puede no existir aún */
  }
  database.exec(`
    CREATE TABLE IF NOT EXISTS tag_price_combo (
      id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      anchor_option_id INTEGER NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      price REAL,
      created_at DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (anchor_option_id) REFERENCES tag_options (id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS tag_price_combo_part (
      combo_id INTEGER NOT NULL,
      option_id INTEGER NOT NULL,
      PRIMARY KEY (combo_id, option_id),
      FOREIGN KEY (combo_id) REFERENCES tag_price_combo (id) ON DELETE CASCADE,
      FOREIGN KEY (option_id) REFERENCES tag_options (id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_tag_price_combo_anchor ON tag_price_combo (anchor_option_id);
  `)
}

/**
 * Reglas de inventario nombradas: ancla (tag), alcance por categorías, filas precio fijo por combinación de tags.
 * (La aplicación en el formulario de producto —elegir regla y filtrar categorías— es fase posterior.)
 */
function ensureInvPricingRulesSchema(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS inv_pricing_rule (
      id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      name VARCHAR(200) NOT NULL,
      anchor_option_id INTEGER NOT NULL,
      scope_all INTEGER NOT NULL DEFAULT 1,
      active INTEGER NOT NULL DEFAULT 1,
      notes TEXT,
      created_at DATETIME DEFAULT (datetime('now')),
      updated_at DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (anchor_option_id) REFERENCES tag_options (id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS inv_pricing_rule_scope_group (
      rule_id INTEGER NOT NULL,
      group_id INTEGER NOT NULL,
      PRIMARY KEY (rule_id, group_id),
      FOREIGN KEY (rule_id) REFERENCES inv_pricing_rule (id) ON DELETE CASCADE,
      FOREIGN KEY (group_id) REFERENCES tag_groups (id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS inv_pricing_rule_row (
      id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      rule_id INTEGER NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      price REAL,
      created_at DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (rule_id) REFERENCES inv_pricing_rule (id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS inv_pricing_rule_row_part (
      row_id INTEGER NOT NULL,
      option_id INTEGER NOT NULL,
      PRIMARY KEY (row_id, option_id),
      FOREIGN KEY (row_id) REFERENCES inv_pricing_rule_row (id) ON DELETE CASCADE,
      FOREIGN KEY (option_id) REFERENCES tag_options (id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_inv_pricing_rule_anchor ON inv_pricing_rule (anchor_option_id);
    CREATE INDEX IF NOT EXISTS idx_inv_pricing_rule_row_rule ON inv_pricing_rule_row (rule_id);
  `)
  try {
    const cols = database.prepare('PRAGMA table_info(inv_pricing_rule)').all()
    if (!cols.some((c) => c.name === 'custom_fields_json')) {
      database.exec(`ALTER TABLE inv_pricing_rule ADD COLUMN custom_fields_json TEXT NOT NULL DEFAULT '[]'`)
    }
  } catch {
    /* noop */
  }
}

const INV_RULE_FIELD_TYPES = new Set(['text', 'select', 'number', 'image', 'checkbox'])

/** Campos extra definidos por la regla (JSON en `inv_pricing_rule.custom_fields_json`). */
function normalizeInvRuleCustomFieldsInput(raw) {
  let arr = []
  if (raw == null) arr = []
  else if (Array.isArray(raw)) arr = raw
  else if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw)
      arr = Array.isArray(p) ? p : []
    } catch {
      arr = []
    }
  } else arr = []
  const out = []
  for (const entry of arr) {
    if (!entry || typeof entry !== 'object') continue
    let id = String(entry.id || '').trim()
    const type = String(entry.type || 'text').toLowerCase()
    if (!INV_RULE_FIELD_TYPES.has(type)) continue
    const name = String(entry.name || '').trim().slice(0, 120)
    if (!name) continue
    if (!id) id = `fld_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
    const required = Boolean(entry.required)
    const base = { id, type, name, required }
    if (type === 'select') {
      const options = Array.isArray(entry.options)
        ? [...new Set(entry.options.map((x) => String(x ?? '').trim()).filter(Boolean))].slice(0, 80)
        : []
      if (options.length === 0) continue
      out.push({ ...base, options })
    } else {
      out.push(base)
    }
  }
  return out
}

function stringifyInvRuleFieldValues(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return '{}'
  try {
    return JSON.stringify(obj)
  } catch {
    return '{}'
  }
}

function parseInvRuleFieldValues(raw) {
  if (raw == null || raw === '') return {}
  try {
    const o = typeof raw === 'string' ? JSON.parse(raw) : raw
    return o && typeof o === 'object' && !Array.isArray(o) ? { ...o } : {}
  } catch {
    return {}
  }
}

/** Colores estilo Notion + icono opcional por sub-etiqueta (`tag_options.tag_icon`). */
function ensureTagNotionStyleMigration(database) {
  try {
    const tgCols = database.prepare('PRAGMA table_info(tag_groups)').all()
    const tgNames = new Set(tgCols.map((c) => c.name))
    if (!tgNames.has('notion_color')) {
      database.exec(`ALTER TABLE tag_groups ADD COLUMN notion_color TEXT NOT NULL DEFAULT 'gray'`)
    }
    const toCols = database.prepare('PRAGMA table_info(tag_options)').all()
    const toNames = new Set(toCols.map((c) => c.name))
    if (!toNames.has('notion_color')) {
      database.exec(`ALTER TABLE tag_options ADD COLUMN notion_color TEXT NOT NULL DEFAULT 'default'`)
    }
    if (!toNames.has('tag_icon')) {
      database.exec(`ALTER TABLE tag_options ADD COLUMN tag_icon TEXT`)
    }
  } catch {
    /* tablas tag_* pueden no existir aún */
  }
}

const NOTION_COLOR_KEYS = new Set([
  'default',
  'gray',
  'brown',
  'orange',
  'yellow',
  'green',
  'blue',
  'purple',
  'pink',
  'red',
  /* variantes con relieve / brillo / cristal (UI) */
  'neo',
  'glow',
  'mesh',
  'prism',
  'aurora',
  'glass',
])

function normalizeNotionColorKey(raw, fallback = 'default') {
  const v = String(raw ?? fallback)
    .toLowerCase()
    .trim()
  return NOTION_COLOR_KEYS.has(v) ? v : fallback
}

function normalizeTagIcon(raw) {
  if (raw == null) return null
  const t = String(raw).trim()
  if (!t) return null
  const norm = t.replace(/\\/g, '/').toLowerCase()
  if (norm.includes('/tag_icons/')) {
    if (t.length > 2048) return null
    return t
  }
  if (t.length > 32) return null
  return t
}

/** Bases antiguas o creadas fuera de SQLAlchemy pueden no tener todas las columnas de `models.Producto`. */
function ensureProductosColumns(database) {
  let cols
  try {
    cols = database.prepare('PRAGMA table_info(productos)').all()
  } catch {
    return
  }
  const names = new Set(cols.map((c) => c.name))
  const add = (col, ddl) => {
    if (!names.has(col)) {
      database.exec(`ALTER TABLE productos ADD COLUMN ${ddl}`)
      names.add(col)
    }
  }
  add('pieza_unica', 'pieza_unica INTEGER')
  add('color', 'color TEXT')
  add('talla', 'talla TEXT')
  add('imagen_path', 'imagen_path TEXT')
  add('estado', "estado TEXT DEFAULT 'disponible'")
  add('fecha_ingreso', 'fecha_ingreso DATETIME')
  add('created_at', 'created_at DATETIME')
  add('updated_at', 'updated_at DATETIME')
  add('stock', 'stock INTEGER NOT NULL DEFAULT 1')
  add('vendido_en', 'vendido_en TEXT')
  add('devuelto_en', 'devuelto_en TEXT')
  add('baja_estado_manual_en', 'baja_estado_manual_en TEXT')
  add('inv_rule_id', 'inv_rule_id INTEGER')
  add('inv_rule_field_values', 'inv_rule_field_values TEXT')
  add('zona', 'zona TEXT')
  add('nota', 'nota TEXT')
}

/**
 * Catálogo «activo»: piezas que no fueron dadas de baja por venta (vendido_en NULL).
 * La UI de inventario y el POS consumen esta vista; los vendidos quedan en `productos` para historial.
 */
function ensureInventarioActivoView(database) {
  ensureVentasSchema(database)
  try {
    database.exec(`
      UPDATE productos
      SET vendido_en = COALESCE(NULLIF(TRIM(updated_at), ''), NULLIF(TRIM(created_at), ''), datetime('now'))
      WHERE LOWER(TRIM(COALESCE(estado, ''))) = 'vendido'
        AND vendido_en IS NULL
    `)
  } catch (e) {
    console.error('[db] ensureInventarioActivoView backfill vendido_en:', e)
  }
  try {
    database.exec(`
      UPDATE productos
      SET estado = 'vendido', vendido_en = COALESCE(vendido_en, datetime('now'))
      WHERE EXISTS (SELECT 1 FROM venta_items vi WHERE vi.producto_id = productos.id)
        AND LOWER(TRIM(COALESCE(estado, ''))) = 'disponible'
    `)
  } catch (e) {
    console.error('[db] ensureInventarioActivoView fix disponible+POS:', e)
  }
  try {
    database.exec(`
      DROP VIEW IF EXISTS inventario_activo;
      CREATE VIEW inventario_activo AS
      SELECT * FROM productos WHERE vendido_en IS NULL;
    `)
  } catch (e) {
    console.error('[db] ensureInventarioActivoView:', e)
  }
}

function friendlySqliteError(err) {
  const msg = String(err?.message || err || '')
  const code = err?.code || ''
  if (code === 'SQLITE_CONSTRAINT_UNIQUE' || /UNIQUE constraint failed/i.test(msg)) {
    return new Error(
      'Ya existe un artículo con ese código. Cambiá el código o revisá el inventario.',
    )
  }
  if (code === 'SQLITE_CONSTRAINT_FOREIGNKEY' || /FOREIGN KEY constraint failed/i.test(msg)) {
    return new Error(
      'Algún tag elegido no es válido en la base (¿se borró la opción?). Reabrí «Tags…» y volvé a elegir.',
    )
  }
  return err instanceof Error ? err : new Error(msg || 'Error al guardar en la base')
}

function initDatabase() {
  getDb()
}

function closeDb() {
  if (_db) {
    try {
      _db.close()
    } catch (e) {
      console.error('[db] closeDb:', e)
    }
    _db = null
  }
}

/**
 * Borra el archivo SQLite (y WAL/SHM), recrea esquema y carga tags + regla ejemplo + artículos demo.
 * @returns {{ ok: true, path: string, productCount: number }}
 */
function resetMonserratDatabaseToSeed() {
  const dbPath = resolveMonserratDbPath()
  closeDb()
  for (const p of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    try {
      if (fs.existsSync(p)) fs.unlinkSync(p)
    } catch (e) {
      console.error('[db] reset unlink', p, e)
    }
  }
  ensureDirForFile(dbPath)
  const db = getDb()
  runFactorySeed(db)
  const n = db.prepare('SELECT COUNT(*) AS c FROM productos').get()
  return { ok: true, path: dbPath, productCount: Number(n?.c) || 0 }
}

function ensureElectronExtras(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS clientes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      telefono TEXT DEFAULT '',
      notas TEXT DEFAULT '',
      saldo_pendiente REAL NOT NULL DEFAULT 0,
      saldo_a_favor REAL NOT NULL DEFAULT 0,
      activo INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_clientes_activo ON clientes(activo);
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)
  /* Migración: en DBs viejas la columna saldo_a_favor no existe. La cuenta
   * representa lo que el bazar le debe a la cliente (notas de crédito por
   * intercambios donde se devolvió más caro). Distinto de `saldo_pendiente`
   * que sigue siendo lo que la cliente debe. */
  try {
    const cols = database.prepare(`PRAGMA table_info(clientes)`).all()
    if (!cols.some((c) => c.name === 'saldo_a_favor')) {
      database.exec(`ALTER TABLE clientes ADD COLUMN saldo_a_favor REAL NOT NULL DEFAULT 0`)
    }
    if (!cols.some((c) => c.name === 'fecha_nacimiento')) {
      database.exec(`ALTER TABLE clientes ADD COLUMN fecha_nacimiento TEXT DEFAULT ''`)
    }
    if (!cols.some((c) => c.name === 'imagen_identificacion_path')) {
      database.exec(`ALTER TABLE clientes ADD COLUMN imagen_identificacion_path TEXT DEFAULT ''`)
    }
    if (!cols.some((c) => c.name === 'recompensas_notas')) {
      database.exec(`ALTER TABLE clientes ADD COLUMN recompensas_notas TEXT DEFAULT ''`)
    }
  } catch (e) {
    console.error('[clientes] migraciones extras:', e?.message || e)
  }
  seedClientesDemoIfEmpty(database)
}

/** Salidas de venta en banqueta (borrador → activa → cerrada), con ítems y snapshot de precio. */
function ensureBanquetaSalidasSchema(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS banqueta_salidas (
      id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL DEFAULT '',
      estado TEXT NOT NULL DEFAULT 'borrador',
      notas TEXT DEFAULT '',
      lugar TEXT DEFAULT '',
      fecha_planeada TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      activated_at TEXT,
      closed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_banqueta_salidas_estado ON banqueta_salidas(estado);
    CREATE TABLE IF NOT EXISTS banqueta_salida_items (
      id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      salida_id INTEGER NOT NULL,
      producto_id INTEGER NOT NULL,
      precio_snapshot REAL,
      codigo_snapshot TEXT,
      nombre_snapshot TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      cantidad INTEGER NOT NULL DEFAULT 1,
      cantidad_vendida INTEGER NOT NULL DEFAULT 0,
      vendido INTEGER NOT NULL DEFAULT 0,
      precio_vendido REAL,
      vendido_at TEXT,
      added_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (salida_id) REFERENCES banqueta_salidas(id) ON DELETE CASCADE,
      FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE RESTRICT,
      UNIQUE(salida_id, producto_id)
    );
    CREATE INDEX IF NOT EXISTS idx_banqueta_items_salida ON banqueta_salida_items(salida_id);
  `)
  ensureBanquetaSalidaSchemaMigrations(database)
}

function ensureBanquetaSalidaSchemaMigrations(database) {
  try {
    const salidaCols = database.prepare('PRAGMA table_info(banqueta_salidas)').all()
    if (salidaCols.length) {
      const names = new Set(salidaCols.map((c) => c.name))
      if (!names.has('lugar')) database.exec("ALTER TABLE banqueta_salidas ADD COLUMN lugar TEXT DEFAULT ''")
      if (!names.has('fecha_planeada')) database.exec('ALTER TABLE banqueta_salidas ADD COLUMN fecha_planeada TEXT')
    }
  } catch {
    /* noop */
  }
  try {
    const cols = database.prepare('PRAGMA table_info(banqueta_salida_items)').all()
    if (!cols.length) return
    const names = new Set(cols.map((c) => c.name))
    if (!names.has('sort_order')) database.exec('ALTER TABLE banqueta_salida_items ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0')
    if (!names.has('cantidad')) database.exec('ALTER TABLE banqueta_salida_items ADD COLUMN cantidad INTEGER NOT NULL DEFAULT 1')
    if (!names.has('cantidad_vendida')) database.exec('ALTER TABLE banqueta_salida_items ADD COLUMN cantidad_vendida INTEGER NOT NULL DEFAULT 0')
    if (!names.has('vendido')) database.exec('ALTER TABLE banqueta_salida_items ADD COLUMN vendido INTEGER NOT NULL DEFAULT 0')
    if (!names.has('precio_vendido')) database.exec('ALTER TABLE banqueta_salida_items ADD COLUMN precio_vendido REAL')
    if (!names.has('vendido_at')) database.exec('ALTER TABLE banqueta_salida_items ADD COLUMN vendido_at TEXT')
  } catch {
    /* noop */
  }
}

function seedClientesDemoIfEmpty(database) {
  const ran = database.prepare("SELECT 1 FROM app_meta WHERE key = 'welcome_demo_clientes_v1' LIMIT 1").get()
  if (ran) return
  const { c } = database.prepare('SELECT COUNT(*) AS c FROM clientes').get()
  if (c > 0) {
    database
      .prepare("INSERT INTO app_meta (key, value) VALUES ('welcome_demo_clientes_v1', 'skipped_existing')")
      .run()
    return
  }
  /* Libreta vieja en desuso: el fiado real vive en el módulo Saldos
   * (saldos_clientes / saldos_movimientos). Ya NO sembramos clientes ni
   * deuda de demostración en la tabla vieja `clientes` — solo dejamos la
   * bandera para no volver a intentarlo. */
  database.prepare("INSERT INTO app_meta (key, value) VALUES ('welcome_demo_clientes_v1', '1')").run()
}

function parseTagsByGroup(raw) {
  if (raw == null) return {}
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw)
      return parseTagsByGroup(p)
    } catch {
      return {}
    }
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    const out = {}
    for (const [k, v] of Object.entries(raw)) {
      const gid = Number(k)
      const oid = Number(v)
      if (Number.isFinite(gid) && Number.isFinite(oid) && oid > 0) out[gid] = oid
    }
    return out
  }
  return {}
}

function tagNamesForProduct(database, productoId) {
  const row = database
    .prepare(
      `SELECT group_concat(o.name, ', ') AS names
       FROM producto_tags pt
       JOIN tag_options o ON o.id = pt.tag_option_id
       WHERE pt.producto_id = ?
       GROUP BY pt.producto_id`,
    )
    .get(productoId)
  return row?.names ? String(row.names) : ''
}

function hydrateProductRow(database, p) {
  if (!p) return p
  return {
    ...p,
    tags: tagNamesForProduct(database, p.id),
  }
}

function getProducts(filters = {}) {
  const database = getDb()
  const from = filters.estado ? 'productos' : 'inventario_activo'
  let sql = `SELECT * FROM ${from} WHERE 1=1`
  const params = []
  if (filters.estado) {
    sql += ' AND estado = ?'
    params.push(filters.estado)
  }
  sql += ' ORDER BY id DESC LIMIT 500'
  return database.prepare(sql).all(...params).map((p) => hydrateProductRow(database, p))
}

function searchProducts(query) {
  const database = getDb()
  const t = String(query || '').trim()
  if (!t) return getProducts({})
  const esc = (s) =>
    String(s)
      .trim()
      .replace(/\\/g, '\\\\')
      .replace(/%/g, '\\%')
      .replace(/_/g, '\\_')
  const like = `%${esc(t).toLowerCase()}%`
  const rows = database
    .prepare(
      `SELECT DISTINCT p.*
       FROM inventario_activo p
       LEFT JOIN producto_tags pt ON pt.producto_id = p.id
       LEFT JOIN tag_options o ON o.id = pt.tag_option_id
       WHERE lower(p.codigo) LIKE ? ESCAPE '\\' OR lower(COALESCE(p.descripcion,'')) LIKE ? ESCAPE '\\' OR lower(COALESCE(p.color,'')) LIKE ? ESCAPE '\\' OR lower(COALESCE(p.talla,'')) LIKE ? ESCAPE '\\' OR lower(COALESCE(o.name,'')) LIKE ? ESCAPE '\\'
       ORDER BY p.id DESC
       LIMIT 200`,
    )
    .all(like, like, like, like, like)
  return rows.map((p) => hydrateProductRow(database, p))
}

function getProductById(id) {
  const database = getDb()
  const p = database.prepare('SELECT * FROM productos WHERE id = ?').get(id)
  if (!p) return null
  ensureVentasSchema(database)
  const vc = database.prepare('SELECT COUNT(*) AS c FROM venta_items WHERE producto_id = ?').get(id)
  const venta_items_count = Number(vc?.c) || 0
  const tagsByGroup = {}
  const links = database
    .prepare(
      `SELECT o.group_id, o.id AS option_id
       FROM producto_tags pt
       JOIN tag_options o ON o.id = pt.tag_option_id
       WHERE pt.producto_id = ?`,
    )
    .all(id)
  for (const r of links) {
    tagsByGroup[r.group_id] = r.option_id
  }
  const { inv_rule_id, inv_rule_field_values, ...rest } = p
  return {
    ...rest,
    tagsByGroup,
    venta_items_count,
    ruleId: inv_rule_id != null && Number(inv_rule_id) > 0 ? Number(inv_rule_id) : null,
    ruleFieldValues: parseInvRuleFieldValues(inv_rule_field_values),
  }
}

function getProductByCodigo(codigo) {
  const database = getDb()
  const c = String(codigo || '').trim()
  if (!c) return null
  const row = database.prepare('SELECT id FROM productos WHERE TRIM(codigo) = ? COLLATE NOCASE').get(c)
  if (!row) return null
  return getProductById(row.id)
}

/**
 * Lista inventario como Zen: búsqueda, filtro estado, vista banqueta, pestaña +6 meses.
 */
function getInventoryList(filters = {}) {
  const database = getDb()
  ensureVentasSchema(database)
  const search = String(filters.search || '').trim()
  const rawEstado = Number(filters.estadoIndex)
  const rawVista = Number(filters.vistaIndex)
  const estadoIndex = Number.isFinite(rawEstado) ? rawEstado : 0
  const vistaIndex = Number.isFinite(rawVista) ? rawVista : 0
  const listTab = filters.listTab === 'stale' ? 'stale' : 'main'

  const params = []
  /** Archivo de vendidos: tabla base `productos`. Resto del inventario: vista `inventario_activo` (vendido_en IS NULL). */
  const soldArchive = vistaIndex !== 1 && estadoIndex === 3
  const base = soldArchive ? 'productos' : 'inventario_activo'
  let fromBody = `${base} p`
  const where = []

  if (search) {
    fromBody = `${base} p LEFT JOIN producto_tags pt ON pt.producto_id = p.id LEFT JOIN tag_options o ON o.id = pt.tag_option_id`
    const esc = (s) =>
      String(s)
        .trim()
        .replace(/\\/g, '\\\\')
        .replace(/%/g, '\\%')
        .replace(/_/g, '\\_')
    const like = `%${esc(search).toLowerCase()}%`
    where.push(
      `(lower(p.codigo) LIKE ? ESCAPE '\\' OR lower(COALESCE(p.descripcion,'')) LIKE ? ESCAPE '\\' OR lower(COALESCE(p.color,'')) LIKE ? ESCAPE '\\' OR lower(COALESCE(p.talla,'')) LIKE ? ESCAPE '\\' OR lower(COALESCE(o.name,'')) LIKE ? ESCAPE '\\')`,
    )
    params.push(like, like, like, like, like)
  }

  if (soldArchive) {
    where.push(
      "(p.vendido_en IS NOT NULL OR LOWER(TRIM(COALESCE(p.estado,''))) = 'vendido')",
    )
  }

  if (listTab === 'stale') {
    where.push("LOWER(TRIM(COALESCE(p.estado,''))) = 'disponible'")
    // Sin fecha: no excluir por NULL <= … (antes desaparecían de «+6 meses»). Sin ambas fechas → no es «viejo».
    where.push(
      "date(COALESCE(NULLIF(TRIM(COALESCE(p.fecha_ingreso,'')), ''), NULLIF(TRIM(COALESCE(p.created_at,'')), ''), datetime('now'))) <= date('now', '-183 days')",
    )
  }

  if (vistaIndex === 1) {
    where.push("LOWER(TRIM(COALESCE(p.estado,''))) = 'en_banqueta'")
  } else {
    const em = { 1: 'disponible', 2: 'en_banqueta', 3: 'vendido', 4: 'reservado' }
    if (estadoIndex >= 1 && estadoIndex <= 4 && !soldArchive) {
      where.push('LOWER(TRIM(COALESCE(p.estado,\'\'))) = ?')
      params.push(em[estadoIndex])
      if (estadoIndex === 1) {
        where.push('NOT EXISTS (SELECT 1 FROM venta_items vi WHERE vi.producto_id = p.id)')
      }
    } else if (estadoIndex === 0 && !soldArchive && !search) {
      /* Vista "Todos" por defecto: NO mezclar lo que salió a banqueta ni lo
       * desactivado (no vendido en banqueta). Tienen su vista/filtro propios y
       * estorbaban el inventario del día a día. Si la dueña BUSCA un código, sí
       * aparece aunque esté en banqueta (no se oculta en búsqueda). */
      where.push("LOWER(TRIM(COALESCE(p.estado,''))) NOT IN ('en_banqueta','desactivado')")
    }
  }

  const distinct = search ? 'DISTINCT ' : ''
  const ventaCountSql =
    '(SELECT COUNT(*) FROM venta_items vi WHERE vi.producto_id = p.id) AS venta_items_count'
  let sql = `SELECT ${distinct}p.*, ${ventaCountSql} FROM ${fromBody}`
  if (where.length) sql += ` WHERE ${where.join(' AND ')}`
  // Catálogo activo: primero artículos sin líneas POS (0), al final los que reingresaron o tienen historial (evita «vendidos arriba» por id alto).
  if (listTab === 'stale') {
    sql += " ORDER BY date(COALESCE(p.fecha_ingreso, p.created_at)) ASC LIMIT 500"
  } else if (soldArchive) {
    sql += ' ORDER BY p.id DESC LIMIT 500'
  } else {
    sql +=
      ' ORDER BY (SELECT COUNT(*) FROM venta_items vi WHERE vi.producto_id = p.id) ASC, p.id DESC LIMIT 500'
  }

  const rows = database.prepare(sql).all(...params)
  return rows.map((p) => hydrateProductRow(database, p))
}

/** Antes de guardar: grupos con `required=1` que aún no tienen opción elegida. */
function checkRequiredTagsForProduct(tagsByGroup) {
  const database = getDb()
  const map = parseTagsByGroup(tagsByGroup)
  const oids = alta.toOptionIdSet(Object.values(map))
  const miss = alta.missingRequiredGroups(database, oids)
  return { ok: miss.length === 0, missing: miss }
}

function setProductTags(database, productoId, tagsByGroup) {
  database.prepare('DELETE FROM producto_tags WHERE producto_id = ?').run(productoId)
  const oids = [...new Set(Object.values(tagsByGroup).map(Number).filter((n) => Number.isFinite(n) && n > 0))]
  const ins = database.prepare('INSERT INTO producto_tags (producto_id, tag_option_id) VALUES (?, ?)')
  for (const oid of oids) {
    ins.run(productoId, oid)
  }
}

/* ----------------------------- AUTO-TAG DE TIPO ---------------------------
 * El alta rápida pide "¿Qué es?" y guarda eso como descripción libre. Para
 * que el sistema "aprenda", convertimos esa primera palabra en un tag dentro
 * de un grupo "Tipo" (creado automáticamente si no existe). Así el cuaderno
 * pasa a tener una taxonomía completa: Tipo + Material + Talla + ..., y las
 * reglas auto-creadas pueden anclar en el Tipo (semánticamente correcto).
 * -------------------------------------------------------------------------- */

const TIPO_GROUP_CANDIDATE_NAMES = [
  'tipo',
  'tipo de prenda',
  'tipo prenda',
  'prenda',
  'producto',
  'categoria',
  'categoría',
  'tipos',
]

function _normAcc(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

function _capitalize(s) {
  const t = String(s ?? '').trim()
  if (!t) return ''
  return t.charAt(0).toLocaleUpperCase('es') + t.slice(1).toLocaleLowerCase('es')
}

/** Busca un grupo del cuaderno cuyo nombre indique "tipo de prenda". Si no
 *  existe Y `createIfMissing=true`, lo crea con nombre "Tipo". */
function findTipoGroup(database, createIfMissing = false) {
  const all = database
    .prepare(
      `SELECT id, name, display_order FROM tag_groups WHERE COALESCE(active, 1) = 1`,
    )
    .all()
  const targets = new Set(TIPO_GROUP_CANDIDATE_NAMES.map(_normAcc))
  for (const g of all) {
    if (targets.has(_normAcc(g.name))) return g
  }
  if (!createIfMissing) return null
  const row = database.prepare('SELECT COALESCE(MAX(display_order), 0) AS m FROM tag_groups').get()
  const nextOrd = (Number(row?.m) || 0) + 1
  const info = database
    .prepare(
      `INSERT INTO tag_groups (name, use_in_price, required, active, display_order, created_at, notion_color)
       VALUES (?, 1, 0, 1, ?, datetime('now'), 'gray')`,
    )
    .run('Tipo', nextOrd)
  return { id: Number(info.lastInsertRowid), name: 'Tipo', display_order: nextOrd }
}

/** Extrae el "tipo base" del descripción (la primera palabra significativa,
 *  ignorando palabras-articulares y vocabulario común que ya cubren los demás
 *  grupos del cuaderno — material/color/talla — para no contaminar el grupo
 *  "Tipo" con cosas como "rojo" o "M"). */
function extractTipoBase(database, descripcion) {
  const desc = String(descripcion || '').trim()
  if (!desc) return ''
  const words = desc.split(/\s+/).filter(Boolean)
  if (words.length === 0) return ''
  const stopWords = new Set(['el', 'la', 'los', 'las', 'un', 'una', 'de', 'del', 'para', 'con'])
  // Conjunto de nombres ya conocidos en otros grupos (excluyendo "Tipo"):
  // así nunca tomamos "rojo" o "algodon" como tipo de prenda.
  const tipo = findTipoGroup(database, false)
  const knownNonTipo = new Set()
  const opts = database
    .prepare(
      `SELECT o.name FROM tag_options o
       JOIN tag_groups g ON g.id = o.group_id
       WHERE COALESCE(o.active, 1) = 1 AND COALESCE(g.active, 1) = 1
       ${tipo ? 'AND g.id != ?' : ''}`,
    )
    .all(...(tipo ? [tipo.id] : []))
  for (const o of opts) knownNonTipo.add(_normAcc(o.name))

  for (const w of words) {
    const norm = _normAcc(w)
    if (!norm) continue
    if (stopWords.has(norm)) continue
    if (knownNonTipo.has(norm)) continue
    return _capitalize(w)
  }
  // Fallback: la primera palabra tal cual (mejor algo que nada)
  return _capitalize(words[0])
}

/** Resuelve la opción de "Tipo" para una descripción.
 *
 *  Modos:
 *    - `createIfMissing: true`  → crea grupo Tipo y opción si faltan (uso al
 *      GUARDAR un producto: addProduct/updateProduct).
 *    - `createIfMissing: false` → solo enriquece si ya existe la opción; no
 *      escribe nada (uso en LECTURAS: find/detect/count). Esto evita que
 *      cada letra que la usuaria tipea cree opciones basura ("Bo", "Bot",
 *      "Bota", "Botas").
 *
 *  Si la usuaria ya seleccionó manualmente una opción del grupo Tipo, se
 *  respeta esa elección sin tocar nada.
 */
function ensureTipoOptionForDescripcion(database, descripcion, existingTagsByGroup, opts) {
  const createIfMissing = opts && opts.createIfMissing === true
  const tipoName = extractTipoBase(database, descripcion)
  if (!tipoName) return null
  const tipoGroup = findTipoGroup(database, createIfMissing)
  if (!tipoGroup) return null
  // Si ya hay una opción del grupo Tipo seleccionada, respetar.
  if (existingTagsByGroup && Object.prototype.hasOwnProperty.call(existingTagsByGroup, tipoGroup.id)) {
    const sel = Number(existingTagsByGroup[tipoGroup.id])
    if (Number.isFinite(sel) && sel > 0) return { groupId: tipoGroup.id, optionId: sel, isNew: false }
  }
  // Buscar opción existente case-insensitive sin acentos.
  const existing = database
    .prepare(
      `SELECT id, name FROM tag_options WHERE group_id = ? AND COALESCE(active, 1) = 1`,
    )
    .all(tipoGroup.id)
  const target = _normAcc(tipoName)
  for (const o of existing) {
    if (_normAcc(o.name) === target) {
      return { groupId: tipoGroup.id, optionId: Number(o.id), optionName: String(o.name), isNew: false }
    }
  }
  if (!createIfMissing) return null
  // Crear nueva (solo en escritura real).
  const cycle = ['default', 'gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red']
  const countRow = database.prepare('SELECT COUNT(*) AS c FROM tag_options WHERE group_id = ?').get(tipoGroup.id)
  const color = cycle[Number(countRow?.c || 0) % cycle.length]
  const info = database
    .prepare(
      `INSERT INTO tag_options (group_id, name, active, created_at, notion_color, tag_icon)
       VALUES (?, ?, 1, datetime('now'), ?, NULL)`,
    )
    .run(tipoGroup.id, tipoName, color)
  return {
    groupId: tipoGroup.id,
    optionId: Number(info.lastInsertRowid),
    optionName: tipoName,
    isNew: true,
  }
}

function addProduct(product) {
  const database = getDb()
  const skipTagValidation = product?.skipTagValidation === true
  const skipRuleLearning = product?.skipRuleLearning === true
  const tagsByGroup = parseTagsByGroup(product?.tagsByGroup ?? product?.tags_by_group)
  if (!skipTagValidation) {
    // Auto-tag de tipo: si la descripción no está vacía y el usuario no eligió
    // explícitamente algo del grupo Tipo, lo agregamos automáticamente. Esto
    // SÍ crea grupo/opción si faltan — es escritura real, no lectura.
    try {
      const auto = ensureTipoOptionForDescripcion(database, product?.descripcion, tagsByGroup, { createIfMissing: true })
      if (auto?.optionId) tagsByGroup[auto.groupId] = auto.optionId
    } catch {
      /* si falla, no bloqueamos el alta — el sistema sigue siendo libre */
    }
    const oids = alta.toOptionIdSet(Object.values(tagsByGroup))
    const miss = alta.missingRequiredGroups(database, oids)
    if (miss.length) {
      const err = new Error(`Faltan grupos obligatorios: ${miss.join(', ')}`)
      err.code = 'TAGS_REQUIRED'
      err.missing = miss
      throw err
    }
  }
  const oids = alta.toOptionIdSet(Object.values(tagsByGroup))
  const talla = alta.optionNameForGroup(database, 'Talla', oids)
  const codigo = String(product.codigo || '').trim()
  const descripcion = String(product.descripcion ?? '').trim()
  const precio = Math.max(0, Number(product.precio) || 0) // nunca negativo (con 0 igual no se puede vender hasta corregirlo)
  const estado = String(product.estado || 'disponible')
  const imagen_path = String(product.imagen_path ?? '').trim()
  const color = String(product.color ?? '').trim()
  const categoria = String(product.categoria ?? '').trim() || null
  const zona = String(product.zona ?? '').trim() || null
  const nota = String(product.nota ?? '').trim() || null
  const marca = String(product.marca ?? '').trim() || null
  const pieza_unica = product.pieza_unica ? 1 : 0
  let stock = Math.max(1, Math.floor(Number(product.stock) || 1))
  if (pieza_unica) stock = 1

  const invRuleId =
    product.ruleId != null && String(product.ruleId).trim() !== '' && Number.isFinite(Number(product.ruleId)) && Number(product.ruleId) > 0
      ? Math.floor(Number(product.ruleId))
      : null
  const invRuleFieldValues = stringifyInvRuleFieldValues(product?.ruleFieldValues)

  const insertProd = database.prepare(
    `INSERT INTO productos (
      codigo, descripcion, precio, pieza_unica, stock, color, talla, imagen_path, estado,
      categoria, zona, marca, nota, inv_rule_id, inv_rule_field_values,
      fecha_ingreso, created_at, updated_at
    ) VALUES (
      @codigo, @descripcion, @precio, @pieza_unica, @stock, @color, @talla, @imagen_path, @estado,
      @categoria, @zona, @marca, @nota, @inv_rule_id, @inv_rule_field_values,
      datetime('now'), datetime('now'), datetime('now')
    )`,
  )
  const delTags = database.prepare('DELETE FROM producto_tags WHERE producto_id = ?')
  const insTag = database.prepare('INSERT INTO producto_tags (producto_id, tag_option_id) VALUES (?, ?)')
  const tagIds = [...new Set(Object.values(tagsByGroup).map(Number).filter((n) => Number.isFinite(n) && n > 0))]

  try {
    const id = database.transaction(() => {
      const info = insertProd.run({
        codigo,
        descripcion,
        precio,
        pieza_unica,
        stock,
        color,
        talla,
        imagen_path,
        estado,
        categoria,
        zona,
        marca,
        nota,
        inv_rule_id: invRuleId,
        inv_rule_field_values: invRuleFieldValues,
      })
      const newId = Number(info.lastInsertRowid)
      delTags.run(newId)
      for (const oid of tagIds) {
        insTag.run(newId, oid)
      }
      return newId
    })()
    // Auto-aprendizaje silencioso. Orden:
    //  1) Si existe regla con anchor=Tipo y la combo es nueva → append.
    //  2) Si no hay regla y hay ≥2 prendas iguales con Tipo claro → create.
    // Todo en background, sin toast molesto. La usuaria revisa en el cuaderno.
    let autoAppend = null
    let autoCreate = null
    let priceMismatch = null
    if (!skipRuleLearning) {
      try {
        autoAppend = autoAppendInvRuleIfApplicable(database, descripcion, tagsByGroup, precio)
        if (!autoAppend) {
          autoCreate = autoCreateInvRuleIfApplicable(database, descripcion, tagsByGroup, id)
        }
        // Sólo tiene sentido reportar mismatch si la regla NO se acaba de crear
        // ni se acaba de extender con esta combinación (en ambos casos el
        // precio quedó alineado).
        if (!autoAppend && !autoCreate) {
          priceMismatch = detectInvRulePriceMismatch(database, descripcion, tagsByGroup, precio)
        }
      } catch { /* best-effort */ }
    }
    recordEvent({
      type: 'product.created',
      actor: 'user',
      scope: 'product',
      entityRef: id,
      source: 'inventario',
      payload: {
        productoId: id,
        codigo,
        precio,
        piezaUnica: pieza_unica === 1,
        stock,
        tagCount: tagIds.length,
        hasDescripcion: descripcion.length > 0,
        hasImagen: imagen_path.length > 0,
        ruleId: invRuleId,
        learning: {
          enabled: !skipRuleLearning,
          appendedToRule: autoAppend != null,
          createdNewRule: autoCreate != null,
          priceMismatch: priceMismatch != null,
        },
      },
    })
    return { id, autoAppend, autoCreate, priceMismatch }
  } catch (e) {
    throw friendlySqliteError(e)
  }
}

function updateProduct(product) {
  const database = getDb()
  const skipTagValidation = product?.skipTagValidation === true
  const skipRuleLearning = product?.skipRuleLearning === true
  const id = Number(product.id)
  if (!Number.isFinite(id)) throw new Error('id inválido')
  ensureVentasSchema(database)
  const prevRow = database
    .prepare('SELECT estado, vendido_en, devuelto_en, baja_estado_manual_en, categoria, zona, marca, nota FROM productos WHERE id = ?')
    .get(id)
  if (!prevRow) throw new Error('Producto no encontrado')
  const posRow = database.prepare('SELECT COUNT(*) AS c FROM venta_items WHERE producto_id = ?').get(id)
  const posCount = Number(posRow?.c) || 0
  const tagsByGroup = parseTagsByGroup(product?.tagsByGroup ?? product?.tags_by_group)
  if (!skipTagValidation) {
    // Mismo auto-tag de Tipo que en addProduct, para coherencia entre alta y edición.
    try {
      const auto = ensureTipoOptionForDescripcion(database, product?.descripcion, tagsByGroup, { createIfMissing: true })
      if (auto?.optionId) tagsByGroup[auto.groupId] = auto.optionId
    } catch {
      /* noop */
    }
    const oids = alta.toOptionIdSet(Object.values(tagsByGroup))
    const miss = alta.missingRequiredGroups(database, oids)
    if (miss.length) {
      const err = new Error(`Faltan grupos obligatorios: ${miss.join(', ')}`)
      err.code = 'TAGS_REQUIRED'
      err.missing = miss
      throw err
    }
  }
  const oids = alta.toOptionIdSet(Object.values(tagsByGroup))
  const talla = alta.optionNameForGroup(database, 'Talla', oids)
  const pieza_unica = product.pieza_unica ? 1 : 0
  let stock = Math.max(1, Math.floor(Number(product.stock) || 1))
  if (pieza_unica) stock = 1
  const estadoNew = String(product.estado || 'disponible').trim().toLowerCase()
  const estadoPrevNorm = String(prevRow.estado || 'disponible').trim().toLowerCase()
  if (estadoNew !== estadoPrevNorm && posCount > 0) {
    throw new Error(
      'Este artículo tiene ventas registradas en el POS: no se puede cambiar el estado desde la ficha (evita marcarlo «disponible» u otro estado y que deje de coincidir con los comprobantes).',
    )
  }
  const hadVendidoEn = prevRow.vendido_en != null && String(prevRow.vendido_en).trim() !== ''
  const now = database.prepare(`SELECT datetime('now') AS t`).get().t
  let vendido_en = null
  let devuelto_en = prevRow.devuelto_en
  if (estadoNew === 'vendido') {
    vendido_en = hadVendidoEn ? prevRow.vendido_en : now
  } else {
    if (hadVendidoEn) devuelto_en = now
  }
  let baja_estado_manual_en = prevRow.baja_estado_manual_en
  if (posCount === 0 && estadoNew === 'vendido' && estadoPrevNorm !== 'vendido') {
    baja_estado_manual_en = now
  } else if (estadoNew !== 'vendido') {
    baja_estado_manual_en = null
  }
  const invRuleIdUpd =
    product.ruleId != null && String(product.ruleId).trim() !== '' && Number.isFinite(Number(product.ruleId)) && Number(product.ruleId) > 0
      ? Math.floor(Number(product.ruleId))
      : null
  const invRuleFieldValuesUpd = stringifyInvRuleFieldValues(product?.ruleFieldValues)
  // Solo modifica categoria si el payload la incluye explícitamente; si no,
  // preserva el valor previo. Esto evita que un updateProduct parcial (por
  // ejemplo desde la IA, o un cambio de estado puntual) nulifique campos
  // que no estaba intentando tocar.
  const categoriaPassedExplicitly = Object.prototype.hasOwnProperty.call(product, 'categoria')
  const categoriaUpd = categoriaPassedExplicitly
    ? (String(product.categoria ?? '').trim() || null)
    : (prevRow.categoria || null)
  // Igual que categoria: solo tocar zona/nota si vienen explícitas en el payload,
  // para que un update parcial (POS/IA marcando estado) no las borre.
  const zonaUpd = Object.prototype.hasOwnProperty.call(product, 'zona')
    ? (String(product.zona ?? '').trim() || null)
    : (prevRow.zona ?? null)
  const notaUpd = Object.prototype.hasOwnProperty.call(product, 'nota')
    ? (String(product.nota ?? '').trim() || null)
    : (prevRow.nota ?? null)
  const marcaUpd = Object.prototype.hasOwnProperty.call(product, 'marca')
    ? (String(product.marca ?? '').trim() || null)
    : (prevRow.marca ?? null)

  const upd = database.prepare(
    `UPDATE productos SET
      descripcion = @descripcion,
      precio = @precio,
      pieza_unica = @pieza_unica,
      stock = @stock,
      color = @color,
      talla = @talla,
      imagen_path = @imagen_path,
      estado = @estado,
      vendido_en = @vendido_en,
      devuelto_en = @devuelto_en,
      baja_estado_manual_en = @baja_estado_manual_en,
      categoria = @categoria,
      zona = @zona,
      marca = @marca,
      nota = @nota,
      inv_rule_id = @inv_rule_id,
      inv_rule_field_values = @inv_rule_field_values,
      updated_at = datetime('now')
     WHERE id = @id`,
  )
  const delTags = database.prepare('DELETE FROM producto_tags WHERE producto_id = ?')
  const insTag = database.prepare('INSERT INTO producto_tags (producto_id, tag_option_id) VALUES (?, ?)')
  const tagIds = [...new Set(Object.values(tagsByGroup).map(Number).filter((n) => Number.isFinite(n) && n > 0))]

  try {
    database.transaction(() => {
      upd.run({
        id,
        descripcion: String(product.descripcion ?? '').trim(),
        precio: Math.max(0, Number(product.precio) || 0), // nunca negativo
        pieza_unica,
        stock,
        color: String(product.color ?? '').trim(),
        talla,
        imagen_path: String(product.imagen_path ?? '').trim(),
        estado: String(product.estado || 'disponible'),
        vendido_en,
        devuelto_en,
        baja_estado_manual_en,
        categoria: categoriaUpd,
        zona: zonaUpd,
        marca: marcaUpd,
        nota: notaUpd,
        inv_rule_id: invRuleIdUpd,
        inv_rule_field_values: invRuleFieldValuesUpd,
      })
      delTags.run(id)
      for (const oid of tagIds) {
        insTag.run(id, oid)
      }
    })()
    let autoAppend = null
    let autoCreate = null
    let priceMismatch = null
    if (!skipRuleLearning) {
      try {
        autoAppend = autoAppendInvRuleIfApplicable(
          database,
          product?.descripcion,
          tagsByGroup,
          Number(product.precio) || 0,
        )
        if (!autoAppend) {
          autoCreate = autoCreateInvRuleIfApplicable(
            database,
            product?.descripcion,
            tagsByGroup,
            id,
          )
        }
        if (!autoAppend && !autoCreate) {
          priceMismatch = detectInvRulePriceMismatch(
            database,
            product?.descripcion,
            tagsByGroup,
            Number(product.precio) || 0,
          )
        }
      } catch { /* es best-effort */ }
    }
    return { ok: true, autoAppend, autoCreate, priceMismatch }
  } catch (e) {
    throw friendlySqliteError(e)
  }
}

/** Tablas conocidas primero (orden estable); luego cualquier otra detectada en el DDL. */
const DELETE_PRODUCTO_CHILD_ORDER = ['banqueta_salida_items', 'plano_items', 'producto_tags', 'venta_items']

function tableDdlReferencesProductos(sql) {
  const s = String(sql || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
  if (!s.includes('producto_id') || !s.includes('references') || !s.includes('productos')) return false
  if (/foreign\s+key\s*\(\s*producto_id\s*\)\s*references\s+[`'"]?productos\b/.test(s)) return true
  if (/producto_id[^,)]*references\s+[`'"]?productos\b/.test(s)) return true
  return false
}

function listTablesReferencingProductosDdl(database) {
  const rows = database.prepare(`SELECT name, sql FROM sqlite_master WHERE type = 'table' AND sql IS NOT NULL`).all()
  const out = []
  for (const r of rows) {
    if (!r?.name || r.name === 'productos') continue
    if (!tableDdlReferencesProductos(r.sql)) continue
    out.push(String(r.name))
  }
  return out
}

function deleteProductChildRows(database, pid) {
  const ddlHits = new Set(listTablesReferencingProductosDdl(database))
  const extras = [...ddlHits].filter((t) => !DELETE_PRODUCTO_CHILD_ORDER.includes(t)).sort((a, b) => a.localeCompare(b))
  const sequence = [...DELETE_PRODUCTO_CHILD_ORDER, ...extras]
  const done = new Set()
  const quoteIdent = (n) => `"${String(n).replace(/"/g, '""')}"`
  for (const t of sequence) {
    if (done.has(t)) continue
    try {
      database.prepare(`DELETE FROM ${quoteIdent(t)} WHERE producto_id = ?`).run(pid)
      done.add(t)
    } catch (e) {
      const msg = String(e?.message || e)
      if (/no such column/i.test(msg) || /no such table/i.test(msg)) continue
      throw e
    }
  }
}

function deleteProduct(id) {
  const database = getDb()
  const pid = Number(id)
  if (!Number.isFinite(pid) || pid <= 0) throw new Error('Identificador de producto no válido.')

  ensureVentasSchema(database)
  ensureBanquetaSalidasSchema(database)

  const ventaRow = database.prepare('SELECT COUNT(*) AS c FROM venta_items WHERE producto_id = ?').get(pid)
  if (Number(ventaRow?.c) > 0) {
    throw new Error(
      'No se puede eliminar el artículo porque figura en al menos una venta del POS (los comprobantes conservan el vínculo). Aunque lo edites y lo marques «Disponible» de nuevo, ese historial sigue y el borrado del catálogo no está permitido.',
    )
  }

  try {
    database.transaction(() => {
      deleteProductChildRows(database, pid)
      database.prepare('DELETE FROM productos WHERE id = ?').run(pid)
    })()
  } catch (e) {
    const msg = String(e?.message || e || '')
    if (e?.code === 'SQLITE_CONSTRAINT_FOREIGNKEY' || /FOREIGN KEY constraint failed/i.test(msg)) {
      throw new Error(
        'No se pudo eliminar el artículo: sigue referenciado en la base (p. ej. banqueta, plano o una tabla extra). Revisá Banqueta / planos o contactá soporte.',
      )
    }
    throw e
  }
  return { ok: true }
}

function nextCodigoMsr() {
  return alta.nextCodigoMsr(getDb())
}

function getTagGroupsForProduct() {
  const database = getDb()
  const groups = database
    .prepare(
      `SELECT id, name, required, display_order, COALESCE(notion_color, 'gray') AS notion_color
       FROM tag_groups WHERE active = 1 ORDER BY display_order, name`,
    )
    .all()
  const optStmt = database.prepare(
    `SELECT id, name, COALESCE(is_price_rule, 0) AS is_price_rule,
        COALESCE(notion_color, 'default') AS notion_color, tag_icon
     FROM tag_options WHERE group_id = ? AND active = 1 ORDER BY name`,
  )
  return groups.map((g) => ({
    id: g.id,
    name: g.name,
    required: Boolean(g.required),
    display_order: g.display_order,
    notion_color: String(g.notion_color || 'gray'),
    options: optStmt.all(g.id).map((o) => ({
      id: o.id,
      name: o.name,
      is_price_rule: Number(o.is_price_rule) === 1,
      notion_color: String(o.notion_color || 'default'),
      tag_icon: o.tag_icon != null ? String(o.tag_icon) : null,
    })),
  }))
}

/** Cuaderno / admin: grupos con conteo de sub-opciones activas y listado completo para editar. */
function getCuadernoTagGroups() {
  const database = getDb()
  const groups = database
    .prepare(
      `SELECT g.id, g.name, g.required, g.display_order, g.use_in_price,
        COALESCE(g.notion_color, 'gray') AS notion_color,
        (SELECT COUNT(*) FROM tag_options o WHERE o.group_id = g.id AND COALESCE(o.active, 1) = 1) AS option_count
       FROM tag_groups g
       WHERE COALESCE(g.active, 1) = 1
       ORDER BY g.display_order, g.name`,
    )
    .all()
  const optStmt = database.prepare(
    `SELECT id, name, COALESCE(active, 1) AS active, COALESCE(is_price_rule, 0) AS is_price_rule,
        COALESCE(rule_priority, 0) AS rule_priority,
        COALESCE(notion_color, 'default') AS notion_color, tag_icon
     FROM tag_options WHERE group_id = ? ORDER BY name COLLATE NOCASE`,
  )
  return groups.map((g) => ({
    id: g.id,
    name: g.name,
    required: Boolean(g.required),
    display_order: g.display_order,
    use_in_price: g.use_in_price,
    notion_color: String(g.notion_color || 'gray'),
    option_count: Number(g.option_count) || 0,
    options: optStmt.all(g.id).map((o) => ({
      id: o.id,
      name: o.name,
      active: Number(o.active) === 1,
      is_price_rule: Number(o.is_price_rule) === 1,
      rule_priority: Number(o.rule_priority) || 0,
      notion_color: String(o.notion_color || 'default'),
      tag_icon: o.tag_icon != null ? String(o.tag_icon) : null,
    })),
  }))
}

function cuadernoAddTagGroup(payload) {
  const database = getDb()
  const name = String(payload?.name || '').trim()
  if (!name) throw new Error('El nombre del grupo no puede estar vacío.')
  const notion_color = normalizeNotionColorKey(payload?.notionColor, 'gray')
  const row = database.prepare('SELECT COALESCE(MAX(display_order), 0) AS m FROM tag_groups').get()
  const nextOrd = (Number(row?.m) || 0) + 1
  try {
    const ins = database.prepare(
      `INSERT INTO tag_groups (name, use_in_price, required, active, display_order, created_at, notion_color)
       VALUES (?, 1, 0, 1, ?, datetime('now'), ?)`,
    )
    const info = ins.run(name, nextOrd, notion_color)
    return { ok: true, id: Number(info.lastInsertRowid) }
  } catch (err) {
    throw friendlySqliteError(err)
  }
}

/**
 * Inserta MUCHAS opciones de tag de una vez, en una sola transacción.
 * Diseñado para importar SEED_TERMS desde el cuaderno-view sin congelar la UI
 * con 500 round-trips IPC.
 *  - Nombres vacíos / duplicados (case-insensitive) se filtran.
 *  - Los que ya existen en el grupo se saltan en silencio.
 *  - Si el grupo no existe, lanza error y rollback.
 * @returns {{ ok: true, added: number, skipped: number }}
 */
function cuadernoBulkAddTagOptions(payload) {
  const database = getDb()
  const groupId = Number(payload?.groupId)
  const rawNames = Array.isArray(payload?.names) ? payload.names : []
  if (!groupId) throw new Error('Indicá el grupo.')
  const g = database.prepare('SELECT id FROM tag_groups WHERE id = ?').get(groupId)
  if (!g) throw new Error('El grupo no existe.')

  // Dedupe case-insensitive contra existentes + entre la lista entrante.
  const existing = new Set(
    database
      .prepare('SELECT LOWER(TRIM(name)) AS n FROM tag_options WHERE group_id = ?')
      .all(groupId)
      .map((r) => r.n),
  )
  const seen = new Set()
  const toInsert = []
  for (const raw of rawNames) {
    const name = String(raw || '').trim()
    if (!name) continue
    const key = name.toLowerCase()
    if (existing.has(key) || seen.has(key)) continue
    seen.add(key)
    toInsert.push(name)
  }
  if (toInsert.length === 0) return { ok: true, added: 0, skipped: rawNames.length }

  const cycle = ['default', 'gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red']
  const startCount = Number(
    database.prepare('SELECT COUNT(*) AS c FROM tag_options WHERE group_id = ?').get(groupId)?.c || 0,
  )
  const ins = database.prepare(
    `INSERT INTO tag_options (group_id, name, active, created_at, notion_color, tag_icon)
     VALUES (?, ?, 1, datetime('now'), ?, NULL)`,
  )
  const tx = database.transaction((names) => {
    let i = 0
    for (const name of names) {
      const color = cycle[(startCount + i) % cycle.length]
      ins.run(groupId, name, color)
      i++
    }
  })
  tx(toInsert)
  return { ok: true, added: toInsert.length, skipped: rawNames.length - toInsert.length }
}

function cuadernoAddTagOption(payload) {
  const database = getDb()
  const groupId = Number(payload?.groupId)
  const name = String(payload?.name || '').trim()
  if (!groupId || !name) throw new Error('Indicá grupo y nombre de la sub-etiqueta.')
  const g = database.prepare('SELECT id FROM tag_groups WHERE id = ?').get(groupId)
  if (!g) throw new Error('El grupo no existe.')
  const countRow = database.prepare('SELECT COUNT(*) AS c FROM tag_options WHERE group_id = ?').get(groupId)
  const cycle = [
    'default',
    'gray',
    'brown',
    'orange',
    'yellow',
    'green',
    'blue',
    'purple',
    'pink',
    'red',
    'neo',
    'glow',
    'mesh',
    'prism',
    'aurora',
    'glass',
  ]
  const notion_color =
    payload?.notionColor != null && String(payload.notionColor).trim() !== ''
      ? normalizeNotionColorKey(payload.notionColor, 'default')
      : cycle[Number(countRow?.c || 0) % cycle.length]
  const tag_icon = normalizeTagIcon(payload?.tagIcon)
  try {
    const ins = database.prepare(
      `INSERT INTO tag_options (group_id, name, active, created_at, notion_color, tag_icon) VALUES (?, ?, 1, datetime('now'), ?, ?)`,
    )
    const info = ins.run(groupId, name, notion_color, tag_icon)
    return { ok: true, id: Number(info.lastInsertRowid) }
  } catch (err) {
    const msg = String(err?.message || err)
    if (/UNIQUE constraint failed/i.test(msg)) {
      throw new Error('Ya existe una opción con ese nombre en este grupo.')
    }
    throw friendlySqliteError(err)
  }
}

function cuadernoRenameTagOption(payload) {
  const database = getDb()
  const id = Number(payload?.id)
  const name = String(payload?.name || '').trim()
  if (!id || !name) throw new Error('Nombre inválido.')
  const row = database.prepare('SELECT group_id FROM tag_options WHERE id = ?').get(id)
  if (!row) throw new Error('La opción no existe.')
  try {
    database.prepare('UPDATE tag_options SET name = ? WHERE id = ?').run(name, id)
    return { ok: true }
  } catch (err) {
    const msg = String(err?.message || err)
    if (/UNIQUE constraint failed/i.test(msg)) {
      throw new Error('Ya existe otra opción con ese nombre en este grupo.')
    }
    throw friendlySqliteError(err)
  }
}

function cuadernoSetTagOptionActive(payload) {
  const database = getDb()
  const id = Number(payload?.id)
  const active = payload?.active !== false
  if (!id) throw new Error('Opción inválida.')
  const row = database.prepare('SELECT id FROM tag_options WHERE id = ?').get(id)
  if (!row) throw new Error('La opción no existe.')
  database.prepare('UPDATE tag_options SET active = ? WHERE id = ?').run(active ? 1 : 0, id)
  return { ok: true }
}

/** Orden de grupos en UI (display_order) — como reordenar propiedades en Notion. */
function cuadernoReorderTagGroups(payload) {
  const database = getDb()
  const orderedIds = Array.isArray(payload?.orderedIds)
    ? payload.orderedIds.map(Number).filter((n) => Number.isFinite(n) && n > 0)
    : []
  if (orderedIds.length === 0) throw new Error('Sin orden para aplicar.')
  const allRows = database.prepare('SELECT id FROM tag_groups').all()
  const valid = new Set(allRows.map((r) => r.id))
  const seen = new Set()
  for (const id of orderedIds) {
    if (!valid.has(id)) throw new Error('ID de grupo inválido en el orden.')
    if (seen.has(id)) throw new Error('Grupos duplicados en el orden.')
    seen.add(id)
  }
  if (orderedIds.length !== valid.size) throw new Error('El orden debe incluir cada grupo una sola vez.')
  const run = database.transaction(() => {
    orderedIds.forEach((id, i) => {
      database.prepare('UPDATE tag_groups SET display_order = ? WHERE id = ?').run(i + 1, id)
    })
  })
  run()
  return { ok: true }
}

/** Grupos y opciones (activas o no) para el gestor de catálogo en UI. */
function getTagCatalogForManager() {
  const database = getDb()
  const groups = database
    .prepare(
      `SELECT g.id, g.name, g.required, g.display_order, g.use_in_price, COALESCE(g.active, 1) AS active,
        COALESCE(g.notion_color, 'gray') AS notion_color,
        (SELECT COUNT(*) FROM tag_options o WHERE o.group_id = g.id AND COALESCE(o.active, 1) = 1) AS option_count
       FROM tag_groups g
       ORDER BY g.display_order, g.name COLLATE NOCASE`,
    )
    .all()
  const optStmt = database.prepare(
    `SELECT id, name, COALESCE(active, 1) AS active, COALESCE(is_price_rule, 0) AS is_price_rule,
        COALESCE(rule_priority, 0) AS rule_priority,
        COALESCE(notion_color, 'default') AS notion_color, tag_icon
     FROM tag_options WHERE group_id = ? ORDER BY name COLLATE NOCASE`,
  )
  return groups.map((g) => ({
    id: g.id,
    name: g.name,
    required: Boolean(g.required),
    display_order: g.display_order,
    use_in_price: g.use_in_price,
    group_active: Number(g.active) === 1,
    notion_color: String(g.notion_color || 'gray'),
    option_count: Number(g.option_count) || 0,
    options: optStmt.all(g.id).map((o) => ({
      id: o.id,
      name: o.name,
      active: Number(o.active) === 1,
      is_price_rule: Number(o.is_price_rule) === 1,
      rule_priority: Number(o.rule_priority) || 0,
      notion_color: String(o.notion_color || 'default'),
      tag_icon: o.tag_icon != null ? String(o.tag_icon) : null,
    })),
  }))
}

function _deleteTagOptionDeep(database, optionId) {
  const oid = Number(optionId)
  database.prepare('DELETE FROM tag_price_combo WHERE anchor_option_id = ?').run(oid)
  database.prepare('DELETE FROM tag_price_combo_part WHERE option_id = ?').run(oid)
  database.prepare('DELETE FROM price_rule_conditions WHERE option_id = ?').run(oid)
  database.prepare('DELETE FROM producto_tags WHERE tag_option_id = ?').run(oid)
  database.prepare('DELETE FROM tag_options WHERE id = ?').run(oid)
}

/** Cuenta cuántos productos (del inventario activo) usan una etiqueta específica. */
function countProductsByTagOption(optionId) {
  const database = getDb()
  const oid = Number(optionId)
  if (!Number.isFinite(oid) || oid <= 0) return 0
  const row = database
    .prepare(
      `SELECT COUNT(DISTINCT p.id) AS c
       FROM producto_tags pt
       JOIN inventario_activo p ON p.id = pt.producto_id
       WHERE pt.tag_option_id = ?`,
    )
    .get(oid)
  return Number(row?.c) || 0
}

function cuadernoRenameTagGroup(payload) {
  const database = getDb()
  const id = Number(payload?.id)
  const name = String(payload?.name || '').trim()
  if (!id || !name) throw new Error('Nombre de grupo inválido.')
  const ex = database.prepare('SELECT id FROM tag_groups WHERE id = ?').get(id)
  if (!ex) throw new Error('El grupo no existe.')
  try {
    database.prepare('UPDATE tag_groups SET name = ? WHERE id = ?').run(name, id)
    return { ok: true }
  } catch (err) {
    const msg = String(err?.message || err)
    if (/UNIQUE constraint failed/i.test(msg)) {
      throw new Error('Ya existe otro grupo con ese nombre.')
    }
    throw friendlySqliteError(err)
  }
}

/** Mueve una etiqueta a otra carpeta. Quita condiciones de reglas que referían esa opción (hay que rearmar reglas si aplica). */
function cuadernoMoveTagOption(payload) {
  const database = getDb()
  const optionId = Number(payload?.optionId ?? payload?.id)
  const newGroupId = Number(payload?.groupId ?? payload?.targetGroupId)
  if (!optionId || !newGroupId) throw new Error('Indicá etiqueta y carpeta destino.')
  const opt = database.prepare('SELECT id, name, group_id FROM tag_options WHERE id = ?').get(optionId)
  if (!opt) throw new Error('La etiqueta no existe.')
  if (Number(opt.group_id) === newGroupId) return { ok: true }
  const g = database.prepare('SELECT id FROM tag_groups WHERE id = ?').get(newGroupId)
  if (!g) throw new Error('La carpeta destino no existe.')
  const clash = database
    .prepare('SELECT id FROM tag_options WHERE group_id = ? AND name = ? AND id != ?')
    .get(newGroupId, opt.name, optionId)
  if (clash) throw new Error('Ya existe una etiqueta con ese nombre en la carpeta destino.')
  const run = database.transaction(() => {
    database.prepare('DELETE FROM price_rule_conditions WHERE option_id = ?').run(optionId)
    database.prepare('UPDATE tag_options SET group_id = ? WHERE id = ?').run(newGroupId, optionId)
  })
  try {
    run()
    return { ok: true }
  } catch (err) {
    throw friendlySqliteError(err)
  }
}

function cuadernoDeleteTagOption(payload) {
  const database = getDb()
  const id = Number(payload?.id)
  if (!id) throw new Error('Opción inválida.')
  const row = database.prepare('SELECT id FROM tag_options WHERE id = ?').get(id)
  if (!row) throw new Error('La opción no existe.')
  const run = database.transaction(() => {
    _deleteTagOptionDeep(database, id)
  })
  run()
  return { ok: true }
}

function cuadernoDeleteTagGroup(payload) {
  const database = getDb()
  const gid = Number(payload?.id)
  if (!gid) throw new Error('Grupo inválido.')
  const g = database.prepare('SELECT id FROM tag_groups WHERE id = ?').get(gid)
  if (!g) throw new Error('El grupo no existe.')
  const opts = database.prepare('SELECT id FROM tag_options WHERE group_id = ?').all(gid)
  const run = database.transaction(() => {
    for (const { id } of opts) {
      _deleteTagOptionDeep(database, id)
    }
    database.prepare('DELETE FROM price_rule_conditions WHERE group_id = ?').run(gid)
    database.prepare('DELETE FROM tag_groups WHERE id = ?').run(gid)
  })
  run()
  return { ok: true }
}

function listInvPricingRules() {
  const database = getDb()
  return database
    .prepare(
      `SELECT r.id, r.name, r.anchor_option_id, r.scope_all, r.active,
        (SELECT g.name || ': ' || o.name FROM tag_options o JOIN tag_groups g ON g.id = o.group_id WHERE o.id = r.anchor_option_id) AS anchor_label,
        (SELECT COUNT(*) FROM inv_pricing_rule_row x WHERE x.rule_id = r.id) AS row_count,
        COALESCE(r.custom_fields_json, '[]') AS custom_fields_json
       FROM inv_pricing_rule r
       ORDER BY r.updated_at DESC, r.id DESC`,
    )
    .all()
    .map((row) => {
      let customFieldCount = 0
      try {
        const a = JSON.parse(String(row.custom_fields_json || '[]'))
        customFieldCount = Array.isArray(a) ? a.length : 0
      } catch {
        customFieldCount = 0
      }
      return {
        id: Number(row.id),
        name: String(row.name || ''),
        anchor_option_id: Number(row.anchor_option_id),
        anchor_label: String(row.anchor_label || ''),
        scope_all: Number(row.scope_all) === 1,
        active: Number(row.active) === 1,
        row_count: Number(row.row_count) || 0,
        custom_field_count: customFieldCount,
      }
    })
}

/**
 * Lista plana de todos los custom fields definidos en cualquier regla.
 * Útil para el editor de etiquetas (seleccionar un campo como propiedad imprimible).
 */
function listInvRuleCustomFieldsFlat() {
  const database = getDb()
  const rows = database
    .prepare(
      `SELECT id, name, COALESCE(custom_fields_json, '[]') AS custom_fields_json
       FROM inv_pricing_rule
       WHERE active = 1
       ORDER BY name ASC`,
    )
    .all()
  const out = []
  for (const r of rows) {
    let fields = []
    try {
      fields = JSON.parse(String(r.custom_fields_json || '[]'))
    } catch {
      fields = []
    }
    if (!Array.isArray(fields)) continue
    for (const f of fields) {
      const fid = Number(f?.id)
      if (!Number.isFinite(fid) || fid <= 0) continue
      out.push({
        field_id: fid,
        field_name: String(f?.name || ''),
        field_type: String(f?.type || 'text'),
        rule_id: Number(r.id),
        rule_name: String(r.name || ''),
      })
    }
  }
  return out
}

function getInvPricingRule(payload) {
  const database = getDb()
  const id = Number(payload?.id)
  if (!id) throw new Error('Regla inválida.')
  const r = database.prepare('SELECT * FROM inv_pricing_rule WHERE id = ?').get(id)
  if (!r) throw new Error('La regla no existe.')
  const scopeRows = database.prepare('SELECT group_id FROM inv_pricing_rule_scope_group WHERE rule_id = ?').all(id)
  const scopeGroupIds = scopeRows.map((x) => Number(x.group_id))
  const rows = database
    .prepare(`SELECT id, price, sort_order FROM inv_pricing_rule_row WHERE rule_id = ? ORDER BY sort_order ASC, id ASC`)
    .all(id)
  const partStmt = database.prepare('SELECT option_id FROM inv_pricing_rule_row_part WHERE row_id = ?')
  const comboRows = rows.map((row) => ({
    id: Number(row.id),
    price: row.price == null ? null : Number(row.price),
    companionIds: partStmt.all(row.id).map((p) => Number(p.option_id)),
  }))
  const anchor = database
    .prepare(
      `SELECT o.id, o.name, o.group_id, o.tag_icon,
              COALESCE(o.notion_color, 'default') AS notion_color,
              g.name AS group_name,
              COALESCE(g.notion_color, 'gray') AS group_color
       FROM tag_options o JOIN tag_groups g ON g.id = o.group_id
       WHERE o.id = ?`,
    )
    .get(Number(r.anchor_option_id))
  return {
    id: Number(r.id),
    name: String(r.name || ''),
    anchor_option_id: Number(r.anchor_option_id),
    anchor_group_id: anchor ? Number(anchor.group_id) : null,
    anchor_name: anchor ? String(anchor.name || '') : '',
    anchor_notion_color: anchor ? String(anchor.notion_color || 'default') : 'default',
    anchor_tag_icon: anchor?.tag_icon != null ? String(anchor.tag_icon) : null,
    anchor_group_name: anchor ? String(anchor.group_name || '') : '',
    anchor_group_color: anchor ? String(anchor.group_color || 'gray') : 'gray',
    scope_all: Number(r.scope_all) === 1,
    active: Number(r.active) === 1,
    notes: r.notes != null ? String(r.notes) : '',
    scopeGroupIds,
    rows: comboRows.map((c) => ({
      companionIds: c.companionIds,
      price: c.price == null ? '' : String(c.price),
    })),
    customFields: normalizeInvRuleCustomFieldsInput(r.custom_fields_json),
  }
}

function upsertInvPricingRule(payload) {
  const database = getDb()
  const name = String(payload?.name || '').trim()
  if (!name) throw new Error('El nombre de la regla es obligatorio.')
  const anchorOptionId = Number(payload?.anchorOptionId)
  if (!anchorOptionId) throw new Error('Elegí el tag ancla.')
  const anchorOk = database.prepare('SELECT id FROM tag_options WHERE id = ? AND COALESCE(active,1)=1').get(anchorOptionId)
  if (!anchorOk) throw new Error('El tag ancla no existe o está inactivo.')
  const scopeAll = Boolean(payload?.scopeAll)
  const rawGids = Array.isArray(payload?.scopeGroupIds) ? payload.scopeGroupIds : []
  const scopeGroupIds = [...new Set(rawGids.map(Number).filter((n) => Number.isFinite(n) && n > 0))]
  if (!scopeAll) {
    if (scopeGroupIds.length === 0) throw new Error('Si no aplica a todas las categorías, elegí al menos una categoría.')
    const chk = database.prepare('SELECT id FROM tag_groups WHERE id = ? AND COALESCE(active,1)=1')
    for (const gid of scopeGroupIds) {
      if (!chk.get(gid)) throw new Error('Alguna categoría del alcance no existe o está inactiva.')
    }
  }
  const rawRows = Array.isArray(payload?.rows) ? payload.rows : []
  const verifyOpt = database.prepare('SELECT id FROM tag_options WHERE id = ? AND COALESCE(active,1)=1')
  const customFields = normalizeInvRuleCustomFieldsInput(payload?.customFields)
  for (const f of customFields) {
    if (f.type === 'select' && (!Array.isArray(f.options) || f.options.length === 0)) {
      throw new Error(`El selector «${f.name}» necesita al menos una opción.`)
    }
  }
  const customFieldsJson = JSON.stringify(customFields)

  const normalizedRows = []
  for (let i = 0; i < rawRows.length; i++) {
    const r = rawRows[i]
    const companionIds = Array.isArray(r?.companionIds)
      ? [...new Set(r.companionIds.map(Number).filter((n) => Number.isFinite(n) && n > 0))]
      : []
    if (companionIds.includes(anchorOptionId)) {
      throw new Error('Las filas no pueden incluir el mismo tag que el ancla.')
    }
    for (const cid of companionIds) {
      if (!verifyOpt.get(cid)) throw new Error('Algún tag en una fila no existe o está inactivo.')
    }
    let price = null
    if (r?.price != null && String(r.price).trim() !== '') {
      const p = Number(String(r.price).replace(',', '.'))
      if (!Number.isFinite(p) || p < 0) throw new Error('Cada precio debe ser un número ≥ 0 o vacío.')
      price = p
    }
    normalizedRows.push({ companionIds, price, sort_order: i })
  }
  const existingIdRaw = payload?.id
  const existingId =
    existingIdRaw != null && String(existingIdRaw).trim() !== '' && Number.isFinite(Number(existingIdRaw))
      ? Math.floor(Number(existingIdRaw))
      : 0
  const delScopes = database.prepare('DELETE FROM inv_pricing_rule_scope_group WHERE rule_id = ?')
  const delRows = database.prepare('DELETE FROM inv_pricing_rule_row WHERE rule_id = ?')
  const insRule = database.prepare(
    `INSERT INTO inv_pricing_rule (name, anchor_option_id, scope_all, active, notes, custom_fields_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
  )
  const updRule = database.prepare(
    `UPDATE inv_pricing_rule SET name = ?, anchor_option_id = ?, scope_all = ?, active = ?, notes = ?, custom_fields_json = ?, updated_at = datetime('now') WHERE id = ?`,
  )
  const insScope = database.prepare('INSERT INTO inv_pricing_rule_scope_group (rule_id, group_id) VALUES (?, ?)')
  const insRow = database.prepare(
    `INSERT INTO inv_pricing_rule_row (rule_id, sort_order, price, created_at) VALUES (?, ?, ?, datetime('now'))`,
  )
  const insPart = database.prepare('INSERT INTO inv_pricing_rule_row_part (row_id, option_id) VALUES (?, ?)')
  let outRuleId = 0
  const run = database.transaction(() => {
    let ruleId = existingId
    const active = payload?.active === false ? 0 : 1
    const notes = payload?.notes != null ? String(payload.notes) : ''
    if (existingId > 0) {
      const ex = database.prepare('SELECT id FROM inv_pricing_rule WHERE id = ?').get(existingId)
      if (!ex) throw new Error('La regla no existe.')
      updRule.run(name, anchorOptionId, scopeAll ? 1 : 0, active, notes, customFieldsJson, existingId)
      delScopes.run(existingId)
      delRows.run(existingId)
      ruleId = existingId
    } else {
      const info = insRule.run(name, anchorOptionId, scopeAll ? 1 : 0, active, notes, customFieldsJson)
      ruleId = Number(info.lastInsertRowid)
    }
    outRuleId = ruleId
    if (!scopeAll) {
      for (const gid of scopeGroupIds) {
        insScope.run(ruleId, gid)
      }
    }
    for (const row of normalizedRows) {
      const info = insRow.run(ruleId, row.sort_order, row.price)
      const rowId = Number(info.lastInsertRowid)
      for (const oid of row.companionIds) {
        insPart.run(rowId, oid)
      }
    }
  })
  run()
  return { ok: true, id: outRuleId }
}

function deleteInvPricingRule(payload) {
  const database = getDb()
  const id = Number(payload?.id)
  if (!id) throw new Error('Regla inválida.')
  database.prepare('DELETE FROM inv_pricing_rule WHERE id = ?').run(id)
  return { ok: true }
}

function getTagLabelsForMap(tagsByGroup) {
  const database = getDb()
  const map = parseTagsByGroup(tagsByGroup)
  return alta.tagLabelsForSelection(database, map)
}

function suggestNombreFromTags(payload) {
  const database = getDb()
  const tagsByGroup = parseTagsByGroup(payload?.tagsByGroup)
  const ex = String(payload?.excludeCodigo || '').trim() || null
  return alta.sugerirNombreDesdePatronesInventario(database, tagsByGroup, ex)
}

function nombreEtiquetaDesdeTagsPayload(payload) {
  const database = getDb()
  const tagsByGroup = parseTagsByGroup(payload?.tagsByGroup)
  return alta.nombreEtiquetaDesdeTags(database, tagsByGroup) || ''
}

/**
 * Precio sugerido según la selección de tags.
 *
 * - Si viene `ruleId` → modo regla exacto sobre `inv_pricing_rule`:
 *   busca la fila cuyo conjunto de companion ids está TODO incluido en la
 *   selección (sin contar el ancla). Gana la fila con más partes (más específica).
 *   Devuelve `null` si ninguna coincide (no hay fallback a patrones).
 * - `mode === 'cuaderno'` → legacy anchor/combo (tag_options.is_price_rule).
 * - `mode === 'patrones'` → mediana del inventario con los mismos tags.
 */
function suggestPrecioFromTags(payload) {
  const database = getDb()
  const tagsByGroup = parseTagsByGroup(payload?.tagsByGroup)
  const oids = alta.toOptionIdSet(Object.values(tagsByGroup))
  const excludeCodigo = String(payload?.excludeCodigo || '').trim() || null
  const ruleIdRaw = payload?.ruleId
  const ruleId =
    ruleIdRaw != null && String(ruleIdRaw).trim() !== '' && Number.isFinite(Number(ruleIdRaw))
      ? Math.floor(Number(ruleIdRaw))
      : 0
  if (ruleId > 0) {
    return resolveInvPricingRulePrice(database, ruleId, oids)
  }
  if (oids.size === 0) return null
  const mode = String(payload?.mode || alta.AUTO_FILL_CUADERNO)
  if (mode === alta.AUTO_FILL_CUADERNO) {
    const tagP = alta.bestTagAnchorPrice(database, oids)
    if (tagP != null && Number.isFinite(Number(tagP))) return Number(tagP)
    return null
  }
  if (mode === alta.AUTO_FILL_PATRONES) {
    const st = alta.inventarioPrecioStatsPorTags(database, oids, excludeCodigo)
    if (!st) return null
    return Number(st.median != null ? st.median : st.avg)
  }
  return null
}

/**
 * Resuelve el precio exacto de una regla de inventario dada una selección de
 * option ids. Requiere que el ancla esté seleccionada. Elige la fila con más
 * partes coincidentes (todas las partes deben estar incluidas en la selección).
 */
function resolveInvPricingRulePrice(database, ruleId, oids) {
  const rule = database
    .prepare(`SELECT id, anchor_option_id, active FROM inv_pricing_rule WHERE id = ?`)
    .get(ruleId)
  if (!rule || !Number(rule.active)) return null
  const anchorId = Number(rule.anchor_option_id)
  if (!oids.has(anchorId)) return null
  const rows = database
    .prepare(
      `SELECT id, price FROM inv_pricing_rule_row
       WHERE rule_id = ? ORDER BY sort_order ASC, id ASC`,
    )
    .all(ruleId)
  const partStmt = database.prepare('SELECT option_id FROM inv_pricing_rule_row_part WHERE row_id = ?')
  let best = null
  for (const row of rows) {
    const parts = partStmt.all(row.id).map((p) => Number(p.option_id))
    if (parts.length === 0) continue
    const allInSel = parts.every((oid) => oids.has(oid))
    if (!allInSel) continue
    if (!best || parts.length > best.count) {
      const p = row.price == null ? null : Number(row.price)
      if (p != null && Number.isFinite(p)) best = { count: parts.length, price: p }
    }
  }
  return best ? best.price : null
}

/**
 * Dada una selección de tags, busca la regla del cuaderno que aplica.
 *
 * Recorre todas las reglas activas, conserva las que tienen su `anchor_option_id`
 * en la selección, y para cada una busca la fila cuyo conjunto de parts está
 * todo incluido en la selección. Gana la fila con MÁS parts coincidentes
 * (la más específica). En empate, gana la regla con `id` menor (la más
 * antigua, que normalmente refleja la decisión más estable del usuario).
 *
 * Devuelve null si ninguna regla aplica.
 *
 * @param {object} payload - { tagsByGroup }
 * @returns {{ ruleId: number, ruleName: string, price: number, partsMatched: number } | null}
 */
function findApplicableInvRulePrice(payload) {
  const database = getDb()
  const tagsByGroup = parseTagsByGroup(payload?.tagsByGroup)
  // Enriquecer la selección con el Tipo derivado del nombre, para que el
  // matcher encuentre reglas que dependen del Tipo aunque el frontend solo
  // haya pasado tags explícitos (Material/Talla/etc).
  const desc = String(payload?.descripcion || '').trim()
  if (desc) {
    try {
      const auto = ensureTipoOptionForDescripcion(database, desc, tagsByGroup)
      if (auto?.optionId && !tagsByGroup[auto.groupId]) tagsByGroup[auto.groupId] = auto.optionId
    } catch { /* noop */ }
  }
  const oids = alta.toOptionIdSet(Object.values(tagsByGroup))
  if (oids.size === 0) return null

  const rules = database
    .prepare(
      `SELECT id, name, anchor_option_id
       FROM inv_pricing_rule
       WHERE active = 1
       ORDER BY id ASC`,
    )
    .all()

  const rowsStmt = database.prepare(
    `SELECT id, price FROM inv_pricing_rule_row
     WHERE rule_id = ? ORDER BY sort_order ASC, id ASC`,
  )
  const partStmt = database.prepare(
    'SELECT option_id FROM inv_pricing_rule_row_part WHERE row_id = ?',
  )

  let best = null
  for (const r of rules) {
    const anchorId = Number(r.anchor_option_id)
    if (!Number.isFinite(anchorId) || !oids.has(anchorId)) continue
    const rows = rowsStmt.all(r.id)
    for (const row of rows) {
      const parts = partStmt.all(row.id).map((p) => Number(p.option_id))
      if (parts.length === 0) continue
      const allIn = parts.every((oid) => oids.has(oid))
      if (!allIn) continue
      const p = row.price == null ? null : Number(row.price)
      if (p == null || !Number.isFinite(p)) continue
      if (!best || parts.length > best.partsMatched) {
        best = {
          ruleId: Number(r.id),
          ruleName: String(r.name || ''),
          rowId: Number(row.id),
          price: p,
          partsMatched: parts.length,
        }
      }
    }
  }
  return best
}

/**
 * Cambia el precio de una fila de regla. Lo usa el alta rápida cuando la
 * usuaria guarda una prenda con precio distinto al sugerido por la regla y
 * acepta el toast de "Actualizar regla".
 */
function updateInvRuleRowPrice(payload) {
  const database = getDb()
  const rowId = Number(payload?.rowId)
  if (!Number.isFinite(rowId) || rowId <= 0) throw new Error('rowId inválido.')
  const price = Number(payload?.price)
  if (!Number.isFinite(price) || price < 0) throw new Error('Precio inválido.')
  const exists = database.prepare('SELECT id FROM inv_pricing_rule_row WHERE id = ?').get(rowId)
  if (!exists) throw new Error('La fila de la regla ya no existe.')
  database.prepare('UPDATE inv_pricing_rule_row SET price = ? WHERE id = ?').run(price, rowId)
  // Tocar updated_at de la regla padre.
  const parent = database
    .prepare('SELECT rule_id FROM inv_pricing_rule_row WHERE id = ?')
    .get(rowId)
  if (parent?.rule_id) {
    database
      .prepare(`UPDATE inv_pricing_rule SET updated_at = datetime('now') WHERE id = ?`)
      .run(parent.rule_id)
  }
  return { ok: true }
}

/**
 * Compara el precio recién guardado vs lo que dicta la regla aplicable. Si
 * difieren, devuelve datos para que el frontend muestre un toast no-molesto
 * con la acción "Actualizar regla".
 */
function detectInvRulePriceMismatch(database, descripcion, tagsByGroupRaw, precioGuardado) {
  const tagsByGroup = parseTagsByGroup(tagsByGroupRaw)
  const desc = String(descripcion || '').trim()
  if (desc) {
    try {
      const auto = ensureTipoOptionForDescripcion(database, desc, tagsByGroup, { createIfMissing: false })
      if (auto?.optionId && !tagsByGroup[auto.groupId]) tagsByGroup[auto.groupId] = auto.optionId
    } catch { /* noop */ }
  }
  const ruleMatch = findApplicableInvRulePrice({ tagsByGroup })
  if (!ruleMatch) return null
  const submitted = Number(precioGuardado)
  if (!Number.isFinite(submitted) || submitted < 0) return null
  if (Math.abs(submitted - Number(ruleMatch.price)) < 0.005) return null
  return {
    ruleId: ruleMatch.ruleId,
    ruleName: ruleMatch.ruleName,
    rowId: ruleMatch.rowId,
    rulePrice: Number(ruleMatch.price),
    submittedPrice: submitted,
  }
}

/**
 * Cuenta prendas vivas que tienen TODOS los tags actuales (subset match) y
 * pertenecen al mismo Tipo (si el descripción lo indica). Útil para mostrar
 * en el alta rápida un indicador progresivo: "1 prenda similar — al guardar
 * la 2da te sugiero regla". El detector de regla usa esta misma lógica.
 *
 * @param {object} payload - { tagsByGroup, descripcion?, excludeProductId? }
 * @returns {{ count: number, oids: number[] }}
 */
function countSimilarProducts(payload) {
  const database = getDb()
  const tagsByGroup = parseTagsByGroup(payload?.tagsByGroup)
  const desc = String(payload?.descripcion || '').trim()
  if (desc) {
    try {
      const auto = ensureTipoOptionForDescripcion(database, desc, tagsByGroup)
      if (auto?.optionId && !tagsByGroup[auto.groupId]) tagsByGroup[auto.groupId] = auto.optionId
    } catch { /* noop */ }
  }
  const oids = [...alta.toOptionIdSet(Object.values(tagsByGroup))]
  if (oids.length === 0) return { count: 0, oids: [] }

  const excludeIdRaw = payload?.excludeProductId
  const excludeId =
    excludeIdRaw != null && Number.isFinite(Number(excludeIdRaw)) && Number(excludeIdRaw) > 0
      ? Math.floor(Number(excludeIdRaw))
      : 0

  const placeholders = oids.map(() => '?').join(',')
  const sql = `
    SELECT COUNT(*) AS n FROM productos p
    WHERE p.id IN (
      SELECT pt.producto_id FROM producto_tags pt
      WHERE pt.tag_option_id IN (${placeholders})
      GROUP BY pt.producto_id
      HAVING COUNT(DISTINCT pt.tag_option_id) = ?
    )
    AND COALESCE(p.estado, 'disponible') NOT IN ('vendido')
    ${excludeId ? 'AND p.id != ?' : ''}
  `
  const params = [...oids, oids.length]
  if (excludeId) params.push(excludeId)
  const row = database.prepare(sql).get(...params)
  return { count: Number(row?.n || 0), oids }
}

/** Mediana simple. */
function _median(arr) {
  const xs = [...arr].sort((a, b) => a - b)
  const n = xs.length
  if (n === 0) return 0
  return n % 2 === 1 ? xs[(n - 1) / 2] : (xs[n / 2 - 1] + xs[n / 2]) / 2
}

/** Elige el ancla "natural" para una combinación de tags. Prefiere el tag
 *  cuyo grupo es "Tipo" (el más estructural). En su ausencia, el más antiguo. */
function pickSmartAnchor(database, oids) {
  const tipoGroup = findTipoGroup(database, false)
  if (tipoGroup && oids.length > 0) {
    const placeholders = oids.map(() => '?').join(',')
    const row = database
      .prepare(
        `SELECT id FROM tag_options WHERE group_id = ? AND id IN (${placeholders}) LIMIT 1`,
      )
      .get(tipoGroup.id, ...oids)
    if (row?.id) return Number(row.id)
  }
  return Math.min(...oids)
}

/**
 * Detecta si una combinación de tags amerita crear una regla nueva o agregar
 * una fila a una regla existente.
 *
 * Lógica:
 *  - Necesita ≥2 tags seleccionados.
 *  - ≥3 prendas vivas (no «vendido») que tengan TODOS esos tags.
 *  - Todos los precios dentro de ±5% del promedio (tolerancia para que
 *    pequeñas variaciones manuales no rompan la detección).
 *  - Si ya existe una regla cuya combinación matchea exactamente → null
 *    (no hace falta proponer nada, ya aplica).
 *  - Si existe una regla con anchor "compatible" (uno de los tags actuales)
 *    pero ninguna de sus filas matchea exactamente → action: 'append'
 *    (ofrecer agregar la fila a esa regla).
 *  - Si no hay regla relacionada → action: 'create' (regla nueva).
 *
 * @param {object} payload - { tagsByGroup, excludeProductId? }
 * @returns {
 *   | { action: 'create', anchorOptionId, companionIds, price, count }
 *   | { action: 'append', ruleId, ruleName, anchorOptionId, companionIds, price, count }
 *   | null
 * }
 */
/**
 * Resuelve "el tag de Tipo" presente en una selección de oids. Si no hay,
 * devuelve null. Es el único anchor aceptable para reglas auto-creadas: sin
 * un Tipo claro la regla es indistinguible (anchor sería un material o talla
 * casual, lo cual genera reglas con nombres extraños como "HM" cuando la
 * usuaria quería "Calzón").
 */
function pickTipoAnchorFromOids(database, oids) {
  const tipoGroup = findTipoGroup(database, false)
  if (!tipoGroup || oids.length === 0) return null
  const placeholders = oids.map(() => '?').join(',')
  const row = database
    .prepare(
      `SELECT id FROM tag_options WHERE group_id = ? AND id IN (${placeholders}) LIMIT 1`,
    )
    .get(tipoGroup.id, ...oids)
  return row?.id ? Number(row.id) : null
}

/**
 * Detecta si la combinación amerita una regla NUEVA. Sólo dispara si:
 *  - Hay un tag de grupo "Tipo" presente (nunca crea reglas con anchor raro).
 *  - ≥2 prendas vivas tienen TODOS estos tags y todas con precio dentro de
 *    ±5% del promedio.
 *  - No existe ya una regla cuyo anchor esté en estos tags (las existentes
 *    se actualizan automáticamente vía auto-append, no creamos paralelas).
 *
 * Ahora se usa SOLO desde el backend (auto-create silencioso). El frontend
 * no la invoca; deja de haber toasts molestos.
 */
function detectInvRuleCandidate(payload) {
  const database = getDb()
  const tagsByGroup = parseTagsByGroup(payload?.tagsByGroup)
  const desc = String(payload?.descripcion || '').trim()
  if (desc) {
    try {
      const auto = ensureTipoOptionForDescripcion(database, desc, tagsByGroup)
      if (auto?.optionId && !tagsByGroup[auto.groupId]) tagsByGroup[auto.groupId] = auto.optionId
    } catch { /* noop */ }
  }
  const oids = [...alta.toOptionIdSet(Object.values(tagsByGroup))]
  if (oids.length < 2) return null

  // Sin Tipo claro, no auto-creamos: evita reglas con anchor casual (HM, M).
  const anchorOptionId = pickTipoAnchorFromOids(database, oids)
  if (!anchorOptionId) return null

  // Match exacto ya existe → nada que hacer.
  if (findApplicableInvRulePrice({ tagsByGroup })) return null

  // Si YA hay una regla con este Tipo como anchor, NO crear una nueva.
  // El auto-append se encarga de sumarle filas a la existente.
  const placeholders = oids.map(() => '?').join(',')
  const existingRule = database
    .prepare(
      `SELECT id FROM inv_pricing_rule
       WHERE active = 1 AND anchor_option_id = ?
       LIMIT 1`,
    )
    .get(anchorOptionId)
  if (existingRule) return null

  const excludeIdRaw = payload?.excludeProductId
  const excludeId =
    excludeIdRaw != null && Number.isFinite(Number(excludeIdRaw)) && Number(excludeIdRaw) > 0
      ? Math.floor(Number(excludeIdRaw))
      : 0

  // Prendas vivas con todos estos tags (subset match).
  const sql = `
    SELECT p.id, p.precio
    FROM productos p
    WHERE p.id IN (
      SELECT pt.producto_id FROM producto_tags pt
      WHERE pt.tag_option_id IN (${placeholders})
      GROUP BY pt.producto_id
      HAVING COUNT(DISTINCT pt.tag_option_id) = ?
    )
    AND COALESCE(p.estado, 'disponible') NOT IN ('vendido')
    ${excludeId ? 'AND p.id != ?' : ''}
  `
  const params = [...oids, oids.length]
  if (excludeId) params.push(excludeId)
  const rows = database.prepare(sql).all(...params)
  if (rows.length < 2) return null

  const prices = rows
    .map((r) => Number(r.precio))
    .filter((n) => Number.isFinite(n) && n >= 0)
  if (prices.length < 2) return null

  const avg = prices.reduce((a, b) => a + b, 0) / prices.length
  if (avg <= 0) return null
  const tolerance = Math.max(0.5, avg * 0.05)
  if (!prices.every((p) => Math.abs(p - avg) <= tolerance)) return null
  const price = Math.round(_median(prices) * 100) / 100

  const companionIds = oids.filter((o) => o !== anchorOptionId).sort((a, b) => a - b)
  if (companionIds.length === 0) return null

  const anchorOpt = database.prepare('SELECT name FROM tag_options WHERE id = ?').get(anchorOptionId)
  const ruleName = anchorOpt?.name ? String(anchorOpt.name) : 'Regla'

  return {
    action: 'create',
    anchorOptionId,
    companionIds,
    price,
    count: prices.length,
    suggestedName: ruleName,
  }
}

/**
 * Crea una regla del cuaderno SILENCIOSAMENTE si la combo lo amerita. Se
 * llama después de guardar la prenda, dentro de addProduct/updateProduct.
 * No hay toast de pregunta — la usuaria no se entera salvo si va al
 * cuaderno. Si la regla queda mal, se borra desde el cuaderno con un click.
 *
 * @returns {{ ruleId, ruleName, anchorOptionName, companionNames } | null}
 */
function autoCreateInvRuleIfApplicable(database, descripcion, tagsByGroupRaw, _excludeId) {
  const candidate = detectInvRuleCandidate({
    tagsByGroup: tagsByGroupRaw,
    descripcion,
    excludeProductId: _excludeId,
  })
  if (!candidate || candidate.action !== 'create') return null

  // Reusamos upsertInvPricingRule para no duplicar lógica.
  try {
    upsertInvPricingRule({
      name: candidate.suggestedName,
      anchorOptionId: candidate.anchorOptionId,
      scopeAll: true,
      scopeGroupIds: [],
      rows: [{ companionIds: candidate.companionIds, price: candidate.price }],
      customFields: [],
    })
  } catch {
    return null
  }
  // Resolver nombres para feedback (lo decide el frontend si lo muestra).
  const anchorOpt = database.prepare('SELECT name FROM tag_options WHERE id = ?').get(candidate.anchorOptionId)
  const companionNames = []
  for (const cid of candidate.companionIds) {
    const opt = database.prepare('SELECT name FROM tag_options WHERE id = ?').get(cid)
    if (opt?.name) companionNames.push(String(opt.name))
  }
  return {
    ruleName: candidate.suggestedName,
    anchorOptionName: anchorOpt?.name ? String(anchorOpt.name) : '',
    companionNames,
  }
}

/**
 * Si la prenda recién guardada matchea una regla del cuaderno (anchor en sus
 * tags) pero la combo exacta de tags todavía no es una fila de esa regla,
 * agrega la fila SILENCIOSAMENTE. Esto absorbe variaciones nuevas en una
 * regla existente sin obligar a la usuaria a confirmar cada vez.
 *
 * Solo dispara si:
 *  - Hay ≥2 oids (regla con un solo tag no aporta).
 *  - No existe ya match exacto (`findApplicableInvRulePrice` devuelve null).
 *  - Existe regla activa cuyo anchor está en esos tags.
 *  - La fila exacta (mismos companions) no existe todavía.
 *
 * @returns {{ ruleId, ruleName, companionNames: string[], price } | null}
 */
function autoAppendInvRuleIfApplicable(database, descripcion, tagsByGroupRaw, precio) {
  const tagsByGroup = parseTagsByGroup(tagsByGroupRaw)
  const desc = String(descripcion || '').trim()
  if (desc) {
    try {
      const auto = ensureTipoOptionForDescripcion(database, desc, tagsByGroup, { createIfMissing: false })
      if (auto?.optionId && !tagsByGroup[auto.groupId]) tagsByGroup[auto.groupId] = auto.optionId
    } catch { /* noop */ }
  }
  const oids = [...alta.toOptionIdSet(Object.values(tagsByGroup))]
  if (oids.length < 2) return null

  // Si no hay Tipo en los tags, no append (mismo principio que create:
  // sólo trabajamos con reglas que tienen anchor de grupo Tipo).
  const tipoAnchor = pickTipoAnchorFromOids(database, oids)
  if (!tipoAnchor) return null

  // Si ya hay match exacto, la regla ya cubre — no duplicar.
  if (findApplicableInvRulePrice({ tagsByGroup })) return null

  // Sólo consideramos reglas cuyo anchor es exactamente el Tipo de esta
  // prenda. Reglas legacy con anchor de otro grupo (creadas antes del fix)
  // no se tocan: la usuaria puede limpiarlas desde el cuaderno.
  const ruleRows = database
    .prepare(
      `SELECT id, name, anchor_option_id FROM inv_pricing_rule
       WHERE active = 1 AND anchor_option_id = ?
       ORDER BY id ASC`,
    )
    .all(tipoAnchor)
  if (ruleRows.length === 0) return null

  const r = ruleRows[0]
  const anchorId = Number(r.anchor_option_id)
  const companionIds = oids.filter((o) => o !== anchorId).sort((a, b) => a - b)
  if (companionIds.length === 0) return null

  const price = Number(precio)
  if (!Number.isFinite(price) || price < 0) return null

  // Si la fila exacta ya existe, salir. (Defensivo: findApplicableInvRulePrice
  // arriba tendría que haber matcheado, pero por las dudas).
  const existingRows = database
    .prepare(
      `SELECT id FROM inv_pricing_rule_row WHERE rule_id = ? ORDER BY sort_order ASC, id ASC`,
    )
    .all(r.id)
  const partStmt = database.prepare(
    'SELECT option_id FROM inv_pricing_rule_row_part WHERE row_id = ?',
  )
  for (const row of existingRows) {
    const parts = partStmt.all(row.id).map((p) => Number(p.option_id))
    if (parts.length === companionIds.length) {
      const set = new Set(parts)
      if (companionIds.every((c) => set.has(c))) return null
    }
  }

  // Agregar fila nueva.
  const sortRow = database
    .prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM inv_pricing_rule_row WHERE rule_id = ?')
    .get(r.id)
  const nextSort = (Number(sortRow?.m) || 0) + 1
  const insRow = database.prepare(
    `INSERT INTO inv_pricing_rule_row (rule_id, sort_order, price, created_at)
     VALUES (?, ?, ?, datetime('now'))`,
  )
  const insPart = database.prepare(
    'INSERT INTO inv_pricing_rule_row_part (row_id, option_id) VALUES (?, ?)',
  )
  const tx = database.transaction(() => {
    const info = insRow.run(r.id, nextSort, price)
    const newRowId = Number(info.lastInsertRowid)
    for (const cid of companionIds) insPart.run(newRowId, cid)
    return newRowId
  })
  tx()

  // Nombres bonitos para feedback al frontend.
  const companionNames = []
  for (const cid of companionIds) {
    const opt = database.prepare('SELECT name FROM tag_options WHERE id = ?').get(cid)
    if (opt?.name) companionNames.push(String(opt.name))
  }

  return {
    ruleId: Number(r.id),
    ruleName: String(r.name || ''),
    companionNames,
    price,
  }
}

/**
 * Agrega una fila (companions + precio) a una regla existente. Si la combo
 * exacta de companions ya está, actualiza el precio en su lugar. Es la API
 * que usa el alta rápida cuando detecta una variación nueva de una regla
 * existente (ej: la regla "Pantalón → Mezclilla=$650" recibe la fila
 * "Pantalón → Gabardina=$595").
 *
 * @param {object} payload - { ruleId, companionIds, price }
 * @returns {{ ok: true, rowId: number, updated: boolean }}
 */
function appendInvRuleRow(payload) {
  const database = getDb()
  const ruleId = Number(payload?.ruleId)
  if (!Number.isFinite(ruleId) || ruleId <= 0) throw new Error('ruleId inválido.')
  const rule = database
    .prepare('SELECT id, anchor_option_id, active FROM inv_pricing_rule WHERE id = ?')
    .get(ruleId)
  if (!rule) throw new Error('La regla no existe.')
  if (!Number(rule.active)) throw new Error('La regla está inactiva.')
  const anchorId = Number(rule.anchor_option_id)
  const rawCids = Array.isArray(payload?.companionIds) ? payload.companionIds : []
  const companionIds = [...new Set(rawCids.map(Number).filter((n) => Number.isFinite(n) && n > 0))]
  if (companionIds.length === 0) throw new Error('Falta al menos un companion.')
  if (companionIds.includes(anchorId)) {
    throw new Error('Las filas no pueden incluir el mismo tag que el ancla.')
  }
  const price = Number(payload?.price)
  if (!Number.isFinite(price) || price < 0) throw new Error('Precio inválido.')

  // ¿Hay fila con esa combo exacta de companions?
  const existingRows = database
    .prepare(
      `SELECT id FROM inv_pricing_rule_row WHERE rule_id = ? ORDER BY sort_order ASC, id ASC`,
    )
    .all(ruleId)
  const partStmt = database.prepare(
    'SELECT option_id FROM inv_pricing_rule_row_part WHERE row_id = ?',
  )
  for (const row of existingRows) {
    const parts = partStmt.all(row.id).map((p) => Number(p.option_id))
    if (parts.length !== companionIds.length) continue
    const set = new Set(parts)
    if (companionIds.every((c) => set.has(c))) {
      database.prepare('UPDATE inv_pricing_rule_row SET price = ? WHERE id = ?').run(price, row.id)
      return { ok: true, rowId: Number(row.id), updated: true }
    }
  }

  const sortRow = database
    .prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM inv_pricing_rule_row WHERE rule_id = ?')
    .get(ruleId)
  const nextSort = (Number(sortRow?.m) || 0) + 1
  const insRow = database.prepare(
    `INSERT INTO inv_pricing_rule_row (rule_id, sort_order, price, created_at)
     VALUES (?, ?, ?, datetime('now'))`,
  )
  const insPart = database.prepare(
    'INSERT INTO inv_pricing_rule_row_part (row_id, option_id) VALUES (?, ?)',
  )
  const tx = database.transaction(() => {
    const info = insRow.run(ruleId, nextSort, price)
    const newId = Number(info.lastInsertRowid)
    for (const cid of companionIds) insPart.run(newId, cid)
    return newId
  })
  const rowId = tx()
  return { ok: true, rowId, updated: false }
}

function getReferenceRows(payload) {
  const database = getDb()
  const tagsByGroup = parseTagsByGroup(payload?.tagsByGroup)
  const oids = alta.toOptionIdSet(Object.values(tagsByGroup))
  const codigo = String(payload?.codigo || '').trim() || null
  const mode = String(payload?.mode || alta.AUTO_FILL_CUADERNO)
  return alta.filasReferenciaPrecio(database, oids, codigo, mode)
}

function getReferenceSnapshot(payload) {
  const database = getDb()
  const tagsByGroup = parseTagsByGroup(payload?.tagsByGroup)
  const oids = alta.toOptionIdSet(Object.values(tagsByGroup))
  const codigo = String(payload?.codigo || '').trim() || null
  const cuaderno = alta.snapshotReferenciaCuaderno(database, oids, tagsByGroup)
  const patrones = alta.snapshotReferenciaPatrones(database, oids, codigo, tagsByGroup)
  return { cuaderno, patrones, tagLabels: alta.tagLabelsForSelection(database, tagsByGroup) }
}

/** @deprecated usar getReferenceSnapshot */
function getReferencePatternStats(payload) {
  const database = getDb()
  const tagsByGroup = parseTagsByGroup(payload?.tagsByGroup ?? payload?.tags)
  const oids = alta.toOptionIdSet(Object.values(tagsByGroup))
  const excludeCodigo = String(payload?.excludeCodigo || '').trim() || null
  const snap = alta.snapshotReferenciaPatrones(database, oids, excludeCodigo, tagsByGroup)
  if (!snap.encontrado) {
    return {
      encontrado: false,
      mensaje: snap.mensaje,
      stats: null,
      productos: [],
    }
  }
  return {
    encontrado: true,
    mensaje: '',
    stats: snap.stats,
    productos: snap.productos.map((p) => ({
      codigo: p.codigo,
      descripcion: p.nombre,
      precio: p.precio,
      estado: p.estado,
    })),
  }
}

function roundPrice(p, mode) {
  let x = Math.max(0, Number(p) || 0)
  const m = mode || 'centavos'
  if (m === 'centavos') return Math.round(x * 100) / 100
  if (m === 'entero') return Math.round(x)
  if (m === 'medio') return Math.round(x * 2) / 2
  if (m === 'punto90') {
    if (x < 5) return Math.round(x * 100) / 100
    return Math.round((Math.floor(x) + 0.9) * 100) / 100
  }
  return Math.round(x * 100) / 100
}

function computeNewPrice(old, opts) {
  const { adjustMode, adjustValue, sumSign, roundMode } = opts
  if (adjustMode === 'fixed') {
    return roundPrice(Number(adjustValue) || 0, 'centavos')
  }
  let o = Number(old) || 0
  let newP
  if (adjustMode === 'pct') {
    newP = o * (1 + Number(adjustValue) / 100)
  } else {
    newP = o + Number(adjustValue || 0) * (sumSign === -1 ? -1 : 1)
  }
  return roundPrice(newP, roundMode)
}

const PREVIEW_CAP = 500

/** Productos del catálogo activo que coinciden con una categoría (y marca opcional). */
function queryProductosAjustePorCatMarca(database, categoria, marca) {
  const cat = String(categoria || '').trim()
  if (!cat) return []
  const params = [cat.toLowerCase()]
  let sql = `SELECT p.* FROM inventario_activo p WHERE LOWER(TRIM(COALESCE(p.categoria, ''))) = ?`
  const mar = String(marca || '').trim()
  if (mar) { sql += ` AND LOWER(TRIM(COALESCE(p.marca, ''))) = ?`; params.push(mar.toLowerCase()) }
  sql += ' ORDER BY p.codigo ASC'
  return database.prepare(sql).all(...params)
}

/**
 * Productos que coinciden con el filtro del ajuste de precios. Si llega `categoria`
 * se filtra por categoría (+marca opcional) — el modelo de la dueña; si no, por
 * etiquetas del cuaderno (modo avanzado, compatibilidad).
 */
function matchProductosAjuste(database, payload) {
  const categoria = String(payload?.categoria || '').trim()
  if (categoria) return queryProductosAjustePorCatMarca(database, categoria, payload?.marca)
  const rawIds = payload?.tagOptionIds ?? payload?.filterTags ?? []
  const tagOptionIds = Array.isArray(rawIds) ? rawIds.map(Number).filter((n) => Number.isFinite(n)) : []
  return alta.queryProductosAjustePorTags(database, Boolean(payload?.matchExact), tagOptionIds)
}

function previewPriceAdjust(payload) {
  const database = getDb()
  const adjustMode = payload?.adjustMode || 'pct'
  const adjustValue = Number(payload?.adjustValue)
  const sumSign = payload?.sumSign === -1 ? -1 : 1
  const roundMode = payload?.roundMode || 'centavos'

  const matched = matchProductosAjuste(database, payload)
  const rows = matched.map((p) => {
    const oldP = Number(p.precio) || 0
    const newP = computeNewPrice(oldP, { adjustMode, adjustValue, sumSign, roundMode })
    return {
      id: p.id,
      codigo: p.codigo,
      descripcion: (p.descripcion || '').slice(0, 80),
      precioActual: oldP,
      precioNuevo: newP,
    }
  })
  const previewRows = rows.slice(0, PREVIEW_CAP)
  return {
    total: rows.length,
    truncated: rows.length > PREVIEW_CAP,
    rows: previewRows,
  }
}

function applyPriceAdjust(payload) {
  const database = getDb()
  const adjustMode = payload?.adjustMode || 'pct'
  const adjustValue = Number(payload?.adjustValue)
  const sumSign = payload?.sumSign === -1 ? -1 : 1
  const roundMode = payload?.roundMode || 'centavos'

  const matched = matchProductosAjuste(database, payload)
  if (matched.length === 0) return { ok: true, updated: 0 }

  const upd = database.prepare(
    `UPDATE productos SET precio = @precio, updated_at = datetime('now') WHERE id = @id`,
  )
  const run = database.transaction(() => {
    for (const p of matched) {
      const newP = computeNewPrice(Number(p.precio) || 0, {
        adjustMode,
        adjustValue,
        sumSign,
        roundMode,
      })
      upd.run({ id: p.id, precio: newP })
    }
  })
  run()
  return { ok: true, updated: matched.length }
}

function ensureVentasSchema(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS ventas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      total REAL NOT NULL DEFAULT 0,
      pago_con REAL,
      cambio REAL,
      metodo TEXT NOT NULL DEFAULT 'efectivo',
      monto_efectivo REAL DEFAULT 0,
      monto_transferencia REAL DEFAULT 0,
      monto_credito REAL DEFAULT 0,
      monto_vale REAL DEFAULT 0,
      notas TEXT DEFAULT '',
      cuenta_bancaria TEXT DEFAULT '',
      saldos_cliente_id INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS vales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT NOT NULL UNIQUE,
      monto REAL NOT NULL,
      monto_usado REAL NOT NULL DEFAULT 0,
      estado TEXT NOT NULL DEFAULT 'activo',
      origen TEXT DEFAULT '',
      venta_origen_id INTEGER,
      nota TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      usado_en TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_vales_codigo ON vales(codigo);
    CREATE TABLE IF NOT EXISTS venta_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venta_id INTEGER NOT NULL,
      producto_id INTEGER NOT NULL,
      codigo_snapshot TEXT,
      nombre_snapshot TEXT,
      precio_snapshot REAL NOT NULL,
      cantidad INTEGER NOT NULL DEFAULT 1,
      devuelto_en TEXT,
      FOREIGN KEY (venta_id) REFERENCES ventas(id) ON DELETE CASCADE,
      FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE RESTRICT
    );
    CREATE INDEX IF NOT EXISTS idx_venta_items_venta ON venta_items(venta_id);
  `)
  /* Migración: agregar devuelto_en si la tabla viene de una versión vieja. */
  const cols = database.prepare(`PRAGMA table_info(venta_items)`).all()
  if (!cols.some((c) => c.name === 'devuelto_en')) {
    database.exec(`ALTER TABLE venta_items ADD COLUMN devuelto_en TEXT`)
  }
  
  /* Migración: columnas nuevas de ventas en bases viejas. */
  try {
    const vCols = database.prepare(`PRAGMA table_info(ventas)`).all()
    if (!vCols.some((c) => c.name === 'cuenta_bancaria')) {
      database.exec(`ALTER TABLE ventas ADD COLUMN cuenta_bancaria TEXT DEFAULT ''`)
    }
    if (!vCols.some((c) => c.name === 'saldos_cliente_id')) {
      database.exec(`ALTER TABLE ventas ADD COLUMN saldos_cliente_id INTEGER`)
    }
    if (!vCols.some((c) => c.name === 'monto_efectivo')) {
      database.exec(`ALTER TABLE ventas ADD COLUMN monto_efectivo REAL DEFAULT 0;
                     ALTER TABLE ventas ADD COLUMN monto_transferencia REAL DEFAULT 0;
                     ALTER TABLE ventas ADD COLUMN monto_credito REAL DEFAULT 0;`)
    }
    if (!vCols.some((c) => c.name === 'monto_vale')) {
      database.exec(`ALTER TABLE ventas ADD COLUMN monto_vale REAL DEFAULT 0`)
    }
  } catch (e) {
    console.error('[ventas] migración columnas:', e?.message || e)
  }
}

/* ── Vales (saldo a favor "al portador", para clientes NO registrados) ──
 * Se generan al devolver sin cuenta y se canjean en caja como forma de pago.
 * No vencen (decisión de la dueña). Nunca se borran: se marcan usados. */
function generarCodigoVale(database) {
  for (let i = 0; i < 30; i++) {
    const code = 'V-' + Math.random().toString(36).slice(2, 7).toUpperCase()
    const hit = database.prepare('SELECT 1 FROM vales WHERE codigo = ?').get(code)
    if (!hit) return code
  }
  return 'V-' + Date.now().toString(36).toUpperCase()
}

function crearVale(database, { monto, origen = '', ventaOrigenId = null, nota = '' } = {}) {
  const m = Math.round(Number(monto) * 100) / 100
  if (!Number.isFinite(m) || m <= 0) throw new Error('Monto de vale inválido.')
  const codigo = generarCodigoVale(database)
  database.prepare(
    `INSERT INTO vales (codigo, monto, origen, venta_origen_id, nota) VALUES (?, ?, ?, ?, ?)`,
  ).run(codigo, m, String(origen || '').slice(0, 60), ventaOrigenId, String(nota || '').slice(0, 200))
  return { ok: true, codigo, monto: m }
}

function buscarVale(codigo) {
  const database = getDb()
  ensureVentasSchema(database)
  const code = String(codigo || '').trim().toUpperCase()
  if (!code) return null
  const v = database.prepare('SELECT * FROM vales WHERE UPPER(codigo) = ?').get(code)
  if (!v) return null
  const disponible = Math.max(0, Math.round(((Number(v.monto) || 0) - (Number(v.monto_usado) || 0)) * 100) / 100)
  return {
    codigo: v.codigo,
    monto: Number(v.monto) || 0,
    usado: Number(v.monto_usado) || 0,
    disponible,
    estado: v.estado,
    activo: v.estado === 'activo' && disponible > 0.005,
  }
}

/**
 * Lista los vales para la vista de Saldos (ver / reimprimir). Más recientes
 * primero. `disponible` y `activo` se calculan; no vencen.
 * @param {{ soloActivos?: boolean }} [opts]
 */
function listVales(opts = {}) {
  const database = getDb()
  ensureVentasSchema(database)
  const rows = database.prepare('SELECT * FROM vales ORDER BY datetime(created_at) DESC, id DESC').all()
  const lista = rows.map((v) => {
    const monto = Number(v.monto) || 0
    const usado = Number(v.monto_usado) || 0
    const disponible = Math.max(0, Math.round((monto - usado) * 100) / 100)
    return {
      codigo: v.codigo,
      monto,
      usado,
      disponible,
      estado: v.estado,
      activo: v.estado === 'activo' && disponible > 0.005,
      origen: v.origen || '',
      nota: v.nota || '',
      ventaOrigenId: v.venta_origen_id != null ? Number(v.venta_origen_id) : null,
      createdAt: v.created_at || null,
      usadoEn: v.usado_en || null,
    }
  })
  return opts?.soloActivos ? lista.filter((x) => x.activo) : lista
}

function ensureIntercambiosSchema(database) {
  ensureVentasSchema(database)
  database.exec(`
    CREATE TABLE IF NOT EXISTS intercambios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venta_origen_id INTEGER,
      venta_salida_id INTEGER,
      cliente_id INTEGER,
      diferencia REAL NOT NULL DEFAULT 0,
      diferencia_metodo TEXT,
      notas TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (venta_origen_id) REFERENCES ventas(id) ON DELETE SET NULL,
      FOREIGN KEY (venta_salida_id) REFERENCES ventas(id) ON DELETE SET NULL,
      FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS intercambio_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      intercambio_id INTEGER NOT NULL,
      rol TEXT NOT NULL CHECK(rol IN ('entra', 'sale')),
      producto_id INTEGER NOT NULL,
      venta_item_origen_id INTEGER,
      codigo_snapshot TEXT,
      nombre_snapshot TEXT,
      precio_snapshot REAL NOT NULL,
      FOREIGN KEY (intercambio_id) REFERENCES intercambios(id) ON DELETE CASCADE,
      FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE RESTRICT,
      FOREIGN KEY (venta_item_origen_id) REFERENCES venta_items(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_intercambio_items_intercambio ON intercambio_items(intercambio_id);
    CREATE INDEX IF NOT EXISTS idx_intercambios_venta_origen ON intercambios(venta_origen_id);
  `)
}

function getSales(filters = {}) {
  const database = getDb()
  ensureVentasSchema(database)
  const limit = Math.max(1, Math.min(1000, Math.floor(Number(filters?.limit) || 50)))
  const where = []
  const params = { limit }
  const q = String(filters?.query || '').trim()
  const metodoFiltro = String(filters?.metodo || '').trim().toLowerCase()
  const desde = String(filters?.from || filters?.desde || '').slice(0, 10)
  const hasta = String(filters?.to || filters?.hasta || '').slice(0, 10)

  /* created_at se guarda en UTC; el usuario filtra por DÍA LOCAL (igual que
   * diaLocalDeVenta en el front). Convertimos a hora local antes de comparar,
   * si no las ventas de la tarde/noche (que ruedan al día UTC siguiente) se
   * salían del reporte de "hoy". */
  if (desde) {
    where.push(`substr(datetime(v.created_at, 'localtime'), 1, 10) >= @desde`)
    params.desde = desde
  }
  if (hasta) {
    where.push(`substr(datetime(v.created_at, 'localtime'), 1, 10) <= @hasta`)
    params.hasta = hasta
  }
  if (metodoFiltro && metodoFiltro !== 'todos') {
    where.push(`LOWER(COALESCE(v.metodo, '')) = @metodo`)
    params.metodo = metodoFiltro
  }
  if (q) {
    where.push(`(
      CAST(v.id AS TEXT) LIKE @q
      OR EXISTS (
        SELECT 1 FROM venta_items viq
        WHERE viq.venta_id = v.id
          AND (LOWER(COALESCE(viq.codigo_snapshot, '')) LIKE @qLower
               OR LOWER(COALESCE(viq.nombre_snapshot, '')) LIKE @qLower)
      )
    )`)
    params.q = `%${q}%`
    params.qLower = `%${q.toLowerCase()}%`
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const rows = database.prepare(
    `SELECT
        v.*,
        COUNT(vi.id) AS item_count,
        SUM(CASE WHEN vi.devuelto_en IS NULL THEN 1 ELSE 0 END) AS active_item_count,
        SUM(CASE WHEN vi.devuelto_en IS NOT NULL THEN 1 ELSE 0 END) AS returned_count,
        COALESCE(SUM(CASE WHEN vi.devuelto_en IS NOT NULL THEN vi.precio_snapshot * vi.cantidad ELSE 0 END), 0) AS returned_total,
        COALESCE(SUM(CASE WHEN vi.devuelto_en IS NOT NULL AND vi.devolucion_metodo = 'efectivo' THEN vi.devolucion_monto ELSE 0 END), 0) AS returned_efectivo,
        COALESCE(SUM(CASE WHEN vi.devuelto_en IS NOT NULL AND vi.devolucion_metodo = 'transferencia' THEN vi.devolucion_monto ELSE 0 END), 0) AS returned_transferencia,
        COALESCE(SUM(CASE WHEN vi.devuelto_en IS NOT NULL AND vi.devolucion_metodo = 'saldos' THEN vi.devolucion_monto ELSE 0 END), 0) AS returned_saldos,
        COALESCE(SUM(CASE WHEN vi.devuelto_en IS NOT NULL AND vi.devolucion_excedente_metodo = 'efectivo' THEN vi.devolucion_excedente ELSE 0 END), 0) AS returned_excedente_efectivo,
        COALESCE(SUM(CASE WHEN vi.devuelto_en IS NOT NULL AND vi.devolucion_excedente_metodo = 'transferencia' THEN vi.devolucion_excedente ELSE 0 END), 0) AS returned_excedente_transferencia
     FROM ventas v
     LEFT JOIN venta_items vi ON vi.venta_id = v.id
     ${whereSql}
     GROUP BY v.id
     ORDER BY v.id DESC
     LIMIT @limit`
  ).all(params)
  return rows.map(r => ({
    ...r,
    item_count: Number(r.item_count) || 0,
    active_item_count: Number(r.active_item_count) || 0,
    returned_count: Number(r.returned_count) || 0,
    returned_total: Number(r.returned_total) || 0,
    returned_efectivo: Number(r.returned_efectivo) || 0,
    returned_transferencia: Number(r.returned_transferencia) || 0,
    returned_saldos: Number(r.returned_saldos) || 0,
    returned_excedente_efectivo: Number(r.returned_excedente_efectivo) || 0,
    returned_excedente_transferencia: Number(r.returned_excedente_transferencia) || 0,
  }))
}

function addSale(payload) {
  const database = getDb()
  ensureVentasSchema(database)
  const items = Array.isArray(payload?.items) ? payload.items : []
  if (items.length === 0) throw new Error('El carrito está vacío.')

  const notas = String(payload?.notas || '').trim()
  const pagos = payload?.pagos || {}
  const efectivo = Number(pagos.efectivo) || 0
  const transferencia = Number(pagos.transferencia) || 0

  const getProd = database.prepare(
    'SELECT id, codigo, descripcion, precio, pieza_unica, stock, estado, vendido_en FROM productos WHERE id = ?',
  )
  const normalized = []
  for (const it of items) {
    const pid = Number(it.productoId || it.producto_id)
    if (!Number.isFinite(pid) || pid <= 0) throw new Error('Ítem de venta con producto no válido.')
    const row = getProd.get(pid)
    if (!row) throw new Error(`Producto no encontrado (id ${pid}).`)
    if (row.vendido_en != null && String(row.vendido_en).trim() !== '') {
      throw new Error(`No se puede vender «${row.codigo}»: figura como vendido en inventario.`)
    }
    const est = String(row.estado || '').trim().toLowerCase()
    if (est && est !== 'disponible') {
      throw new Error(`No se puede vender «${row.codigo}»: estado «${row.estado}».`)
    }
    const cantidad = Math.floor(Number(it.cantidad))
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      throw new Error(`Cantidad invalida para «${row.codigo}».`)
    }
    const pieza = Number(row.pieza_unica) === 1
    if (pieza && cantidad !== 1) throw new Error(`Pieza única «${row.codigo}»: solo 1 unidad por venta.`)
    const stock = Math.max(0, Math.floor(Number(row.stock) || 0))
    if (pieza && stock < 1) throw new Error(`Sin stock para «${row.codigo}».`)
    if (!pieza && cantidad > stock) {
      throw new Error(`Stock insuficiente «${row.codigo}» (disponible: ${stock}).`)
    }
    const precio = Number(row.precio)
    if (!Number.isFinite(precio) || precio <= 0) {
      throw new Error(`No se puede vender «${row.codigo}»: no tiene precio asignado.`)
    }
    const codigo = String(row.codigo || '').trim()
    const nombre = String(row.descripcion || codigo || '').trim()
    normalized.push({ pid, codigo, nombre, precio, cantidad, pieza })
  }

  const total = normalized.reduce((s, x) => s + x.precio * x.cantidad, 0)
  if (!Number.isFinite(total) || total <= 0) throw new Error('Total de venta no válido.')

  /* ── Pagos. Soporta el contrato nuevo (pagos:{efectivo,transferencia} +
   *    clienteId + fiar) y el viejo (metodo + pagoCon + creditoMovimiento),
   *    normalizando todo a montoEfectivo / montoTransferencia / clienteId. ── */
  let montoEfectivo = efectivo
  let montoTransferencia = transferencia
  let clienteId = Number(payload?.clienteId) || null
  let fiar = !!payload?.fiar
  // La dueña decide si se usa el saldo a favor del cliente en esta venta (interruptor
  // en cobro/fiar). Default true por compatibilidad; la UI manda false si lo apaga.
  const usarFavor = payload?.usarFavor !== false

  if (payload?.metodo === 'efectivo' && payload?.pagoCon != null) montoEfectivo = Number(payload.pagoCon) || total
  if (payload?.metodo === 'transferencia') montoTransferencia = total
  if (payload?.metodo === 'credito' && payload?.creditoMovimiento) {
    const cm = payload.creditoMovimiento
    clienteId = Number(cm.saldosClienteId || cm.saldos_cliente_id) || clienteId
    const eng = Math.max(0, Number(cm.enganche) || 0)
    if (String(cm.engancheMetodo || cm.enganche_metodo || 'efectivo').toLowerCase() === 'transferencia') montoTransferencia += eng
    else montoEfectivo += eng
    fiar = true
  }

  if (montoEfectivo < 0 || montoTransferencia < 0) throw new Error('Los pagos no pueden ser negativos.')

  const cuenta_bancaria = String(payload?.cuentaBancaria || payload?.cuenta_bancaria || '').trim()
  if (montoTransferencia > 0 && !cuenta_bancaria) {
    throw new Error('Selecciona la cuenta bancaria de la transferencia.')
  }

  if (clienteId) {
    const cuenta = database.prepare('SELECT id FROM saldos_clientes WHERE id = ?').get(clienteId)
    if (!cuenta) throw new Error('La cuenta de Saldos no existe.')
  }

  /* Saldo a favor: se aplica AUTOMÁTICAMENTE a esta compra (hasta lo que se
   * deba), igual que el motor saldosLedger. No es una casilla manual: si la
   * clienta tiene saldo a favor, baja lo que paga hoy. */
  /* Vale (crédito al portador, p. ej. de una devolución sin cuenta): reduce lo
   * adeudado como crédito; no da cambio. Se valida acá y se marca usado en la tx. */
  let valeCodigo = ''
  let valeAplicado = 0
  const valePago = pagos?.vale
  if (valePago && (valePago.codigo || valePago.monto != null)) {
    const vinfo = buscarVale(valePago.codigo)
    if (!vinfo) throw new Error('Ese vale no existe.')
    if (!vinfo.activo) throw new Error('Ese vale ya no tiene saldo disponible.')
    const pedido = valePago.monto != null ? Number(valePago.monto) : vinfo.disponible
    valeAplicado = Math.round(Math.min(Math.max(0, pedido) || 0, vinfo.disponible, total) * 100) / 100
    if (valeAplicado > 0.005) valeCodigo = vinfo.codigo
    else valeAplicado = 0
  }

  const pagadoCaja = Math.round((montoEfectivo + montoTransferencia) * 100) / 100
  const adeudadoTrasVale = Math.max(0, Math.round((total - valeAplicado) * 100) / 100)
  /* El saldo a favor es DINERO del cliente: se aplica PRIMERO (baja lo que se
   * debe), luego la caja cubre el resto y el efectivo entregado de más se
   * devuelve como CAMBIO. (Antes el favor se aplicaba después de la caja, así que
   * al pagar de más no se daba cambio y el sobrante quedaba atrapado como saldo a
   * favor — el bug que reportó la dueña.) Vale y favor no dan cambio; solo el efectivo. */
  const favorDisponible = (clienteId && usarFavor) ? favorSaldosCliente(database, clienteId) : 0
  const favorAplicado = Math.round(Math.min(favorDisponible, adeudadoTrasVale) * 100) / 100
  const adeudadoTrasFavor = Math.max(0, Math.round((adeudadoTrasVale - favorAplicado) * 100) / 100)
  const faltante = Math.max(0, Math.round((adeudadoTrasFavor - pagadoCaja) * 100) / 100)
  const cambio = Math.max(0, Math.round((pagadoCaja - adeudadoTrasFavor) * 100) / 100)
  const sumaPagos = Math.round((pagadoCaja + valeAplicado + favorAplicado) * 100) / 100

  if (faltante > 0.01) {
    if (!clienteId) throw new Error(`Pago insuficiente: faltan ${faltante.toFixed(2)}. Selecciona un cliente para fiar el resto.`)
    if (!fiar) throw new Error(`Pago insuficiente: faltan ${faltante.toFixed(2)}. Usa «Fiar» para dejar el resto a cuenta.`)
  }

  // La venta toca Saldos si hay cliente y, o queda debiendo, o usó saldo a favor.
  const tocaSaldos = !!clienteId && (faltante > 0.01 || favorAplicado > 0.005)

  // Lo que paga HOY en caja entra como abono a la cuenta, partido por medio.
  const abonoTotal = tocaSaldos ? Math.min(pagadoCaja, adeudadoTrasFavor) : 0
  const abonoEfectivo = Math.round(Math.min(montoEfectivo, abonoTotal) * 100) / 100
  const abonoTransferencia = Math.round((abonoTotal - abonoEfectivo) * 100) / 100
  const abonoVale = tocaSaldos ? valeAplicado : 0

  let metodo
  {
    let conteo = 0
    if (montoEfectivo > 0) conteo++
    if (montoTransferencia > 0) conteo++
    if (valeAplicado > 0.005) conteo++
    if (faltante > 0.01 || favorAplicado > 0.005) conteo++
    if (conteo > 1) metodo = 'mixto'
    else if (montoTransferencia > 0) metodo = 'transferencia'
    else if (valeAplicado > 0.005) metodo = 'vale'
    else if (faltante > 0.01 || favorAplicado > 0.005) metodo = 'credito'
    else metodo = 'efectivo'
  }

  // monto_credito = lo que NO se pagó en caja (fiado + saldo a favor aplicado).
  const montoACuenta = Math.round((favorAplicado + faltante) * 100) / 100

  const creditoPayload = tocaSaldos
    ? {
        saldosClienteId: clienteId,
        monto: total,
        abonoEfectivo,
        abonoTransferencia,
        abonoVale,
        descripcion: `Compra en caja (${normalized.length} artículo${normalized.length === 1 ? '' : 's'})`,
      }
    : null

  const insVenta = database.prepare(
    `INSERT INTO ventas (total, pago_con, cambio, metodo, monto_efectivo, monto_transferencia, monto_credito, monto_vale, notas, cuenta_bancaria, saldos_cliente_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  const insItem = database.prepare(
    `INSERT INTO venta_items (venta_id, producto_id, codigo_snapshot, nombre_snapshot, precio_snapshot, cantidad) VALUES (?, ?, ?, ?, ?, ?)`,
  )
  /* Pieza única: el WHERE re-valida que la prenda siga disponible y sin
   * vendido_en. Si dos cobros corren a la vez (doble click, dos ventanas),
   * solo uno gana — el otro recibe `changes === 0` y aborta la transacción. */
  const updEstadoPieza = database.prepare(
    `UPDATE productos SET estado = 'vendido', vendido_en = datetime('now'), updated_at = datetime('now')
       WHERE id = ?
         AND pieza_unica = 1
         AND vendido_en IS NULL
         AND LOWER(COALESCE(estado, '')) = 'disponible'`,
  )
  const updStockMulti = database.prepare(
    `UPDATE productos SET
       stock = stock - @c,
       estado = CASE WHEN (stock - @c) <= 0 THEN 'vendido' ELSE estado END,
       vendido_en = CASE WHEN (stock - @c) <= 0 THEN datetime('now') ELSE vendido_en END,
       updated_at = datetime('now')
     WHERE id = @id AND pieza_unica = 0 AND stock >= @c`,
  )
  let ventaId
  const run = database.transaction(() => {
    const info = insVenta.run(
      total,
      sumaPagos,
      cambio,
      metodo,
      montoEfectivo,
      montoTransferencia,
      montoACuenta,
      valeAplicado,
      notas,
      cuenta_bancaria,
      creditoPayload ? creditoPayload.saldosClienteId : null
    )
    ventaId = Number(info.lastInsertRowid)
    for (const x of normalized) {
      insItem.run(ventaId, x.pid, x.codigo, x.nombre, x.precio, x.cantidad)
      if (x.pieza) {
        const r = updEstadoPieza.run(x.pid)
        if (r.changes === 0) {
          throw new Error(`«${x.codigo}» ya no está disponible (otra caja la vendió primero).`)
        }
      } else {
        const r = updStockMulti.run({ c: x.cantidad, id: x.pid })
        if (r.changes === 0) throw new Error(`Stock insuficiente al confirmar «${x.codigo}».`)
      }
    }
    if (valeCodigo && valeAplicado > 0.005) {
      const vr = database.prepare(
        `UPDATE vales
            SET monto_usado = monto_usado + @m,
                estado = CASE WHEN (monto_usado + @m) >= monto - 0.005 THEN 'usado' ELSE estado END,
                usado_en = datetime('now')
          WHERE UPPER(codigo) = UPPER(@cod)
            AND estado = 'activo'
            AND (monto - monto_usado) >= @m - 0.005`,
      ).run({ m: valeAplicado, cod: valeCodigo })
      if (vr.changes === 0) throw new Error('El vale ya no tiene saldo suficiente.')
    }
    if (creditoPayload) {
      /* La compra es un `cargo` y el enganche un `abono`, ambos en la libreta
       * de Saldos (saldos_movimientos), referenciando la venta. El saldo no se
       * guarda: lo calcula el motor (src/lib/saldosLedger.js) desde acá. */
      const d = new Date()
      const hoy = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const desc = creditoPayload.descripcion || `Fiado en caja · venta #${ventaId} · ${normalized.length} ${normalized.length === 1 ? 'artículo' : 'artículos'}`
      const movs = [{ tipo: 'cargo', fecha: hoy, monto: creditoPayload.monto, concepto: desc, referenciaIds: [ventaId] }]
      /* Lo que paga en caja hoy entra como abono(s), partido por medio para que
       * el corte del día cuente bien el efectivo vs la transferencia. El saldo a
       * favor previo lo absorbe el motor automáticamente (no se registra acá). */
      if (creditoPayload.abonoEfectivo > 0) {
        movs.push({
          tipo: 'abono', fecha: hoy, monto: creditoPayload.abonoEfectivo,
          concepto: `Enganche venta #${ventaId}`, medio: 'efectivo', referenciaIds: [ventaId],
        })
      }
      if (creditoPayload.abonoTransferencia > 0) {
        movs.push({
          tipo: 'abono', fecha: hoy, monto: creditoPayload.abonoTransferencia,
          concepto: `Enganche venta #${ventaId}`, medio: 'transferencia', referenciaIds: [ventaId],
        })
      }
      if (creditoPayload.abonoVale > 0) {
        movs.push({
          tipo: 'abono', fecha: hoy, monto: creditoPayload.abonoVale,
          concepto: `Pago con vale · venta #${ventaId}`, medio: 'vale', referenciaIds: [ventaId],
        })
      }
      saldosStore.registrarMovimientos(database, creditoPayload.saldosClienteId, movs)
    }
  })
  run()

  recordEvent({
    type: 'sale.completed',
    actor: 'user',
    scope: 'sale',
    entityRef: ventaId,
    source: 'pdv',
    payload: {
      ventaId,
      total,
      cambio,
      metodo,
      itemCount: normalized.length,
      items: normalized.map((x) => ({
        productoId: x.pid,
        codigo: x.codigo,
        precio: x.precio,
        cantidad: x.cantidad,
        piezaUnica: x.pieza,
      })),
      credito: creditoPayload
        ? { saldosClienteId: creditoPayload.saldosClienteId, monto: creditoPayload.monto, abonado: creditoPayload.abonoEfectivo + creditoPayload.abonoTransferencia, favorAplicado, faltante }
        : null,
    },
  })
  if (creditoPayload) {
    recordEvent({
      type: 'credit.movement',
      actor: 'user',
      scope: 'credit',
      entityRef: creditoPayload.saldosClienteId,
      source: 'pdv',
      payload: {
        saldosClienteId: creditoPayload.saldosClienteId,
        tipo: 'cargo',
        monto: creditoPayload.monto,
        abonado: creditoPayload.abonoEfectivo + creditoPayload.abonoTransferencia,
        ventaId,
      },
    })
  }
  return {
    ok: true, ventaId, total, cambio, metodo,
    faltante, favorAplicado, valeAplicado, valeCodigo,
    saldosClienteId: creditoPayload ? creditoPayload.saldosClienteId : null,
  }
}

/** Tabla temporal fija para RENAME durante migración agresiva. */
const CREDITO_MOV_BACKUP = '__mlb_credito_mov_backup'

/** RENUEVA la tabla físicamente cuando ALTER / CREATE IF NOT EXISTS no alcanzan. */
function migrateCreditoMovimientosToCanonical(database) {
  const exists = database
    .prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='credito_movimientos' LIMIT 1`)
    .get()
  if (!exists) return

  database.exec(`DROP TABLE IF EXISTS ${CREDITO_MOV_BACKUP}`)

  const oldCols = database.prepare(`PRAGMA table_info(credito_movimientos)`).all()
  const nm = new Set(oldCols.map((c) => c.name))
  const has = (name) => nm.has(name)
  const exprDescripcion = has('descripcion') ? `COALESCE(t.descripcion, '')` : `''`
  const exprVenta = has('venta_id') ? 't.venta_id' : 'NULL'
  const exprMora = has('mora_periodo') ? 't.mora_periodo' : 'NULL'
  const exprCreated = has('created_at') ? 't.created_at' : `datetime('now')`

  database.transaction(() => {
    database.exec(`ALTER TABLE credito_movimientos RENAME TO ${CREDITO_MOV_BACKUP}`)
    database.exec(`
      CREATE TABLE credito_movimientos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cliente_id INTEGER NOT NULL,
        tipo TEXT NOT NULL CHECK(tipo IN ('compra', 'pago', 'recargo', 'ajuste', 'nota_credito', 'uso_nota')),
        monto REAL NOT NULL,
        descripcion TEXT DEFAULT '',
        venta_id INTEGER,
        mora_periodo TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE,
        FOREIGN KEY (venta_id) REFERENCES ventas(id) ON DELETE SET NULL
      );
    `)
    database.exec(`
      INSERT INTO credito_movimientos (id, cliente_id, tipo, monto, descripcion, venta_id, mora_periodo, created_at)
      SELECT t.id, t.cliente_id, t.tipo, t.monto, ${exprDescripcion}, ${exprVenta}, ${exprMora}, ${exprCreated}
        FROM ${CREDITO_MOV_BACKUP} AS t;
    `)
    database.exec(`DROP TABLE ${CREDITO_MOV_BACKUP}`)
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_credito_mov_cliente ON credito_movimientos(cliente_id);
      CREATE INDEX IF NOT EXISTS idx_credito_mov_venta ON credito_movimientos(venta_id);
    `)
  })()
}

function creditoShapeMatchesCode(database) {
  try {
    database
      .prepare(
        `SELECT id, cliente_id, tipo, monto, descripcion, venta_id, mora_periodo, created_at FROM credito_movimientos LIMIT 0`,
      )
      .all()
    return true
  } catch {
    return false
  }
}

/**
 * Repara estados basura tras migración interrumpida:
 * - backup + tabla final → borra el backup;
 * - sólo backup (sin credito_movimientos) → renombra a credito_movimientos.
 */
function repairCreditoMovBackupOrphans(database) {
  const b = database
    .prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`)
    .get(CREDITO_MOV_BACKUP)
  const m = database
    .prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='credito_movimientos'`)
    .get()
  if (b && m) {
    database.exec(`DROP TABLE IF EXISTS ${CREDITO_MOV_BACKUP}`)
    return
  }
  if (b && !m) {
    database.exec(`ALTER TABLE ${CREDITO_MOV_BACKUP} RENAME TO credito_movimientos`)
  }
}

function creditoTipoRecargoAccepted(database) {
  const ddlRow = database.prepare(
    `SELECT sql FROM sqlite_master WHERE type='table' AND name='credito_movimientos'`,
  ).get()
  const ddl = String(ddlRow?.sql || '')
  if (ddl.length > 0 && !ddl.includes("'recargo'")) return false
  try {
    const sample = database
      .prepare(`SELECT id FROM clientes WHERE activo = 1 ORDER BY id ASC LIMIT 1`)
      .get()
    const cid = sample ? Number(sample.id) : 0
    if (cid <= 0) return true
    database
      .prepare(
        `INSERT INTO credito_movimientos (cliente_id, tipo, monto, descripcion, venta_id) VALUES (?, 'recargo', 0, '__schema_probe__', NULL)`,
      )
      .run(cid)
    database
      .prepare(
        `DELETE FROM credito_movimientos WHERE cliente_id = ? AND descripcion = '__schema_probe__'`,
      )
      .run(cid)
    return true
  } catch {
    return false
  }
}

/**
 * Probe para detectar si el CHECK de `tipo` ya acepta los nuevos tipos
 * 'nota_credito' y 'uso_nota'. En DBs viejas la tabla tiene un CHECK
 * sin estos valores; al fallar la inserción se dispara la migración
 * `migrateCreditoMovimientosToCanonical` que recrea la tabla.
 */
function creditoTipoNotaCreditoAccepted(database) {
  const ddlRow = database.prepare(
    `SELECT sql FROM sqlite_master WHERE type='table' AND name='credito_movimientos'`,
  ).get()
  const ddl = String(ddlRow?.sql || '')
  if (ddl.length > 0 && (!ddl.includes("'nota_credito'") || !ddl.includes("'uso_nota'"))) return false
  try {
    const sample = database
      .prepare(`SELECT id FROM clientes WHERE activo = 1 ORDER BY id ASC LIMIT 1`)
      .get()
    const cid = sample ? Number(sample.id) : 0
    if (cid <= 0) return true
    database
      .prepare(
        `INSERT INTO credito_movimientos (cliente_id, tipo, monto, descripcion, venta_id) VALUES (?, 'nota_credito', 0, '__schema_probe_nc__', NULL)`,
      )
      .run(cid)
    database
      .prepare(
        `DELETE FROM credito_movimientos WHERE cliente_id = ? AND descripcion = '__schema_probe_nc__'`,
      )
      .run(cid)
    return true
  } catch {
    return false
  }
}

function ensureCreditoSchema(database) {
  repairCreditoMovBackupOrphans(database)
  /* Solo CREATE: no incluir índices sobre venta_id aquí — si la tabla ya existía vieja,
   * CREATE TABLE IF NOT EXISTS no hace nada pero el siguiente CREATE INDEX igual corre y rompe.
   */
  database.exec(`
    CREATE TABLE IF NOT EXISTS credito_movimientos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_id INTEGER NOT NULL,
      tipo TEXT NOT NULL CHECK(tipo IN ('compra', 'pago', 'recargo', 'ajuste', 'nota_credito', 'uso_nota')),
      monto REAL NOT NULL,
      descripcion TEXT DEFAULT '',
      venta_id INTEGER,
      mora_periodo TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE,
      FOREIGN KEY (venta_id) REFERENCES ventas(id) ON DELETE SET NULL
    );
  `)

  database.pragma('foreign_keys = OFF')
  try {
    const shapeOk = creditoShapeMatchesCode(database)
    const tipoOk = shapeOk ? creditoTipoRecargoAccepted(database) : false
    const notaOk = shapeOk && tipoOk ? creditoTipoNotaCreditoAccepted(database) : false
    if (!shapeOk || !tipoOk || !notaOk) {
      migrateCreditoMovimientosToCanonical(database)
    }
  } finally {
    database.pragma('foreign_keys = ON')
  }

  try {
    const crCols = database.prepare(`PRAGMA table_info(credito_movimientos)`).all()
    if (!crCols.some((c) => c.name === 'cuenta_bancaria')) {
      database.exec(`ALTER TABLE credito_movimientos ADD COLUMN cuenta_bancaria TEXT DEFAULT ''`)
    }
  } catch (e) {
    console.error('[credito_movimientos] migración cuenta_bancaria:', e?.message || e)
  }

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_credito_mov_cliente ON credito_movimientos(cliente_id);
    CREATE INDEX IF NOT EXISTS idx_credito_mov_venta ON credito_movimientos(venta_id);
  `)
}

function listClientes() {
  const database = getDb()
  return database.prepare(
    `SELECT * FROM clientes WHERE activo = 1 ORDER BY nombre COLLATE NOCASE`
  ).all()
}

function addCliente(payload) {
  const database = getDb()
  const nombre = String(payload?.nombre || '').trim()
  if (!nombre) throw new Error('El nombre es obligatorio.')
  const telefono = String(payload?.telefono || '').trim()
  const notas = String(payload?.notas || '').trim()
  const fecha_nacimiento = String(payload?.fecha_nacimiento || payload?.fechaNacimiento || '').trim()
  const imagen_identificacion_path = String(payload?.imagen_identificacion_path || payload?.imagenIdentificacionPath || '').trim()
  const recompensas_notas = String(payload?.recompensas_notas || payload?.recompensasNotas || '').trim()

  const info = database.prepare(
    `INSERT INTO clientes (nombre, telefono, notas, fecha_nacimiento, imagen_identificacion_path, recompensas_notas, saldo_pendiente, activo) VALUES (?, ?, ?, ?, ?, ?, 0, 1)`
  ).run(nombre, telefono, notas, fecha_nacimiento, imagen_identificacion_path, recompensas_notas)
  const id = Number(info.lastInsertRowid)
  recordEvent({
    type: 'customer.created',
    actor: 'user',
    scope: 'customer',
    entityRef: id,
    source: 'pdv',
    payload: { clienteId: id, nombre, hasTelefono: telefono.length > 0 },
  })
  return { ok: true, id }
}

function updateCliente(payload) {
  const database = getDb()
  const id = Number(payload?.id)
  if (!id) throw new Error('Cliente inválido.')
  const sets = []
  const params = []
  if (payload?.nombre != null) { sets.push('nombre = ?'); params.push(String(payload.nombre).trim()) }
  if (payload?.telefono != null) { sets.push('telefono = ?'); params.push(String(payload.telefono).trim()) }
  if (payload?.notas != null) { sets.push('notas = ?'); params.push(String(payload.notas).trim()) }
  if (payload?.fecha_nacimiento !== undefined || payload?.fechaNacimiento !== undefined) {
    sets.push('fecha_nacimiento = ?')
    params.push(String(payload.fecha_nacimiento ?? payload.fechaNacimiento ?? '').trim())
  }
  if (payload?.imagen_identificacion_path !== undefined || payload?.imagenIdentificacionPath !== undefined) {
    sets.push('imagen_identificacion_path = ?')
    params.push(String(payload.imagen_identificacion_path ?? payload.imagenIdentificacionPath ?? '').trim())
  }
  if (payload?.recompensas_notas !== undefined || payload?.recompensasNotas !== undefined) {
    sets.push('recompensas_notas = ?')
    params.push(String(payload.recompensas_notas ?? payload.recompensasNotas ?? '').trim())
  }
  if (sets.length === 0) return { ok: true }
  sets.push("updated_at = datetime('now')")
  params.push(id)
  database.prepare(`UPDATE clientes SET ${sets.join(', ')} WHERE id = ?`).run(...params)
  return { ok: true }
}

function deleteClienteSinMovimientosCC(clienteId) {
  const database = getDb()
  ensureCreditoSchema(database)
  const id = Number(clienteId)
  if (!Number.isFinite(id) || id <= 0) throw new Error('Cliente inválido.')
  database.transaction(() => {
    const c = database.prepare(
      `SELECT id, saldo_pendiente FROM clientes WHERE id = ? AND activo = 1`,
    ).get(id)
    if (!c) throw new Error('Cliente no encontrado.')
    const saldo = Number(c.saldo_pendiente) || 0
    if (saldo > 0.005) {
      throw new Error('No se puede eliminar un cliente con saldo pendiente.')
    }
    const { cnt } = database.prepare(
      `SELECT COUNT(*) AS cnt FROM credito_movimientos WHERE cliente_id = ?`,
    ).get(id)
    if (Number(cnt) > 0) {
      throw new Error(
        'Solo se puede eliminar si la cuenta corriente está vacía (sin compras ni abonos).',
      )
    }
    const r = database.prepare(`DELETE FROM clientes WHERE id = ?`).run(id)
    if (r.changes !== 1) throw new Error('No se pudo eliminar el cliente.')
  })()
  return { ok: true }
}

function addCreditoMovimiento(payload) {
  const database = getDb()
  ensureCreditoSchema(database)
  const clienteId = Number(payload?.clienteId || payload?.cliente_id)
  const tipo = String(payload?.tipo || '').toLowerCase()
  if (!clienteId) throw new Error('Cliente inválido.')
  if (tipo !== 'compra' && tipo !== 'pago' && tipo !== 'ajuste' && tipo !== 'nota_credito' && tipo !== 'uso_nota') {
    throw new Error('Tipo de movimiento inválido.')
  }
  const monto = Math.round(Number(payload?.monto) * 100) / 100
  if (!Number.isFinite(monto) || monto <= 0) throw new Error('Monto debe ser mayor a 0.')
  const descripcion = String(payload?.descripcion || '').trim()
  const ventaId = Number(payload?.ventaId || payload?.venta_id) || null

  // Soporte de pagos retroactivos y cuenta bancaria
  const created_at = String(payload?.created_at || payload?.createdAt || '').trim() || null
  const cuenta_bancaria = String(payload?.cuenta_bancaria || payload?.cuentaBancaria || '').trim()

  const run = database.transaction(() => {
    database.prepare(
      `INSERT INTO credito_movimientos (cliente_id, tipo, monto, descripcion, venta_id, created_at, cuenta_bancaria) 
       VALUES (?, ?, ?, ?, ?, COALESCE(?, datetime('now')), COALESCE(?, ''))`,
    ).run(clienteId, tipo, monto, descripcion, ventaId, created_at, cuenta_bancaria)
    
    /* compra aumenta saldo; pago y ajuste lo bajan.
     * nota_credito y uso_nota:
     * - nota_credito: se emite un saldo a favor, por lo que NO cambia saldo_pendiente directamente, pero aumenta `saldo_a_favor`.
     * - uso_nota: reduce `saldo_a_favor` y también reduce `saldo_pendiente` (se usa la nota para pagar).
     */
    if (tipo === 'nota_credito') {
      database.prepare(
        `UPDATE clientes SET saldo_a_favor = saldo_a_favor + ?, updated_at = datetime('now') WHERE id = ?`,
      ).run(monto, clienteId)
    } else if (tipo === 'uso_nota') {
      database.prepare(
        `UPDATE clientes SET saldo_a_favor = MAX(0, saldo_a_favor - ?), saldo_pendiente = MAX(0, saldo_pendiente - ?), updated_at = datetime('now') WHERE id = ?`,
      ).run(monto, monto, clienteId)
    } else {
      const aumenta = tipo === 'compra'
      const delta = aumenta ? monto : -monto
      database.prepare(
        `UPDATE clientes SET saldo_pendiente = MAX(0, saldo_pendiente + ?), updated_at = datetime('now') WHERE id = ?`,
      ).run(delta, clienteId)
    }
  })
  run()
  recordEvent({
    type: 'credit.movement',
    actor: 'user',
    scope: 'credit',
    entityRef: clienteId,
    source: 'pdv',
    payload: { clienteId, tipo, monto, ventaId, hasDescripcion: descripcion.length > 0 },
  })
  return { ok: true }
}

function getCreditoMovimientos(payload) {
  const database = getDb()
  ensureCreditoSchema(database)
  const clienteId = Number(payload?.clienteId || payload?.cliente_id)
  if (!clienteId) return []
  return database.prepare(
    `SELECT * FROM credito_movimientos WHERE cliente_id = ? ORDER BY id DESC LIMIT 200`
  ).all(clienteId)
}

function getCredits() {
  return listClientes()
}

/* ───────────────────────── INTERCAMBIOS ───────────────────────── */

/**
 * Texto: prendas con última venta sin devolver y dentro del plazo (para picker de intercambio).
 */
function searchIntercambiableCandidates(payload = {}) {
  const database = getDb()
  ensureIntercambiosSchema(database)
  const t = String(payload?.query || '').trim()
  const limiteDias = Math.max(1, Math.floor(Number(payload?.limiteDias) || 30))
  const filterMode = String(payload?.filterMode || 'todos')

  // Compute the effective day limit based on filterMode
  let effectiveDias = limiteDias
  if (filterMode === 'hoy') effectiveDias = 1
  else if (filterMode === 'semana') effectiveDias = 7

  const esc = (s) =>
    String(s)
      .trim()
      .replace(/\\/g, '\\\\')
      .replace(/%/g, '\\%')
      .replace(/_/g, '\\_')

  // If no search text, return all recent candidates (no 2-char minimum)
  const hasQuery = t.length >= 1
  const like = hasQuery ? `%${esc(t).toLowerCase()}%` : null

  let sql = `SELECT p.*,
              v.created_at AS fecha_venta,
              v.metodo AS venta_metodo,
              CAST(
                (julianday('now') - julianday(replace(trim(v.created_at), 'T', ' ')))
                AS INTEGER
              ) AS dias_desde_venta
       FROM productos p
       INNER JOIN venta_items vi ON vi.producto_id = p.id
         AND vi.devuelto_en IS NULL
         AND vi.id = (
           SELECT MAX(vi2.id) FROM venta_items vi2
           WHERE vi2.producto_id = p.id AND vi2.devuelto_en IS NULL
         )
       INNER JOIN ventas v ON v.id = vi.venta_id
       WHERE datetime(replace(trim(v.created_at), 'T', ' ')) >= datetime('now', '-' || cast(? as text) || ' days')`

  const params = [effectiveDias]

  if (hasQuery) {
    sql += ` AND (
         lower(p.codigo) LIKE ? ESCAPE '\\'
         OR lower(COALESCE(p.descripcion,'')) LIKE ? ESCAPE '\\'
       )`
    params.push(like, like)
  }

  sql += ` ORDER BY v.created_at DESC LIMIT 50`

  const rows = database.prepare(sql).all(...params)
  return rows.map((p) => {
    const hyd = hydrateProductRow(database, p)
    return { ...hyd, fecha_venta: p.fecha_venta, dias_desde_venta: p.dias_desde_venta }
  })
}

/**
 * Buscar el último venta_item ELEGIBLE para devolución de un código.
 * Elegible = pertenece a la venta más reciente del producto, sin devolver,
 * y dentro del límite de días configurado.
 *
 * Devuelve null si no hay nada elegible (con razón).
 */
function findIntercambiableByCodigo(payload = {}) {
  const database = getDb()
  ensureIntercambiosSchema(database)
  const codigo = String(payload?.codigo || '').trim()
  const limiteDias = Math.max(1, Math.floor(Number(payload?.limiteDias) || 30))
  if (!codigo) return null
  const prod = getProductByCodigo(codigo)
  if (!prod) return { ok: false, reason: 'no_existe', codigo }
  /* Buscamos el último venta_item de ese producto que NO esté devuelto. */
  const item = database.prepare(
    `SELECT vi.*, v.created_at AS venta_fecha, v.metodo AS venta_metodo, v.id AS venta_id
       FROM venta_items vi
       JOIN ventas v ON v.id = vi.venta_id
      WHERE vi.producto_id = ? AND vi.devuelto_en IS NULL
      ORDER BY vi.id DESC
      LIMIT 1`,
  ).get(prod.id)
  if (!item) {
    return { ok: false, reason: 'sin_venta', codigo, producto: prod }
  }
  /* Calcular días desde la venta. */
  const ventaFecha = new Date(String(item.venta_fecha) + 'Z').getTime()
  const dias = Math.floor((Date.now() - ventaFecha) / (1000 * 60 * 60 * 24))
  const creditoOrigen = findCreditoOrigenForVenta(database, item.venta_id, item.venta_metodo)
  if (dias > limiteDias) {
    return { ok: false, reason: 'fuera_de_plazo', codigo, producto: prod, dias, limiteDias, item, creditoOrigen }
  }
  return { ok: true, codigo, producto: prod, item, dias, limiteDias, creditoOrigen }
}

/**
 * Si la venta original fue a crédito, devuelve { clienteId, clienteNombre,
 * saldoActual } para que el panel de intercambios pueda anticipar el efecto
 * sobre el saldo del cliente antes de confirmar.
 *
 * Si no fue a crédito (efectivo/transferencia) o no se encuentra el
 * movimiento, devuelve null.
 */
function findCreditoOrigenForVenta(database, ventaId, metodo) {
  if (!ventaId) return null
  if (String(metodo || '').toLowerCase() !== 'credito') return null
  try {
    const mov = database.prepare(
      `SELECT cliente_id FROM credito_movimientos
        WHERE venta_id = ? AND tipo = 'compra'
        ORDER BY id ASC LIMIT 1`,
    ).get(ventaId)
    if (!mov?.cliente_id) return null
    const c = database.prepare(
      `SELECT id, nombre, saldo_pendiente FROM clientes WHERE id = ?`,
    ).get(mov.cliente_id)
    if (!c) return null
    return {
      clienteId: Number(c.id),
      clienteNombre: String(c.nombre || ''),
      saldoActual: Number(c.saldo_pendiente) || 0,
    }
  } catch {
    return null
  }
}

/**
 * Confirma un intercambio:
 *   - `entra` (lo que devuelve la cliente): marca venta_item.devuelto_en y
 *     vuelve el producto a `disponible`.
 *   - `sale` (lo que se lleva): si existe, hace el descuento normal de stock
 *     (idéntico a una venta) y registra una venta «fantasma» con método
 *     `intercambio` para mantener trazabilidad.
 *   - Si la diferencia es positiva (la cliente pone plata extra), se registra
 *     en `intercambios.diferencia` con su método (efectivo/transferencia).
 *   - Si es negativa (la cliente se lleva algo más barato), por política
 *     NO se devuelve dinero; se ignora la diferencia (queda como nota).
 *
 * Todo en una sola transacción.
 */
function addIntercambio(payload = {}) {
  const database = getDb()
  ensureIntercambiosSchema(database)
  const entra = Array.isArray(payload?.entra) ? payload.entra : []
  const sale = Array.isArray(payload?.sale) ? payload.sale : []
  if (entra.length === 0) throw new Error('Hay que registrar al menos una prenda que vuelve.')
  const limiteDias = Math.max(1, Math.floor(Number(payload?.limiteDias) || 30))

  /* Validar y enriquecer las prendas que entran. */
  const entraNorm = entra.map((e) => {
    const found = findIntercambiableByCodigo({ codigo: e.codigo, limiteDias })
    if (!found?.ok) {
      const reason = found?.reason || 'no_existe'
      const map = {
        no_existe: `Código «${e.codigo}» no existe.`,
        sin_venta: `«${e.codigo}» no figura como vendido.`,
        fuera_de_plazo: `«${e.codigo}» fuera del plazo (${found?.dias} días, límite ${found?.limiteDias}).`,
      }
      throw new Error(map[reason] || 'Prenda no intercambiable.')
    }
    return found
  })

  /* Validar prendas que salen. */
  const saleNorm = []
  for (const s of sale) {
    const codigo = String(s.codigo || '').trim()
    if (!codigo) continue
    const prod = getProductByCodigo(codigo)
    if (!prod) throw new Error(`«${codigo}» no existe.`)
    const est = String(prod.estado || '').toLowerCase()
    if (est !== 'disponible') {
      throw new Error(`«${codigo}» no está disponible (estado: ${prod.estado || 'sin estado'}).`)
    }
    if (prod.vendido_en != null && String(prod.vendido_en).trim() !== '') {
      throw new Error(`«${codigo}» figura como vendido.`)
    }
    saleNorm.push({ producto: prod, precio: Number(prod.precio) || 0 })
  }

  /* Cambio de prendas FIADAS: el modelo de "diferencia = salida − entrada"
   * asume que lo que entra YA estaba pagado. Para una prenda fiada eso es
   * falso (la clienta la debe), así que cobrar solo la diferencia le regala
   * la prenda nueva. Para no perder plata, el cambio de una prenda fiada se
   * hace en dos pasos claros que SÍ están bien resueltos: 1) Devolución (que
   * cancela el fiado del cliente) y 2) una venta nueva de la otra prenda. */
  {
    const getVentaMetodo = database.prepare(`SELECT metodo FROM ventas WHERE id = ?`)
    for (const e of entraNorm) {
      const v = getVentaMetodo.get(e.item.venta_id)
      if (v && String(v.metodo || '').toLowerCase() === 'credito') {
        throw new Error(
          `«${e.codigo}» se vendió fiada. El cambio de una prenda fiada se hace con Devolución (cancela el fiado) y después una venta nueva, así las cuentas quedan bien.`,
        )
      }
    }
  }

  const totalEntra = entraNorm.reduce((s, e) => s + (Number(e.item.precio_snapshot) || 0), 0)
  const totalSale = saleNorm.reduce((s, x) => s + x.precio, 0)
  const diferencia = Math.round((totalSale - totalEntra) * 100) / 100
  const diferenciaMetodo = diferencia > 0 ? String(payload?.diferenciaMetodo || 'efectivo') : null
  if (diferencia > 0 && !['efectivo', 'transferencia', 'credito'].includes(diferenciaMetodo)) {
    throw new Error('Método de pago de diferencia inválido.')
  }
  const clienteId = Number(payload?.clienteId) || null
  if (diferencia > 0 && diferenciaMetodo === 'credito' && !clienteId) {
    throw new Error('Para diferencia a crédito, seleccioná un cliente.')
  }

  let intercambioId, ventaSalidaId
  const reversasCredito = []
  let excesoDevolucion = 0
  let notaCreditoDifNegativa = null
  const tx = database.transaction(() => {
    /* 1) Marcar como devueltos los venta_items que entran y volver productos a disponible */
    const markDevuelto = database.prepare(
      `UPDATE venta_items SET devuelto_en = datetime('now') WHERE id = ? AND devuelto_en IS NULL`,
    )
    const setDisponible = database.prepare(
      `UPDATE productos SET estado = 'disponible', vendido_en = NULL, updated_at = datetime('now') WHERE id = ?`,
    )
    for (const e of entraNorm) {
      const r = markDevuelto.run(e.item.id)
      if (r.changes === 0) {
        throw new Error(`«${e.codigo}» ya fue devuelto previamente.`)
      }
      setDisponible.run(e.producto.id)
    }

    /* 2) Crear cabecera del intercambio */
    const insIntercambio = database.prepare(
      `INSERT INTO intercambios (venta_origen_id, venta_salida_id, cliente_id, diferencia, diferencia_metodo, notas)
       VALUES (?, NULL, ?, ?, ?, ?)`,
    )
    /* venta_origen_id: si todas las prendas que entran son de la misma venta,
     * la guardamos; si no, NULL. */
    const ventas = new Set(entraNorm.map((e) => Number(e.item.venta_id)))
    const ventaOrigenId = ventas.size === 1 ? [...ventas][0] : null
    const r = insIntercambio.run(
      ventaOrigenId,
      clienteId,
      diferencia > 0 ? diferencia : 0,
      diferenciaMetodo,
      String(payload?.notas || '').trim(),
    )
    intercambioId = Number(r.lastInsertRowid)

    /* 2b) Reversa de crédito: por cada prenda que vuelve cuya venta original
     *     fue a crédito, restar el `precio_snapshot` del saldo del cliente
     *     (clamped en 0) y registrar un movimiento `ajuste`. Si la devolución
     *     excede el saldo restante (cliente ya pagó parte o todo), el sobrante
     *     se guarda como `nota_credito` en `saldo_a_favor` del mismo cliente.
     */
    ensureCreditoSchema(database)
    const getVenta = database.prepare(`SELECT id, metodo FROM ventas WHERE id = ?`)
    const getMovCompra = database.prepare(
      `SELECT cliente_id FROM credito_movimientos
        WHERE venta_id = ? AND tipo = 'compra'
        ORDER BY id ASC LIMIT 1`,
    )
    const getCliente = database.prepare(
      `SELECT id, nombre, saldo_pendiente, saldo_a_favor FROM clientes WHERE id = ?`,
    )
    const insAjuste = database.prepare(
      `INSERT INTO credito_movimientos (cliente_id, tipo, monto, descripcion, venta_id)
       VALUES (?, 'ajuste', ?, ?, ?)`,
    )
    const insNotaCredito = database.prepare(
      `INSERT INTO credito_movimientos (cliente_id, tipo, monto, descripcion, venta_id)
       VALUES (?, 'nota_credito', ?, ?, ?)`,
    )
    const updSaldoMinus = database.prepare(
      `UPDATE clientes SET saldo_pendiente = MAX(0, saldo_pendiente - ?),
                            updated_at = datetime('now') WHERE id = ?`,
    )
    const updSaldoFavorPlus = database.prepare(
      `UPDATE clientes SET saldo_a_favor = saldo_a_favor + ?,
                            updated_at = datetime('now') WHERE id = ?`,
    )
    for (const e of entraNorm) {
      const v = getVenta.get(e.item.venta_id)
      if (!v) continue
      if (String(v.metodo || '').toLowerCase() !== 'credito') continue
      const mov = getMovCompra.get(v.id)
      if (!mov?.cliente_id) continue
      const c = getCliente.get(mov.cliente_id)
      if (!c) continue
      const saldoAntes = Number(c.saldo_pendiente) || 0
      const precio = Number(e.item.precio_snapshot) || 0
      if (precio <= 0) continue
      const aplicado = Math.min(saldoAntes, precio)
      const exceso = precio - aplicado
      if (aplicado > 0) {
        insAjuste.run(
          mov.cliente_id,
          aplicado,
          `Devolución intercambio #${intercambioId} · ${e.codigo}`,
          v.id,
        )
        updSaldoMinus.run(aplicado, mov.cliente_id)
      }
      if (exceso > 0) {
        insNotaCredito.run(
          mov.cliente_id,
          exceso,
          `Saldo a favor por devolución intercambio #${intercambioId} · ${e.codigo}`,
          v.id,
        )
        updSaldoFavorPlus.run(exceso, mov.cliente_id)
      }
      reversasCredito.push({
        clienteId: Number(c.id),
        clienteNombre: String(c.nombre || ''),
        ventaOrigenId: Number(v.id),
        codigo: e.codigo,
        precio,
        aplicado,
        exceso,
        saldoAntes,
        saldoDespues: Math.max(0, saldoAntes - aplicado),
      })
      excesoDevolucion += exceso
    }

    /* 3) Si hay prendas que salen, registramos una "venta de intercambio" que
     *    descuenta stock como una venta normal, con monto = diferencia (no el
     *    precio total — la cliente ya pagó la entrada). El total de esa venta
     *    refleja lo que entró de plata real en este intercambio. */
    if (saleNorm.length > 0) {
      const insVenta = database.prepare(
        `INSERT INTO ventas (total, pago_con, cambio, metodo, notas) VALUES (?, NULL, NULL, ?, ?)`,
      )
      const insVentaItem = database.prepare(
        `INSERT INTO venta_items (venta_id, producto_id, codigo_snapshot, nombre_snapshot, precio_snapshot, cantidad) VALUES (?, ?, ?, ?, ?, 1)`,
      )
      const updEstadoPiezaSale = database.prepare(
        `UPDATE productos SET estado = 'vendido', vendido_en = datetime('now'), updated_at = datetime('now')
           WHERE id = ?
             AND vendido_en IS NULL
             AND LOWER(COALESCE(estado, '')) = 'disponible'`,
      )
      const ventaInfo = insVenta.run(
        diferencia > 0 ? diferencia : 0,
        `intercambio:${diferenciaMetodo || 'sin_diferencia'}`,
        `Intercambio #${intercambioId}`,
      )
      ventaSalidaId = Number(ventaInfo.lastInsertRowid)
      for (const x of saleNorm) {
        insVentaItem.run(ventaSalidaId, x.producto.id, x.producto.codigo, x.producto.descripcion, x.precio)
        const ru = updEstadoPiezaSale.run(x.producto.id)
        if (ru.changes === 0) {
          throw new Error(`«${x.producto.codigo}» ya no está disponible.`)
        }
      }
      database.prepare(`UPDATE intercambios SET venta_salida_id = ? WHERE id = ?`).run(ventaSalidaId, intercambioId)
    }

    /* 4) Si la diferencia es a crédito, agregar movimiento. */
    if (diferencia > 0 && diferenciaMetodo === 'credito') {
      ensureCreditoSchema(database)
      database.prepare(
        `INSERT INTO credito_movimientos (cliente_id, tipo, monto, descripcion, venta_id) VALUES (?, 'compra', ?, ?, ?)`,
      ).run(clienteId, diferencia, `Diferencia intercambio #${intercambioId}`, ventaSalidaId)
      database.prepare(
        `UPDATE clientes SET saldo_pendiente = MAX(0, saldo_pendiente + ?), updated_at = datetime('now') WHERE id = ?`,
      ).run(diferencia, clienteId)
    }

    /* 5) Items del intercambio (snapshot completo) */
    const insItem = database.prepare(
      `INSERT INTO intercambio_items (intercambio_id, rol, producto_id, venta_item_origen_id, codigo_snapshot, nombre_snapshot, precio_snapshot)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    for (const e of entraNorm) {
      insItem.run(
        intercambioId,
        'entra',
        e.producto.id,
        e.item.id,
        e.codigo,
        e.item.nombre_snapshot || e.producto.descripcion,
        e.item.precio_snapshot,
      )
    }
    for (const x of saleNorm) {
      insItem.run(
        intercambioId,
        'sale',
        x.producto.id,
        null,
        x.producto.codigo,
        x.producto.descripcion,
        x.precio,
      )
    }

    /* 6) Diferencia negativa: la cliente se lleva algo más barato. Si podemos
     *    identificar UN cliente único (override explícito o auto-inferido por
     *    las prendas que vuelven, todas de la misma venta a crédito), el
     *    sobrante se guarda como nota de crédito. Si no, sigue siendo el
     *    "descuento informal" de antes (queda registrado en notas pero sin
     *    contraparte contable). */
    if (diferencia < 0) {
      const monto = Math.round(-diferencia * 100) / 100
      let target = Number(payload?.clienteSaldoFavor) || null
      if (!target) {
        const clientesEntra = new Set()
        for (const e of entraNorm) {
          const v = getVenta.get(e.item.venta_id)
          if (!v || String(v.metodo || '').toLowerCase() !== 'credito') continue
          const m = getMovCompra.get(v.id)
          if (m?.cliente_id) clientesEntra.add(Number(m.cliente_id))
        }
        if (clientesEntra.size === 1) target = [...clientesEntra][0]
      }
      if (target) {
        const c = getCliente.get(target)
        if (c) {
          insNotaCredito.run(
            target,
            monto,
            `Saldo a favor por intercambio #${intercambioId} (se llevó más barato)`,
            ventaSalidaId || null,
          )
          updSaldoFavorPlus.run(monto, target)
          notaCreditoDifNegativa = {
            clienteId: Number(c.id),
            clienteNombre: String(c.nombre || ''),
            monto,
          }
        }
      }
    }
  })
  tx()

  return {
    ok: true,
    intercambioId,
    ventaSalidaId,
    diferencia,
    totalEntra: Math.round(totalEntra * 100) / 100,
    totalSale: Math.round(totalSale * 100) / 100,
    reversasCredito,
    excesoDevolucion: Math.round(excesoDevolucion * 100) / 100,
    notaCreditoDifNegativa,
  }
}

/* Saldo de una cuenta de Saldos calculado igual que el motor puro
 * (src/lib/saldosLedger.js): cargos − pagos, clamped en 0 (Saldos no maneja
 * saldo negativo). Solo movimientos NO anulados. */
function saldoSaldosCliente(database, clienteId) {
  const r = database.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN tipo IN ('cargo','cargo_atraso','ajuste') THEN monto ELSE 0 END), 0) AS cargos,
      COALESCE(SUM(CASE WHEN tipo IN ('abono','descuento') THEN monto ELSE 0 END), 0) AS pagos
    FROM saldos_movimientos WHERE cliente_id = ? AND anulado = 0
  `).get(Number(clienteId))
  const saldo = (Number(r?.cargos) || 0) - (Number(r?.pagos) || 0)
  return Math.max(0, Math.round(saldo * 100) / 100)
}

/* Saldo A FAVOR de una cuenta (lo que el bazar le debe a la clienta) = pagos −
 * cargos, clamped en 0. Es el espejo de saldoSaldosCliente: una cuenta nunca
 * tiene deuda y saldo a favor a la vez. */
function favorSaldosCliente(database, clienteId) {
  const r = database.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN tipo IN ('cargo','cargo_atraso','ajuste') THEN monto ELSE 0 END), 0) AS cargos,
      COALESCE(SUM(CASE WHEN tipo = 'abono' THEN monto ELSE 0 END), 0) AS abonos,
      COALESCE(SUM(CASE WHEN tipo = 'descuento' THEN monto ELSE 0 END), 0) AS descuentos
    FROM saldos_movimientos WHERE cliente_id = ? AND anulado = 0
  `).get(Number(clienteId))
  /* El saldo a favor SOLO nace de DEVOLUCIONES (descuento) que superan la deuda
   * neta. Un abono nunca genera saldo a favor (regla del negocio). Esto coincide
   * con saldosLedger.js (que ya no convierte el sobrante de un abono en favor). */
  const cargos = Number(r?.cargos) || 0
  const abonos = Number(r?.abonos) || 0
  const descuentos = Number(r?.descuentos) || 0
  const deudaNeta = Math.max(0, cargos - abonos)
  const favor = descuentos - deudaNeta
  return Math.max(0, Math.round(favor * 100) / 100)
}

function getVentaItemPorCodigoDevolucion(codigo) {
  const database = getDb()
  const clean = String(codigo || '').trim()
  if (!clean) return null
  const prod = getProductByCodigo(clean)
  if (!prod) return null
  const item = database.prepare(
    `SELECT vi.*, v.metodo AS venta_metodo, v.created_at AS venta_fecha, v.id AS venta_id, v.saldos_cliente_id AS saldos_cliente_id
     FROM venta_items vi
     JOIN ventas v ON v.id = vi.venta_id
     WHERE vi.producto_id = ? AND vi.devuelto_en IS NULL
     ORDER BY vi.id DESC LIMIT 1`
  ).get(prod.id)
  if (!item) return { producto: prod, ventaItem: null, credito: null }

  /* Si la venta fue FIADA (vinculada a una cuenta de Saldos), traemos al cliente
   * y cuánto debe / cuánto había abonado de ESA venta, para que el PDV cancele
   * el fiado en Saldos en vez de devolver efectivo a ciegas. */
  let credito = null
  const saldosClienteId = Number(item.saldos_cliente_id) || null
  if (saldosClienteId) {
    try {
      const c = database.prepare('SELECT id, nombre FROM saldos_clientes WHERE id = ?').get(saldosClienteId)
      if (c) {
        const pag = database.prepare(`
          SELECT COALESCE(SUM(m.monto), 0) AS pagado
          FROM saldos_movimientos m, json_each(m.referencia_ids) j
          WHERE m.cliente_id = ? AND m.anulado = 0 AND m.tipo = 'abono' AND j.value = ?
        `).get(saldosClienteId, item.venta_id)
        credito = {
          saldosClienteId,
          clienteNombre: String(c.nombre || ''),
          saldoPendiente: saldoSaldosCliente(database, saldosClienteId),
          enganchePagado: Number(pag?.pagado) || 0,
        }
      }
    } catch { credito = null }
  }
  return { producto: prod, ventaItem: item, credito }
}

function registrarDevolucionRapida(payload = {}) {
  const database = getDb()
  ensureIntercambiosSchema(database)
  const codigo = String(payload?.codigo || '').trim()
  const ventaItemId = Number(payload?.ventaItemId || payload?.venta_item_id) || null
  const metodoReembolso = String(payload?.metodoReembolso || payload?.metodo_reembolso || 'efectivo').trim().toLowerCase()
  const cuentaBancaria = String(payload?.cuentaBancaria || payload?.cuenta_bancaria || '').trim()
  /* En una venta fiada, todo el reembolso (incluyendo el excedente de lo que ya
   * había pagado) se abona a la cuenta de Saldos. El excedente se convertirá
   * automáticamente en "Saldo a Favor" para futuras compras. */
  let excedenteMetodo = String(payload?.excedenteMetodo || payload?.excedente_metodo || 'efectivo').trim().toLowerCase()
  if (!['efectivo', 'transferencia'].includes(excedenteMetodo)) excedenteMetodo = 'efectivo'
  const montoReembolso = payload?.montoReembolso != null ? Number(payload.montoReembolso) : null

  if (!['efectivo', 'transferencia', 'vale'].includes(metodoReembolso)) {
    throw new Error('Método de reembolso inválido.')
  }
  if (!ventaItemId && !codigo) throw new Error('Falta indicar el renglón o el código a devolver.')

  /* Apuntar al RENGLÓN EXACTO: la UI manda el id del venta_item, así se devuelve
   * la línea que la dueña eligió y NO la última venta del mismo código (clave si
   * el producto se vendió en varios tickets). Si solo llega el código (atajo por
   * escaneo), se toma la venta activa más reciente de ese producto. */
  let item
  if (ventaItemId) {
    item = database.prepare(
      `SELECT vi.*, v.metodo AS venta_metodo, v.created_at AS venta_fecha, v.id AS venta_id, v.saldos_cliente_id AS saldos_cliente_id
         FROM venta_items vi JOIN ventas v ON v.id = vi.venta_id
        WHERE vi.id = ? AND vi.devuelto_en IS NULL`,
    ).get(ventaItemId)
    if (!item) throw new Error('Ese renglón ya fue devuelto o no existe.')
  } else {
    const prodByCode = getProductByCodigo(codigo)
    if (!prodByCode) throw new Error(`La prenda con código «${codigo}» no existe en el inventario.`)
    item = database.prepare(
      `SELECT vi.*, v.metodo AS venta_metodo, v.created_at AS venta_fecha, v.id AS venta_id, v.saldos_cliente_id AS saldos_cliente_id
         FROM venta_items vi JOIN ventas v ON v.id = vi.venta_id
        WHERE vi.producto_id = ? AND vi.devuelto_en IS NULL
        ORDER BY vi.id DESC LIMIT 1`,
    ).get(prodByCode.id)
    if (!item) throw new Error(`La prenda «${codigo}» no figura como vendida en ninguna transacción activa (o ya fue devuelta).`)
  }

  const prod = database.prepare('SELECT id, codigo, descripcion, pieza_unica, stock FROM productos WHERE id = ?').get(item.producto_id)
  if (!prod) throw new Error('El producto de ese renglón ya no existe en el inventario.')
  const codigoRef = codigo || String(prod.codigo || item.codigo_snapshot || '').trim()

  /* BLINDAJE: si la venta fue FIADA (vinculada a una cuenta de Saldos), la
   * devolución cancela el fiado en Saldos — nunca devuelve efectivo a ciegas por
   * una prenda que la clienta todavía debe. El cliente se resuelve desde la
   * venta, no del llamador, así nadie puede saltearse esto. */
  const saldosClienteId = Number(item.saldos_cliente_id) || null
  const ventaEsCredito = !!saldosClienteId

  const cantidadDevuelta = Math.max(1, Math.floor(Number(item.cantidad) || 1))
  const totalRenglon = Math.round(((Number(item.precio_snapshot) || 0) * cantidadDevuelta) * 100) / 100
  const reembolso = Math.round((montoReembolso !== null && Number.isFinite(montoReembolso) ? montoReembolso : totalRenglon) * 100) / 100
  if (!Number.isFinite(reembolso) || reembolso <= 0) throw new Error('Monto de devolucion invalido.')
  if (reembolso - totalRenglon > 0.005) {
    throw new Error(`La devolucion no puede superar el total del renglon (${totalRenglon.toFixed(2)}).`)
  }
  if (!ventaEsCredito && metodoReembolso === 'transferencia' && !cuentaBancaria) {
    throw new Error('Selecciona la cuenta bancaria desde donde sale la devolucion.')
  }

  let deudaCancelada = 0
  let excedenteOut = 0
  let clienteNombre = ''
  let devolucionMonto = reembolso
  let devolucionMetodo = metodoReembolso
  let devolucionExcedente = 0
  let devolucionExcedenteMetodo = ''
  let valeCreado = null

  const tx = database.transaction(() => {
    // Marcar el item como devuelto.
    const marked = database.prepare(`UPDATE venta_items SET devuelto_en = datetime('now') WHERE id = ? AND devuelto_en IS NULL`).run(item.id)
    if (marked.changes === 0) throw new Error('Esta prenda ya fue devuelta.')

    // Reponer stock / volver a disponible.
    if (Number(prod.pieza_unica) === 1) {
      database.prepare(`UPDATE productos SET estado = 'disponible', vendido_en = NULL, updated_at = datetime('now') WHERE id = ?`).run(prod.id)
    } else {
      database.prepare(`UPDATE productos SET stock = stock + ?, estado = 'disponible', vendido_en = NULL, updated_at = datetime('now') WHERE id = ?`).run(item.cantidad || 1, prod.id)
    }

    if (ventaEsCredito) {
      /* Reembolsar todo el monto a la cuenta del cliente (Saldos).
       * Si el reembolso supera la deuda actual, se genera un Saldo a Favor. */
      const c = database.prepare('SELECT nombre FROM saldos_clientes WHERE id = ?').get(saldosClienteId)
      clienteNombre = String(c?.nombre || '')
      const saldoActual = saldoSaldosCliente(database, saldosClienteId)
      deudaCancelada = Math.min(saldoActual, reembolso)
      excedenteOut = Math.round((reembolso - deudaCancelada) * 100) / 100
      devolucionMonto = deudaCancelada
      devolucionMetodo = 'saldos'
      devolucionExcedente = excedenteOut
      // El excedente ahora es Saldo a favor, no sale dinero de la caja
      devolucionExcedenteMetodo = excedenteOut > 0 ? 'saldo_a_favor' : ''
      
      if (reembolso > 0) {
        const d = new Date()
        const hoy = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        saldosStore.registrarMovimientos(database, saldosClienteId, [{
          tipo: 'descuento', fecha: hoy, monto: reembolso,
          concepto: `Devolución de «${codigoRef}» (venta #${item.venta_id})`,
          referenciaIds: [item.venta_id],
        }])
      }
    } else if (metodoReembolso === 'vale') {
      /* Cliente NO registrado: no se devuelve efectivo. Se genera un VALE al
       * portador por el monto, que podrá canjear en su próxima compra. */
      const v = crearVale(database, { monto: reembolso, origen: 'devolucion', ventaOrigenId: item.venta_id, nota: `Devolución de «${codigoRef}»` })
      valeCreado = { codigo: v.codigo, monto: v.monto }
      devolucionMonto = reembolso
      devolucionMetodo = 'vale'
    }
    database.prepare(`
      UPDATE venta_items
         SET devolucion_monto = ?,
             devolucion_metodo = ?,
             devolucion_cuenta_bancaria = ?,
             devolucion_excedente = ?,
             devolucion_excedente_metodo = ?
       WHERE id = ?
    `).run(devolucionMonto, devolucionMetodo, cuentaBancaria || '', devolucionExcedente, devolucionExcedenteMetodo, item.id)
  })

  tx()

  recordEvent({
    type: 'sale.returned',
    actor: 'user',
    scope: 'sale',
    entityRef: item.venta_id,
    source: 'pdv',
    payload: {
      codigo: codigoRef, ventaId: item.venta_id, productoId: prod.id, reembolso, metodoReembolso,
      cantidad: cantidadDevuelta, totalRenglon,
      saldosClienteId, ventaEsCredito, deudaCancelada,
      excedente: excedenteOut, excedenteMetodo: excedenteOut > 0 ? excedenteMetodo : null,
      cuentaBancaria: cuentaBancaria || '',
    },
  })

  return {
    ok: true, reembolso, totalRenglon, cantidad: cantidadDevuelta, ventaId: item.venta_id, productoId: prod.id, codigo: codigoRef,
    ventaEsCredito, saldosClienteId: ventaEsCredito ? saldosClienteId : null, clienteNombre,
    deudaCancelada, excedente: excedenteOut, excedenteMetodo: excedenteOut > 0 ? excedenteMetodo : null,
    vale: valeCreado,
  }
}

function listClientesConCredito() {
  ensureCreditoSchema(getDb())
  return listClientes()
}

/**
 * Devuelve la venta asociada a un movimiento de crédito (link "ver venta").
 * Incluye los items con snapshot de código/nombre/precio para el detalle.
 */
/**
 * Detalle de una venta para "Consultar ventas": cabecera, renglones (con marca
 * de devuelto) y, si fue fiada, el nombre de la cuenta de Saldos. Lo usa el PDV
 * para ver una venta, reimprimir el ticket y devolver prenda por prenda.
 */
function getVentaDetalle(ventaId) {
  const database = getDb()
  ensureVentasSchema(database)
  const id = Number(ventaId)
  if (!Number.isFinite(id) || id <= 0) return null
  const venta = database.prepare(`SELECT * FROM ventas WHERE id = ?`).get(id)
  if (!venta) return null
  const items = database.prepare(
    `SELECT id, producto_id, codigo_snapshot, nombre_snapshot, precio_snapshot, cantidad, devuelto_en,
            devolucion_monto, devolucion_metodo, devolucion_cuenta_bancaria,
            devolucion_excedente, devolucion_excedente_metodo
       FROM venta_items WHERE venta_id = ? ORDER BY id ASC`,
  ).all(id)
  let clienteNombre = null
  if (venta.saldos_cliente_id) {
    const c = database.prepare('SELECT nombre FROM saldos_clientes WHERE id = ?').get(venta.saldos_cliente_id)
    clienteNombre = c?.nombre || null
  }
  return { venta, items, clienteNombre }
}

/**
 * Elimina una venta por completo, dejando todo "como antes de la venta":
 *  - Las prendas NO devueltas vuelven al inventario (disponible, stock repuesto).
 *    Las que YA se devolvieron no se tocan (su stock volvió en la devolución).
 *  - Se ANULAN los movimientos de Saldos que referencian esta venta (el cargo del
 *    fiado, su enganche y cualquier descuento de devolución) → no queda deuda ni
 *    saldo a favor por esta venta.
 *  - Se borra la venta y sus renglones (desaparece de la lista y de reportes).
 * Los VALES ya emitidos por una devolución NO se tocan (son crédito al portador
 * ya entregado). Pensado como "deshacer" una venta equivocada.
 */
function deleteVenta(ventaId) {
  const database = getDb()
  ensureVentasSchema(database)
  const id = Number(ventaId)
  if (!Number.isFinite(id) || id <= 0) throw new Error('Venta inválida.')
  const venta = database.prepare('SELECT * FROM ventas WHERE id = ?').get(id)
  if (!venta) throw new Error('Esa venta no existe (quizá ya se eliminó).')
  const items = database.prepare(
    'SELECT id, producto_id, cantidad, devuelto_en FROM venta_items WHERE venta_id = ?',
  ).all(id)

  let stockRepuesto = 0
  let saldosRevertidos = 0
  const tx = database.transaction(() => {
    for (const it of items) {
      if (it.devuelto_en) continue // ya volvió al inventario en su devolución
      const prod = database.prepare('SELECT id, pieza_unica FROM productos WHERE id = ?').get(it.producto_id)
      if (!prod) continue // el producto ya no existe; nada que reponer
      if (Number(prod.pieza_unica) === 1) {
        database.prepare(`UPDATE productos SET estado = 'disponible', vendido_en = NULL, updated_at = datetime('now') WHERE id = ?`).run(prod.id)
      } else {
        const cant = Math.max(1, Math.floor(Number(it.cantidad) || 1))
        database.prepare(`UPDATE productos SET stock = stock + ?, estado = 'disponible', vendido_en = NULL, updated_at = datetime('now') WHERE id = ?`).run(cant, prod.id)
      }
      stockRepuesto += 1
    }
    // Anular los movimientos de Saldos que referencian esta venta (cargo del fiado,
    // enganche/abonos y descuentos de devolución). Quedan en historial, fuera del saldo.
    const movs = database.prepare(
      `SELECT m.id FROM saldos_movimientos m
        WHERE m.anulado = 0
          AND EXISTS (SELECT 1 FROM json_each(m.referencia_ids) j WHERE j.value = ?)`,
    ).all(id)
    for (const m of movs) {
      database.prepare(`UPDATE saldos_movimientos SET anulado = 1, anulado_motivo = ?, anulado_en = datetime('now') WHERE id = ?`).run(`Venta #${id} eliminada`, m.id)
      saldosRevertidos += 1
    }
    database.prepare('DELETE FROM venta_items WHERE venta_id = ?').run(id)
    database.prepare('DELETE FROM ventas WHERE id = ?').run(id)
  })
  tx()

  recordEvent({
    type: 'sale.deleted', actor: 'user', scope: 'sale', entityRef: id, source: 'pdv',
    payload: { ventaId: id, total: Number(venta.total) || 0, stockRepuesto, saldosRevertidos, eraFiado: !!venta.saldos_cliente_id },
  })
  return { ok: true, ventaId: id, stockRepuesto, saldosRevertidos, eraFiado: !!venta.saldos_cliente_id }
}

/**
 * Compras (ventas ligadas a la cuenta de Saldos) de un cliente, con sus renglones
 * y la CATEGORÍA de cada prenda, para mostrar en su expediente "qué se llevó y
 * cuándo". Más recientes primero. La categoría sale del producto (LEFT JOIN; si la
 * prenda se borró, queda vacía).
 */
function getComprasCliente(clienteId) {
  const database = getDb()
  ensureVentasSchema(database)
  const id = Number(clienteId)
  if (!Number.isFinite(id) || id <= 0) return []
  const ventas = database.prepare(
    `SELECT id, total, created_at FROM ventas WHERE saldos_cliente_id = ? ORDER BY datetime(created_at) DESC, id DESC`,
  ).all(id)
  if (ventas.length === 0) return []
  const itemsStmt = database.prepare(
    `SELECT vi.codigo_snapshot AS codigo, vi.nombre_snapshot AS nombre, vi.cantidad,
            vi.precio_snapshot AS precio, vi.devuelto_en AS devuelto, p.categoria AS categoria
       FROM venta_items vi LEFT JOIN productos p ON p.id = vi.producto_id
      WHERE vi.venta_id = ? ORDER BY vi.id ASC`,
  )
  return ventas.map((v) => ({
    ventaId: Number(v.id),
    fecha: v.created_at,
    total: Number(v.total) || 0,
    items: itemsStmt.all(v.id).map((it) => ({
      codigo: String(it.codigo || ''),
      nombre: String(it.nombre || it.codigo || ''),
      categoria: String(it.categoria || ''),
      cantidad: Number(it.cantidad) || 1,
      precio: Number(it.precio) || 0,
      devuelto: it.devuelto != null,
    })),
  }))
}

function getVentaForCredito(movimientoId) {
  const database = getDb()
  ensureCreditoSchema(database)
  const mov = database.prepare(
    `SELECT venta_id FROM credito_movimientos WHERE id = ?`,
  ).get(Number(movimientoId))
  if (!mov?.venta_id) return null
  const venta = database.prepare(`SELECT * FROM ventas WHERE id = ?`).get(mov.venta_id)
  if (!venta) return null
  const items = database.prepare(
    `SELECT id, producto_id, codigo_snapshot, nombre_snapshot, precio_snapshot, cantidad
       FROM venta_items WHERE venta_id = ? ORDER BY id ASC`,
  ).all(venta.id)
  return { venta, items }
}

function getWelcomeSnapshot() {
  const database = getDb()
  const p = database
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM productos) AS productosTotal,
        (SELECT COUNT(*) FROM inventario_activo p
          WHERE LOWER(TRIM(COALESCE(p.estado, ''))) = 'disponible'
            AND NOT EXISTS (SELECT 1 FROM venta_items vi WHERE vi.producto_id = p.id)) AS productosDisponibles`,
    )
    .get()
  /* Fiado real: vive en el módulo Saldos (saldos_clientes / saldos_movimientos),
   * NO en la libreta vieja `clientes`. El saldo por cuenta = cargos − pagos
   * (clamped ≥ 0), idéntico a saldoSaldosCliente() y al motor saldosLedger.js. */
  const c = database
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM saldos_clientes WHERE COALESCE(archivada, 0) = 0) AS clientesTotal,
        COALESCE(SUM(CASE WHEN saldo > 0.005 THEN 1 ELSE 0 END), 0) AS clientesConSaldo,
        COALESCE(SUM(CASE WHEN saldo > 0 THEN saldo ELSE 0 END), 0) AS saldoTotalPendiente
       FROM (
         SELECT COALESCE(SUM(CASE
                  WHEN m.tipo IN ('cargo','cargo_atraso','ajuste') THEN m.monto
                  WHEN m.tipo IN ('abono','descuento') THEN -m.monto
                  ELSE 0 END), 0) AS saldo
           FROM saldos_clientes sc
           LEFT JOIN saldos_movimientos m
             ON m.cliente_id = sc.id AND m.anulado = 0
          WHERE COALESCE(sc.archivada, 0) = 0
          GROUP BY sc.id
       )`,
    )
    .get()
  return {
    productosTotal: Number(p.productosTotal) || 0,
    productosDisponibles: Number(p.productosDisponibles) || 0,
    clientesTotal: Number(c.clientesTotal) || 0,
    clientesConSaldo: Number(c.clientesConSaldo) || 0,
    saldoTotalPendiente: Number(c.saldoTotalPendiente) || 0,
  }
}

function getMonserratDbPath() {
  return resolveMonserratDbPath()
}

function listBanquetaSalidas() {
  const database = getDb()
  const rows = database
    .prepare(
      `SELECT s.id, s.nombre, s.estado, s.notas, s.lugar, s.fecha_planeada,
              s.created_at, s.activated_at, s.closed_at,
              (SELECT COUNT(*) FROM banqueta_salida_items i WHERE i.salida_id = s.id) AS item_count,
              (SELECT COUNT(*) FROM banqueta_salida_items i WHERE i.salida_id = s.id AND i.vendido = 1) AS sold_count,
              (SELECT COALESCE(SUM(i.precio_vendido), 0) FROM banqueta_salida_items i WHERE i.salida_id = s.id AND i.vendido = 1) AS sold_total
       FROM banqueta_salidas s
       ORDER BY
         CASE s.estado WHEN 'activa' THEN 0 WHEN 'borrador' THEN 1 ELSE 2 END,
         s.id DESC`,
    )
    .all()
  return (rows || []).map((r) => ({
    ...r,
    item_count: Number(r.item_count) || 0,
    sold_count: Number(r.sold_count) || 0,
    sold_total: Number(r.sold_total) || 0,
  }))
}

function getActiveBanquetaSalida() {
  const database = getDb()
  const row = database
    .prepare(
      `SELECT s.id, s.nombre, s.estado, s.lugar, s.fecha_planeada, s.created_at, s.activated_at,
              (SELECT COUNT(*) FROM banqueta_salida_items i WHERE i.salida_id = s.id) AS item_count,
              (SELECT COUNT(*) FROM banqueta_salida_items i WHERE i.salida_id = s.id AND i.vendido = 1) AS sold_count
       FROM banqueta_salidas s
       WHERE s.estado = 'activa'
       LIMIT 1`,
    )
    .get()
  if (!row) return null
  return {
    ...row,
    item_count: Number(row.item_count) || 0,
    sold_count: Number(row.sold_count) || 0,
  }
}

function sanitizeFechaPlaneada(value) {
  if (value == null) return null
  const s = String(value).trim()
  if (!s) return null
  // Acepta YYYY-MM-DD o cualquier string parseable; guardamos en ISO
  const d = new Date(s)
  if (Number.isFinite(d.getTime())) {
    // Si el input es YYYY-MM-DD, conservar esa forma (sin corrimiento de zona horaria)
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
    return d.toISOString()
  }
  return null
}

function createBanquetaSalida(payload = {}) {
  const database = getDb()
  const nombre =
    String(payload.nombre || '').trim() ||
    `Salida ${new Date().toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}`
  const lugar = String(payload.lugar || '').trim()
  const fechaPlaneada = sanitizeFechaPlaneada(payload.fechaPlaneada ?? payload.fecha_planeada)
  const r = database
    .prepare(
      `INSERT INTO banqueta_salidas (nombre, estado, lugar, fecha_planeada)
       VALUES (?, 'borrador', ?, ?)`,
    )
    .run(nombre, lugar, fechaPlaneada)
  return { id: Number(r.lastInsertRowid) }
}

function updateBanquetaSalida(payload = {}) {
  const id = Number(payload.id)
  if (!id) throw new Error('Salida inválida')
  const database = getDb()
  const row = database.prepare('SELECT estado FROM banqueta_salidas WHERE id = ?').get(id)
  if (!row) throw new Error('No existe la salida')
  if (row.estado === 'cerrada') throw new Error('No se puede editar una salida cerrada')
  if (payload.nombre != null) {
    database.prepare('UPDATE banqueta_salidas SET nombre = ? WHERE id = ?').run(String(payload.nombre).trim(), id)
  }
  if (payload.notas != null) {
    database.prepare('UPDATE banqueta_salidas SET notas = ? WHERE id = ?').run(String(payload.notas), id)
  }
  if (payload.lugar != null) {
    database.prepare('UPDATE banqueta_salidas SET lugar = ? WHERE id = ?').run(String(payload.lugar).trim(), id)
  }
  if (payload.fechaPlaneada !== undefined || payload.fecha_planeada !== undefined) {
    const fp = sanitizeFechaPlaneada(payload.fechaPlaneada ?? payload.fecha_planeada)
    database.prepare('UPDATE banqueta_salidas SET fecha_planeada = ? WHERE id = ?').run(fp, id)
  }
  return { ok: true }
}

function getBanquetaSalidaDetail(id) {
  const database = getDb()
  const sid = Number(id)
  if (!sid) return null
  const s = database.prepare('SELECT * FROM banqueta_salidas WHERE id = ?').get(sid)
  if (!s) return null
  const items = database
    .prepare(
      `SELECT i.id, i.producto_id, i.precio_snapshot, i.codigo_snapshot, i.nombre_snapshot,
              i.added_at, i.vendido, i.precio_vendido, i.vendido_at, COALESCE(i.sort_order, 0) AS sort_order,
              COALESCE(i.cantidad, 1) AS cantidad, COALESCE(i.cantidad_vendida, 0) AS cantidad_vendida,
              p.codigo AS codigo_actual, p.descripcion AS descripcion_actual, p.precio AS precio_actual,
              p.estado AS estado_producto, p.pieza_unica AS pieza_unica, p.stock AS stock_actual
       FROM banqueta_salida_items i
       JOIN productos p ON p.id = i.producto_id
       WHERE i.salida_id = ?
       ORDER BY COALESCE(i.sort_order, 0) ASC, i.id ASC`,
    )
    .all(sid)
  return { salida: s, items: items || [] }
}

function addProductToBanquetaSalida(salidaId, codigo, cantidad = 1) {
  const database = getDb()
  const sid = Number(salidaId)
  const s = database.prepare('SELECT id, estado FROM banqueta_salidas WHERE id = ?').get(sid)
  if (!s) throw new Error('Salida no encontrada')
  if (s.estado === 'cerrada') throw new Error('La salida está cerrada')
  const p = getProductByCodigo(codigo)
  if (!p) throw new Error('No hay artículo con ese código')
  const estActual = String(p.estado || '').trim().toLowerCase()
  const marcadoVendido =
    (p.vendido_en != null && String(p.vendido_en).trim() !== '') || estActual === 'vendido'
  if (marcadoVendido) {
    throw new Error('Esta prenda figura como vendida. No se puede agregar a banqueta.')
  }
  /* Invariante: una prenda solo puede estar en UNA salida no cerrada a la vez.
   * Si está en otra salida abierta/borrador/activa, abortar — sino al cerrar
   * la primera salida la prenda vuelve a `disponible` aunque siga referenciada
   * en la segunda → inventario y banqueta se desincronizan. */
  const otra = database
    .prepare(
      `SELECT s2.id, s2.nombre, s2.estado FROM banqueta_salida_items i
       JOIN banqueta_salidas s2 ON s2.id = i.salida_id
       WHERE i.producto_id = ? AND s2.estado != 'cerrada' AND s2.id != ?
       LIMIT 1`,
    )
    .get(p.id, sid)
  if (otra) {
    const ref = otra.nombre ? `«${otra.nombre}»` : `#${otra.id}`
    throw new Error(`«${codigoStrPreview(p)}» ya está en otra salida abierta (${ref}).`)
  }
  const precio = Number(p.precio) || 0
  const codigoStr = String(p.codigo || '').trim()
  const nombre = String(p.descripcion || codigoStr).slice(0, 500)

  /* Stock parcial: para artículos repetibles (no pieza única) la dueña elige
   * cuántas unidades saca. Esas unidades se descuentan del stock al salir (ya no
   * están en la tienda). Si saca todo, el producto pasa a «en_banqueta»; si deja
   * stock, sigue «disponible» para la tienda. La pieza única siempre es 1 y se
   * mueve por estado, sin tocar el stock. */
  const esPieza = Number(p.pieza_unica) === 1
  const stockDisp = Math.max(0, Math.floor(Number(p.stock) || 0))
  let qty = Math.max(1, Math.floor(Number(cantidad) || 1))
  if (esPieza) {
    qty = 1
  } else {
    if (stockDisp < 1) throw new Error(`«${codigoStr}» no tiene stock disponible para banqueta.`)
    if (qty > stockDisp) throw new Error(`Solo hay ${stockDisp} en stock de «${codigoStr}» (pediste ${qty}).`)
  }

  const mx = database
    .prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM banqueta_salida_items WHERE salida_id = ?')
    .get(sid)
  const nextOrder = Number(mx?.m ?? -1) + 1
  const run = database.transaction(() => {
    try {
      database
        .prepare(
          `INSERT INTO banqueta_salida_items (salida_id, producto_id, precio_snapshot, codigo_snapshot, nombre_snapshot, sort_order, cantidad)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(sid, p.id, precio, codigoStr, nombre, nextOrder, qty)
    } catch (e) {
      const msg = String(e?.message || e || '')
      if (/UNIQUE constraint failed/i.test(msg)) {
        throw new Error('Esa prenda ya está en esta salida.')
      }
      throw friendlySqliteError(e)
    }
    if (esPieza) {
      if (estActual !== 'en_banqueta') {
        database.prepare("UPDATE productos SET estado = 'en_banqueta', updated_at = datetime('now') WHERE id = ?").run(p.id)
      }
    } else {
      database.prepare(
        `UPDATE productos
            SET stock = MAX(0, stock - @q),
                estado = CASE WHEN (stock - @q) <= 0 THEN 'en_banqueta' ELSE estado END,
                updated_at = datetime('now')
          WHERE id = @id AND stock >= @q`,
      ).run({ q: qty, id: p.id })
    }
  })
  run()
  return getBanquetaSalidaDetail(sid)
}

function codigoStrPreview(p) {
  return String(p?.codigo || p?.descripcion || '').trim() || '?'
}

function removeBanquetaSalidaItem(itemId) {
  const database = getDb()
  const iid = Number(itemId)
  const row = database
    .prepare(
      `SELECT i.id, i.producto_id, s.estado FROM banqueta_salida_items i
       JOIN banqueta_salidas s ON s.id = i.salida_id
       WHERE i.id = ?`,
    )
    .get(iid)
  if (!row) throw new Error('Ítem no encontrado')
  if (row.estado === 'cerrada') throw new Error('No se puede modificar una salida cerrada')
  const run = database.transaction(() => {
    database.prepare('DELETE FROM banqueta_salida_items WHERE id = ?').run(iid)
    // Si el producto no figura en ninguna otra salida viva, lo devolvemos al inventario.
    const other = database
      .prepare(
        `SELECT 1 FROM banqueta_salida_items i
         JOIN banqueta_salidas s ON s.id = i.salida_id
         WHERE i.producto_id = ? AND s.estado != 'cerrada' LIMIT 1`,
      )
      .get(row.producto_id)
    if (!other) {
      database
        .prepare(
          "UPDATE productos SET estado = 'disponible' WHERE id = ? AND LOWER(COALESCE(estado,'')) = 'en_banqueta'",
        )
        .run(row.producto_id)
    }
  })
  run()
  return { ok: true }
}

/**
 * Modo Regreso: en una salida `activa`, la cliente trae prendas vendidas en
 * la calle. Escaneás el código → marcamos el ítem como vendido (con precio
 * opcional). Si el código no está en la salida → error claro. Si ya estaba
 * vendido → idempotente, no falla.
 *
 * Reusa setBanquetaSalidaItemResult, pero busca por código en lugar de por
 * itemId (la operadora solo tiene el lector de barras).
 */
/**
 * Sugiere prendas "viejas" (≥ N meses sin vender, estado disponible) para
 * armar una salida de banqueta. No incluye prendas que ya estén en otra
 * salida no cerrada — esas saldrían como duplicado al escanear.
 */
function listStaleForBanqueta(opts = {}) {
  const database = getDb()
  const meses = Math.max(1, Math.floor(Number(opts?.meses) || 6))
  const limit = Math.max(10, Math.floor(Number(opts?.limit) || 50))
  const dias = meses * 30
  /* `date('now', '-Xdays')`: SQLite no acepta param en el modificador, pero
   * `dias` viene saneado arriba; lo interpolamos seguro. */
  return database.prepare(
    `SELECT p.id, p.codigo, p.descripcion, p.precio, p.fecha_ingreso, p.created_at,
            COALESCE(p.fecha_ingreso, p.created_at) AS fecha_referencia,
            CAST(julianday('now') - julianday(COALESCE(p.fecha_ingreso, p.created_at)) AS INTEGER) AS dias_sin_mover
       FROM inventario_activo p
      WHERE LOWER(TRIM(COALESCE(p.estado,''))) = 'disponible'
        AND NOT EXISTS (
          SELECT 1 FROM banqueta_salida_items bi
            JOIN banqueta_salidas bs ON bs.id = bi.salida_id
           WHERE bi.producto_id = p.id AND bs.estado != 'cerrada'
        )
        AND NOT EXISTS (SELECT 1 FROM venta_items vi WHERE vi.producto_id = p.id)
        AND date(COALESCE(p.fecha_ingreso, p.created_at)) <= date('now', '-${dias} days')
      ORDER BY date(COALESCE(p.fecha_ingreso, p.created_at)) ASC
      LIMIT ?`,
  ).all(limit)
}

function scanBanquetaSalidaResult(payload = {}) {
  const database = getDb()
  const salidaId = Number(payload?.salidaId)
  const codigo = String(payload?.codigo || '').trim()
  if (!salidaId) throw new Error('Salida inválida.')
  if (!codigo) throw new Error('Código vacío.')
  const s = database.prepare('SELECT id, estado FROM banqueta_salidas WHERE id = ?').get(salidaId)
  if (!s) throw new Error('Salida no encontrada.')
  if (s.estado === 'cerrada') throw new Error('La salida está cerrada.')
  if (s.estado !== 'activa') {
    throw new Error('Esta salida aún no está activa. Activala primero para usar el modo Regreso.')
  }
  const item = database.prepare(
    `SELECT id, vendido, precio_snapshot FROM banqueta_salida_items
      WHERE salida_id = ? AND TRIM(LOWER(codigo_snapshot)) = TRIM(LOWER(?))
      LIMIT 1`,
  ).get(salidaId, codigo)
  if (!item) {
    throw new Error(`«${codigo}» no está en esta salida (no salió a banqueta).`)
  }
  /* Si no se especifica precio, asumimos el precio_snapshot original (lo que
   * Monserrat puso al armar la salida). El operador puede pasar un override
   * cuando recibe la prenda y ajusta. */
  const precioVendido = (() => {
    const raw = payload?.precioVendido
    if (raw == null || String(raw).trim() === '') return Number(item.precio_snapshot) || 0
    const n = Number(raw)
    return Number.isFinite(n) && n >= 0 ? n : Number(item.precio_snapshot) || 0
  })()
  database.prepare(
    `UPDATE banqueta_salida_items
        SET vendido = 1, cantidad_vendida = COALESCE(cantidad, 1), precio_vendido = ?, vendido_at = COALESCE(vendido_at, datetime('now'))
      WHERE id = ?`,
  ).run(precioVendido, item.id)
  return {
    ok: true,
    itemId: item.id,
    yaEstaba: Number(item.vendido) === 1,
    precioVendido,
    detail: getBanquetaSalidaDetail(salidaId),
  }
}

function setBanquetaSalidaItemResult(payload = {}) {
  const database = getDb()
  const iid = Number(payload.itemId)
  if (!iid) throw new Error('Ítem inválido')
  const vendido = payload.vendido ? 1 : 0
  const precioRaw = payload.precioVendido ?? payload.precio_vendido
  const precioVendido =
    vendido === 1 && precioRaw != null && String(precioRaw).trim() !== '' && Number.isFinite(Number(precioRaw))
      ? Number(precioRaw)
      : null
  const row = database
    .prepare(
      `SELECT i.id, COALESCE(i.cantidad, 1) AS cantidad, s.estado, s.id AS salida_id FROM banqueta_salida_items i
       JOIN banqueta_salidas s ON s.id = i.salida_id WHERE i.id = ?`,
    )
    .get(iid)
  if (!row) throw new Error('Ítem no encontrado')
  if (row.estado === 'cerrada') throw new Error('La salida ya está cerrada')
  if (vendido === 1) {
    // cantidad vendida: por defecto todo lo que salió; multi-stock puede vender menos.
    const reqCant = Number(payload.cantidadVendida ?? payload.cantidad_vendida)
    const cantVend = Number.isFinite(reqCant) && reqCant > 0
      ? Math.min(Math.floor(reqCant), Number(row.cantidad) || 1)
      : (Number(row.cantidad) || 1)
    database
      .prepare(
        `UPDATE banqueta_salida_items
         SET vendido = 1, cantidad_vendida = ?, precio_vendido = ?, vendido_at = COALESCE(vendido_at, datetime('now'))
         WHERE id = ?`,
      )
      .run(cantVend, precioVendido, iid)
  } else {
    database
      .prepare(
        `UPDATE banqueta_salida_items SET vendido = 0, cantidad_vendida = 0, precio_vendido = NULL, vendido_at = NULL WHERE id = ?`,
      )
      .run(iid)
  }
  return getBanquetaSalidaDetail(row.salida_id)
}

function reorderBanquetaSalidaItems(salidaId, orderedItemIds) {
  const database = getDb()
  const sid = Number(salidaId)
  const ids = Array.isArray(orderedItemIds) ? orderedItemIds.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0) : []
  if (!sid || !ids.length) return getBanquetaSalidaDetail(sid)
  const s = database.prepare('SELECT estado FROM banqueta_salidas WHERE id = ?').get(sid)
  if (!s) throw new Error('Salida no encontrada')
  if (s.estado === 'cerrada') throw new Error('No se puede reordenar una salida cerrada')
  const run = database.transaction(() => {
    ids.forEach((itemId, idx) => {
      database
        .prepare('UPDATE banqueta_salida_items SET sort_order = ? WHERE id = ? AND salida_id = ?')
        .run(idx, itemId, sid)
    })
  })
  run()
  return getBanquetaSalidaDetail(sid)
}

function removeBanquetaSalidaItemsBulk(itemIds) {
  const database = getDb()
  const ids = Array.isArray(itemIds) ? itemIds.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0) : []
  if (!ids.length) return { ok: true, detail: null }
  const row = database
    .prepare(
      `SELECT i.salida_id AS sid, s.estado FROM banqueta_salida_items i
       JOIN banqueta_salidas s ON s.id = i.salida_id
       WHERE i.id = ?`,
    )
    .get(ids[0])
  if (!row) throw new Error('Ítem no encontrado')
  if (row.estado === 'cerrada') throw new Error('No se puede modificar una salida cerrada')
  const sid = Number(row.sid)
  const ph = ids.map(() => '?').join(',')
  const okCnt = database
    .prepare(`SELECT COUNT(*) AS c FROM banqueta_salida_items WHERE salida_id = ? AND id IN (${ph})`)
    .get(sid, ...ids)
  if (!okCnt || Number(okCnt.c) !== ids.length) {
    throw new Error('Los ítems deben pertenecer a la misma salida.')
  }
  const del = database.prepare('DELETE FROM banqueta_salida_items WHERE id = ? AND salida_id = ?')
  const run = database.transaction(() => {
    for (const iid of ids) del.run(iid, sid)
  })
  run()
  return { ok: true, detail: getBanquetaSalidaDetail(sid) }
}

function activateBanquetaSalida(salidaId) {
  const database = getDb()
  const sid = Number(salidaId)
  const s = database.prepare('SELECT id, estado FROM banqueta_salidas WHERE id = ?').get(sid)
  if (!s) throw new Error('Salida no encontrada')
  if (s.estado === 'cerrada') throw new Error('La salida ya está cerrada')
  const n = database.prepare('SELECT COUNT(*) AS c FROM banqueta_salida_items WHERE salida_id = ?').get(sid)
  if (!n || Number(n.c) < 1) throw new Error('Agregá al menos una prenda antes de activar.')
  const run = database.transaction(() => {
    database.prepare(`UPDATE banqueta_salidas SET estado = 'borrador' WHERE estado = 'activa'`).run()
    database
      .prepare(`UPDATE banqueta_salidas SET estado = 'activa', activated_at = datetime('now') WHERE id = ?`)
      .run(sid)
  })
  run()
  return getBanquetaSalidaDetail(sid)
}

function closeBanquetaSalida(salidaId) {
  const database = getDb()
  const sid = Number(salidaId)
  const s = database.prepare('SELECT estado FROM banqueta_salidas WHERE id = ?').get(sid)
  if (!s) throw new Error('Salida no encontrada')
  if (s.estado !== 'activa') throw new Error('Solo se puede cerrar una salida activa.')
  const items = database
    .prepare(
      `SELECT i.id, i.producto_id, i.vendido, COALESCE(i.precio_vendido, 0) AS precio_vendido,
              p.pieza_unica AS pieza_unica, p.estado AS estado_producto
         FROM banqueta_salida_items i JOIN productos p ON p.id = i.producto_id
        WHERE i.salida_id = ?`,
    )
    .all(sid)
  let sold = 0
  let desactivados = 0
  let ingreso = 0
  const run = database.transaction(() => {
    database
      .prepare(`UPDATE banqueta_salidas SET estado = 'cerrada', closed_at = datetime('now') WHERE id = ?`)
      .run(sid)
    const setVendido = database.prepare(
      "UPDATE productos SET estado = 'vendido', vendido_en = COALESCE(vendido_en, datetime('now')), updated_at = datetime('now') WHERE id = ?",
    )
    /* No vendidas NO vuelven al bazar: quedan «desactivado» (siguen en inventario,
     * NO se venden, se pueden reactivar escaneando la etiqueta o eliminar). Las
     * unidades repetibles que se sacaron ya se descontaron del stock al salir, así
     * que las no vendidas simplemente no regresan. */
    const setDesactivado = database.prepare(
      "UPDATE productos SET estado = 'desactivado', updated_at = datetime('now') WHERE id = ? AND vendido_en IS NULL",
    )
    for (const it of items) {
      const esPieza = Number(it.pieza_unica) === 1
      const enBanqueta = String(it.estado_producto || '').toLowerCase() === 'en_banqueta'
      if (Number(it.vendido) === 1) {
        sold += 1
        ingreso += Number(it.precio_vendido) || 0
        if (esPieza) setVendido.run(it.producto_id)
        else if (enBanqueta) { setDesactivado.run(it.producto_id); desactivados += 1 }
        // repetible con stock restante: sigue 'disponible' en la tienda.
      } else if (esPieza || enBanqueta) {
        setDesactivado.run(it.producto_id)
        desactivados += 1
      }
      // repetible no vendido con stock restante: las unidades sacadas no vuelven.
    }
  })
  run()
  return { ok: true, sold, desactivados, ingreso: Math.round(ingreso * 100) / 100 }
}

/* Reactivar un producto «desactivado» (volvió de banqueta sin venderse y la dueña
 * decide traerlo de vuelta a la tienda). Lo regresa a «disponible». Para piezas
 * repetibles que quedaron en 0, conviene además ajustar el stock al reactivar. */
function reactivarProductoBanqueta(payload = {}) {
  const database = getDb()
  const id = Number(payload?.productoId || payload?.id || payload)
  if (!Number.isFinite(id) || id <= 0) throw new Error('Producto inválido.')
  const p = database.prepare('SELECT id, estado, pieza_unica, stock FROM productos WHERE id = ?').get(id)
  if (!p) throw new Error('Producto no encontrado.')
  if (String(p.estado || '').toLowerCase() !== 'desactivado') {
    throw new Error('Solo se pueden reactivar productos desactivados.')
  }
  const nuevoStock = payload?.stock != null && Number.isFinite(Number(payload.stock))
    ? Math.max(0, Math.floor(Number(payload.stock)))
    : (Number(p.pieza_unica) === 1 ? 1 : Math.max(1, Math.floor(Number(p.stock) || 0) || 1))
  database.prepare(
    "UPDATE productos SET estado = 'disponible', stock = ?, vendido_en = NULL, updated_at = datetime('now') WHERE id = ?",
  ).run(nuevoStock, id)
  return { ok: true, id, stock: nuevoStock }
}

function deleteBanquetaSalida(salidaId) {
  const database = getDb()
  const sid = Number(salidaId)
  const s = database.prepare('SELECT estado FROM banqueta_salidas WHERE id = ?').get(sid)
  if (!s) throw new Error('Salida no encontrada')
  if (s.estado === 'activa') {
    throw new Error('No se puede eliminar una salida activa. Cerrala primero o eliminá el borrador antes de activar.')
  }
  /* Historial: ya se aplicó cierre al inventario; solo quitamos el registro y los ítems (CASCADE). */
  if (s.estado === 'cerrada') {
    database.prepare('DELETE FROM banqueta_salidas WHERE id = ?').run(sid)
    return { ok: true }
  }
  if (s.estado !== 'borrador') throw new Error('Solo se pueden borrar borradores o salidas cerradas del historial.')
  const productIds = database
    .prepare('SELECT producto_id FROM banqueta_salida_items WHERE salida_id = ?')
    .all(sid)
    .map((r) => Number(r.producto_id))
  const run = database.transaction(() => {
    database.prepare('DELETE FROM banqueta_salidas WHERE id = ?').run(sid)
    // Devolver al inventario productos que quedaron sin ninguna otra salida viva.
    for (const pid of productIds) {
      const other = database
        .prepare(
          `SELECT 1 FROM banqueta_salida_items i
           JOIN banqueta_salidas s ON s.id = i.salida_id
           WHERE i.producto_id = ? AND s.estado != 'cerrada' LIMIT 1`,
        )
        .get(pid)
      if (!other) {
        database
          .prepare(
            "UPDATE productos SET estado = 'disponible' WHERE id = ? AND LOWER(COALESCE(estado,'')) = 'en_banqueta'",
          )
          .run(pid)
      }
    }
  })
  run()
  return { ok: true }
}

module.exports = {
  initDatabase,
  getDb,
  closeDb,
  resetMonserratDatabaseToSeed,
  getProducts,
  checkRequiredTagsForProduct,
  addProduct,
  updateProduct,
  deleteProduct,
  searchProducts,
  nextCodigoMsr,
  getProductById,
  getProductByCodigo,
  getInventoryList,
  getTagGroupsForProduct,
  getTagLabelsForMap,
  suggestNombreFromTags,
  suggestPrecioFromTags,
  getReferenceRows,
  getReferenceSnapshot,
  previewPriceAdjust,
  applyPriceAdjust,
  getReferencePatternStats,
  getSales,
  addSale,
  getCredits,
  getWelcomeSnapshot,
  listBanquetaSalidas,
  getActiveBanquetaSalida,
  createBanquetaSalida,
  updateBanquetaSalida,
  getBanquetaSalidaDetail,
  addProductToBanquetaSalida,
  removeBanquetaSalidaItem,
  setBanquetaSalidaItemResult,
  activateBanquetaSalida,
  closeBanquetaSalida,
  deleteBanquetaSalida,
  reorderBanquetaSalidaItems,
  removeBanquetaSalidaItemsBulk,
  reactivarProductoBanqueta,
  getMonserratDbPath,
  nombreEtiquetaDesdeTagsPayload,
  getCuadernoTagGroups,
  getTagCatalogForManager,
  cuadernoAddTagGroup,
  cuadernoAddTagOption,
  cuadernoBulkAddTagOptions,
  cuadernoMoveTagOption,
  cuadernoRenameTagOption,
  cuadernoRenameTagGroup,
  cuadernoDeleteTagOption,
  cuadernoDeleteTagGroup,
  countProductsByTagOption,
  cuadernoSetTagOptionActive,
  cuadernoReorderTagGroups,
  listInvPricingRules,
  listInvRuleCustomFieldsFlat,
  getInvPricingRule,
  findApplicableInvRulePrice,
  detectInvRuleCandidate,
  appendInvRuleRow,
  countSimilarProducts,
  updateInvRuleRowPrice,
  upsertInvPricingRule,
  deleteInvPricingRule,
  listClientes,
  addCliente,
  updateCliente,
  deleteClienteSinMovimientosCC,
  addCreditoMovimiento,
  getCreditoMovimientos,
  listClientesConCredito,
  getVentaForCredito,
  findIntercambiableByCodigo,
  searchIntercambiableCandidates,
  addIntercambio,
  getVentaItemPorCodigoDevolucion,
  getVentaDetalle,
  deleteVenta,
  getComprasCliente,
  registrarDevolucionRapida,
  buscarVale,
  listVales,
  scanBanquetaSalidaResult,
  listStaleForBanqueta,
  recordEvent,
  ledgerQuery,
  ledgerStats,
}
