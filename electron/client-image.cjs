'use strict'

const { dialog, shell, app } = require('electron')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

/**
 * Abre un diálogo para elegir la imagen de identificación del cliente y la copia de forma segura.
 * @param {import('electron').BrowserWindow | null} browserWindow
 * @param {string} dataRoot directorio root de la base de datos
 */
function pickClientImage(browserWindow, dataRoot) {
  try {
    const res = dialog.showOpenDialogSync(browserWindow || undefined, {
      title: 'Elegir identificación de cliente',
      properties: ['openFile'],
      filters: [{ name: 'Imágenes', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }],
    })
    
    if (!res || !res[0]) {
      return { ok: false, cancelled: true, path: '' }
    }

    const src = res[0]
    const dir = path.join(dataRoot, 'client_identifications')
    
    // Asegurar que exista la carpeta
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    const ext = path.extname(src).toLowerCase() || '.jpg'
    // Sanitizar nombre de archivo para evitar caracteres raros que rompan rutas
    const base = path.basename(src, ext)
      .replace(/[^\w\-]+/g, '_')
      .slice(0, 36)
      
    const filename = `${base}_${crypto.randomBytes(6).toString('hex')}${ext}`
    const dest = path.join(dir, filename)

    fs.copyFileSync(src, dest)
    
    return { ok: true, cancelled: false, path: dest }
  } catch (err) {
    console.error('[client-image] Error al copiar identificación:', err)
    return { ok: false, cancelled: false, error: err?.message || String(err), path: '' }
  }
}

/**
 * Guarda (descarga) una copia de la imagen de identificación ya almacenada a la
 * ubicación que elija la dueña, y muestra el archivo en la carpeta.
 * @param {import('electron').BrowserWindow | null} browserWindow
 * @param {string} srcPath ruta absoluta de la imagen guardada
 */
function saveClientImage(browserWindow, srcPath) {
  try {
    const src = String(srcPath || '').trim()
    if (!src || !fs.existsSync(src)) {
      return { ok: false, message: 'No hay imagen de identificación para descargar.' }
    }
    const ext = path.extname(src) || '.jpg'
    let downloads
    try { downloads = app.getPath('downloads') } catch { downloads = '' }
    const defaultPath = downloads ? path.join(downloads, `identificacion${ext}`) : `identificacion${ext}`
    const dest = dialog.showSaveDialogSync(browserWindow || undefined, {
      title: 'Descargar identificación',
      defaultPath,
      filters: [{ name: 'Imágenes', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }],
    })
    if (!dest) return { ok: false, cancelled: true }
    fs.copyFileSync(src, dest)
    try { shell.showItemInFolder(dest) } catch { /* noop */ }
    return { ok: true, path: dest }
  } catch (err) {
    console.error('[client-image] Error al descargar identificación:', err)
    return { ok: false, error: err?.message || String(err) }
  }
}

module.exports = { pickClientImage, saveClientImage }
