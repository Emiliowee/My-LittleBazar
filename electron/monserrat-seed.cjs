'use strict'

/**
 * Semilla de fábrica alineada con `src/db/setup.py` (grupos, opciones, regla ejemplo, artículos demo).
 * Se ejecuta sobre una base vacía recién creada.
 */

const DEFAULT_GROUPS = [
  {
    name: 'Marca',
    use_in_price: 1,
    required: 0,
    display_order: 1,
    options: [
      'Guess',
      'Tommy Hilfiger',
      'Calvin Klein',
      'Nike',
      'Adidas',
      'Zara',
      'Otra marca',
      'Sin marca',
    ],
  },
  {
    name: 'Público',
    use_in_price: 1,
    required: 0,
    display_order: 2,
    options: ['Mujer', 'Hombre', 'Niño(a)', 'Unisex'],
  },
  {
    name: 'Tipo de prenda',
    use_in_price: 1,
    required: 1,
    display_order: 3,
    options: [
      'Blusa',
      'Vestido',
      'Pantalón',
      'Falda',
      'Chamarra',
      'Playera',
      'Shorts',
      'Suéter',
      'Pijama',
      'Interior',
      'Accesorios',
      'Zapatos',
    ],
  },
  {
    name: 'Material',
    use_in_price: 1,
    required: 0,
    display_order: 4,
    options: ['Algodón', 'Poliéster', 'Mezclilla', 'Satén', 'Seda', 'Lana', 'Licra'],
  },
  {
    name: 'Talla',
    use_in_price: 0,
    required: 0,
    display_order: 5,
    options: ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'Única'],
  },
  {
    name: 'Temporada',
    use_in_price: 0,
    required: 0,
    display_order: 6,
    options: ['Primavera-Verano', 'Otoño-Invierno', 'Todo el año'],
  },
]

/** @typedef {{ codigo: string, descripcion: string, precio: number, estado: string, pieza_unica?: boolean, stock?: number, tags: [string, string][] }} DemoRow */

