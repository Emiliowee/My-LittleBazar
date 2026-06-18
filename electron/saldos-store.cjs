'use strict'

/**
 * Persistencia del módulo Saldos (la libreta de cuentas de clientas).
 *
 * Diseño: este archivo solo guarda y lee — NUNCA calcula saldos. El saldo,
 * la aplicación FIFO de abonos y el cargo por atraso sugerido viven en el
 * motor puro `src/lib/saldosLedger.js` (testeado), que corre en el renderer
 * con los movimientos crudos que salen de acá.
 *
 * Reglas duras (de docs/saldos-especificacion.md):
 *   · El saldo nunca se edita directo: todo se explica con movimientos.
 *   · Los movimientos no se borran: se ANULAN (queda la marca y el motivo).
 *   · Cliente con movimientos no se elimina: se archiva.
 *   · Cargo con enganche el mismo día = dos movimientos (cargo + abono),
 *     registrados en una sola transacción.
 */

const TIPOS_VALIDOS = new Set(['cargo', 'abono', 'descuento', 'cargo_atraso', 'ajuste', 'nota'])
const ID_ESTADOS = new Set(['pendiente', 'completa', 'omitida'])
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function limpiarTexto(v, max = 400) {
  return String(v ?? '').trim().slice(0, max)
}

function validarFecha(v) {
  const f = limpiarTexto(v, 10)
  if (!ISO_DATE_RE.test(f)) throw new Error('Fecha inválida (se espera AAAA-MM-DD).')
  return f
}

function validarMonto(v, { permitirCero = false } = {}) {
  const n = Math.round(Number(v) * 100) / 100
  if (!Number.isFinite(n)) throw new Error('Monto inválido.')
  if (n < 0) throw new Error('El monto no puede ser negativo.')
  if (!permitirCero && n === 0) throw new Error('El monto debe ser mayor a cero.')
  if (n > 9_999_999) throw new Error('Monto fuera de rango.')
  return n
}

function rowACliente(row) {
  return {
    id: row.id,
    nombre: row.nombre,
    telefono: row.telefono || '',
    nacimiento: row.nacimiento || '',
    direccion: row.direccion || '',
    identificacion: {
      estado: row.identificacion_estado || 'pendiente',
      motivo: row.identificacion_motivo || '',
      imagen: row.identificacion_imagen || '',
    },
    etiquetas: parseEtiquetas(row.etiquetas),
    nota: row.nota || '',
    archivada: row.archivada === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at || null,
    movimientos: [],
    recordatorios: [],
  }
}

/** Etiquetas guardadas como CSV ("Buena paga,Mayorista") → array limpio. */
function parseEtiquetas(csv) {
  return String(csv || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 12)
}

function serializarEtiquetas(arr) {
  if (!Array.isArray(arr)) return ''
  return arr.map((s) => String(s || '').trim()).filter(Boolean).slice(0, 12).join(',')
}

function rowARecordatorio(row) {
  return {
    id: row.id,
    clienteId: row.cliente_id,
    tipo: row.tipo || 'nota',
    texto: row.texto || '',
    fecha: row.fecha || '',
    hecho: row.hecho === 1,
    createdAt: row.created_at,
  }
}

function rowAMovimiento(row) {
  let referenciaIds = []
  try {
    const parsed = JSON.parse(row.referencia_ids || '[]')
    if (Array.isArray(parsed)) referenciaIds = parsed
  } catch { /* columna corrupta no debe tirar la lista */ }
  return {
    id: row.id,
    clienteId: row.cliente_id,
    tipo: row.tipo,
    fecha: row.fecha,
    monto: row.monto,
    concepto: row.concepto || '',
    medio: row.medio || '',
    quienPago: row.quien_pago || '',
    nota: row.nota || '',
    referenciaIds,
    anulado: row.anulado === 1,
    anuladoMotivo: row.anulado_motivo || '',
    createdAt: row.created_at,
  }
}

/** Cuentas completas (clientes + movimientos crudos) para alimentar el motor. */
function listCuentas(db, { incluirArchivadas = true } = {}) {
  const clientes = db
    .prepare(`SELECT * FROM saldos_clientes ${incluirArchivadas ? '' : 'WHERE archivada = 0'} ORDER BY nombre COLLATE NOCASE`)
    .all()
    .map(rowACliente)
  if (clientes.length === 0) return []
  const porId = new Map(clientes.map((c) => [c.id, c]))
  const movimientos = db
    .prepare('SELECT * FROM saldos_movimientos ORDER BY fecha, id')
    .all()
  for (const row of movimientos) {
    const cliente = porId.get(row.cliente_id)
    if (cliente) cliente.movimientos.push(rowAMovimiento(row))
  }
  let recordatorios = []
  try {
    recordatorios = db.prepare('SELECT * FROM saldos_recordatorios ORDER BY hecho, fecha, id').all()
  } catch { /* tabla puede no existir en bases viejas pre-migración 003 */ }
  for (const row of recordatorios) {
    const cliente = porId.get(row.cliente_id)
    if (cliente) cliente.recordatorios.push(rowARecordatorio(row))
  }
  return clientes
}

