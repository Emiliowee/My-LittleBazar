const fs = require('fs')
const path = require('path')
const os = require('os')
const { execSync, execFileSync } = require('child_process')
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib')

/** Resolución explícita: en algunos empaquetados `require('bwip-js/node')` falla por exports. */
function getBwipJs() {
  try {
    return require('bwip-js/node')
  } catch (e1) {
    const direct = path.join(__dirname, '..', 'node_modules', 'bwip-js', 'dist', 'bwip-js-node.js')
    try {
      return require(direct)
    } catch (e2) {
      console.error('[label-pdf] No se pudo cargar bwip-js:', e1?.message || e1, '|', e2?.message || e2)
      throw e1
    }
  }
}

function isVirtualPdf(name) {
  const n = String(name || '').toLowerCase()
  if (!n) return false
  if (n.includes('pdf')) return true
  if (n.includes('xps')) return true
  if (n.includes('onenote')) return true
  return false
}

function normalizeCode128Payload(raw) {
  let s = String(raw ?? '').trim()
  if (!s) return ''
  s = s.replace(/[\x00-\x1f\x7f]/g, '')
  return s.slice(0, 64)
}

function codigoLegibleEspaciado(texto) {
  const s = String(texto ?? '').trim()
  if (!s) return ''
  const compact = s.replace(/\s+/g, '')
  if (/^\d+$/.test(compact) && compact.length <= 28) {
    return compact.split('').join(' ')
  }
  return s
}

function wrapNombreLines(text, maxLen, maxLines) {
  const t = String(text || '').trim() || '—'
  if (t === '—') return ['—']
  const words = t.split(/\s+/)
  const out = []
  let cur = ''
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w
    if (next.length <= maxLen) cur = next
    else {
      if (cur) out.push(cur)
      cur = w.length > maxLen ? `${w.slice(0, maxLen - 1)}…` : w
    }
  }
  if (cur) out.push(cur)
  return out.slice(0, maxLines)
}

/**
 * @param {string} outPath
 * @param {string} resolvedLabel
 * @param {string} when
 */
async function writeTestPdf(outPath, resolvedLabel, when) {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([595.28, 841.89])
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const reg = await pdf.embedFont(StandardFonts.Helvetica)
  let y = 780
  page.drawText('My Little Bazar', {
    x: 50,
    y,
    size: 18,
    font: bold,
    color: rgb(0.556, 0.372, 0.447),
  })
  y -= 36
  page.drawText('Prueba de impresión', { x: 50, y, size: 12, font: bold })
  y -= 22
  page.drawText('Si ves este documento, el spooler y el driver respondieron.', {
    x: 50,
    y,
    size: 11,
    font: reg,
    color: rgb(0.23, 0.21, 0.19),
  })
  y -= 36
  page.drawLine({
    start: { x: 50, y },
    end: { x: 545, y },
    thickness: 0.5,
    color: rgb(0.88, 0.88, 0.88),
  })
  y -= 20
  const muted = rgb(0.43, 0.41, 0.38)
  page.drawText(`Impresora: ${resolvedLabel}`, { x: 50, y, size: 10, font: reg, color: muted })
  y -= 14
  page.drawText(`Enviado: ${when}`, { x: 50, y, size: 10, font: reg, color: muted })
  fs.writeFileSync(outPath, await pdf.save())
}

const LABEL_WHITE = rgb(1, 1, 1)
const LABEL_LINE = rgb(0.78, 0.78, 0.8)
const LABEL_INK = rgb(0.08, 0.08, 0.09)
const LABEL_ACCENT = rgb(0.5, 0.32, 0.38)

/**
 * Una sola hoja = tamaño exacto de la etiqueta (sin bandas vacías).
 * Orden visual de abajo arriba en PDF: MSR → barras → PRECIO → nombre → empresa (lectura humana de arriba abajo: inverso).
 * Sin rectángulos internos (solo texto + barras); un borde suave alrededor de la etiqueta.
 * @param {string} outPath
 * @param {{ empresa?: string, codigo: string, nombre: string, precio: string }} fields
 * @returns {Promise<{ barcodeOk: boolean, barcodeNote?: string }>}
 */
