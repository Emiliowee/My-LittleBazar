-- Migracion 004 - Devoluciones detalladas en POS.
--
-- Una devolucion no solo marca la prenda como devuelta: tambien debe guardar
-- cuanto dinero salio, por que medio salio y si en una venta fiada se cancelo
-- deuda en Saldos o hubo excedente para devolver.

CREATE TABLE IF NOT EXISTS ventas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  total REAL NOT NULL DEFAULT 0,
  pago_con REAL,
  cambio REAL,
  metodo TEXT NOT NULL DEFAULT 'efectivo',
  notas TEXT DEFAULT '',
  cuenta_bancaria TEXT DEFAULT '',
  saldos_cliente_id INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);

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

ALTER TABLE venta_items ADD COLUMN devolucion_monto REAL NOT NULL DEFAULT 0;
ALTER TABLE venta_items ADD COLUMN devolucion_metodo TEXT NOT NULL DEFAULT '';
ALTER TABLE venta_items ADD COLUMN devolucion_cuenta_bancaria TEXT NOT NULL DEFAULT '';
ALTER TABLE venta_items ADD COLUMN devolucion_excedente REAL NOT NULL DEFAULT 0;
ALTER TABLE venta_items ADD COLUMN devolucion_excedente_metodo TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_venta_items_devuelto
  ON venta_items (devuelto_en, devolucion_metodo);
