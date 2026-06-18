-- Migración 003 — Saldos V2: identificación con foto, etiquetas y recordatorios.
--
-- Cierra pendientes de docs/saldos-especificacion.md:
--   · Foto de identificación: ruta de imagen guardada localmente (NUNCA se
--     sube a internet). La dueña normalmente pide identificación.
--   · Etiquetas manuales del cliente (buena paga, revisar, mayorista, …) —
--     marcas para filtrar y recordar, NO IA. Se guardan como CSV.
--   · Recordatorios: prometió pagar, revisar cuenta, no insistir, llamar,
--     mandar WhatsApp. Tabla propia (un cliente tiene varios).
--
-- Cambios PURAMENTE ADITIVOS: dos columnas NULLables + una tabla nueva.

ALTER TABLE saldos_clientes ADD COLUMN identificacion_imagen TEXT;
ALTER TABLE saldos_clientes ADD COLUMN etiquetas TEXT;

CREATE TABLE IF NOT EXISTS saldos_recordatorios (
  id          INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  cliente_id  INTEGER NOT NULL REFERENCES saldos_clientes(id),
  tipo        TEXT NOT NULL DEFAULT 'nota',
  texto       TEXT,
  fecha       TEXT,
  hecho       INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_saldos_recordatorios_cliente
  ON saldos_recordatorios (cliente_id, hecho, fecha);