/** Sin acentos ni mayúsculas, para comparar nombres como los escribe la gente. */
function normalizarNombre(v) {
  return String(v || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

/** Posibles duplicados por nombre o teléfono parecido (caso raro #6 de la spec). */
function buscarParecidos(db, { nombre, telefono }) {
  const nom = normalizarNombre(limpiarTexto(nombre, 120))
  const tel = limpiarTexto(telefono, 30).replace(/\D/g, '')
  const rows = db.prepare('SELECT id, nombre, telefono FROM saldos_clientes WHERE archivada = 0').all()
  return rows.filter((r) => {
    const rNom = normalizarNombre(r.nombre)
    const rTel = String(r.telefono || '').replace(/\D/g, '')
    if (nom && (rNom === nom || rNom.includes(nom) || nom.includes(rNom))) return true
    if (tel && rTel && rTel === tel) return true
    return false
  })
}

function crearCliente(db, payload) {
  const nombre = limpiarTexto(payload?.nombre, 120)
  if (!nombre) throw new Error('El nombre del cliente es obligatorio.')
  const nacimiento = limpiarTexto(payload?.nacimiento, 10)
  if (nacimiento && !ISO_DATE_RE.test(nacimiento)) throw new Error('Fecha de nacimiento inválida.')
  const idEstado = limpiarTexto(payload?.identificacionEstado, 20) || 'pendiente'
  if (!ID_ESTADOS.has(idEstado)) throw new Error('Estado de identificación inválido.')

  const r = db.prepare(`
    INSERT INTO saldos_clientes
      (nombre, telefono, nacimiento, direccion, identificacion_estado, identificacion_motivo, identificacion_imagen, etiquetas, nota)
    VALUES (@nombre, @telefono, @nacimiento, @direccion, @idEstado, @idMotivo, @idImagen, @etiquetas, @nota)
  `).run({
    nombre,
    telefono: limpiarTexto(payload?.telefono, 30),
    nacimiento,
    direccion: limpiarTexto(payload?.direccion, 400),
    idEstado,
    idMotivo: limpiarTexto(payload?.identificacionMotivo, 200),
    idImagen: limpiarTexto(payload?.identificacionImagen, 500),
    etiquetas: serializarEtiquetas(payload?.etiquetas),
    nota: limpiarTexto(payload?.nota, 400),
  })
  return { ok: true, clienteId: Number(r.lastInsertRowid) }
}

function actualizarCliente(db, payload) {
  const id = Number(payload?.id)
  if (!id) throw new Error('Cliente inválido.')
  const existente = db.prepare('SELECT id FROM saldos_clientes WHERE id = ?').get(id)
  if (!existente) throw new Error('El cliente no existe.')
  const nombre = limpiarTexto(payload?.nombre, 120)
  if (!nombre) throw new Error('El nombre del cliente es obligatorio.')
  const idEstado = limpiarTexto(payload?.identificacionEstado, 20) || 'pendiente'
  if (!ID_ESTADOS.has(idEstado)) throw new Error('Estado de identificación inválido.')

  db.prepare(`
    UPDATE saldos_clientes SET
      nombre = @nombre, telefono = @telefono, nacimiento = @nacimiento,
      direccion = @direccion, identificacion_estado = @idEstado,
      identificacion_motivo = @idMotivo, identificacion_imagen = @idImagen,
      etiquetas = @etiquetas, nota = @nota,
      updated_at = datetime('now')
    WHERE id = @id
  `).run({
    id,
    nombre,
    telefono: limpiarTexto(payload?.telefono, 30),
    nacimiento: limpiarTexto(payload?.nacimiento, 10),
    direccion: limpiarTexto(payload?.direccion, 400),
    idEstado,
    idMotivo: limpiarTexto(payload?.identificacionMotivo, 200),
    idImagen: limpiarTexto(payload?.identificacionImagen, 500),
    etiquetas: serializarEtiquetas(payload?.etiquetas),
    nota: limpiarTexto(payload?.nota, 400),
  })
  return { ok: true }
}

function setArchivada(db, clienteId, archivada) {
  const id = Number(clienteId)
  if (!id) throw new Error('Cliente inválido.')
  db.prepare(`UPDATE saldos_clientes SET archivada = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(archivada ? 1 : 0, id)
  return { ok: true }
}

/** Eliminar solo está permitido si la cuenta nunca tuvo movimientos. */
function eliminarCliente(db, clienteId) {
  const id = Number(clienteId)
  if (!id) throw new Error('Cliente inválido.')
  const movs = db.prepare('SELECT COUNT(*) AS n FROM saldos_movimientos WHERE cliente_id = ?').get(id)
  if ((movs?.n || 0) > 0) {
    throw new Error('Este cliente tiene movimientos: archivalo en lugar de eliminarlo.')
  }
  db.prepare('DELETE FROM saldos_clientes WHERE id = ?').run(id)
  return { ok: true }
}

/**
 * Registra uno o más movimientos en una transacción (p. ej. cargo + enganche).
 * Cada movimiento: { tipo, fecha, monto, concepto?, medio?, quienPago?, nota?, referenciaIds? }
 */
function registrarMovimientos(db, clienteId, movimientos) {
  const id = Number(clienteId)
  if (!id) throw new Error('Cliente inválido.')
  const cliente = db.prepare('SELECT id, archivada FROM saldos_clientes WHERE id = ?').get(id)
  if (!cliente) throw new Error('El cliente no existe.')

  const lista = Array.isArray(movimientos) ? movimientos : [movimientos]
  if (lista.length === 0) throw new Error('No hay movimientos para registrar.')

  const preparados = lista.map((mov) => {
    const tipo = limpiarTexto(mov?.tipo, 20).toLowerCase()
    if (!TIPOS_VALIDOS.has(tipo)) throw new Error(`Tipo de movimiento inválido: "${tipo}".`)
    const esNota = tipo === 'nota'
    return {
      tipo,
      fecha: validarFecha(mov?.fecha),
      monto: esNota ? 0 : validarMonto(mov?.monto),
      concepto: limpiarTexto(mov?.concepto, 200),
      medio: limpiarTexto(mov?.medio, 60),
      quienPago: limpiarTexto(mov?.quienPago, 120),
      nota: limpiarTexto(mov?.nota, 400),
      referenciaIds: JSON.stringify(
        Array.isArray(mov?.referenciaIds) ? mov.referenciaIds.map((x) => Number(x)).filter(Boolean) : [],
      ),
    }
  })

  const insert = db.prepare(`
    INSERT INTO saldos_movimientos
      (cliente_id, tipo, fecha, monto, concepto, medio, quien_pago, nota, referencia_ids)
    VALUES (@clienteId, @tipo, @fecha, @monto, @concepto, @medio, @quienPago, @nota, @referenciaIds)
  `)
  const ids = []
  const trx = db.transaction(() => {
    for (const mov of preparados) {
      const r = insert.run({ clienteId: id, ...mov })
      ids.push(Number(r.lastInsertRowid))
    }
  })
  trx()
  return { ok: true, movimientoIds: ids }
}

/** Anula (no borra) un movimiento. El historial queda completo y auditable. */
function anularMovimiento(db, movimientoId, motivo) {
  const id = Number(movimientoId)
  if (!id) throw new Error('Movimiento inválido.')
  const mov = db.prepare('SELECT id, anulado FROM saldos_movimientos WHERE id = ?').get(id)
  if (!mov) throw new Error('El movimiento no existe.')
  if (mov.anulado === 1) throw new Error('El movimiento ya está anulado.')
  db.prepare(`
    UPDATE saldos_movimientos
    SET anulado = 1, anulado_motivo = ?, anulado_en = datetime('now')
    WHERE id = ?
  `).run(limpiarTexto(motivo, 200) || 'Sin motivo', id)
  return { ok: true }
}

/* ── Recordatorios ─────────────────────────────────────────────────── */

const TIPOS_RECORDATORIO = new Set(['promesa', 'revisar', 'no_insistir', 'llamar', 'whatsapp', 'nota'])

function crearRecordatorio(db, payload) {
  const clienteId = Number(payload?.clienteId)
  if (!clienteId) throw new Error('Cliente inválido.')
  const cliente = db.prepare('SELECT id FROM saldos_clientes WHERE id = ?').get(clienteId)
  if (!cliente) throw new Error('El cliente no existe.')
  const tipo = limpiarTexto(payload?.tipo, 20).toLowerCase() || 'nota'
  if (!TIPOS_RECORDATORIO.has(tipo)) throw new Error(`Tipo de recordatorio inválido: "${tipo}".`)
  const fecha = limpiarTexto(payload?.fecha, 10)
  if (fecha && !ISO_DATE_RE.test(fecha)) throw new Error('Fecha de recordatorio inválida.')
  const r = db.prepare(`
    INSERT INTO saldos_recordatorios (cliente_id, tipo, texto, fecha)
    VALUES (@clienteId, @tipo, @texto, @fecha)
  `).run({ clienteId, tipo, texto: limpiarTexto(payload?.texto, 300), fecha })
  return { ok: true, recordatorioId: Number(r.lastInsertRowid) }
}

function completarRecordatorio(db, recordatorioId, hecho = true) {
  const id = Number(recordatorioId)
  if (!id) throw new Error('Recordatorio inválido.')
  db.prepare('UPDATE saldos_recordatorios SET hecho = ? WHERE id = ?').run(hecho ? 1 : 0, id)
  return { ok: true }
}

function eliminarRecordatorio(db, recordatorioId) {
  const id = Number(recordatorioId)
  if (!id) throw new Error('Recordatorio inválido.')
  db.prepare('DELETE FROM saldos_recordatorios WHERE id = ?').run(id)
  return { ok: true }
}

module.exports = {
  listCuentas,
  buscarParecidos,
  crearCliente,
  actualizarCliente,
  setArchivada,
  eliminarCliente,
  registrarMovimientos,
  anularMovimiento,
  crearRecordatorio,
  completarRecordatorio,
  eliminarRecordatorio,
}
