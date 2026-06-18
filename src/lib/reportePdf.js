/**
 * Genera el HTML imprimible de Reportes con un diseño Premium.
 * El renderer arma datos tabulares; Electron lo convierte a PDF con
 * webContents.printToPDF.
 */

const INK = '#0f172a'
const NAVY = '#1e293b'
const MUTED = '#64748b'
const LINE = '#e2e8f0'
const SOFT = '#f8fafc'
const CARD_BG = '#ffffff'
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

function renderTable(columns, rows) {
  if (!columns.length) return '<div class="empty">Sin columnas para mostrar.</div>'
  if (!rows.length) return '<div class="empty">No hay registros para los criterios seleccionados.</div>'

  const head = columns
    .map((c) => `<th class="${c.align === 'right' ? 'num' : ''}" scope="col">${esc(c.label)}</th>`)
    .join('')
  const body = rows
    .map((row) => `<tr>${columns
      .map((c, index) => `<td class="${c.align === 'right' ? 'num' : ''}">${esc(printableValue(row, { ...c, index }))}</td>`)
      .join('')}</tr>`)
    .join('')

  return `<div class="table-wrapper">
    <table class="report-table">
      <thead><tr>${head}</tr></thead>
      <tbody>${body}</tbody>
    </table>
  </div>`
}

function renderMetrics(metrics) {
  const rows = (Array.isArray(metrics) ? metrics : []).filter((m) => String(m?.label || '').trim())
  if (!rows.length) return ''
  
  return `<div class="metrics-grid">
    ${rows.map((m) => `
      <div class="metric-card">
        <div class="metric-label">${esc(m.label)}</div>
        <div class="metric-value">${esc(m.value)}</div>
      </div>
    `).join('')}
  </div>`
}

