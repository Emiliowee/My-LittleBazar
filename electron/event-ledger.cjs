'use strict'

/**
 * Event Ledger — capa append-only que registra los hechos del bazar.
 *
 * Es el sustrato sobre el que se apoya cualquier capacidad adaptativa,
 * cualquier "what-if", cualquier predicción, cualquier auditoría. Las
 * tablas de dominio (productos, ventas, clientes) siguen siendo la
 * verdad operativa; este ledger es la **historia inmutable** de cómo
 * llegamos a esa verdad.
 *
 * Reglas:
 *   - APPEND-ONLY. No hay UPDATE ni DELETE expuestos.
 *   - Cada llamada a appendEvent debe ser idempotente: si la escritura
 *     falla por cualquier motivo, NUNCA propaga el error al caller —
 *     el ledger es un observador, no debe poder romper la transacción
 *     de negocio.
 *   - El payload es un JSON serializado. No hacemos schema validation
 *     en runtime: la disciplina vive en src/lib/eventTypes.js (capa app).
 *
 * Tabla: cognitive_events
 *   id            integer pk
 *   ts            iso utc string (microsegundo no es necesario; orden total
 *                 lo da el AUTOINCREMENT)
 *   event_type    string (ej. "sale.completed", "customer.created")
 *   actor         string ("user" | "agent" | "system" | ...)
 *   scope         string opcional (entidad lógica: "sale", "product", ...)
 *   entity_ref    integer opcional (FK lógica al id de la entidad)
 *   payload_json  text (JSON; no se valida acá)
 *   source        string opcional (módulo origen)
 *   session_id    string opcional (correlación de sesión)
 */

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS cognitive_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL,
    event_type TEXT NOT NULL,
    actor TEXT,
    scope TEXT,
    entity_ref INTEGER,
    payload_json TEXT,
    source TEXT,
    session_id TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_cognitive_events_type_ts ON cognitive_events (event_type, ts);
  CREATE INDEX IF NOT EXISTS idx_cognitive_events_scope_ref ON cognitive_events (scope, entity_ref);
  CREATE INDEX IF NOT EXISTS idx_cognitive_events_ts ON cognitive_events (ts);
`

let _schemaReady = false
let _appendStmt = null

function ensureSchema(database) {
  if (_schemaReady) return
  try {
    database.exec(SCHEMA)
    _schemaReady = true
  } catch (err) {
    console.error('[event-ledger] no se pudo crear schema:', err?.message || err)
  }
}

function safeJsonStringify(value) {
  try {
    return JSON.stringify(value ?? null)
  } catch {
    return 'null'
  }
}

function parsePayload(raw) {
  if (raw == null || raw === '') return null
  try {
    return JSON.parse(String(raw))
  } catch {
    return null
  }
}

/**
 * Registra un evento. NUNCA tira: si algo falla, devuelve null y loguea.
 * Esto garantiza que el ledger no pueda tirar abajo una venta o un alta.
 */
function appendEvent(database, evt) {
  if (!database || !evt || typeof evt !== 'object') return null
  try {
    ensureSchema(database)
    const type = String(evt.type || '').trim()
    if (!type) return null
    const ts = String(evt.ts || new Date().toISOString())
    const actor = evt.actor != null ? String(evt.actor) : null
    const scope = evt.scope != null ? String(evt.scope) : null
    const entityRef =
      evt.entityRef != null && Number.isFinite(Number(evt.entityRef))
        ? Number(evt.entityRef)
        : null
    const source = evt.source != null ? String(evt.source) : null
    const sessionId = evt.sessionId != null ? String(evt.sessionId) : null
    const payloadJson = safeJsonStringify(evt.payload)

    if (!_appendStmt) {
      _appendStmt = database.prepare(
        `INSERT INTO cognitive_events
           (ts, event_type, actor, scope, entity_ref, payload_json, source, session_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
    }
    const info = _appendStmt.run(ts, type, actor, scope, entityRef, payloadJson, source, sessionId)
    return { id: Number(info.lastInsertRowid), ts, type }
  } catch (err) {
    console.error('[event-ledger] append falló (silencioso):', err?.message || err)
    return null
  }
}

