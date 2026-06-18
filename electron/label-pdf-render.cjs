/**
 * Renderiza una etiqueta a PDF usando un modelo de bloques (ver label-model.cjs).
 *
 * Conversión:
 *  - Coordenadas del modelo: mm, eje Y hacia abajo desde arriba-izquierda.
 *  - PDF: puntos (pt), eje Y hacia arriba desde abajo-izquierda.
 *
 * El texto se dibuja con la baseline del bloque (parte inferior del primer
 * carácter en fontSize). Se calcula esa baseline centrando el texto dentro
 * de `h` como referencia.
 */

const fs = require('fs')
const path = require('path')
const { fileURLToPath } = require('node:url')
const { nativeImage } = require('electron')
const {
  PDFDocument, StandardFonts, rgb,
  pushGraphicsState, popGraphicsState, concatTransformationMatrix,
} = require('pdf-lib')
const { mmToPt, blockTextForData } = require('./label-model.cjs')
const { applyLabelLogoStyle } = require('./label-logo-raster.cjs')

function getBwipJs() {
  try {
    return require('bwip-js/node')
  } catch (e1) {
    const direct = path.join(__dirname, '..', 'node_modules', 'bwip-js', 'dist', 'bwip-js-node.js')
    try {
      return require(direct)
    } catch (e2) {
      console.error('[label-pdf-render] No se pudo cargar bwip-js:', e1?.message || e1, '|', e2?.message || e2)
      throw e1
    }
  }
}

function hexToRgb01(hex, fallback) {
  const s = String(hex || '').trim()
  const m = /^#([0-9a-f]{6})$/i.exec(s)
  if (!m) return fallback
  const n = parseInt(m[1], 16)
  const r = ((n >> 16) & 0xff) / 255
  const g = ((n >> 8) & 0xff) / 255
  const b = (n & 0xff) / 255
  return rgb(r, g, b)
}

function normalizeCode128Payload(raw) {
  let s = String(raw == null ? '' : raw).trim()
  if (!s) return ''
  s = s.replace(/[\x00-\x1f\x7f]/g, '')
  return s.slice(0, 64)
}

function wrapParagraphWords(t, maxLen) {
  const words = String(t || '').trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return []
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
  return out
}

/**
 * Parte el texto en líneas (incluye saltos \n); respeta maxLines total.
 */
function wrapLines(text, maxLen, maxLines) {
  const raw = String(text ?? '')
  const trimmed = raw.trim()
  if (!trimmed) return ['—']
  const parts = raw.split(/\n/)
  const out = []
  for (let pi = 0; pi < parts.length; pi++) {
    const para = parts[pi]
    if (para === '' && pi > 0) {
      out.push('')
      if (out.length >= maxLines) return out
      continue
    }
    const wrapped = wrapParagraphWords(para, maxLen)
    for (const ln of wrapped) {
      out.push(ln)
      if (out.length >= maxLines) return out
    }
  }
  return out.length ? out : ['—']
}

/**
 * Estima cuántos caracteres caben en `widthMm` con una fuente de `fontSizePt`.
 * Helvetica ≈ 0.55 × fontSize en avance horizontal promedio.
 */
function estimateMaxChars(widthMm, fontSizePt) {
  const widthPt = mmToPt(widthMm)
  const avg = Math.max(1, 0.55 * fontSizePt)
  return Math.max(1, Math.floor(widthPt / avg))
}

function logoPathToFs(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return ''
  if (s.startsWith('file:')) {
    try {
      return fileURLToPath(s)
    } catch {
      return s
    }
  }
  return s
}

function resolveBrandingLogoFsPath() {
  const candidates = [
    path.join(__dirname, '..', 'public', 'branding', 'logo.jpg'),
    path.join(__dirname, '..', 'dist', 'branding', 'logo.jpg'),
  ]
  for (const p of candidates) {
    try {
      if (fs.existsSync(p) && fs.statSync(p).isFile()) return p
    } catch {
      /* noop */
    }
  }
  return ''
}

function effectiveLogoFsPathForPdf(rawFromData) {
  const u = logoPathToFs(String(rawFromData ?? '').trim())
  if (u) {
    try {
      if (fs.existsSync(u) && fs.statSync(u).isFile()) return u
    } catch {
      /* noop */
    }
  }
  return resolveBrandingLogoFsPath()
}

/**
 * Renderiza `template` + `data` en el PDF `outPath`. Devuelve metadata sobre
 * el código de barras (si se pudo generar).
 */