/** @type {DemoRow[]} */
const DEMO_PRODUCTOS = [
  {
    codigo: 'MSR-000001',
    descripcion: 'Blusa algodón M',
    precio: 149,
    estado: 'disponible',
    tags: [
      ['Tipo de prenda', 'Blusa'],
      ['Material', 'Algodón'],
      ['Marca', 'Zara'],
      ['Público', 'Mujer'],
      ['Talla', 'M'],
      ['Temporada', 'Primavera-Verano'],
    ],
  },
  {
    codigo: 'MSR-000002',
    descripcion: 'Vestido satén L',
    precio: 289,
    estado: 'disponible',
    tags: [
      ['Tipo de prenda', 'Vestido'],
      ['Material', 'Satén'],
      ['Marca', 'Otra marca'],
      ['Público', 'Mujer'],
      ['Talla', 'L'],
    ],
  },
  {
    codigo: 'MSR-000003',
    descripcion: 'Pantalón mezclilla 32',
    precio: 220,
    estado: 'disponible',
    tags: [
      ['Tipo de prenda', 'Pantalón'],
      ['Material', 'Mezclilla'],
      ['Marca', 'Calvin Klein'],
      ['Público', 'Hombre'],
      ['Talla', 'L'],
    ],
  },
  {
    codigo: 'MSR-000004',
    descripcion: 'Falda poliéster S',
    precio: 165,
    estado: 'disponible',
    tags: [
      ['Tipo de prenda', 'Falda'],
      ['Material', 'Poliéster'],
      ['Marca', 'Guess'],
      ['Público', 'Mujer'],
      ['Talla', 'S'],
    ],
  },
  {
    codigo: 'MSR-000005',
    descripcion: 'Chamarra mezclilla M',
    precio: 310,
    estado: 'disponible',
    tags: [
      ['Tipo de prenda', 'Chamarra'],
      ['Material', 'Mezclilla'],
      ['Marca', 'Tommy Hilfiger'],
      ['Público', 'Unisex'],
      ['Talla', 'M'],
    ],
  },
  {
    codigo: 'MSR-000006',
    descripcion: 'Playera algodón XL',
    precio: 95,
    estado: 'disponible',
    tags: [
      ['Tipo de prenda', 'Playera'],
      ['Material', 'Algodón'],
      ['Marca', 'Nike'],
      ['Público', 'Hombre'],
      ['Talla', 'XL'],
    ],
  },
  {
    codigo: 'MSR-000007',
    descripcion: 'Shorts deportivo M',
    precio: 118,
    estado: 'disponible',
    tags: [
      ['Tipo de prenda', 'Shorts'],
      ['Material', 'Licra'],
      ['Marca', 'Adidas'],
      ['Público', 'Mujer'],
      ['Talla', 'M'],
    ],
  },
  {
    codigo: 'MSR-000008',
    descripcion: 'Suéter lana L',
    precio: 198,
    estado: 'disponible',
    tags: [
      ['Tipo de prenda', 'Suéter'],
      ['Material', 'Lana'],
      ['Marca', 'Sin marca'],
      ['Público', 'Mujer'],
      ['Talla', 'L'],
      ['Temporada', 'Otoño-Invierno'],
    ],
  },
  {
    codigo: 'MSR-000009',
    descripcion: 'Pijama algodón M',
    precio: 175,
    estado: 'disponible',
    tags: [
      ['Tipo de prenda', 'Pijama'],
      ['Material', 'Algodón'],
      ['Marca', 'Otra marca'],
      ['Público', 'Mujer'],
      ['Talla', 'M'],
    ],
  },
  {
    codigo: 'MSR-000010',
    descripcion: 'Cinturón accesorio Única',
    precio: 85,
    estado: 'disponible',
    tags: [
      ['Tipo de prenda', 'Accesorios'],
      ['Material', 'Poliéster'],
      ['Marca', 'Sin marca'],
      ['Público', 'Unisex'],
      ['Talla', 'Única'],
    ],
  },
  {
    codigo: 'MSR-000011',
    descripcion: 'Zapatos deportivos 42',
    precio: 450,
    estado: 'disponible',
    tags: [
      ['Tipo de prenda', 'Zapatos'],
      ['Material', 'Poliéster'],
      ['Marca', 'Nike'],
      ['Público', 'Hombre'],
      ['Talla', 'L'],
    ],
  },
  {
    codigo: 'MSR-000012',
    descripcion: 'Blusa poliéster S (reservado)',
    precio: 132,
    estado: 'reservado',
    tags: [
      ['Tipo de prenda', 'Blusa'],
      ['Material', 'Poliéster'],
      ['Marca', 'Zara'],
      ['Público', 'Mujer'],
      ['Talla', 'S'],
    ],
  },
  {
    codigo: 'MSR-000013',
    descripcion: 'Vestido vendido (ejemplo)',
    precio: 199,
    estado: 'vendido',
    tags: [
      ['Tipo de prenda', 'Vestido'],
      ['Material', 'Algodón'],
      ['Marca', 'Guess'],
      ['Público', 'Mujer'],
      ['Talla', 'M'],
    ],
  },
  {
    codigo: 'MSR-000014',
    descripcion: 'Playera niño(a) 8',
    precio: 72,
    estado: 'disponible',
    tags: [
      ['Tipo de prenda', 'Playera'],
      ['Material', 'Algodón'],
      ['Marca', 'Otra marca'],
      ['Público', 'Niño(a)'],
      ['Talla', 'S'],
    ],
  },
  {
    codigo: 'MSR-000015',
    descripcion: 'En banqueta — falda mezclilla',
    precio: 155,
    estado: 'en_banqueta',
    tags: [
      ['Tipo de prenda', 'Falda'],
      ['Material', 'Mezclilla'],
      ['Marca', 'Zara'],
      ['Público', 'Mujer'],
      ['Talla', 'M'],
    ],
  },
  {
    codigo: 'MSR-000016',
    descripcion: 'Labial tono rojo (varias unidades)',
    precio: 48,
    estado: 'disponible',
    pieza_unica: false,
    stock: 36,
    tags: [
      ['Tipo de prenda', 'Accesorios'],
      ['Material', 'Poliéster'],
      ['Marca', 'Sin marca'],
      ['Público', 'Mujer'],
      ['Talla', 'Única'],
    ],
  },
  {
    codigo: 'MSR-000017',
    descripcion: 'Perfume mini 15 ml (stock)',
    precio: 120,
    estado: 'disponible',
    pieza_unica: false,
    stock: 20,
    tags: [
      ['Tipo de prenda', 'Accesorios'],
      ['Marca', 'Otra marca'],
      ['Público', 'Unisex'],
      ['Talla', 'Única'],
    ],
  },
]

