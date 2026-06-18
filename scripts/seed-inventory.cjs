#!/usr/bin/env node
'use strict'

/**
 * Semilla extendida de productos para desarrollo.
 *
 * Lee LOS TAGS REALES que el usuario tiene en su cuaderno (tag_groups + tag_options)
 * y genera combinaciones realistas sobre esa estructura, de modo que el modo
 * "Patrones" y el modo "Cuaderno" tengan datos suficientes para sugerir
 * precios/nombres coherentes.
 *
 * El módulo `better-sqlite3` está compilado para Electron ABI, por eso el script
 * se ejecuta bajo Electron (no con Node puro):
 *
 *   npx electron bazar-app/scripts/seed-inventory.cjs               (defaults: count=60)
 *   npx electron bazar-app/scripts/seed-inventory.cjs --count=40
 *   npx electron bazar-app/scripts/seed-inventory.cjs --reset       (borra SEED-* previos)
 *   npx electron bazar-app/scripts/seed-inventory.cjs --dry         (no escribe)
 *
 * El script NO modifica la estructura de tags; solo inserta productos.
 */

const path = require('path')
const fs = require('fs')

function resolveDbPath() {
  if (process.env.BAZAR_MONSERRAT_DB) return path.resolve(process.env.BAZAR_MONSERRAT_DB)
  const repoRoot = path.resolve(__dirname, '..', '..')
  const monorepoDb = path.join(repoRoot, 'data', 'monserrat.db')
  if (fs.existsSync(monorepoDb)) return monorepoDb
  const localDb = path.join(repoRoot, 'bazar-app', 'data', 'monserrat.db')
  if (fs.existsSync(localDb)) return localDb
  if (process.env.APPDATA) {
    const userDb = path.join(process.env.APPDATA, 'bazar-app', 'monserrat.db')
    if (fs.existsSync(userDb)) return userDb
  }
  throw new Error('No se encontró monserrat.db (configurá BAZAR_MONSERRAT_DB).')
}

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=')
    return [k, v === undefined ? true : v]
  }),
)
const TARGET = Math.max(1, Number(args.count) || 60)
const RESET = Boolean(args.reset)
const DRY = Boolean(args.dry)

const dbPath = resolveDbPath()
console.log(`[seed] DB:     ${dbPath}`)
console.log(`[seed] target=${TARGET} reset=${RESET} dry=${DRY}`)

const Database = require(path.join(__dirname, '..', 'node_modules', 'better-sqlite3'))
const db = new Database(dbPath)
db.pragma('foreign_keys = ON')

const groups = db
  .prepare(
    `SELECT id, name, required, use_in_price, display_order
     FROM tag_groups WHERE active = 1 ORDER BY display_order, id`,
  )
  .all()
const options = db
  .prepare(
    `SELECT o.id, o.name, o.group_id, g.name AS grupo, o.is_price_rule
     FROM tag_options o JOIN tag_groups g ON g.id = o.group_id
     WHERE o.active = 1 AND g.active = 1
     ORDER BY g.display_order, g.id, o.id`,
  )
  .all()

if (!groups.length || !options.length) {
  console.error('[seed] No hay grupos/opciones activos. Creá tags en el cuaderno primero.')
  process.exit(1)
}

const optsByGroup = {}
for (const o of options) {
  if (!optsByGroup[o.grupo]) optsByGroup[o.grupo] = []
  optsByGroup[o.grupo].push(o)
}

/**
 * Heurística para elegir el grupo "primario" (el que da la descripción base).
 * Prioriza `required`, luego el que contenga palabras como "tipo", "prenda", "ropa", "categor".
 */
function pickPrimaryGroup() {
  const req = groups.find((g) => g.required)
  if (req && optsByGroup[req.name]?.length) return req.name
  const hint = groups.find((g) => /tipo|prenda|ropa|categor|produc/i.test(g.name))
  if (hint && optsByGroup[hint.name]?.length) return hint.name
  const any = groups.find((g) => optsByGroup[g.name]?.length)
  return any?.name || groups[0].name
}
const primaryGroup = pickPrimaryGroup()

/**
 * Heurísticas de precio base por nombre de opción primaria.
 * Si no hay coincidencia conocida, se usa el rango genérico.
 */
const PRICE_HINTS = [
  [/(zapato|tenis|calzado|bota)/i, [350, 650]],
  [/(chamarra|abrigo|saco)/i, [300, 520]],
  [/(vestido)/i, [240, 420]],
  [/(pantal[oó]n|jean)/i, [180, 320]],
  [/(falda)/i, [140, 220]],
  [/(blusa|camisa)/i, [120, 220]],
  [/(su[eé]ter|sweater)/i, [180, 280]],
  [/(playera|camiseta|top)/i, [80, 140]],
  [/(short|bermuda)/i, [100, 170]],
  [/(pijama)/i, [160, 240]],
  [/(interior|calz[oó]n|brasier|tanga)/i, [60, 120]],
  [/(accesorio|cinto|cintur|bolsa|gorra|collar|arete|pulsera)/i, [40, 180]],
]
function basePriceFor(name) {
  for (const [re, range] of PRICE_HINTS) if (re.test(name)) return range
  return [90, 220]
}

const BRAND_MULT = {
  nike: 1.18,
  adidas: 1.15,
  puma: 1.1,
  'tommy hilfiger': 1.3,
  tommy: 1.3,
  'calvin klein': 1.3,
  guess: 1.25,
  zara: 1.05,
  'h&m': 1.0,
  'otra marca': 0.9,
  'sin marca': 0.85,
}
function brandMult(name) {
  const k = String(name || '').toLowerCase()
  for (const b in BRAND_MULT) if (k.includes(b)) return BRAND_MULT[b]
  return 1.0
}