/**
 * Consulta el ledger. Devuelve arreglo con los eventos ordenados desc por id.
 * Argumentos opcionales:
 *   - types: string[]   tipos exactos (OR entre ellos)
 *   - typePrefix: string filtra por prefijo (ej. "sale.")
 *   - since: ISO string ts mínimo (>=)
 *   - until: ISO string ts máximo (<=)
 *   - scope: string
 *   - entityRef: number
 *   - limit: number (default 200, máx 2000)
 */
function queryEvents(database, opts = {}) {
  try {
    ensureSchema(database)
    const where = []
    const params = []
    if (Array.isArray(opts.types) && opts.types.length > 0) {
      where.push(`event_type IN (${opts.types.map(() => '?').join(',')})`)
      for (const t of opts.types) params.push(String(t))
    }
    if (opts.typePrefix) {
      where.push(`event_type LIKE ?`)
      params.push(`${String(opts.typePrefix)}%`)
    }
    if (opts.since) {
      where.push(`ts >= ?`)
      params.push(String(opts.since))
    }
    if (opts.until) {
      where.push(`ts <= ?`)
      params.push(String(opts.until))
    }
    if (opts.scope) {
      where.push(`scope = ?`)
      params.push(String(opts.scope))
    }
    if (opts.entityRef != null && Number.isFinite(Number(opts.entityRef))) {
      where.push(`entity_ref = ?`)
      params.push(Number(opts.entityRef))
    }
    const lim = Math.min(2000, Math.max(1, Math.floor(Number(opts.limit) || 200)))
    const sql = `
      SELECT id, ts, event_type AS type, actor, scope, entity_ref AS entityRef,
             payload_json, source, session_id AS sessionId
        FROM cognitive_events
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY id DESC
       LIMIT ?
    `
    params.push(lim)
    const rows = database.prepare(sql).all(...params)
    return rows.map((r) => ({
      id: r.id,
      ts: r.ts,
      type: r.type,
      actor: r.actor,
      scope: r.scope,
      entityRef: r.entityRef,
      payload: parsePayload(r.payload_json),
      source: r.source,
      sessionId: r.sessionId,
    }))
  } catch (err) {
    console.error('[event-ledger] query falló:', err?.message || err)
    return []
  }
}

/**
 * Estadísticas resumen del ledger. Útil para:
 *   - mostrar al usuario "el sistema ha observado X hechos"
 *   - alimentar al agente con un mapa rápido de qué pasó últimamente
 *   - validar empíricamente que el ledger está vivo
 */
function ledgerStats(database) {
  try {
    ensureSchema(database)
    const total = database.prepare(`SELECT COUNT(*) AS n FROM cognitive_events`).get()?.n || 0
    const byType = database
      .prepare(
        `SELECT event_type AS type, COUNT(*) AS n
           FROM cognitive_events
          GROUP BY event_type
          ORDER BY n DESC
          LIMIT 30`,
      )
      .all()
    const last = database
      .prepare(
        `SELECT id, ts, event_type AS type, scope, entity_ref AS entityRef
           FROM cognitive_events
          ORDER BY id DESC
          LIMIT 1`,
      )
      .get()
    const first = database
      .prepare(
        `SELECT id, ts FROM cognitive_events ORDER BY id ASC LIMIT 1`,
      )
      .get()
    const last24h = database
      .prepare(
        `SELECT COUNT(*) AS n FROM cognitive_events
          WHERE ts >= datetime('now', '-1 day')`,
      )
      .get()?.n || 0
    return { total, last24h, byType, first, last }
  } catch (err) {
    console.error('[event-ledger] stats falló:', err?.message || err)
    return { total: 0, last24h: 0, byType: [], first: null, last: null }
  }
}

module.exports = {
  appendEvent,
  queryEvents,
  ledgerStats,
  ensureSchema,
}
