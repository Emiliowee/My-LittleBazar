-- Migración 002 — Saldos V1: la libreta digital de cuentas de clientas.
--
-- Modelo según docs/saldos-especificacion.md:
--   · El saldo NUNCA se guarda: se calcula desde los movimientos
--     (motor puro src/lib/saldosLedger.js, testeado).
--   · Los movimientos no se borran: se anulan (auditable como la hoja física).
--   · Piezas nuevas con nombres nuevos — NO toca las tablas viejas de
--     crédito del POS (clientes / movimientos de credito siguen igual).
--
-- Cambios PURAMENTE ADITIVOS: dos tablas nuevas + índices.

CREATE TABLE IF NOT EXISTS saldos_clientes (
  id                     INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  nombre                 TEXT NOT NULL,
  telefono               TEXT,
  nacimiento             TEXT,
  direccion              TEXT,
  identificacion_estado  TEXT NOT NULL DEFAULT 'pendiente',
  identificacion_motivo  TEXT,
  nota                   TEXT,
  archivada              INTEGER NOT NULL DEFAULT 0,
  created_at             TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at             TEXT
);

CREATE TABLE IF NOT EXISTS saldos_movimientos (
  id              INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  cliente_id      INTEGER NOT NULL REFERENCES saldos_clientes(id),
  tipo            TEXT NOT NULL,
  fecha           TEXT NOT NULL,
  monto           REAL NOT NULL DEFAULT 0,
  concepto        TEXT,
  medio           TEXT,
  quien_pago      TEXT,
  nota            TEXT,
  referencia_ids  TEXT,
  anulado         INTEGER NOT NULL DEFAULT 0,
  anulado_motivo  TEXT,
  anulado_en      TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_saldos_mov_cliente
  ON saldos_movimientos (cliente_id, fecha, id);

CREATE INDEX IF NOT EXISTS idx_saldos_clientes_archivada
  ON saldos_clientes (archivada, nombre);