const ESTADOS = [
  { key: 'disponible', weight: 78 },
  { key: 'reservado', weight: 7 },
  { key: 'vendido', weight: 8 },
  { key: 'en_banqueta', weight: 7 },
]

function pickOne(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}
function pickWeighted(arr) {
  const total = arr.reduce((a, b) => a + b.weight, 0)
  let n = Math.random() * total
  for (const it of arr) {
    n -= it.weight
    if (n <= 0) return it.key
  }
  return arr[0].key
}
function round5(n) {
  return Math.max(5, Math.round(n / 5) * 5)
}

/* -------- reset -------- */
if (RESET && !DRY) {
  const ids = db
    .prepare(`SELECT id FROM productos WHERE codigo LIKE 'SEED-%'`)
    .all()
    .map((r) => r.id)
  if (ids.length) {
    const delPlano = db.prepare(`DELETE FROM plano_items WHERE producto_id = ?`)
    const delTags = db.prepare(`DELETE FROM producto_tags WHERE producto_id = ?`)
    const delProd = db.prepare(`DELETE FROM productos WHERE id = ?`)
    db.transaction(() => {
      for (const id of ids) {
        try {
          delPlano.run(id)
        } catch {}
        delTags.run(id)
        delProd.run(id)
      }
    })()
    console.log(`[seed] reset: ${ids.length} productos SEED-* borrados`)
  }
}

function nextSeedSerial() {
  const row = db
    .prepare(`SELECT codigo FROM productos WHERE codigo LIKE 'SEED-%' ORDER BY codigo DESC LIMIT 1`)
    .get()
  if (row?.codigo) {
    const m = /^SEED-(\d+)$/.exec(row.codigo)
    if (m) return Number(m[1]) + 1
  }
  return 1
}

/* -------- builder -------- */

function buildProduct() {
  const opts = {}
  const primaryBag = optsByGroup[primaryGroup] || []
  if (primaryBag.length) opts[primaryGroup] = pickOne(primaryBag)
  for (const g of groups) {
    if (g.name === primaryGroup) continue
    const bag = optsByGroup[g.name] || []
    if (!bag.length) continue
    if (!g.required && Math.random() < 0.15) continue
    opts[g.name] = pickOne(bag)
  }
  const primary = opts[primaryGroup] || pickOne(options)
  if (!opts[primaryGroup]) opts[primaryGroup] = primary
  const [lo, hi] = basePriceFor(primary.name)
  const brandOpt = Object.values(opts).find((o) => /marca/i.test(o.grupo))
  const brand = brandOpt?.name || ''
  const raw = lo + Math.random() * (hi - lo)
  const precio = round5(raw * brandMult(brand))
  const partes = [primary.name]
  for (const [g, o] of Object.entries(opts)) {
    if (g === primaryGroup) continue
    if (/marca/i.test(g) && o.name) partes.push(o.name)
  }
  const descripcion = partes.join(' ').replace(/\s+/g, ' ').trim() || primary.name
  const estado = pickWeighted(ESTADOS)
  const multiUnidad = /accesorio|cinto|cintur|pulsera|arete|collar|gorra/i.test(primary.name)
  const pieza = multiUnidad && Math.random() < 0.5 ? 0 : 1
  const stock = pieza ? 1 : 5 + Math.floor(Math.random() * 40)
  return { opts, descripcion, precio, estado, pieza, stock }
}

const insP = db.prepare(
  `INSERT INTO productos (
    codigo, descripcion, precio, pieza_unica, stock, color, talla, imagen_path, estado,
    fecha_ingreso, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, '', ?, '', ?, datetime('now'), datetime('now'), datetime('now'))`,
)
const insPT = db.prepare(`INSERT INTO producto_tags (producto_id, tag_option_id) VALUES (?, ?)`)
const hasCode = db.prepare(`SELECT 1 FROM productos WHERE codigo = ?`)

let serial = nextSeedSerial()
let created = 0
const byPrimary = {}
const estadoCount = {}

db.transaction(() => {
  while (created < TARGET) {
    const p = buildProduct()
    const codigo = `SEED-${String(serial++).padStart(6, '0')}`
    if (hasCode.get(codigo)) continue
    const talla = Object.values(p.opts).find((o) => /talla/i.test(o.grupo))?.name || ''
    if (DRY) {
      console.log(
        `[dry] ${codigo} "${p.descripcion}" $${p.precio} ${p.estado} · ${Object.entries(p.opts)
          .map(([g, o]) => `${g}:${o.name}`)
          .join(', ')}`,
      )
    } else {
      const info = insP.run(codigo, p.descripcion, p.precio, p.pieza, p.stock, talla, p.estado)
      const pid = Number(info.lastInsertRowid)
      const seenOids = new Set()
      for (const o of Object.values(p.opts)) {
        if (seenOids.has(o.id)) continue
        seenOids.add(o.id)
        insPT.run(pid, o.id)
      }
    }
    created += 1
    const primaryName = p.opts[primaryGroup]?.name || '(?)'
    byPrimary[primaryName] = (byPrimary[primaryName] || 0) + 1
    estadoCount[p.estado] = (estadoCount[p.estado] || 0) + 1
  }
})()

console.log(`[seed] ${created} productos ${DRY ? '(dry)' : 'insertados'} · grupo primario: ${primaryGroup}`)
console.log('[seed] por opción primaria:', byPrimary)
console.log('[seed] por estado:', estadoCount)
db.close()

try {
  const { app } = require('electron')
  if (app?.whenReady) app.whenReady().then(() => app.quit())
} catch {
  /* Node puro: nada */
}
