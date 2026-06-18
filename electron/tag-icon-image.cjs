const { dialog } = require('electron')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

/**
 * Copia la imagen a `data/tag_icons` para usarla como icono de etiqueta.
 * @param {import('electron').BrowserWindow | null} browserWindow
 * @param {string} dataRoot directorio `data` (padre de monserrat.db)
 */
function pickTagIconImage(browserWindow, dataRoot) {
  const res = dialog.showOpenDialogSync(browserWindow || undefined, {
    title: 'Imagen para la etiqueta',
    properties: ['openFile'],
    filters: [{ name: 'Imágenes', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }],
  })
  if (!res || !res[0]) return { ok: false, cancelled: true, path: '' }

  const src = res[0]
  const dir = path.join(dataRoot, 'tag_icons')
  fs.mkdirSync(dir, { recursive: true })
  const ext = path.extname(src).toLowerCase() || '.png'
  const base = path.basename(src, ext).replace(/[^\w\-]+/g, '_').slice(0, 32)
  const dest = path.join(dir, `tag_${base}_${crypto.randomBytes(6).toString('hex')}${ext}`)
  fs.copyFileSync(src, dest)
  return { ok: true, cancelled: false, path: dest }
}

module.exports = { pickTagIconImage }
