/**
 * PDF de la «hoja de trabajo» de una salida de banqueta.
 *
 * Layout A4 vertical, tabla limpia con columnas para apuntar a mano
 * (checkbox vendido, $ de venta real, notas). Paginación automática.
 */
const fs = require('fs')
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib')

/* Colores alineados a tema claro (foreground / border / muted) */
const INK = rgb(0.09, 0.09, 0.11)
const INK_SOFT = rgb(0.28, 0.28, 0.32)
const INK_MUTED = rgb(0.45, 0.45, 0.48)
const LINE = rgb(0.90, 0.91, 0.93)
const LINE_SOFT = rgb(0.94, 0.94, 0.96)
const META_BG = rgb(0.965, 0.965, 0.97)
const HEAD_RULE = rgb(0.16, 0.16, 0.2)

const PAGE_W = 595.28
const PAGE_H = 841.89
const MARGIN_X = 40
const TOP = 54
const BOTTOM = 54

function esc(s) {
  return String(s == null ? '' : s).replace(/[\r\n\t]+/g, ' ').trim()
}

function formatPrice(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '$0'
  if (Math.abs(v - Math.round(v)) < 1e-9) return `$${Math.round(v)}`
  return `$${v.toFixed(2)}`
}

function formatFechaLarga(iso) {
  if (!iso) return ''
  try {
    const d = new Date(`${iso}T00:00:00`)
    if (!isFinite(d.getTime())) return iso
    return d.toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  } catch { return String(iso) }
}

/** Trunca un texto para que no exceda `maxW` en puntos, usando el font dado. */
function fitText(text, font, size, maxW) {
  const t = esc(text)
  if (!t) return ''
  if (font.widthOfTextAtSize(t, size) <= maxW) return t
  const ell = '…'
  let lo = 0, hi = t.length
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    const s = t.slice(0, mid) + ell
    if (font.widthOfTextAtSize(s, size) <= maxW) lo = mid
    else hi = mid - 1
  }
  return lo > 0 ? t.slice(0, lo) + ell : ''
}

/**
 * Genera el PDF de la hoja de banqueta.
 * @param {string} outPath
 * @param {{ salida: any, items: any[] }} detail
 */