async function writeLabelPdf(outPath, fields) {
  const empresa = String(fields?.empresa || 'My Little Bazar')
  const codigoRaw = String(fields?.codigo || '').trim()
  const nombre = String(fields?.nombre || '').trim() || '—'
  const precio = String(fields?.precio || '').trim() || '$0'
  const payload = normalizeCode128Payload(codigoRaw)

  let barcodeOk = false
  let barcodeNote = ''

  const PW = 168
  const pad = 8
  const innerW = PW - 2 * pad
  const gap = 5
  const barcodeMaxH = 48

  const nombreLines = wrapNombreLines(nombre, 26, 2)
  const hNom = 6 + nombreLines.length * 9
  const hCod = 13
  const hPrec = 15
  const hEmp = 13

  let barcodeBuf = null
  let dh = 22
  let dw = innerW - 4

  if (payload) {
    try {
      const bwipjs = getBwipJs()
      const pngBuf = await bwipjs.toBuffer({
        bcid: 'code128',
        text: payload,
        scale: 2,
        height: 20,
        includetext: false,
        backgroundcolor: 'FFFFFF',
        barcolor: '000000',
      })
      const buf = Buffer.isBuffer(pngBuf) ? pngBuf : Buffer.from(pngBuf)
      if (buf && buf.length >= 32) {
        barcodeBuf = buf
        const tmpPdf = await PDFDocument.create()
        const im = await tmpPdf.embedPng(buf)
        const maxW = innerW - 4
        const sc = Math.min(maxW / Math.max(1, im.width), barcodeMaxH / Math.max(1, im.height), 1)
        dw = Math.round(im.width * sc * 1000) / 1000
        dh = Math.round(im.height * sc * 1000) / 1000
      }
    } catch (err) {
      console.error('[label-pdf] Code128 PNG:', err)
      barcodeNote = String(err?.message || err)
    }
  }

  const stackH = hCod + gap + dh + gap + hPrec + gap + hNom + gap + hEmp
  const PH = Math.max(96, Math.ceil(stackH + 2 * pad))

  const pdf = await PDFDocument.create()
  const page = pdf.addPage([PW, PH])
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const reg = await pdf.embedFont(StandardFonts.Helvetica)

  page.drawRectangle({
    x: 1,
    y: 1,
    width: PW - 2,
    height: PH - 2,
    color: LABEL_WHITE,
    borderColor: LABEL_LINE,
    borderWidth: 0.5,
  })

  let y = pad
  const codigoShow = codigoRaw || '—'
  const cw = bold.widthOfTextAtSize(codigoShow, 8)
  page.drawText(codigoShow, {
    x: pad + (innerW - cw) / 2,
    y: y + 4,
    size: 8,
    font: bold,
    color: LABEL_INK,
  })
  y += hCod + gap

  if (barcodeBuf) {
    try {
      const img = await pdf.embedPng(barcodeBuf)
      const sc = Math.min((innerW - 4) / Math.max(1, img.width), barcodeMaxH / Math.max(1, img.height), 1)
      dw = Math.round(img.width * sc * 1000) / 1000
      dh = Math.round(img.height * sc * 1000) / 1000
      const xImg = pad + (innerW - dw) / 2
      page.drawImage(img, { x: xImg, y, width: dw, height: dh })
      barcodeOk = true
      y += dh + gap
    } catch (err) {
      console.error('[label-pdf] embed PNG:', err)
      barcodeNote = String(err?.message || err)
      const hf = 18
      page.drawText(`Código: ${codigoShow}`, {
        x: pad + 2,
        y: y + 5,
        size: 7,
        font: reg,
        color: rgb(0.4, 0.38, 0.36),
        maxWidth: innerW - 4,
      })
      y += hf + gap
    }
  } else if (payload) {
    const hf = 18
    page.drawText(`Código: ${codigoShow}`, {
      x: pad + 2,
      y: y + 5,
      size: 7,
      font: reg,
      color: rgb(0.4, 0.38, 0.36),
      maxWidth: innerW - 4,
    })
    y += hf + gap
  } else {
    barcodeNote = 'Sin payload para Code128'
    const hf = 16
    page.drawText(`Código: ${codigoShow}`, {
      x: pad + 2,
      y: y + 4,
      size: 7,
      font: reg,
      color: rgb(0.4, 0.38, 0.36),
      maxWidth: innerW - 4,
    })
    y += hf + gap
  }

  const wTag = 52
  const wVal = innerW - wTag - gap
  const pw = bold.widthOfTextAtSize(precio, 9)
  page.drawText('PRECIO:', { x: pad + 2, y: y + 4, size: 7.5, font: bold, color: LABEL_INK })
  page.drawText(precio, {
    x: pad + wTag + gap + Math.max(0, (wVal - pw) / 2),
    y: y + 3.5,
    size: 9,
    font: bold,
    color: LABEL_INK,
  })
  y += hPrec + gap

  let ty = y + hNom - 5
  for (const line of nombreLines) {
    page.drawText(line, {
      x: pad + 2,
      y: ty,
      size: 7.5,
      font: reg,
      color: LABEL_INK,
      maxWidth: innerW - 4,
    })
    ty -= 9
  }
  y += hNom + gap

  const ew = bold.widthOfTextAtSize(empresa, 8)
  page.drawText(empresa, {
    x: pad + (innerW - ew) / 2,
    y: y + 4,
    size: 8,
    font: bold,
    color: LABEL_ACCENT,
  })

  fs.writeFileSync(outPath, await pdf.save())
  return { barcodeOk, barcodeNote: barcodeOk ? undefined : barcodeNote }
}

