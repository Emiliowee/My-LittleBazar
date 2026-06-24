export const SALDOS_CONFIG_DEFAULT = {
  diasAtraso: 30,
  porcentajeAtraso: 0.2,
}

const TIPOS_CARGO = new Set(['cargo', 'cargo_atraso'])
const TIPOS_PAGO = new Set(['abono', 'descuento'])

export function todayIso() {
  const d = new Date()
  return toIsoDate(d)
}

export function toIsoDate(date) {
  const d = date instanceof Date ? date : parseIsoDate(date)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function daysAgoIso(days) {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  d.setDate(d.getDate() - Number(days || 0))
  return toIsoDate(d)
}

export function daysBetween(start, end = todayIso()) {
  const a = parseIsoDate(start)
  const b = parseIsoDate(end)
  const ms = b.getTime() - a.getTime()
  return Math.max(0, Math.floor(ms / 86400000))
}

export function money(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100) / 100
}

export function crearMovimientoId(prefix = 'mov') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

export function ordenarMovimientos(movimientos = []) {
  return [...movimientos].sort((a, b) => {
    const fa = String(a?.fecha || '')
    const fb = String(b?.fecha || '')
    if (fa !== fb) return fa.localeCompare(fb)
    const ca = Number(a?.createdAt) || 0
    const cb = Number(b?.createdAt) || 0
    if (ca !== cb) return ca - cb
    return String(a?.id || '').localeCompare(String(b?.id || ''))
  })
}

export function calcularCuentaSaldos(cuenta, config = {}) {
  const cfg = { ...SALDOS_CONFIG_DEFAULT, ...config }
  const fechaCorte = cfg.fechaCorte || todayIso()
  const movimientos = ordenarMovimientos(cuenta?.movimientos || [])
  const cargos = []
  const procesados = []

  const referenciasConAtraso = new Set()
  for (const mov of movimientos) {
    if (mov?.tipo !== 'cargo_atraso') continue
    const ids = Array.isArray(mov.referenciaIds)
      ? mov.referenciaIds
      : mov.referenciaId
        ? [mov.referenciaId]
        : []
    ids.forEach((id) => referenciasConAtraso.add(String(id)))
  }

  let saldoAFavor = 0

  for (const mov of movimientos) {
    const tipo = normalizarTipo(mov?.tipo)
    const firmado = money(mov?.monto)
    const monto = Math.abs(firmado)

    if (TIPOS_CARGO.has(tipo) || (tipo === 'ajuste' && firmado > 0)) {
      let aplicadoDeFavor = 0
      let saldoDelCargo = monto
      const asignacionesAuto = []
      
      if (saldoAFavor > 0) {
        aplicadoDeFavor = Math.min(saldoAFavor, monto)
        saldoAFavor = money(saldoAFavor - aplicadoDeFavor)
        saldoDelCargo = money(monto - aplicadoDeFavor)
        if (aplicadoDeFavor > 0) {
          asignacionesAuto.push({ monto: aplicadoDeFavor, nota: 'Cubierto con saldo a favor previo' })
        }
      }

      const cargo = {
        ...mov,
        tipo,
        monto,
        aplicado: aplicadoDeFavor,
        saldo: saldoDelCargo,
        asignacionesAuto,
        dias: daysBetween(mov.fecha, fechaCorte),
        atrasable: tipo === 'cargo' || (tipo === 'ajuste' && firmado > 0),
      }
      cargos.push(cargo)
      procesados.push({ ...mov, tipo, monto, saldoDespues: Math.max(0, saldoAbierto(cargos) - saldoAFavor) })
      continue
    }

    if (TIPOS_PAGO.has(tipo) || (tipo === 'ajuste' && firmado < 0)) {
      const asignaciones = aplicarMontoMasViejoPrimero(cargos, monto)
      const aplicado = money(asignaciones.reduce((sum, a) => sum + a.monto, 0))
      const sobrante = money(monto - aplicado)
      if (sobrante > 0) {
        saldoAFavor = money(saldoAFavor + sobrante)
      }
      procesados.push({
        ...mov,
        tipo,
        monto,
        asignaciones,
        sobrante,
        saldoDespues: Math.max(0, saldoAbierto(cargos) - saldoAFavor),
      })
      continue
    }

    procesados.push({ ...mov, tipo, monto: firmado, saldoDespues: Math.max(0, saldoAbierto(cargos) - saldoAFavor) })
  }

  const saldoBruto = saldoAbierto(cargos)
  const saldo = Math.max(0, saldoBruto - saldoAFavor)
  const totalCargos = money(cargos.reduce((sum, c) => sum + c.monto, 0))
  const totalAplicado = money(cargos.reduce((sum, c) => sum + c.aplicado, 0))
  const pagos = procesados.filter((m) => TIPOS_PAGO.has(m.tipo) || (m.tipo === 'ajuste' && Number(m.monto) < 0))
  const ultimoAbono = [...pagos].reverse().find((m) => m.tipo === 'abono') || null
  const ultimoMovimiento = procesados[procesados.length - 1] || null
  const diasSinAbono = ultimoAbono
    ? daysBetween(ultimoAbono.fecha, fechaCorte)
    : cargos.length > 0
      ? daysBetween(cargos[0].fecha, fechaCorte)
      : 0

  const cargosVencidos = cargos.filter((cargo) => {
    if (!cargo.atrasable || cargo.saldo <= 0) return false
    if (cargo.dias < Number(cfg.diasAtraso || 0)) return false
    return !referenciasConAtraso.has(String(cargo.id))
  })
  const baseAtraso = money(cargosVencidos.reduce((sum, c) => sum + c.saldo, 0))
  const cargoAtrasoSugerido = money(baseAtraso * Number(cfg.porcentajeAtraso || 0))

  return {
    cuentaId: cuenta?.id,
    saldo,
    saldoAFavor,
    totalCargos,
    totalAplicado,
    cargos,
    movimientos: procesados,
    ultimoAbono,
    ultimoMovimiento,
    diasSinAbono,
    cargosVencidos,
    baseAtraso,
    cargoAtrasoSugerido,
    requiereCargoAtraso: cargoAtrasoSugerido > 0,
  }
}

