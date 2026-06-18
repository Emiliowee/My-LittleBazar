'use strict'

/**
 * Test end-to-end del FLUJO CRÍTICO del negocio, ejercitando el código real
 * de electron/database.cjs (no una reimplementación) contra una base SQLite
 * temporal y aislada.
 *
 * El circuito que verifica es el que define si el software le sirve a la
 * clienta o no:
 *
 *     alta de producto  ->  buscar por código (escaneo del POS)  ->  vender
 *                       ->  el stock baja / el estado cambia
 *                       ->  el ingreso queda registrado
 *
 * Aísla la base real seteando BAZAR_MONSERRAT_DB a un archivo temporal ANTES
 * de requerir database.cjs (resolveMonserratDbPath respeta esa variable).
 * Nunca toca la base de la clienta.
 *
 * Uso:  npm run test:venta   (corre bajo Electron por el binding nativo)
 * Exit: 0 si pasa, 1 si falla.
 */

const fs = require('fs')
const os = require('os')
const path = require('path')

const TMP_DB = path.join(os.tmpdir(), `mlb-venta-test-${Date.now()}-${process.pid}.db`)
process.env.BAZAR_MONSERRAT_DB = TMP_DB

const db = require('../electron/database.cjs')

let passed = 0
function ok(label) {
  passed += 1
  console.log(`  ok   ${label}`)
}
function assert(cond, label) {
  if (!cond) throw new Error(`ASSERT FALLÓ: ${label}`)
  ok(label)
}
function assertThrows(fn, fragmentoEsperado, label) {
  let threw = null
  try { fn() } catch (e) { threw = e }
  if (!threw) throw new Error(`ASSERT FALLÓ: ${label} — se esperaba un error y no hubo ninguno`)
  if (fragmentoEsperado && !String(threw.message).toLowerCase().includes(fragmentoEsperado.toLowerCase())) {
    throw new Error(`ASSERT FALLÓ: ${label} — el error fue «${threw.message}», esperaba que incluyera «${fragmentoEsperado}»`)
  }
  ok(`${label} (rechazó: "${threw.message.slice(0, 60)}…")`)
}

function safeDelete(p) {
  for (const ext of ['', '-shm', '-wal']) {
    try { fs.unlinkSync(p + ext) } catch { /* no existe */ }
  }
}

function nuevoProducto(extra) {
  const base = {
    codigo: `T-${Math.random().toString(36).slice(2, 9).toUpperCase()}`,
    descripcion: 'Producto de prueba',
    precio: 100,
    pieza_unica: true,
    stock: 1,
    estado: 'disponible',
    skipTagValidation: true,
    skipRuleLearning: true,
  }
  return { ...base, ...extra }
}