function physicalPrintWindows(tmpTxtPath, printerName) {
  const p = (printerName || '').trim()
  const nameArg = p ? ` -Name '${p.replace(/'/g, "''")}'` : ''
  const pathArg = tmpTxtPath.replace(/'/g, "''")
  execSync(
    `powershell -NoProfile -NonInteractive -Command "Get-Content -LiteralPath '${pathArg}' | Out-Printer${nameArg}"`,
    { encoding: 'utf8', timeout: 120000, windowsHide: true },
  )
}

function physicalPrintUnix(tmpTxtPath, printerName) {
  const p = (printerName || '').trim()
  if (p) execFileSync('lpr', ['-P', p, tmpTxtPath], { timeout: 120000 })
  else execFileSync('lpr', [tmpTxtPath], { timeout: 120000 })
}

/**
 * Texto plano al spooler (impresoras físicas).
 * @param {string} [printerName]
 */
function sendPhysicalTestPrint(printerName) {
  const body = `My Little Bazar — prueba de impresión\r\n${new Date().toLocaleString('es-MX')}\r\n`
  const tmp = path.join(os.tmpdir(), `bazar-print-test-${Date.now()}.txt`)
  fs.writeFileSync(tmp, body, 'utf8')
  try {
    if (process.platform === 'win32') {
      physicalPrintWindows(tmp, printerName)
    } else {
      physicalPrintUnix(tmp, printerName)
    }
    const label = (printerName || '').trim() || 'predeterminada del sistema'
    return { ok: true, message: `Trabajo enviado a «${label}».` }
  } catch (e) {
    return { ok: false, message: String(e.message || e) }
  } finally {
    try {
      fs.unlinkSync(tmp)
    } catch {
      /* ignore */
    }
  }
}

module.exports = {
  isVirtualPdf,
  writeTestPdf,
  writeLabelPdf,
  sendPhysicalTestPrint,
}