function renderPairsList(title, rows) {
  const pairs = normalizedPairs(rows)
  if (!pairs.length) return ''
  
  return `<div class="info-section">
    <h3 class="section-title">${esc(title)}</h3>
    <div class="pairs-grid">
      ${pairs.map((r) => `
        <div class="pair-item">
          <span class="pair-label">${esc(r.label)}</span>
          <span class="pair-value">${esc(r.value)}</span>
        </div>
      `).join('')}
    </div>
  </div>`
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
  
  // Decide layout automatically
  const wide = cols.length > 6
  const pageSize = wide ? 'Letter landscape' : 'Letter portrait'
  
  const criteriosRows = normalizedPairs(criterios)
  const datosReporte = [
    { label: 'Folio', value: folio },
    { label: 'Generado', value: generado },
    { label: 'Periodo', value: periodoTexto || '-' },
    { label: 'Registros', value: String(rows.length) },
  ]

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>${esc(titulo)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    @page { size: ${pageSize}; margin: 15mm 15mm 18mm; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      background: ${PAPER};
      color: ${INK};
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      font-size: ${wide ? '9px' : '10px'};
    }
    body { padding: 0; }
    .doc {
      width: 100%;
      min-height: 100%;
    }
    
    /* Header & Brand */
    header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 24px;
      padding-bottom: 20px;
      border-bottom: 2px solid ${SOFT};
      page-break-inside: avoid;
    }
    .header-left {
      max-width: 60%;
    }
    .brand {
      display: inline-block;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: ${NAVY};
      background: ${SOFT};
      padding: 4px 10px;
      border-radius: 4px;
      margin-bottom: 12px;
    }
    h1 {
      margin: 0 0 6px 0;
      font-size: ${wide ? '20px' : '24px'};
      font-weight: 700;
      line-height: 1.1;
      letter-spacing: -0.02em;
      color: ${INK};
    }
    .desc {
      margin: 0;
      font-size: 11px;
      line-height: 1.5;
      color: ${MUTED};
    }
    .header-right {
      text-align: right;
    }
    .meta-row {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      margin-bottom: 4px;
    }
    .meta-label {
      font-size: 9px;
      color: ${MUTED};
      text-transform: uppercase;
      letter-spacing: 0.05em;
      font-weight: 500;
    }
    .meta-value {
      font-size: 10px;
      color: ${INK};
      font-weight: 600;
      min-width: 120px;
      text-align: left;
    }
    
    /* Document Metadata (Pairs) */
    .info-section {
      margin-bottom: 20px;
      page-break-inside: avoid;
    }
    .section-title {
      font-size: 10px;
      font-weight: 600;
      color: ${NAVY};
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin: 0 0 10px 0;
      padding-bottom: 6px;
      border-bottom: 1px solid ${LINE};
    }
    .pairs-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 12px 24px;
    }
    .pair-item {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .pair-label {
      font-size: 9px;
      color: ${MUTED};
      text-transform: uppercase;
      letter-spacing: 0.05em;
      font-weight: 500;
    }
    .pair-value {
      font-size: 11px;
      color: ${INK};
      font-weight: 600;
    }

    /* Metrics Cards */
    .metrics-grid {
      display: flex;
      gap: 12px;
      margin-bottom: 24px;
      page-break-inside: avoid;
    }
    .metric-card {
      flex: 1;
      background: ${CARD_BG};
      border: 1px solid ${LINE};
      border-radius: 8px;
      padding: 14px 16px;
      box-shadow: 0 1px 2px rgba(0,0,0,0.02);
    }
    .metric-label {
      font-size: 9.5px;
      font-weight: 600;
      color: ${MUTED};
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 6px;
    }
    .metric-value {
      font-size: ${wide ? '16px' : '20px'};
      font-weight: 700;
      color: ${INK};
      font-variant-numeric: tabular-nums;
    }

    /* Table */
    .table-wrapper {
      border: 1px solid ${LINE};
      border-radius: 8px;
      overflow: hidden;
      margin-bottom: 16px;
      background: ${CARD_BG};
    }
    .report-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-variant-numeric: tabular-nums;
      margin: 0;
    }
    thead {
      display: table-header-group;
      background: ${SOFT};
    }
    tbody {
      display: table-row-group;
    }
    th {
      color: ${MUTED};
      text-align: left;
      font-size: ${wide ? '8.5px' : '9px'};
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 10px 12px;
      border-bottom: 1px solid ${LINE};
      word-break: break-word;
    }
    td {
      padding: 9px 12px;
      color: ${INK};
      font-size: ${wide ? '9.5px' : '10.5px'};
      border-bottom: 1px solid ${LINE};
      vertical-align: middle;
      word-break: break-word;
      line-height: 1.4;
    }
    tr:last-child td {
      border-bottom: none;
    }
    tr:nth-child(even) td { 
      background: #fafbfc; 
    }
    .num {
      text-align: right;
      font-variant-numeric: tabular-nums;
    }
    .empty {
      border: 1px dashed ${LINE};
      background: ${SOFT};
      border-radius: 8px;
      padding: 24px;
      color: ${MUTED};
      text-align: center;
      font-size: 11px;
      font-weight: 500;
      page-break-inside: avoid;
    }

    /* Notes & Footer */
    .note {
      margin-top: 16px;
      background: ${SOFT};
      border-left: 3px solid ${NAVY};
      border-radius: 0 4px 4px 0;
      padding: 10px 14px;
      color: ${INK};
      font-size: 10px;
      line-height: 1.5;
      page-break-inside: avoid;
    }
    footer {
      margin-top: 32px;
      padding-top: 16px;
      border-top: 1px solid ${LINE};
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 9px;
      color: ${MUTED};
      page-break-inside: avoid;
    }
    .footer-brand {
      font-weight: 600;
      color: ${NAVY};
    }
    
    @media print {
      a { color: inherit; text-decoration: none; }
      @page {
        @bottom-right {
          content: "Página " counter(page) " de " counter(pages);
          font-family: 'Inter', sans-serif;
          font-size: 9px;
          color: ${MUTED};
        }
      }
    }
  </style>
</head>
<body>
  <main class="doc">
    <header>
      <div class="header-left">
        <div class="brand">${esc(bazarNombre)}</div>
        <h1>${esc(titulo)}</h1>
        ${descripcion ? `<p class="desc">${esc(descripcion)}</p>` : ''}
      </div>
      <div class="header-right">
        ${datosReporte.map(r => `
          <div class="meta-row">
            <span class="meta-label">${esc(r.label)}</span>
            <span class="meta-value">${esc(r.value)}</span>
          </div>
        `).join('')}
      </div>
    </header>
    
    ${criteriosRows.length ? renderPairsList('Criterios de Búsqueda', criteriosRows) : ''}
    
    ${renderMetrics(metricas)}
    
    ${renderTable(cols, rows)}
    
    ${nota ? `<div class="note"><strong>Observaciones:</strong> ${esc(nota)}</div>` : ''}
    
    <footer>
      <span>Generado desde <span class="footer-brand">My Little Bazar POS</span></span>
      <span>${esc(folio)}</span>
    </footer>
  </main>
</body>
</html>`
}

