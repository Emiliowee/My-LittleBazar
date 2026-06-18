'use strict'

/**
 * Test del render de etiquetas con rotación de bloques.
 *
 * El bug histórico: el editor rotaba bloques y el preview los mostraba
 * rotados, pero el PDF impreso ignoraba la rotación → la etiqueta salía
 * volteada/desacomodada. Este test verifica que el PDF:
 *   1. Se genera sin crashear para 0/90/180/270°.
 *   2. Incluye operadores de transformación (cm) cuando hay rotación, y NO
 *      cuando no la hay (no rota de gratis).
 *
 * Uso:  node scripts/test-label-rotation.cjs
 */

const fs = require('fs')
const os = require('os')
const path = require('path')
const zlib = require('zlib')
const { renderLabelPdf } = require('../electron/label-pdf-render.cjs')
const { createDefaultTemplate } = require('../electron/label-model.cjs')

let pasos = 0
function ok(label, cond) {
  if (!cond) { console.error(`\nFAIL: ${label}`); process.exit(1) }
  pasos += 1
  console.log(`  ok   ${label}`)
}

const DATA = { empresa: 'Monserrat', nombre: 'Blusa negra', precio: '$350', codigo: 'MSR-0001' }

function plantillaConRotacion(rot) {
  const t = createDefaultTemplate()
  // Sin bloques de imagen: nativeImage es de Electron y este test corre con node.
  t.blocks = t.blocks
    .filter((b) => b.type !== 'logo' && b.type !== 'imagen_fija')
    .map((b) => (b.type === 'nombre' ? { ...b, rotation: rot } : b))
  return t
}

/** Texto de los content streams del PDF (descomprime los Flate). */
function contenidoPdf(buf) {
  let texto = buf.toString('latin1')
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g
  let m
  while ((m = re.exec(texto)) !== null) {
    const raw = Buffer.from(m[1], 'latin1')
    try { texto += '\n' + zlib.inflateSync(raw).toString('latin1') }
    catch { try { texto += '\n' + zlib.inflateRawSync(raw).toString('latin1') } catch { /* no comprimido */ } }
  }
  return texto
}

/** Cuenta operadores `cm` (concat matrix = transformación) en el contenido. */
function contarCm(buf) {
  return (contenidoPdf(buf).match(/\bcm\b/g) || []).length
}

async function run() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mlb-label-rot-'))
  try {
    // Baseline sin rotación (el barcode ya aporta sus propios 'cm' por drawImage).
    const base0 = path.join(dir, 'label_0.pdf')
    const meta0 = await renderLabelPdf(base0, plantillaConRotacion(0), DATA)
    ok('rotación 0° genera PDF sin crashear', fs.existsSync(base0) && fs.statSync(base0).size > 200)
    ok('rotación 0° produce código de barras', meta0 && meta0.barcodeOk === true)
    const cmBase = contarCm(fs.readFileSync(base0))

    for (const rot of [90, 180, 270]) {
      const out = path.join(dir, `label_${rot}.pdf`)
      const meta = await renderLabelPdf(out, plantillaConRotacion(rot), DATA)
      ok(`rotación ${rot}° genera PDF sin crashear`, fs.existsSync(out) && fs.statSync(out).size > 200)
      ok(`rotación ${rot}° produce código de barras`, meta && meta.barcodeOk === true)
      // El bloque «nombre» rotado agrega un 'cm' de transformación extra sobre el baseline.
      const cm = contarCm(fs.readFileSync(out))
      ok(`rotación ${rot}°: el bloque rotado agrega su transformación (cm ${cm} > base ${cmBase})`, cm > cmBase)
    }
    console.log(`\nOK  test-label-rotation — ${pasos} verificaciones`)
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }) } catch { /* noop */ }
  }
}

run().then(() => process.exit(0)).catch((err) => {
  console.error('\nFAIL test-label-rotation:', err.message)
  if (err.stack) console.error(err.stack)
  process.exit(1)
})
