import {
  corteDelDia, prendasEstancadas, stockBajo, totalFiadoAfuera,
  hoyLocal, diaLocalDeVenta,
} from '../src/lib/reportes.js'
import { daysAgoIso } from '../src/lib/saldosLedger.js'

let passed = 0
function assert(cond, label) {
  if (!cond) { console.error(`FAIL: ${label}`); process.exit(1) }
  passed += 1
  console.log(`  ok  ${label}`)
}

const hoy = hoyLocal()
const ahora = new Date().toISOString() // created_at de "hoy" (UTC); diaLocalDeVenta lo lleva a local

// ── Corte del día ──────────────────────────────────────────────────
console.log('\n[corteDelDia]')
const ventas = [
  { total: 200, metodo: 'efectivo', cambio: 0, created_at: ahora },
  { total: 100, metodo: 'efectivo', cambio: 20, created_at: ahora },     // pagó 120
  { total: 300, metodo: 'transferencia', cambio: 0, created_at: ahora },
  { total: 120, metodo: 'efectivo', cambio: 0, created_at: ahora, returned_efectivo: 40 },
  { total: 500, metodo: 'credito', cambio: null, created_at: ahora },    // fiado, no es caja
  { total: 999, metodo: 'efectivo', cambio: 0, created_at: '2020-01-01 10:00:00' }, // viejo, se ignora
]
const cuentas = [
  { id: 1, nombre: 'Rosa', movimientos: [
    { tipo: 'cargo', fecha: hoy, monto: 500 },           // el fiado de arriba
    { tipo: 'abono', fecha: hoy, monto: 150, medio: 'efectivo' }, // enganche en efectivo
  ] },
  { id: 2, nombre: 'Luz', movimientos: [
    { tipo: 'abono', fecha: hoy, monto: 80, medio: 'transferencia' },
    { tipo: 'cargo', fecha: daysAgoIso(40), monto: 400 }, // deuda vieja, no cuenta para el corte
  ] },
]
const corte = corteDelDia(ventas, cuentas, { hoy })
assert(corte.numVentas === 5, `cuenta 5 ventas de hoy (ignora la vieja), vino ${corte.numVentas}`)
assert(corte.efectivo === 530, `efectivo = 420 ventas + 150 enganche - 40 devueltos = 530, vino ${corte.efectivo}`)
assert(corte.transferencia === 380, `transferencia = 300 venta + 80 abono = 380, vino ${corte.transferencia}`)
assert(corte.totalCobrado === 910, `total cobrado = 530 + 380 = 910, vino ${corte.totalCobrado}`)
assert(corte.cambioEntregado === 20, `cambio entregado = 20, vino ${corte.cambioEntregado}`)
assert(corte.efectivoEnCaja === 530, `efectivo en caja = efectivo neto (no resta dos veces el cambio) = 530, vino ${corte.efectivoEnCaja}`)
assert(corte.devolucionesEfectivo === 40, `devoluciones en efectivo = 40, vino ${corte.devolucionesEfectivo}`)
assert(corte.fiadoAnotado === 500, `fiado anotado hoy = 500, vino ${corte.fiadoAnotado}`)
assert(corte.abonosRecibidos === 230, `abonos recibidos = 150 + 80 = 230, vino ${corte.abonosRecibidos}`)

// ── Prendas estancadas ─────────────────────────────────────────────
console.log('\n[prendasEstancadas]')
const productos = [
  { id: 1, codigo: 'A', descripcion: 'Vestido viejo', pieza_unica: 1, estado: 'disponible', fecha_ingreso: daysAgoIso(60) },
  { id: 2, codigo: 'B', descripcion: 'Blusa nueva', pieza_unica: 1, estado: 'disponible', fecha_ingreso: daysAgoIso(5) },
  { id: 3, codigo: 'C', descripcion: 'Pantalón vendido', pieza_unica: 1, estado: 'vendido', fecha_ingreso: daysAgoIso(90) },
  { id: 4, codigo: 'D', descripcion: 'Labial stock 0', pieza_unica: 0, stock: 0, estado: 'disponible', fecha_ingreso: daysAgoIso(99) },
  { id: 5, codigo: 'E', descripcion: 'Perfume stock', pieza_unica: 0, stock: 4, estado: 'disponible', fecha_ingreso: daysAgoIso(45) },
]
const estancadas = prendasEstancadas(productos, { dias: 21, hoy })
assert(estancadas.length === 2, `2 estancadas (Vestido y Perfume), vino ${estancadas.length}`)
assert(estancadas[0].codigo === 'A', `la más vieja primero (A), vino ${estancadas[0].codigo}`)
assert(!estancadas.some((p) => p.codigo === 'C'), 'no incluye la vendida')
assert(!estancadas.some((p) => p.codigo === 'D'), 'no incluye la de stock 0')

// ── Stock bajo ─────────────────────────────────────────────────────
console.log('\n[stockBajo]')
const sb = stockBajo(productos, { umbral: 2 })
assert(sb.agotados.length === 1 && sb.agotados[0].codigo === 'D', 'detecta 1 agotado (D)')
assert(sb.bajos.length === 0, 'Perfume con stock 4 no es stock bajo (umbral 2)')
const sb2 = stockBajo([{ codigo: 'X', pieza_unica: 0, stock: 1 }, { codigo: 'Y', pieza_unica: 0, stock: 2 }], { umbral: 2 })
assert(sb2.bajos.length === 2, `dos artículos en stock bajo, vino ${sb2.bajos.length}`)
assert(sb2.bajos[0].codigo === 'X', 'el de menor stock primero')

// ── Fiado en la calle ──────────────────────────────────────────────
console.log('\n[totalFiadoAfuera]')
const fiado = totalFiadoAfuera(cuentas)
// Rosa: cargo 500 - abono 150 = 350. Luz: cargo 400 - abono 80 = 320.
assert(fiado.total === 670, `total fiado afuera = 350 + 320 = 670, vino ${fiado.total}`)
assert(fiado.deudores === 2, `2 deudores, vino ${fiado.deudores}`)
assert(fiado.top[0].nombre === 'Rosa', `Rosa debe más (350), primera; vino ${fiado.top[0].nombre}`)

// ── diaLocalDeVenta ────────────────────────────────────────────────
console.log('\n[diaLocalDeVenta]')
assert(diaLocalDeVenta(ahora) === hoy, 'created_at de ahora cae en hoy local')
assert(diaLocalDeVenta('') === '', 'created_at vacío → vacío')

console.log(`\nreportes ok — ${passed} verificaciones`)
process.exit(0)