function optionId(db, groupName, optionName) {
  const r = db
    .prepare(
      `SELECT o.id FROM tag_options o
       JOIN tag_groups g ON g.id = o.group_id
       WHERE g.name = ? AND o.name = ?`,
    )
    .get(groupName, optionName)
  return r ? Number(r.id) : null
}

/**
 * @param {import('better-sqlite3').Database} db
 */
function runFactorySeed(db) {
  const insG = db.prepare(
    `INSERT INTO tag_groups (name, use_in_price, required, active, display_order, created_at)
     VALUES (?, ?, ?, 1, ?, datetime('now'))`,
  )
  const insO = db.prepare(
    `INSERT INTO tag_options (group_id, name, active, created_at) VALUES (?, ?, 1, datetime('now'))`,
  )
  const insP = db.prepare(
    `INSERT INTO productos (
      codigo, descripcion, precio, pieza_unica, stock, color, talla, imagen_path, estado,
      fecha_ingreso, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, '', '', '', ?,
      datetime('now'), datetime('now'), datetime('now')
    )`,
  )
  const insPT = db.prepare(`INSERT INTO producto_tags (producto_id, tag_option_id) VALUES (?, ?)`)

  const run = db.transaction(() => {
    for (const g of DEFAULT_GROUPS) {
      const info = insG.run(g.name, g.use_in_price, g.required, g.display_order)
      const gid = Number(info.lastInsertRowid)
      for (const oname of g.options) {
        insO.run(gid, oname)
      }
    }

    const oidBlusa = optionId(db, 'Tipo de prenda', 'Blusa')
    const oidAlg = optionId(db, 'Material', 'Algodón')
    const rowTipo = db.prepare(`SELECT id FROM tag_groups WHERE name = 'Tipo de prenda'`).get()
    const rowMat = db.prepare(`SELECT id FROM tag_groups WHERE name = 'Material'`).get()
    if (oidBlusa && oidAlg && rowTipo?.id && rowMat?.id) {
      const insR = db.prepare(
        `INSERT INTO price_rules (name, price_min, price_max, priority, active, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, 1, ?, datetime('now'), datetime('now'))`,
      )
      const info = insR.run(
        'Blusa algodón (ejemplo)',
        120,
        180,
        20,
        'Regla de ejemplo del cuaderno; podés editarla en Cuaderno de precios.',
      )
      const rid = Number(info.lastInsertRowid)
      const insC = db.prepare(
        `INSERT INTO price_rule_conditions (rule_id, group_id, option_id) VALUES (?, ?, ?)`,
      )
      insC.run(rid, rowTipo.id, oidBlusa)
      insC.run(rid, rowMat.id, oidAlg)
    }

    for (const row of DEMO_PRODUCTOS) {
      const pieza = row.pieza_unica !== false ? 1 : 0
      const stock = pieza ? 1 : Math.max(1, Math.floor(Number(row.stock) || 1))
      const pinfo = insP.run(row.codigo, row.descripcion, row.precio, pieza, stock, row.estado)
      const pid = Number(pinfo.lastInsertRowid)
      for (const [gName, oName] of row.tags) {
        const oid = optionId(db, gName, oName)
        if (oid) insPT.run(pid, oid)
      }
    }
  })

  run()
}

module.exports = { runFactorySeed, DEFAULT_GROUPS, DEMO_PRODUCTOS }
