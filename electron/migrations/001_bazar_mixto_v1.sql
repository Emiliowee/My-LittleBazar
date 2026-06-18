-- Migración 001 — Modelo dual del bazar (pieza única + stock)
--
-- Suma los campos que faltaban para soportar honestamente las dos formas
-- de inventario que maneja la clienta:
--
--   1) Ropa importada de paca: pieza única, sin código de fábrica, con
--      marca / talla / género / color. Pertenece a un fardo de origen
--      (paca_id) y se puede comparar contra precio_original cuando va
--      a banqueta.
--
--   2) Cositas repetibles (cosmética, fragancia, accesorio, calzado, ...)
--      con stock contado y categoría declarada.
--
-- Cambios PURAMENTE ADITIVOS:
--   - Nueva tabla pacas (vacía).
--   - Nuevas columnas NULLables en productos. Los productos viejos quedan
--     con NULL en los campos nuevos y siguen comportándose como antes.
--
-- NO se toca:
--   - La semántica de "estado" (sigue siendo 'disponible' / 'vendido' /
--     etc.). El renombrado a vocabulario unificado va en una migración
--     posterior con más análisis.
--   - La tabla banqueta_salidas. Su colapso eventual al estado del
--     producto requiere una decisión de modelado aparte.

CREATE TABLE IF NOT EXISTS pacas (
  id              INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  nombre          VARCHAR(120) NOT NULL,
  fecha_compra    TEXT,
  costo_total     REAL,
  cantidad_aprox  INTEGER,
  lugar_compra    VARCHAR(200),
  notas           TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT
);

ALTER TABLE productos ADD COLUMN categoria       TEXT;
ALTER TABLE productos ADD COLUMN marca           TEXT;
ALTER TABLE productos ADD COLUMN genero          TEXT;
ALTER TABLE productos ADD COLUMN precio_original REAL;
ALTER TABLE productos ADD COLUMN paca_id         INTEGER REFERENCES pacas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_productos_categoria ON productos(categoria);
CREATE INDEX IF NOT EXISTS idx_productos_marca     ON productos(marca);
CREATE INDEX IF NOT EXISTS idx_productos_paca      ON productos(paca_id);
