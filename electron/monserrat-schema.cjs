'use strict'

/**
 * DDL alineado con SQLAlchemy (`src/db/models.py`). Solo CREATE IF NOT EXISTS.
 */
function ensureMonserratSchema(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS tag_groups (
      id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      name VARCHAR(120) NOT NULL UNIQUE,
      use_in_price BOOLEAN,
      required BOOLEAN,
      active BOOLEAN,
      display_order INTEGER,
      created_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS tag_options (
      id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      name VARCHAR(120) NOT NULL,
      active BOOLEAN,
      is_price_rule INTEGER NOT NULL DEFAULT 0,
      rule_priority INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME,
      UNIQUE (group_id, name),
      FOREIGN KEY(group_id) REFERENCES tag_groups (id)
    );

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

    CREATE TABLE IF NOT EXISTS price_rules (
      id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      name VARCHAR(200) NOT NULL,
      price_min FLOAT NOT NULL,
      price_max FLOAT NOT NULL,
      priority INTEGER,
      active BOOLEAN,
      notes TEXT,
      created_at DATETIME,
      updated_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS price_rule_conditions (
      id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      rule_id INTEGER NOT NULL,
      group_id INTEGER NOT NULL,
      option_id INTEGER NOT NULL,
      UNIQUE (rule_id, group_id),
      FOREIGN KEY(rule_id) REFERENCES price_rules (id),
      FOREIGN KEY(group_id) REFERENCES tag_groups (id),
      FOREIGN KEY(option_id) REFERENCES tag_options (id)
    );

    CREATE TABLE IF NOT EXISTS productos (
      id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      codigo VARCHAR(60) NOT NULL UNIQUE,
      descripcion TEXT,
      precio FLOAT NOT NULL DEFAULT 0,
      pieza_unica BOOLEAN,
      stock INTEGER NOT NULL DEFAULT 1,
      color VARCHAR(100),
      talla VARCHAR(50),
      imagen_path VARCHAR(500),
      estado VARCHAR(30),
      fecha_ingreso DATETIME,
      created_at DATETIME,
      updated_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS producto_tags (
      producto_id INTEGER NOT NULL,
      tag_option_id INTEGER NOT NULL,
      PRIMARY KEY (producto_id, tag_option_id),
      FOREIGN KEY(producto_id) REFERENCES productos (id),
      FOREIGN KEY(tag_option_id) REFERENCES tag_options (id)
    );

    CREATE TABLE IF NOT EXISTS tienda_planos (
      id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      nombre VARCHAR(120) NOT NULL,
      notas TEXT,
      cols INTEGER NOT NULL DEFAULT 14,
      rows INTEGER NOT NULL DEFAULT 10,
      created_at DATETIME,
      updated_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS plano_items (
      id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      plano_id INTEGER NOT NULL,
      producto_id INTEGER NOT NULL,
      grid_x INTEGER NOT NULL,
      grid_y INTEGER NOT NULL,
      display_color VARCHAR(20),
      UNIQUE (plano_id, grid_x, grid_y),
      UNIQUE (plano_id, producto_id),
      FOREIGN KEY(plano_id) REFERENCES tienda_planos (id),
      FOREIGN KEY(producto_id) REFERENCES productos (id)
    );

    CREATE INDEX IF NOT EXISTS idx_productos_codigo ON productos(codigo);
    CREATE INDEX IF NOT EXISTS idx_productos_estado ON productos(estado);
  `)
}

module.exports = { ensureMonserratSchema }
