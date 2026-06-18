const fs = require('fs')
const path = require('path')
const { app } = require('electron')

/**
 * Misma convención que Python (`src/core/paths.py`): `data/monserrat.db` bajo la raíz del monorepo.
 * `electron/` vive en `bazar-app/electron` → subir dos niveles llega a `BazarMonserrrat/`.
 */
function resolveMonserratDbPath() {
  if (process.env.BAZAR_MONSERRAT_DB) {
    return path.resolve(process.env.BAZAR_MONSERRAT_DB)
  }

  const electronDir = __dirname
  const bazarAppRoot = path.join(electronDir, '..')
  const monorepoRoot = path.join(bazarAppRoot, '..')
  const monorepoDataDir = path.join(monorepoRoot, 'data')
  const monorepoDb = path.join(monorepoDataDir, 'monserrat.db')

  if (fs.existsSync(monorepoDataDir)) {
    return monorepoDb
  }

  const localData = path.join(bazarAppRoot, 'data')
  if (fs.existsSync(localData)) {
    return path.join(localData, 'monserrat.db')
  }

  return path.join(app.getPath('userData'), 'monserrat.db')
}

function ensureDirForFile(filePath) {
  const dir = path.dirname(filePath)
  fs.mkdirSync(dir, { recursive: true })
}

/** Carpeta `data` donde está `monserrat.db` (imágenes en `data/product_images`). */
function resolveDataRootDir() {
  return path.dirname(resolveMonserratDbPath())
}

module.exports = { resolveMonserratDbPath, ensureDirForFile, resolveDataRootDir }
