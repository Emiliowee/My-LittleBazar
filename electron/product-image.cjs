const { dialog } = require('electron')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

/**
 * Copia la imagen a `data/product_images` (misma idea que `PRODUCT_IMAGES_DIR` en Python).
 * @param {import('electron').BrowserWindow | null} browserWindow
 * @param {string} dataRoot directorio `data` (padre de monserrat.db)
 */
function pickProductImage(browserWindow, dataRoot) {
  const res = dialog.showOpenDialogSync(browserWindow || undefined, {
    title: 'Elegir imagen del producto',
    properties: ['openFile'],
    filters: [{ name: 'Imágenes', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }],
  })
  if (!res || !res[0]) return { ok: false, cancelled: true, path: '' }

  const src = res[0]
  const dir = path.join(dataRoot, 'product_images')
  fs.mkdirSync(dir, { recursive: true })
  const ext = path.extname(src).toLowerCase() || '.jpg'
  const base = path.basename(src, ext).replace(/[^\w\-]+/g, '_').slice(0, 36)
  const dest = path.join(dir, `${base}_${crypto.randomBytes(6).toString('hex')}${ext}`)
  fs.copyFileSync(src, dest)
  return { ok: true, cancelled: false, path: dest }
}

module.exports = { pickProductImage }