async function renderLabelPdf(outPath, template, data) {
  const W_mm = Number(template.width_mm) || 60
  const H_mm = Number(template.height_mm) || 40
  const PW = mmToPt(W_mm)
  const PH = mmToPt(H_mm)

  const pdf = await PDFDocument.create()
  const page = pdf.addPage([PW, PH])
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const reg = await pdf.embedFont(StandardFonts.Helvetica)

  const bgColor = hexToRgb01(template.background, rgb(1, 1, 1))
  page.drawRectangle({ x: 0, y: 0, width: PW, height: PH, color: bgColor })

  if (template.border && template.border.enabled) {
    const bw = Number(template.border.width) || 0.5
    const bc = hexToRgb01(template.border.color, rgb(0.78, 0.78, 0.8))
    page.drawRectangle({
      x: 0.5, y: 0.5, width: PW - 1, height: PH - 1,
      color: bgColor, borderColor: bc, borderWidth: bw,
    })
  }

  let barcodeOk = false
  let barcodeNote = ''

  for (const block of template.blocks || []) {
    if (!block || block.visible === false) continue
    const x = mmToPt(Number(block.x) || 0)
    const y = mmToPt(Number(block.y) || 0)
    const w = mmToPt(Math.max(1, Number(block.w) || 0))
    const h = mmToPt(Math.max(1, Number(block.h) || 0))

    /* pdf-lib usa origen abajo-izquierda; el modelo usa arriba-izquierda */
    const yBottom = PH - y - h
    const fontSizePt = Math.max(3, Number(block.fontSize) || 8)
    const font = block.fontWeight === 'bold' ? bold : reg
    const color = hexToRgb01(block.color, rgb(0.08, 0.08, 0.09))

    /* Rotación del bloque: replica EXACTO el preview SVG (rotate horario
     * alrededor del centro del bloque). Sin esto el PDF impreso ignoraba la
     * rotación y la etiqueta salía volteada/desacomodada respecto al editor.
     * El `continue` dentro del try ejecuta el finally → el pop siempre ocurre. */
    const rot = (((Number(block.rotation) || 0) % 360) + 360) % 360
    let rotated = false
    if (rot !== 0) {
      const cx = x + w / 2
      const cy = yBottom + h / 2
      const rad = -rot * (Math.PI / 180) // PDF (Y arriba) usa -θ para igualar SVG (Y abajo)
      const cos = Math.cos(rad)
      const sin = Math.sin(rad)
      page.pushOperators(
        pushGraphicsState(),
        concatTransformationMatrix(cos, sin, -sin, cos, cx - cos * cx + sin * cy, cy - sin * cx - cos * cy),
      )
      rotated = true
    }

    try {
      if (block.type === 'codigo_barras') {
        const payload = normalizeCode128Payload(String(data?.codigo || ''))
        if (!payload) {
          barcodeNote = 'Sin código para generar barras'
          continue
        }
        const bwipjs = getBwipJs()
        const pngBuf = await bwipjs.toBuffer({
          bcid: 'code128',
          text: payload,
          scale: 2,
          height: Math.max(6, Math.round((h / mmToPt(1)) * 0.9)),
          includetext: false,
          backgroundcolor: String(block.background || 'FFFFFF').replace('#', ''),
          barcolor: String(block.barColor || '000000').replace('#', ''),
        })
        const buf = Buffer.isBuffer(pngBuf) ? pngBuf : Buffer.from(pngBuf)
        const img = await pdf.embedPng(buf)
        const scale = Math.min(w / img.width, h / img.height, 1)
        const dw = img.width * scale
        const dh = img.height * scale
        page.drawImage(img, {
          x: x + (w - dw) / 2,
          y: yBottom + (h - dh) / 2,
          width: dw,
          height: dh,
        })
        barcodeOk = true
        continue
      }

      if (block.type === 'separador') {
        const thickness = Math.max(0.2, Number(block.thickness) || 0.5)
        const lineColor = hexToRgb01(block.color, rgb(0.78, 0.78, 0.8))
        page.drawLine({
          start: { x, y: yBottom + h / 2 },
          end: { x: x + w, y: yBottom + h / 2 },
          thickness,
          color: lineColor,
        })
        continue
      }

      if (block.type === 'logo') {
        try {
          const fsPath = effectiveLogoFsPathForPdf(data?.logoPath)
          if (!fsPath) continue
          let img
          const ni = nativeImage.createFromPath(fsPath)
          if (!ni.isEmpty()) {
            const styled = applyLabelLogoStyle(ni, {
              style: data?.labelLogoStyle,
              warmth: data?.labelLogoWarmth,
              contrast: data?.labelLogoContrast,
              saturation: data?.labelLogoSaturation,
            })
            const pngBuf = styled.toPNG()
            img = await pdf.embedPng(Buffer.isBuffer(pngBuf) ? pngBuf : Buffer.from(pngBuf))
          } else {
            const raw = fs.readFileSync(fsPath)
            try {
              img = await pdf.embedPng(raw)
            } catch {
              img = await pdf.embedJpg(raw)
            }
          }
          const iw = Number(img?.width) || 0
          const ih = Number(img?.height) || 0
          if (iw <= 0 || ih <= 0) continue
          const fit = String(block.objectFit || 'contain').toLowerCase()
          const scale =
            fit === 'cover'
              ? Math.max(w / iw, h / ih)
              : Math.min(w / iw, h / ih)
          const dw = iw * scale
          const dh = ih * scale
          if (!Number.isFinite(dw) || !Number.isFinite(dh) || dw <= 0 || dh <= 0) continue
          page.drawImage(img, {
            x: x + (w - dw) / 2,
            y: yBottom + (h - dh) / 2,
            width: dw,
            height: dh,
          })
        } catch (err) {
          console.error('[label-pdf-render] logo:', err)
        }
        continue
      }

      if (block.type === 'imagen_fija') {
        try {
          const fsPath = logoPathToFs(String(block.imagePath || '').trim())
          if (!fsPath) continue
          try {
            if (!fs.existsSync(fsPath) || !fs.statSync(fsPath).isFile()) continue
          } catch {
            continue
          }
          const raw = fs.readFileSync(fsPath)
          let img
          try {
            img = await pdf.embedPng(raw)
          } catch {
            try {
              img = await pdf.embedJpg(raw)
            } catch {
              continue
            }
          }
          const iw = Number(img?.width) || 0
          const ih = Number(img?.height) || 0
          if (iw <= 0 || ih <= 0) continue
          const fit = String(block.objectFit || 'contain').toLowerCase()
          const scale =
            fit === 'cover'
              ? Math.max(w / iw, h / ih)
              : Math.min(w / iw, h / ih)
          const dw = iw * scale
          const dh = ih * scale
          if (!Number.isFinite(dw) || !Number.isFinite(dh) || dw <= 0 || dh <= 0) continue
          page.drawImage(img, {
            x: x + (w - dw) / 2,
            y: yBottom + (h - dh) / 2,
            width: dw,
            height: dh,
          })
        } catch (err) {
          console.error('[label-pdf-render] imagen_fija:', err)
        }
        continue
      }

      /* Bloque precio: "LABEL    VALUE" */
      if (block.type === 'precio' && block.showLabel !== false) {
        const valueStr = blockTextForData(block, data)
        const labelStr = String(block.labelText || 'PRECIO:')
        const labelPt = Math.max(3, Number(block.labelFontSize) || fontSizePt * 0.75)
        const labelColor = hexToRgb01(block.labelColor || block.color, color)
        const labelWidth = bold.widthOfTextAtSize(labelStr, labelPt)
        const valueWidth = font.widthOfTextAtSize(valueStr, fontSizePt)
        const midY = yBottom + h / 2 - fontSizePt / 2 + fontSizePt * 0.28
        page.drawText(labelStr, { x: x + 2, y: midY, size: labelPt, font: bold, color: labelColor })
        page.drawText(valueStr, {
          x: x + w - valueWidth - 2,
          y: midY,
          size: fontSizePt,
          font,
          color,
        })
        continue
      }

      /* Resto de bloques texto (empresa / nombre / código / texto_libre / precio sin label / propiedad) */
      const text = blockTextForData(block, data)
      /* Bloque `propiedad` sin valor y sin showEmpty: no renderizar (ni fallback "—") */
      if (block.type === 'propiedad' && !String(text || '').trim()) continue
      const maxLines = Math.max(1, Number(block.maxLines) || 1)
      const approxPerLine = estimateMaxChars(Math.max(1, Number(block.w) || 10), fontSizePt)
      const lines = wrapLines(text, approxPerLine, maxLines)
      const lhMult = Number.isFinite(Number(block.lineHeight)) ? Math.max(1, Number(block.lineHeight)) : 1.15
      const lineStep = fontSizePt * lhMult
      const totalH = (lines.length - 1) * lineStep + fontSizePt
      let ty = yBottom + h - (h - totalH) / 2 - fontSizePt * 0.85
      for (const line of lines) {
        if (line !== '') {
          const lw = font.widthOfTextAtSize(line, fontSizePt)
          let lx = x + 2
          if (block.align === 'center') lx = x + (w - lw) / 2
          else if (block.align === 'right') lx = x + w - lw - 2
          page.drawText(line, { x: lx, y: ty, size: fontSizePt, font, color })
        }
        ty -= lineStep
      }
    } catch (err) {
      console.error('[label-pdf-render] bloque', block.type, err)
    } finally {
      if (rotated) page.pushOperators(popGraphicsState())
    }
  }

  fs.writeFileSync(outPath, await pdf.save())
  return { barcodeOk, barcodeNote: barcodeOk ? undefined : barcodeNote }
}

module.exports = { renderLabelPdf }