async function writeBanquetaSheetPdf(outPath, detail) {
  const salida = detail?.salida || {}
  const items = Array.isArray(detail?.items) ? detail.items : []

  const pdf = await PDFDocument.create()
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const reg = await pdf.embedFont(StandardFonts.Helvetica)
  const mono = await pdf.embedFont(StandardFonts.Courier)

  /* ── anchos de columna ───────────────────────────────────────────── */
  const tableLeft = MARGIN_X
  const tableRight = PAGE_W - MARGIN_X
  const tableW = tableRight - tableLeft
  const colW = {
    num: 22,
    codigo: 70,
    descripcion: 0,
    precio: 52,
    chk: 20,
    vendido: 68,
    notas: 110,
  }
  colW.descripcion = tableW - (colW.num + colW.codigo + colW.precio + colW.chk + colW.vendido + colW.notas)

  const colX = {}
  {
    let x = tableLeft
    colX.num = x; x += colW.num
    colX.codigo = x; x += colW.codigo
    colX.descripcion = x; x += colW.descripcion
    colX.precio = x; x += colW.precio
    colX.chk = x; x += colW.chk
    colX.vendido = x; x += colW.vendido
    colX.notas = x
  }

  const ROW_H = 22
  const HEADER_ROW_H = 18
  const HEADER_TITLE_BLOCK_H = 92 // espacio para título + meta + aire

  /* ── helper: dibuja cabecera en una página nueva ────────────────── */
  const drawPageHeader = (page, pageIndex, totalPages) => {
    const title = esc(salida.nombre) || `Salida #${salida.id || ''}`
    const fecha = formatFechaLarga(salida.fecha_planeada)
    const lugar = esc(salida.lugar)
    const piezas = items.length

    let y = PAGE_H - TOP
    page.drawText('HOJA DE TRABAJO · BANQUETA', {
      x: MARGIN_X, y, size: 8, font: bold, color: INK_MUTED,
    })
    y -= 16
    page.drawText(fitText(title, bold, 20, tableW), {
      x: MARGIN_X, y: y - 16, size: 20, font: bold, color: INK,
    })
    y -= 38

    /* caja meta */
    const metaH = 26
    page.drawRectangle({ x: MARGIN_X, y: y - metaH, width: tableW, height: metaH, color: META_BG })

    const parts = []
    if (fecha) parts.push({ k: 'Fecha', v: fecha })
    if (lugar) parts.push({ k: 'Lugar', v: lugar })
    parts.push({ k: 'Piezas', v: String(piezas) })
    parts.push({ k: 'Pág.', v: `${pageIndex + 1} / ${totalPages}` })

    let mx = MARGIN_X + 14
    const baselineY = y - metaH / 2 - 3
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i]
      page.drawText(`${p.k}:`, { x: mx, y: baselineY, size: 8.5, font: bold, color: INK })
      const kW = bold.widthOfTextAtSize(`${p.k}:`, 8.5)
      mx += kW + 5
      const vText = fitText(p.v, reg, 9, tableW - (mx - MARGIN_X) - 14)
      page.drawText(vText, { x: mx, y: baselineY, size: 9, font: reg, color: INK_SOFT })
      mx += reg.widthOfTextAtSize(vText, 9) + 20
    }

    y -= metaH + 18

    /* cabecera de tabla */
    const headY = y
    const headers = [
      { label: '#', align: 'center', x: colX.num, w: colW.num },
      { label: 'CÓDIGO', align: 'left', x: colX.codigo, w: colW.codigo },
      { label: 'DESCRIPCIÓN', align: 'left', x: colX.descripcion, w: colW.descripcion },
      { label: 'PRECIO REF.', align: 'right', x: colX.precio, w: colW.precio },
      { label: null, align: 'center', x: colX.chk, w: colW.chk, icon: 'check' },
      { label: '$ VENDIDO', align: 'left', x: colX.vendido, w: colW.vendido },
      { label: 'NOTAS', align: 'left', x: colX.notas, w: tableRight - colX.notas },
    ]
    for (const h of headers) {
      if (h.icon === 'check') {
        /* cuadrito con tilde estilizada (línea diagonal) como icono */
        const s = 8
        const cx = h.x + (h.w - s) / 2
        const cy = headY - 13
        page.drawRectangle({
          x: cx, y: cy, width: s, height: s,
          borderColor: INK_SOFT, borderWidth: 0.6, color: rgb(1, 1, 1),
        })
        continue
      }
      let tx = h.x + 4
      const labW = bold.widthOfTextAtSize(h.label, 7.5)
      if (h.align === 'center') tx = h.x + (h.w - labW) / 2
      else if (h.align === 'right') tx = h.x + h.w - labW - 4
      page.drawText(h.label, { x: tx, y: headY - 9, size: 7.5, font: bold, color: INK_SOFT })
    }
    page.drawLine({
      start: { x: tableLeft, y: headY - HEADER_ROW_H },
      end: { x: tableRight, y: headY - HEADER_ROW_H },
      thickness: 0.8,
      color: HEAD_RULE,
    })

    return headY - HEADER_ROW_H
  }

  /* ── calcular paginación ─────────────────────────────────────────── */
  const rowsFirstPage = Math.max(
    1,
    Math.floor((PAGE_H - TOP - HEADER_TITLE_BLOCK_H - BOTTOM) / ROW_H),
  )
  const rowsOtherPages = Math.max(
    1,
    Math.floor((PAGE_H - TOP - HEADER_TITLE_BLOCK_H - BOTTOM) / ROW_H),
  )

  const totalPages = items.length === 0
    ? 1
    : 1 + Math.max(0, Math.ceil(Math.max(0, items.length - rowsFirstPage) / rowsOtherPages))

  /* ── dibujar filas ───────────────────────────────────────────────── */
  let idx = 0
  for (let p = 0; p < totalPages; p++) {
    const page = pdf.addPage([PAGE_W, PAGE_H])
    let y = drawPageHeader(page, p, totalPages)
    const maxRows = p === 0 ? rowsFirstPage : rowsOtherPages
    for (let r = 0; r < maxRows && idx < items.length; r++, idx++) {
      const it = items[idx]
      const cod = esc(it.codigo_snapshot || it.codigo_actual)
      const nom = esc(it.nombre_snapshot || it.descripcion_actual || cod)
      const pr = formatPrice(Number(it.precio_snapshot ?? it.precio_actual) || 0)
      const rowTop = y
      const rowBottom = y - ROW_H
      const midY = rowBottom + ROW_H / 2 - 3

      /* # */
      const numStr = String(idx + 1)
      const numW = reg.widthOfTextAtSize(numStr, 9)
      page.drawText(numStr, { x: colX.num + (colW.num - numW) / 2, y: midY, size: 9, font: reg, color: INK_MUTED })

      /* código */
      const codFit = fitText(cod || '—', mono, 8.5, colW.codigo - 8)
      page.drawText(codFit, { x: colX.codigo + 4, y: midY, size: 8.5, font: mono, color: INK_SOFT })

      /* descripción */
      const nomFit = fitText(nom, reg, 10, colW.descripcion - 8)
      page.drawText(nomFit, { x: colX.descripcion + 4, y: midY, size: 10, font: reg, color: INK })

      /* precio ref. (alineado a la derecha) */
      const prW = reg.widthOfTextAtSize(pr, 9)
      page.drawText(pr, { x: colX.precio + colW.precio - prW - 4, y: midY, size: 9, font: reg, color: INK_MUTED })

      /* checkbox */
      const chkSize = 10
      const chkX = colX.chk + (colW.chk - chkSize) / 2
      const chkY = midY - chkSize / 2 + 2
      page.drawRectangle({
        x: chkX, y: chkY, width: chkSize, height: chkSize,
        borderColor: INK_SOFT, borderWidth: 0.8, color: rgb(1, 1, 1),
      })

      /* líneas para escribir (vendido + notas) */
      const writeY = rowBottom + 4
      page.drawLine({
        start: { x: colX.vendido + 4, y: writeY },
        end: { x: colX.vendido + colW.vendido - 4, y: writeY },
        thickness: 0.5, color: LINE,
      })
      page.drawLine({
        start: { x: colX.notas + 4, y: writeY },
        end: { x: tableRight - 4, y: writeY },
        thickness: 0.5, color: LINE,
      })

      /* separador de fila */
      page.drawLine({
        start: { x: tableLeft, y: rowBottom },
        end: { x: tableRight, y: rowBottom },
        thickness: 0.3, color: LINE_SOFT,
      })

      y = rowBottom
    }

    /* pie de página */
    const footY = BOTTOM - 12
    const printed = `Impreso: ${new Date().toLocaleString('es-MX', { hour12: false })}`
    page.drawText(printed, { x: MARGIN_X, y: footY, size: 8, font: reg, color: INK_MUTED })
    const firmaStr = 'Firma: ____________________'
    const firmaW = reg.widthOfTextAtSize(firmaStr, 8)
    page.drawText(firmaStr, { x: tableRight - firmaW, y: footY, size: 8, font: reg, color: INK_MUTED })

    /* solo en la última página: total de referencia */
    if (p === totalPages - 1) {
      const totalRef = items.reduce((s, it) => s + (Number(it.precio_snapshot ?? it.precio_actual) || 0), 0)
      const totalLine = `Total referencia: ${formatPrice(totalRef)}`
      const tlW = bold.widthOfTextAtSize(totalLine, 10)
      page.drawText(totalLine, { x: tableRight - tlW, y: footY + 18, size: 10, font: bold, color: INK })
    }

    /* si no hay items, aviso */
    if (items.length === 0 && p === 0) {
      page.drawText('Sin piezas agregadas todavía.', {
        x: tableLeft + 4,
        y: y - 24,
        size: 10,
        font: reg,
        color: INK_MUTED,
      })
    }
  }

  fs.writeFileSync(outPath, await pdf.save())
  return { pageCount: totalPages }
}

module.exports = { writeBanquetaSheetPdf }
