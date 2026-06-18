const { execSync } = require('child_process')

function listPrintersWindows() {
  try {
    const cmd =
      'powershell -NoProfile -NonInteractive -Command "Get-Printer | Select-Object -ExpandProperty Name"'
    const out = execSync(cmd, { encoding: 'utf8', timeout: 20000, windowsHide: true })
    return [...new Set(out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, 'es', { sensitivity: 'base' }),
    )
  } catch (e) {
    console.error('[printers] Windows list failed', e.message)
    return []
  }
}

function listPrintersDarwin() {
  try {
    const out = execSync('lpstat -p', { encoding: 'utf8', timeout: 12000 })
    const names = []
    for (const line of out.split('\n')) {
      const m = line.match(/^printer\s+(.+?)\s+is\s/i)
      if (m) names.push(m[1].trim())
    }
    return [...new Set(names)].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
  } catch (e) {
    console.error('[printers] macOS list failed', e.message)
    return []
  }
}

function listPrintersLinux() {
  try {
    const out = execSync('lpstat -p 2>/dev/null', { encoding: 'utf8', timeout: 12000, shell: '/bin/sh' })
    const names = []
    for (const line of out.split('\n')) {
      const m = line.match(/^printer\s+(.+?)\s+is\s/i)
      if (m) names.push(m[1].trim())
    }
    return [...new Set(names)].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
  } catch (e) {
    console.error('[printers] Linux list failed', e.message)
    return []
  }
}

function listPrinterNames() {
  if (process.platform === 'win32') return listPrintersWindows()
  if (process.platform === 'darwin') return listPrintersDarwin()
  return listPrintersLinux()
}

function getDefaultPrinterNameWindows() {
  try {
    const cmd =
      'powershell -NoProfile -NonInteractive -Command "Get-CimInstance -ClassName Win32_Printer | Where-Object { $_.Default } | Select-Object -ExpandProperty Name"'
    const out = execSync(cmd, { encoding: 'utf8', timeout: 15000, windowsHide: true }).trim()
    return out || ''
  } catch {
    return ''
  }
}

function getDefaultPrinterNameLpstat() {
  try {
    const out = execSync('lpstat -d', { encoding: 'utf8', timeout: 8000 })
    const m =
      out.match(/default destination:\s*(.+)/i) ||
      out.match(/destino predeterminado:\s*(.+)/i) ||
      out.match(/sistema predeterminado:\s*(.+)/i)
    return m ? m[1].trim() : ''
  } catch {
    return ''
  }
}

function getDefaultPrinterName() {
  if (process.platform === 'win32') return getDefaultPrinterNameWindows()
  return getDefaultPrinterNameLpstat()
}

function printerExists(name) {
  const n = (name || '').trim()
  if (!n) return true
  return listPrinterNames().includes(n)
}

function diagnosticLines() {
  const lines = []
  const defaultN = getDefaultPrinterName()
  lines.push(`Predeterminada del sistema: ${defaultN || '(no definida)'}`)
  const all = listPrinterNames()
  if (!all.length) {
    lines.push('No se detectó ninguna impresora instalada.')
    return lines
  }
  lines.push(`Instaladas (${all.length}):`)
  for (const n of [...all].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))) {
    const mark = n === defaultN ? ' ← predeterminada' : ''
    lines.push(`  · ${n}${mark}`)
  }
  return lines
}

module.exports = {
  listPrinterNames,
  getDefaultPrinterName,
  printerExists,
  diagnosticLines,
}