function run() {
  // El primer getDb() crea schema base + corre migraciones numeradas.
  db.getDb()

  // ── Caso 1: pieza única, camino feliz ────────────────────────────────
  console.log('\n[Caso 1] Pieza única: alta -> escaneo -> venta')
  const snap0 = db.getWelcomeSnapshot()
  const p1 = db.addProduct(nuevoProducto({ descripcion: 'Vestido rojo único', precio: 350 }))
  assert(p1 && Number(p1.id) > 0, 'addProduct devuelve id')

  const escaneado = db.getProductByCodigo(p1.codigoGenerado || p1.codigo || nuevoProducto().codigo)
  // addProduct puede normalizar el código; lo recuperamos por id para escanear su código real.
  const real = db.getProductById(Number(p1.id))
  assert(real && real.codigo, 'el producto existe y tiene código tras el alta')
  const porCodigo = db.getProductByCodigo(real.codigo)
  assert(porCodigo && Number(porCodigo.id) === Number(p1.id), 'getProductByCodigo encuentra el producto (simula escaneo del POS)')

  const venta1 = db.addSale({
    metodo: 'efectivo',
    pagoCon: 500,
    items: [{ productoId: Number(p1.id), cantidad: 1 }],
  })
  assert(venta1 && venta1.ok === true, 'addSale devuelve ok')
  assert(Number(venta1.total) === 350, `total de venta correcto (esperaba 350, vino ${venta1.total})`)
  assert(Number(venta1.cambio) === 150, `cambio correcto (esperaba 150, vino ${venta1.cambio})`)

  const trasVenta = db.getProductById(Number(p1.id))
  assert(String(trasVenta.estado).toLowerCase() === 'vendido', 'el producto quedó en estado "vendido"')
  assert(trasVenta.vendido_en && String(trasVenta.vendido_en).trim() !== '', 'el producto tiene vendido_en seteado')

  const snap1 = db.getWelcomeSnapshot()
  assert(
    Number(snap1.productosDisponibles) === Number(snap0.productosDisponibles),
    `disponibles vuelve a su nivel: el alta sumó 1 y la venta restó 1 (antes ${snap0.productosDisponibles}, después ${snap1.productosDisponibles})`,
  )

  // ── Caso 2: stock múltiple descuenta correctamente ───────────────────
  console.log('\n[Caso 2] Stock múltiple: venta parcial y agotamiento')
  const p2 = db.addProduct(nuevoProducto({ descripcion: 'Labial stock', precio: 80, pieza_unica: false, stock: 3 }))
  const id2 = Number(p2.id)
  db.addSale({ metodo: 'efectivo', pagoCon: 200, items: [{ productoId: id2, cantidad: 2 }] })
  const tras2a = db.getProductById(id2)
  assert(Number(tras2a.stock) === 1, `stock baja de 3 a 1 tras vender 2 (vino ${tras2a.stock})`)
  assert(String(tras2a.estado).toLowerCase() === 'disponible', 'con stock restante sigue "disponible"')

  db.addSale({ metodo: 'efectivo', pagoCon: 100, items: [{ productoId: id2, cantidad: 1 }] })
  const tras2b = db.getProductById(id2)
  assert(Number(tras2b.stock) === 0, `stock llega a 0 tras vender la última (vino ${tras2b.stock})`)
  assert(String(tras2b.estado).toLowerCase() === 'vendido', 'con stock 0 pasa a "vendido"')

  // ── Caso 3: no se puede vender una pieza única ya vendida ─────────────
  console.log('\n[Caso 3] Edge: re-venta de pieza única agotada')
  assertThrows(
    () => db.addSale({ metodo: 'efectivo', pagoCon: 500, items: [{ productoId: Number(p1.id), cantidad: 1 }] }),
    'vendido',
    'rechaza vender una pieza única ya vendida',
  )

  // ── Caso 4: no se puede vender sin precio ────────────────────────────
  console.log('\n[Caso 4] Edge: producto sin precio')
  const p4 = db.addProduct(nuevoProducto({ descripcion: 'Sin precio', precio: 0 }))
  assertThrows(
    () => db.addSale({ metodo: 'efectivo', pagoCon: 100, items: [{ productoId: Number(p4.id), cantidad: 1 }] }),
    'precio',
    'rechaza vender un producto con precio 0',
  )

  // ── Caso 5: la venta quedó en el historial ───────────────────────────
  console.log('\n[Caso 5] El ingreso queda registrado')
  const ventas = db.getSales({})
  const lista = Array.isArray(ventas) ? ventas : (ventas?.rows || ventas?.ventas || [])
  assert(Array.isArray(lista) && lista.length >= 3, `getSales devuelve las ventas hechas (vino ${Array.isArray(lista) ? lista.length : 'no-array'})`)

  console.log(`\nOK  test-flujo-venta — ${passed} verificaciones pasaron`)
  console.log('    El circuito alta -> escaneo -> venta -> stock/estado -> ingreso CIERRA.')
}

try {
  run()
  db.closeDb?.()
  safeDelete(TMP_DB)
  process.exit(0)
} catch (err) {
  console.error(`\nFAIL test-flujo-venta: ${err.message}`)
  if (err.stack) console.error(err.stack.split('\n').slice(1, 4).join('\n'))
  try { db.closeDb?.() } catch { /* noop */ }
  safeDelete(TMP_DB)
  process.exit(1)
}
