const fs = require('fs')
const { execFileSync } = require('child_process')

/**
 * Envía un PDF existente a la cola de impresión (sin abrir visor).
 * Windows: pdf-to-printer. macOS/Linux: lp.
 * @param {string} absPath
 * @param {string} [printerName]
 * @param {number} [copies=1]
 */
async function printPdfToQueue(absPath, printerName, copies = 1) {
  if (!absPath || !fs.existsSync(absPath)) {
    throw new Error('Archivo PDF no encontrado.')
  }
  const name = String(printerName || '').trim()
  const numCopies = Math.max(1, parseInt(copies, 10) || 1)

  if (process.platform === 'win32') {
    const { print } = require('pdf-to-printer')
    const opts = {}
    if (name) opts.printer = name
    if (numCopies > 1) opts.copies = numCopies
    await print(absPath, opts)
    return
  }

  try {
    const args = []
    if (name) {
      args.push('-d', name)
    }
    if (numCopies > 1) {
      args.push('-n', String(numCopies))
    }
    args.push(absPath)
    execFileSync('lp', args, { timeout: 120000 })
  } catch (e) {
    throw new Error(String(e?.message || e))
  }
}

module.exports = { printPdfToQueue }

