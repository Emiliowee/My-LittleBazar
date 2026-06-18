/**
 * Motor puro de Reportes — calcula del lado del front a partir de datos crudos
 * (ventas, productos, cuentas de Saldos). Sin estado, sin I/O: fácil de testear
 * (`scripts/test-reportes.mjs`). La vista (`ReportesView`) trae los datos por
 * IPC y los pasa acá.
 *
 * Conceptos:
 *  - Corte del día: cuánta plata REAL entró hoy (efectivo + transferencia),
 *    incluyendo enganches/abonos en efectivo del módulo Saldos; cuánto se anotó
 *    a cuenta (fiado); cambio entregado; efectivo neto en caja.
 *  - Prendas estancadas: disponibles que llevan muchos días sin venderse.
 *  - Stock bajo: artículos de stock contado por agotarse / agotados.
 *  - Fiado en la calle: suma de lo que deben las cuentas de Saldos.
 */

import { calcularCuentaSaldos, daysBetween, money } from './saldosLedger.js'

/** Día local (AAAA-MM-DD) de hoy. */
export function hoyLocal() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Día local de una venta a partir de su created_at (guardado en UTC). */
export function diaLocalDeVenta(createdAt) {
  const raw = String(createdAt || '').trim()
  if (!raw) return ''
  // 'YYYY-MM-DD HH:MM:SS' (UTC) → Date → día local.
  const iso = raw.includes('T') ? raw : raw.replace(' ', 'T')
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + 'Z')
  if (Number.isNaN(d.getTime())) return raw.slice(0, 10)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function metodoBase(metodo) {
  const m = String(metodo || '').toLowerCase()
  if (m.startsWith('intercambio:')) return { base: 'intercambio', sub: m.split(':')[1] || '' }
  return { base: m, sub: '' }
}

/**
 * Corte del día. `ventas` = filas de getSales; `cuentas` = saldos.listCuentas
 * (cada una con `movimientos`). `hoy` = día local AAAA-MM-DD.
 */
export function corteDelDia(ventas = [], cuentas = [], { hoy = hoyLocal() } = {}) {
  const ventasHoy = (Array.isArray(ventas) ? ventas : []).filter((v) => diaLocalDeVenta(v.created_at) === hoy)

  let efectivoVentas = 0
  let transferVentas = 0
  let cambioEntregado = 0
  let devolucionesEfectivo = 0
  let devolucionesTransferencia = 0
  let devolucionesSaldos = 0
  for (const v of ventasHoy) {
    const total = money(v.total)
    const { base, sub } = metodoBase(v.metodo)
    const m = base === 'intercambio' ? sub : base
    if (m === 'efectivo') { efectivoVentas += total; cambioEntregado += money(v.cambio) }
    else if (m === 'transferencia') { transferVentas += total }
    // 'credito' (fiado) no es plata en caja: entra por sus enganches/abonos.
    devolucionesEfectivo += money(v.returned_efectivo) + money(v.returned_excedente_efectivo)
    devolucionesTransferencia += money(v.returned_transferencia) + money(v.returned_excedente_transferencia)
    devolucionesSaldos += money(v.returned_saldos)
  }

  // Movimientos de Saldos de HOY (la `fecha` ya es día local).
  let cargosHoy = 0          // fiado anotado a cuenta
  let abonosEfectivo = 0     // enganches + abonos en efectivo
  let abonosTransfer = 0     // enganches + abonos por transferencia
  let descuentosHoy = 0      // devoluciones de fiado (cancelaciones)
  for (const c of (Array.isArray(cuentas) ? cuentas : [])) {
    for (const mov of (c.movimientos || [])) {
      if (mov.anulada || mov.anulado) continue
      if (String(mov.fecha || '') !== hoy) continue
      const monto = money(mov.monto)
      if (mov.tipo === 'cargo') cargosHoy += monto
      else if (mov.tipo === 'abono') {
        const medio = String(mov.medio || '').toLowerCase()
        if (medio === 'transferencia') abonosTransfer += monto
        else abonosEfectivo += monto
      } else if (mov.tipo === 'descuento') descuentosHoy += monto
    }
  }

  const efectivo = money(efectivoVentas + abonosEfectivo - devolucionesEfectivo)
  const transferencia = money(transferVentas + abonosTransfer - devolucionesTransferencia)
  const totalCobrado = money(efectivo + transferencia)
  const efectivoEnCaja = efectivo
  const abonosRecibidos = money(abonosEfectivo + abonosTransfer)

  return {
    hoy,
    numVentas: ventasHoy.length,
    efectivo,
    transferencia,
    totalCobrado,
    cambioEntregado: money(cambioEntregado),
    efectivoEnCaja,
    fiadoAnotado: money(cargosHoy),
    abonosRecibidos,
    devolucionesEfectivo: money(devolucionesEfectivo),
    devolucionesTransferencia: money(devolucionesTransferencia),
    devolucionesFiado: money(descuentosHoy + devolucionesSaldos),
    porMetodo: [
      { clave: 'efectivo', label: 'Efectivo', monto: efectivo },
      { clave: 'transferencia', label: 'Transferencia', monto: transferencia },
      { clave: 'fiado', label: 'Fiado (a cuenta)', monto: money(cargosHoy) },
    ],
  }
}

function esDisponible(p) {
  const estado = String(p.estado || '').trim().toLowerCase()
  if (estado && estado !== 'disponible') return false
  if (p.vendido_en && String(p.vendido_en).trim() !== '') return false
  if (Number(p.pieza_unica) === 1) return true
  return Number(p.stock) > 0
}

/** Prendas disponibles que llevan `dias` o más sin moverse (por fecha_ingreso). */
export function prendasEstancadas(productos = [], { dias = 21, hoy = hoyLocal(), limite = 50 } = {}) {
  const rows = (Array.isArray(productos) ? productos : [])
    .filter(esDisponible)
    .map((p) => {
      const ingreso = String(p.fecha_ingreso || p.created_at || '').slice(0, 10)
      return { ...p, _dias: ingreso ? daysBetween(ingreso, hoy) : 0 }
    })
    .filter((p) => p._dias >= dias)
    .sort((a, b) => b._dias - a._dias)
  return rows.slice(0, limite)
}

/** Artículos de stock contado por agotarse (1..umbral) o agotados (0). */
export function stockBajo(productos = [], { umbral = 2 } = {}) {
  const multi = (Array.isArray(productos) ? productos : []).filter((p) => Number(p.pieza_unica) !== 1)
  const agotados = multi.filter((p) => Number(p.stock) <= 0)
  const bajos = multi
    .filter((p) => Number(p.stock) > 0 && Number(p.stock) <= umbral)
    .sort((a, b) => Number(a.stock) - Number(b.stock))
  return { umbral, agotados, bajos }
}

/** Lo que deben las cuentas de Saldos: total, cuántas deben y el ranking. */
export function totalFiadoAfuera(cuentas = [], { config = {} } = {}) {
  const conSaldo = (Array.isArray(cuentas) ? cuentas : [])
    .map((c) => ({ id: c.id, nombre: c.nombre, saldo: money(calcularCuentaSaldos(c, config).saldo) }))
    .filter((c) => c.saldo > 0)
    .sort((a, b) => b.saldo - a.saldo)
  const total = money(conSaldo.reduce((s, c) => s + c.saldo, 0))
  return { total, deudores: conSaldo.length, top: conSaldo }
}
