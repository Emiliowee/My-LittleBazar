/**
 * Genera el HTML imprimible de Reportes.
 * El renderer arma datos tabulares; Electron lo convierte a PDF con
 * webContents.printToPDF. Mantenerlo puro evita que la exportacion dependa del DOM.
 */

const INK = '#111827'
const NAVY = '#1f2937'
const MUTED = '#4b5563'
const LINE = '#9ca3af'
const SOFT = '#f3f4f6'
const HEADER = '#e5e7eb'
const PAPER = '#ffffff'

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
))

function normalizedColumns(columns) {
  return (Array.isArray(columns) ? columns : [])
    .map((c) => ({
      key: String(c?.key || '').trim(),
      label: String(c?.label || c?.key || '').trim(),
      align: c?.align === 'right' ? 'right' : 'left',
    }))
    .filter((c) => c.key && c.label)
}

function normalizedRows(rows) {
  return Array.isArray(rows) ? rows : []
}

function normalizedPairs(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => {
      if (Array.isArray(row)) return { label: String(row[0] || '').trim(), value: String(row[1] ?? '').trim() }
      return { label: String(row?.label || '').trim(), value: String(row?.value ?? '').trim() }
    })
    .filter((row) => row.label || row.value)
}

function printableValue(row, col) {
  if (Array.isArray(row)) return row[col.index] ?? ''
  return row?.[col.key] ?? ''
}

function renderTable(columns, rows, titulo) {
  if (!columns.length) return '<p class="empty">Sin columnas para mostrar.</p>'
  if (!rows.length) return '<p class="empty">No hay registros para los parametros seleccionados.</p>'

  const head = columns
    .map((c) => `<th class="${c.align === 'right' ? 'num' : ''}" scope="col">${esc(c.label)}</th>`)
    .join('')
  const body = rows
    .map((row) => `<tr>${columns
      .map((c, index) => `<td class="${c.align === 'right' ? 'num' : ''}">${esc(printableValue(row, { ...c, index }))}</td>`)
      .join('')}</tr>`)
    .join('')
  return `<table>
    <caption>${esc(titulo || 'Detalle del reporte')}</caption>
    <thead><tr>${head}</tr></thead>
    <tbody>${body}</tbody>
  </table>`
}

function renderMetrics(metrics) {
  const rows = (Array.isArray(metrics) ? metrics : []).filter((m) => String(m?.label || '').trim())
  if (!rows.length) return ''
  return `<table class="summary-table">
    <caption>Resumen del reporte</caption>
    <tbody>
      ${rows.map((m) => `<tr><th scope="row">${esc(m.label)}</th><td class="num">${esc(m.value)}</td></tr>`).join('')}
    </tbody>
  </table>`
}

function renderPairsTable(title, rows) {
  const pairs = normalizedPairs(rows)
  if (!pairs.length) return ''
  return `<table class="info-table">
    <caption>${esc(title)}</caption>
    <tbody>
      ${pairs.map((r) => `<tr><th scope="row">${esc(r.label)}</th><td>${esc(r.value)}</td></tr>`).join('')}
    </tbody>
  </table>`
}

function buildFolio(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  return `REP-${y}${m}${d}-${hh}${mm}`
}