function normalizarTipo(tipo) {
  const t = String(tipo || '').trim().toLowerCase()
  if (t === 'cargo_atraso') return 'cargo_atraso'
  if (t === 'descuento') return 'descuento'
  if (t === 'ajuste') return 'ajuste'
  if (t === 'nota') return 'nota'
  if (t === 'abono') return 'abono'
  return 'cargo'
}

function aplicarMontoMasViejoPrimero(cargos, montoOriginal) {
  let restante = money(montoOriginal)
  const asignaciones = []
  for (const cargo of cargos) {
    if (restante <= 0) break
    const abierto = money(cargo.saldo)
    if (abierto <= 0) continue
    const aplicado = money(Math.min(abierto, restante))
    cargo.aplicado = money(cargo.aplicado + aplicado)
    cargo.saldo = money(cargo.monto - cargo.aplicado)
    restante = money(restante - aplicado)
    asignaciones.push({
      cargoId: cargo.id,
      concepto: cargo.concepto || cargo.articulo || 'Cargo',
      monto: aplicado,
    })
  }
  return asignaciones
}

function saldoAbierto(cargos) {
  return money(cargos.reduce((sum, c) => sum + Math.max(0, Number(c.saldo) || 0), 0))
}

function parseIsoDate(value) {
  if (value instanceof Date) {
    const d = new Date(value)
    d.setHours(12, 0, 0, 0)
    return d
  }
  const raw = String(value || '').slice(0, 10)
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) {
    const fallback = new Date()
    fallback.setHours(12, 0, 0, 0)
    return fallback
  }
  const d = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  d.setHours(12, 0, 0, 0)
  return d
}
