import assert from 'node:assert/strict'
import { calcularCuentaSaldos } from '../src/lib/saldosLedger.js'

const config = { fechaCorte: '2026-06-03', diasAtraso: 30, porcentajeAtraso: 0.2 }

{
  const cuenta = {
    id: 'c1',
    movimientos: [
      { id: 'm1', tipo: 'cargo', fecha: '2026-04-01', concepto: 'Blusa', monto: 300 },
      { id: 'm2', tipo: 'cargo', fecha: '2026-04-10', concepto: 'Zapatos', monto: 500 },
      { id: 'm3', tipo: 'abono', fecha: '2026-04-15', concepto: 'Abono general', monto: 350 },
    ],
  }
  const res = calcularCuentaSaldos(cuenta, config)
  assert.equal(res.saldo, 450)
  assert.equal(res.cargos[0].saldo, 0)
  assert.equal(res.cargos[1].saldo, 450)
  assert.deepEqual(res.movimientos[2].asignaciones.map((a) => [a.concepto, a.monto]), [
    ['Blusa', 300],
    ['Zapatos', 50],
  ])
}

{
  const cuenta = {
    id: 'c2',
    movimientos: [
      { id: 'm1', tipo: 'cargo', fecha: '2026-04-20', concepto: 'Vestido', monto: 1000 },
      { id: 'm2', tipo: 'abono', fecha: '2026-05-01', concepto: 'Pago', monto: 200 },
    ],
  }
  const res = calcularCuentaSaldos(cuenta, config)
  assert.equal(res.saldo, 800)
  assert.equal(res.baseAtraso, 800)
  assert.equal(res.cargoAtrasoSugerido, 160)
  assert.equal(res.requiereCargoAtraso, true)
}

{
  const cuenta = {
    id: 'c3',
    movimientos: [
      { id: 'm1', tipo: 'cargo', fecha: '2026-04-20', concepto: 'Bolsa', monto: 500 },
      { id: 'm2', tipo: 'cargo_atraso', fecha: '2026-06-01', concepto: 'Cargo por atraso', monto: 100, referenciaIds: ['m1'] },
    ],
  }
  const res = calcularCuentaSaldos(cuenta, config)
  assert.equal(res.saldo, 600)
  assert.equal(res.baseAtraso, 0)
  assert.equal(res.cargoAtrasoSugerido, 0)
}

{
  const cuenta = {
    id: 'c4',
    movimientos: [
      { id: 'm1', tipo: 'cargo', fecha: '2026-05-01', concepto: 'Falda', monto: 200 },
      { id: 'm2', tipo: 'abono', fecha: '2026-05-02', concepto: 'Pago de mas', monto: 250 },
    ],
  }
  const res = calcularCuentaSaldos(cuenta, config)
  assert.equal(res.saldo, 0)
  assert.equal(res.alertas[0].tipo, 'abono_sobrante')
  assert.equal(res.alertas[0].monto, 50)
}

{
  const cuenta = {
    id: 'c5',
    movimientos: [
      { id: 'm1', tipo: 'cargo', fecha: '2026-05-01', concepto: 'Conjunto', monto: 700 },
      { id: 'm2', tipo: 'descuento', fecha: '2026-05-03', concepto: 'Perdonado', monto: 75 },
    ],
  }
  const res = calcularCuentaSaldos(cuenta, config)
  assert.equal(res.saldo, 625)
  assert.equal(res.totalAplicado, 75)
}

console.log('saldos ledger ok')