export function buildReportePdfHtml({
  bazarNombre = 'Bazar Monserrat',
  titulo = 'Reporte',
  descripcion = '',
  periodoTexto = '',
  criterios = [],
  metricas = [],
  columnas = [],
  filas = [],
  nota = '',
} = {}) {
  const now = new Date()
  const generado = now.toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short' })
  const folio = buildFolio(now)
  const cols = normalizedColumns(columnas)
  const rows = normalizedRows(filas)
  const wide = cols.length > 5
  const pageSize = wide ? 'Letter landscape' : 'Letter portrait'
  const criteriosRows = normalizedPairs(criterios)
  const datosNegocio = [
    { label: 'Nombre comercial', value: bazarNombre },
    { label: 'Tipo de documento', value: 'Reporte administrativo' },
    { label: 'Moneda', value: 'MXN - Pesos mexicanos' },
    { label: 'Sistema', value: 'My Little Bazar' },
  ]
  const datosReporte = [
    { label: 'Folio interno', value: folio },
    { label: 'Reporte', value: titulo },
    { label: 'Periodo', value: periodoTexto || '-' },
    { label: 'Fecha de emision', value: generado },
    { label: 'Registros', value: String(rows.length) },
  ]

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>${esc(titulo)}</title>
  <style>
    @page { size: ${pageSize}; margin: 13mm 11mm 15mm; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      background: ${PAPER};
      color: ${INK};
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      font-family: Arial, "Helvetica Neue", Helvetica, sans-serif;
      font-size: ${wide ? '9px' : '10px'};
    }
    body { padding: 0; }
    .doc {
      width: 100%;
      min-height: 100%;
    }
    .document-label {
      width: 100%;
      background: ${NAVY};
      color: #fff;
      padding: 6px 8px;
      margin-bottom: 9px;
      display: flex;
      justify-content: space-between;
      gap: 16px;
      font-size: 8.2px;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }
    header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 18px;
      border: 1px solid ${LINE};
      border-top: 0;
      padding: 10px 10px 9px;
      margin-bottom: 10px;
      page-break-inside: avoid;
    }
    .brand {
      font-size: 8px;
      font-weight: 800;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: ${MUTED};
    }
    h1 {
      margin: 3px 0 4px;
      font-size: ${wide ? '16px' : '18px'};
      line-height: 1.1;
      letter-spacing: -0.01em;
      color: ${INK};
      text-transform: uppercase;
    }
    .desc {
      max-width: ${wide ? '540px' : '390px'};
      margin: 0;
      line-height: 1.38;
      color: ${MUTED};
    }
    .folio {
      min-width: ${wide ? '230px' : '170px'};
      text-align: right;
    }
    .folio-label {
      font-size: 8px;
      color: ${MUTED};
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .folio-value {
      margin-top: 4px;
      font-size: 14px;
      font-weight: 800;
      color: ${INK};
      font-variant-numeric: tabular-nums;
    }
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-bottom: 10px;
      page-break-inside: avoid;
    }
    .info-table,
    .summary-table {
      width: 100%;
      border-collapse: collapse;
      border: 1px solid ${LINE};
      table-layout: fixed;
      page-break-inside: avoid;
      margin: 0;
    }
    .info-table caption,
    .summary-table caption,
    table.report-table caption {
      caption-side: top;
      background: ${HEADER};
      border: 1px solid ${LINE};
      border-bottom: 0;
      padding: 5px 7px;
      text-align: left;
      font-size: 7.7px;
      font-weight: 800;
      color: ${INK};
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .info-table th,
    .summary-table th {
      width: 38%;
      border-top: 1px solid ${LINE};
      background: #fff;
      color: ${MUTED};
      text-align: left;
      font-size: 8.2px;
      font-weight: 700;
      padding: 5px 7px;
      text-transform: uppercase;
    }
    .info-table td,
    .summary-table td {
      border-top: 1px solid ${LINE};
      color: ${INK};
      font-size: 8.8px;
      font-weight: 600;
      padding: 5px 7px;
      overflow-wrap: anywhere;
    }
    .summary-table {
      margin-bottom: 10px;
    }
    .summary-table th { width: 55%; }
    .summary-table td {
      font-size: ${wide ? '10px' : '11px'};
      font-weight: 800;
      font-variant-numeric: tabular-nums;
    }
    .section-title {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin: 9px 0 6px;
      font-size: 8px;
      font-weight: 800;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: ${MUTED};
      page-break-after: avoid;
    }
    .section-title::after {
      content: "";
      height: 1px;
      flex: 1;
      margin-left: 12px;
      background: ${LINE};
    }
    table {
      width: 100%;
      border-collapse: collapse;
      border: 1px solid ${LINE};
      table-layout: fixed;
      page-break-inside: auto;
      font-variant-numeric: tabular-nums;
    }
    table.report-table {
      border-color: #6b7280;
    }
    thead {
      display: table-header-group;
    }
    tbody {
      display: table-row-group;
    }
    th {
      background: ${NAVY};
      color: #fff;
      text-align: left;
      font-size: ${wide ? '7.2px' : '7.8px'};
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      border: 1px solid ${NAVY};
      padding: ${wide ? '5px 5px' : '6px 6px'};
      overflow-wrap: anywhere;
    }
    td {
      border: 1px solid #d1d5db;
      padding: ${wide ? '5px 5px' : '6px 6px'};
      color: #1f2937;
      vertical-align: top;
      overflow-wrap: anywhere;
      line-height: 1.28;
    }
    tr {
      page-break-inside: avoid;
      break-inside: avoid;
    }
    tr:nth-child(even) td { background: #f9fafb; }
    .num {
      text-align: right;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .empty {
      border: 1px solid ${LINE};
      background: ${SOFT};
      border-radius: 10px;
      padding: 16px;
      color: ${MUTED};
      text-align: center;
      page-break-inside: avoid;
    }
    .note {
      margin-top: 12px;
      border: 1px solid ${LINE};
      background: ${SOFT};
      padding: 8px 10px;
      color: ${INK};
      line-height: 1.45;
      page-break-inside: avoid;
    }
    footer {
      margin-top: 12px;
      padding-top: 8px;
      border-top: 1px solid ${LINE};
      display: flex;
      justify-content: space-between;
      gap: 16px;
      font-size: 8.5px;
      color: ${MUTED};
      page-break-inside: avoid;
    }
    @media print {
      a { color: inherit; text-decoration: none; }
    }
  </style>
</head>
<body>
  <main class="doc">
    <div class="document-label">
      <span>Reporte administrativo interno</span>
      <span>Mexico - MXN</span>
    </div>
    <header>
      <div>
        <div class="brand">${esc(bazarNombre)}</div>
        <h1>${esc(titulo)}</h1>
        ${descripcion ? `<p class="desc">${esc(descripcion)}</p>` : ''}
      </div>
      <div class="folio">
        <div class="folio-label">Folio interno</div>
        <div class="folio-value">${esc(folio)}</div>
      </div>
    </header>
    <section class="info-grid">
      ${renderPairsTable('Datos del negocio', datosNegocio)}
      ${renderPairsTable('Datos del reporte', datosReporte)}
    </section>
    ${criteriosRows.length ? renderPairsTable('Criterios aplicados', criteriosRows) : ''}
    ${renderMetrics(metricas)}
    ${renderTable(cols, rows, `Detalle - ${titulo}`).replace('<table>', '<table class="report-table">')}
    ${nota ? `<div class="note"><strong>Observaciones:</strong> ${esc(nota)}</div>` : ''}
    <footer>
      <span>Documento generado por My Little Bazar - uso interno administrativo</span>
      <span>${esc(folio)}</span>
    </footer>
  </main>
</body>
</html>`
}
