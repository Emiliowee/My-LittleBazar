import { formatPrice } from '@/lib/format.js'

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function formatFechaLarga(raw) {
  if (!raw) return ''
  const s = String(raw).trim()
  let d
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, dd] = s.split('-').map((n) => Number(n))
    d = new Date(y, (m || 1) - 1, dd || 1)
  } else {
    d = new Date(s)
  }
  if (!Number.isFinite(d.getTime())) return ''
  return d.toLocaleDateString('es-MX', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
}

/**
 * Precio a usar al marcar como vendida: si `precio_vendido` es 0 o vacío, se toma referencia (snapshot / actual).
 * Evita que `??` deje 0 cuando en BD 0 significa «sin precio de venta cargado».
 */
export function banquetaPrecioParaToggleVendido(it) {
  const raw = it?.precio_vendido
  if (raw != null && raw !== '') {
    const n = Number(raw)
    if (Number.isFinite(n) && n !== 0) return n
  }
  const snap = Number(it?.precio_snapshot ?? it?.precio_actual)
  return Number.isFinite(snap) ? snap : null
}

/** Hoja de trabajo imprimible: columnas en blanco para apuntar a mano. */
export function buildBanquetaPrintHtml(detail) {
  if (!detail?.salida) return ''
  const salida = detail.salida
  const items = Array.isArray(detail.items) ? detail.items : []
  const title = String(salida.nombre || `Salida #${salida.id}`)
  const fecha = formatFechaLarga(salida.fecha_planeada)
  const lugar = String(salida.lugar || '').trim()
  const totalRef = items.reduce((s, it) => s + (Number(it.precio_snapshot ?? it.precio_actual) || 0), 0)

  const rows = items
    .map((it, idx) => {
      const cod = String(it.codigo_snapshot || it.codigo_actual || '').trim()
      const nom = String(it.nombre_snapshot || it.descripcion_actual || cod).trim()
      const pr = formatPrice(Number(it.precio_snapshot ?? it.precio_actual) || 0)
      return `<tr>
      <td class="num">${idx + 1}</td>
      <td class="mono">${escapeHtml(cod)}</td>
      <td>${escapeHtml(nom)}</td>
      <td class="price">${escapeHtml(pr)}</td>
      <td class="chk"></td>
      <td class="write"></td>
      <td class="write wide"></td>
    </tr>`
    })
    .join('')

  const metaLine = [
    fecha && `<span class="meta-item"><b>Fecha:</b> ${escapeHtml(fecha)}</span>`,
    lugar && `<span class="meta-item"><b>Lugar:</b> ${escapeHtml(lugar)}</span>`,
    `<span class="meta-item"><b>Piezas:</b> ${items.length}</span>`,
  ]
    .filter(Boolean)
    .join('')

  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"/>
<title>${escapeHtml(title)}</title>
<style>
  :root {
    --bq-fg: hsl(240 10% 9%);
    --bq-fg-strong: hsl(240 10% 4%);
    --bq-muted: hsl(240 4% 38%);
    --bq-muted-2: hsl(240 3% 46%);
    --bq-border: hsl(240 6% 88%);
    --bq-border-strong: hsl(240 6% 18%);
    --bq-meta-bg: hsl(240 5% 96%);
    --bq-row: hsl(240 5% 94%);
  }
  * { box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; padding: 24px 28px; color: var(--bq-fg); max-width: 860px; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 4px; font-weight: 600; letter-spacing: -0.01em; color: var(--bq-fg-strong); }
  .sub { font-size: 11px; color: var(--bq-muted-2); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 10px; }
  .meta { display: flex; gap: 18px; flex-wrap: wrap; font-size: 12px; color: var(--bq-muted); margin-bottom: 20px; padding: 10px 14px; border-radius: 10px; background: var(--bq-meta-bg); border: 1px solid var(--bq-border); }
  .meta-item b { font-weight: 600; color: var(--bq-fg-strong); margin-right: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  thead th { font-weight: 600; font-size: 9.5px; text-transform: uppercase; color: var(--bq-muted); letter-spacing: 0.06em; border-bottom: 1px solid var(--bq-border-strong); padding: 8px 6px; text-align: left; }
  tbody td { border-bottom: 1px solid var(--bq-border); padding: 10px 6px; vertical-align: middle; }
  td.num { width: 26px; color: var(--bq-muted-2); text-align: center; font-size: 11px; }
  td.mono { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 11px; width: 76px; color: var(--bq-fg); }
  td.price { width: 72px; text-align: right; color: var(--bq-muted); font-variant-numeric: tabular-nums; font-size: 11.5px; }
  th.chk, td.chk { width: 34px; text-align: center; }
  td.chk::before { content: ""; display: inline-block; width: 14px; height: 14px; border: 1.3px solid var(--bq-border-strong); border-radius: 3px; }
  td.write { border-bottom: 1px solid var(--bq-border); background: linear-gradient(to bottom, transparent, hsl(240 5% 98%)); }
  th.write-col, td.write { width: 110px; }
  th.wide, td.wide { width: 170px; }
  tfoot td { padding-top: 14px; font-size: 11px; color: var(--bq-muted); }
  .total { text-align: right; font-weight: 600; font-size: 13px; color: var(--bq-fg-strong); padding-top: 16px; }
  .foot { margin-top: 26px; font-size: 10px; color: var(--bq-muted-2); display: flex; justify-content: space-between; border-top: 1px solid var(--bq-border); padding-top: 10px; }
  @media print {
    body { padding: 14px 18px; }
    .no-print { display: none; }
  }
</style></head>
<body>
  <div class="sub">Hoja de trabajo · Banqueta</div>
  <h1>${escapeHtml(title)}</h1>
  <div class="meta">${metaLine}</div>
  <table>
    <thead>
      <tr>
        <th class="num">#</th>
        <th>Código</th>
        <th>Descripción</th>
        <th class="price">Precio ref.</th>
        <th class="chk">✓</th>
        <th class="write-col">$ Vendido</th>
        <th class="wide">Notas</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="total">Total referencia: ${escapeHtml(formatPrice(totalRef))}</div>
  <div class="foot">
    <span>Impreso: ${escapeHtml(new Date().toLocaleString('es-MX'))}</span>
    <span>Firma: ____________________</span>
  </div>
</body></html>`
}
