'use strict'

/**
 * Auditoría de cables IPC: detecta canales que el renderer invoca (vía
 * preload) pero que el proceso main NO registra como handler. Esa
 * desconexión produce errores silenciosos en runtime — el renderer llama,
 * main rechaza, y el try/catch del componente se traga el fallo. La pantalla
 * queda muda sin que nadie sepa por qué.
 *
 * Clasifica los canales rotos en:
 *   - ACTIVOS:   los usa código vivo en src/ -> bug real, hay que arreglar.
 *   - DURMIENTES: nadie en src/ los llama -> código muerto (típicamente
 *                 residuo de vistas borradas). No rompen, pero ensucian.
 *
 * Uso:  npm run audit:ipc
 * Exit: 0 si no hay cables ACTIVOS rotos; 1 si los hay.
 *
 * Esta herramienta nace del hallazgo de 2026-05: getWelcomeSnapshot y tres
 * canales del cuaderno estaban cortados y rompían en silencio el inicio, el
 * POS y el aprendizaje del alta. Queda como guardián para que no vuelva a
 * pasar sin que se note.
 */

const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const main = fs.readFileSync(path.join(root, 'electron/main.cjs'), 'utf8')
const preload = fs.readFileSync(path.join(root, 'electron/preload.cjs'), 'utf8')

const handled = new Set([...main.matchAll(/ipcMain\.handle\(\s*'([^']+)'/g)].map((m) => m[1]))
const methodToChannel = {}
for (const m of preload.matchAll(/(\w+):\s*\([^)]*\)\s*=>\s*ipcRenderer\.invoke\(\s*'([^']+)'/g)) {
  methodToChannel[m[1]] = m[2]
}
const broken = Object.entries(methodToChannel).filter(([, c]) => !handled.has(c))

function walk(dir) {
  let out = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) out = out.concat(walk(p))
    else if (/\.(jsx?|tsx?)$/.test(e.name) && !e.name.endsWith('.d.ts')) out.push(p)
  }
  return out
}

const srcFiles = walk(path.join(root, 'src'))
const usedBy = {}
for (const [method] of broken) {
  const re = new RegExp('\\b' + method + '\\s*\\(')
  for (const f of srcFiles) {
    if (re.test(fs.readFileSync(f, 'utf8'))) {
      ;(usedBy[method] = usedBy[method] || []).push(path.relative(root, f).replace(/\\/g, '/'))
    }
  }
}

const active = broken.filter(([m]) => usedBy[m])
const dormant = broken.filter(([m]) => !usedBy[m])

console.log(`Canales del preload: ${Object.keys(methodToChannel).length} | handlers en main: ${handled.size}`)
console.log(`Cables cortados: ${broken.length} (activos: ${active.length}, durmientes: ${dormant.length})\n`)

if (active.length) {
  console.log('✗ ACTIVOS (código vivo los llama — bug real):')
  for (const [m, c] of active) {
    console.log(`   ${m} -> ${c}`)
    usedBy[m].forEach((f) => console.log(`        ${f}`))
  }
  console.log('')
}
if (dormant.length) {
  console.log('· DURMIENTES (sin llamador vivo — código muerto a podar):')
  console.log('   ' + dormant.map(([m]) => m).join(', ') + '\n')
}
if (!active.length) console.log('OK — ningún cable IPC activo está cortado.')

process.exit(active.length ? 1 : 0)
