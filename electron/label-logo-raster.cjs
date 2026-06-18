/**
 * Estilos de logo para etiqueta (térmica B/N vs color) y ajustes ligeros.
 * Entrada/salida: `nativeImage` de Electron (bitmap BGRA en plataformas little-endian).
 */

function clampByte(n) {
  return Math.max(0, Math.min(255, Math.round(n)))
}

function luminance(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b
}

/**
 * @param {import('electron').NativeImage} nativeImage
 * @param {{ style?: string, warmth?: number, contrast?: number, saturation?: number }} opts
 * @returns {import('electron').NativeImage}
 */
function applyLabelLogoStyle(nativeImage, opts = {}) {
  const { nativeImage: NI } = require('electron')
  if (!nativeImage || nativeImage.isEmpty()) return nativeImage

  const style = String(opts.style || 'thermal').toLowerCase() === 'original' ? 'original' : 'thermal'
  const warmth = Number.isFinite(Number(opts.warmth)) ? Math.max(-30, Math.min(30, Number(opts.warmth))) : 0
  const contrast = Number.isFinite(Number(opts.contrast)) ? Math.max(70, Math.min(130, Number(opts.contrast))) : 100
  const saturation = Number.isFinite(Number(opts.saturation))
    ? Math.max(0, Math.min(200, Number(opts.saturation)))
    : 100

  const size = nativeImage.getSize()
  const w = Math.max(1, Number(size.width) || 1)
  const h = Math.max(1, Number(size.height) || 1)
  let buf
  try {
    buf = Buffer.from(nativeImage.toBitmap({ scaleFactor: 1.0 }))
  } catch {
    return nativeImage
  }
  const expected = w * h * 4
  if (!buf || buf.length !== expected) return nativeImage

  const cf = contrast / 100
  const tw = warmth / 30

  for (let i = 0; i < expected; i += 4) {
    const b0 = buf[i]
    const g0 = buf[i + 1]
    const r0 = buf[i + 2]
    const a = buf[i + 3]

    if (style === 'original') {
      const sat = saturation / 100
      const y = luminance(r0, g0, b0)
      let outR = y + (r0 - y) * sat
      let outG = y + (g0 - y) * sat
      let outB = y + (b0 - y) * sat
      buf[i] = clampByte((outB - 128) * cf + 128)
      buf[i + 1] = clampByte((outG - 128) * cf + 128)
      buf[i + 2] = clampByte((outR - 128) * cf + 128)
      buf[i + 3] = a
      continue
    }

    /* térmica: gris + contraste + tinte frío/cálido */
    let y = luminance(r0, g0, b0)
    y = clampByte((y - 128) * cf + 128)
    const outR = clampByte(y + tw * 22)
    const outG = clampByte(y + tw * 8)
    const outB = clampByte(y - tw * 20)
    buf[i] = outB
    buf[i + 1] = outG
    buf[i + 2] = outR
    buf[i + 3] = a
  }

  try {
    return NI.createFromBitmap(buf, { width: w, height: h, scaleFactor: 1.0 })
  } catch {
    return nativeImage
  }
}

module.exports = { applyLabelLogoStyle }
