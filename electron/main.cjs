const { app, BrowserWindow, ipcMain, screen, shell, dialog, nativeImage } = require('electron')
const fs = require('fs')
const path = require('path')
const { pathToFileURL, fileURLToPath } = require('node:url')
const { execFile } = require('child_process')
const os = require('os')
const db = require('./database.cjs')
const { pickProductImage } = require('./product-image.cjs')
const { pickTagIconImage } = require('./tag-icon-image.cjs')
const { pickClientImage, saveClientImage } = require('./client-image.cjs')
const { resolveDataRootDir } = require('./monserrat-path.cjs')
const printers = require('./printers.cjs')
const printTest = require('./print-test.cjs')
const printPdf = require('./print-pdf.cjs')
const { createSettingsStore } = require('./settings-store.cjs')
const { createLabelTemplatesStore } = require('./label-templates-store.cjs')
const labelPdfRender = require('./label-pdf-render.cjs')
const ticketPdfRender = require('./ticket-pdf-render.cjs')
const { applyLabelLogoStyle } = require('./label-logo-raster.cjs')
const saldosStore = require('./saldos-store.cjs')

const isDev = !app.isPackaged

/** Carga variables en la raíz del proyecto (sin dotenv).
 * Orden (desarrollo): `.env.example` → `.env` → `.env.local` (gana la última).
 * `process.defaultApp` distingue ejecución desde el ejecutable de Electron (`electron .`)
 * de app empaquetada; en algunos entornos es más fiable que solo `app.isPackaged`.
 * Endurecido: BOM, CRLF, comillas. Log: nombre de key y longitud, nunca el valor. */
function loadMlbEnvFromRoot() {
  const root = path.join(__dirname, '..')
  const includeExample =
    app.isPackaged === false ||
    process.defaultApp === true ||
    String(process.env.npm_lifecycle_event || '').startsWith('dev')
  const files = includeExample
    ? ['.env.example', '.env', '.env.local']
    : ['.env', '.env.local']
  const loaded = []
  for (const fname of files) {
    const fp = path.join(root, fname)
    try {
      if (!fs.existsSync(fp)) continue
      let raw = fs.readFileSync(fp, 'utf8')
      // BOM UTF-8
      if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1)
      const lines = raw.split(/\r?\n/)
      for (let line of lines) {
        line = line.trim()
        if (!line || line.startsWith('#')) continue
        if (line.startsWith('export ')) line = line.slice(7).trim()
        const eq = line.indexOf('=')
        if (eq < 1) continue
        const key = line.slice(0, eq).trim()
        let val = line.slice(eq + 1).trim()
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1)
        }
        if (key) {
          process.env[key] = val
          loaded.push({ file: fname, key, len: val.length })
        }
      }
    } catch (err) {
      console.error('[env-loader] error leyendo', fname, ':', err?.message || err)
    }
  }
  if (loaded.length === 0) {
    const hint = includeExample ? '.env.example, .env o .env.local' : '.env o .env.local'
    console.warn('[env-loader] ⚠️  NO se cargó ninguna key (' + hint + ') en', root)
  } else {
    for (const { file, key, len } of loaded) {
      console.log(`[env-loader] ✓ ${key} cargada de ${file} (len=${len})`)
    }
  }
}

loadMlbEnvFromRoot()

/** Ruta de disco: acepta `file://` (p. ej. settings antiguos) o ruta absoluta normal. */
function workspacePathToFs(p) {
  const s = String(p ?? '').trim()
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

/** Logo por defecto de la app (mismo que el sidebar sin avatar). */
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

/** Ruta de archivo a usar en etiquetas: avatar del espacio o logo por defecto. */
function effectiveWorkspaceLogoFsPath(settings) {
  const user = workspacePathToFs(String(settings?.workspaceLogoPath ?? '').trim())
  if (user) {
    try {
      if (fs.existsSync(user) && fs.statSync(user).isFile()) return user
    } catch {
      /* noop */
    }
  }
  return resolveBrandingLogoFsPath()
}

/** Nombre de archivo PDF de etiqueta (sin extensión), seguro para el sistema de archivos. */
function safeEtiquetaFileStem(codigo, nombreEtiqueta) {
  const bad = /[<>:"/\\|?*\x00-\x1f]/g
  const c = String(codigo || '')
    .trim()
    .replace(bad, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 56)
  const rawN = String(nombreEtiqueta || '')
    .trim()
    .replace(bad, '_')
    .replace(/\s+/g, '_')
    .slice(0, 48)
  const n = rawN === '—' ? '' : rawN
  let stem
  if (c && n) stem = `Etiqueta_${c}_${n}`
  else if (c) stem = `Etiqueta_${c}`
  else if (n) stem = `Etiqueta_${n}`
  else stem = `Etiqueta_${Date.now()}`
  if (stem.length > 140) stem = stem.slice(0, 140)
  return stem
}

/** @type {import('electron').BrowserWindow | null} */
let mainWindow = null
/** @type {import('electron').BrowserWindow | null} */
let devicesWindow = null
/** @type {import('electron').BrowserWindow | null} */
let pdvWindow = null
/** @type {import('electron').Rectangle | null} */
let preWelcomeBounds = null
/** @type {[number, number] | null} */
let preWelcomeMinSize = null
/** Ventana principal en modo splash: no permitir maximizar. */
let welcomeModeActive = false
/** @type {ReturnType<typeof createSettingsStore> | null} */
let settingsStore = null
/** @type {ReturnType<typeof createLabelTemplatesStore> | null} */
let labelTemplatesStore = null

/** Carpeta efectiva para guardar PDFs de etiqueta (config o Descargas). */
function resolveLabelPdfDirectory() {
  const downloads = app.getPath('downloads')
  try {
    const st = settingsStore?.getAll?.() ?? {}
    const custom = String(st.labelPdfSavePath || '').trim()
    if (!custom) return downloads
    const norm = path.resolve(custom)
    try {
      const stat = fs.statSync(norm)
      if (stat.isDirectory()) return norm
    } catch {
      /* ruta inexistente o sin acceso */
    }
    return downloads
  } catch {
    return downloads
  }
}

/**
 * Construye los mapas que necesita el bloque `propiedad` del template:
 *   - propertiesByTagGroupId: { [group_id]: { value: option_id, label: option.name, group: group.name } }
 *   - propertiesByRuleFieldId: { [field_id]: { value, label, type, group: rule.name } }
 *
 * Si no hay producto identificable, devuelve mapas vacíos. Tolera todo error de DB.
 */
function buildLabelPropertyMaps({ productoId, codigo }) {
  const empty = { propertiesByTagGroupId: {}, propertiesByRuleFieldId: {} }
  try {
    let producto = null
    if (Number.isFinite(Number(productoId)) && Number(productoId) > 0) {
      producto = db.getProductById(Number(productoId))
    }
    if (!producto && codigo) {
      producto = db.getProductByCodigo(codigo)
    }
    if (!producto) return empty

    const propertiesByTagGroupId = {}
    const tagsByGroup = producto.tagsByGroup || {}
    if (Object.keys(tagsByGroup).length > 0) {
      const groups = typeof db.getCuadernoTagGroups === 'function' ? db.getCuadernoTagGroups() : []
      const byId = new Map()
      for (const g of Array.isArray(groups) ? groups : []) {
        byId.set(Number(g.id), g)
      }
      for (const [gid, oid] of Object.entries(tagsByGroup)) {
        const groupId = Number(gid)
        const optionId = Number(oid)
        if (!Number.isFinite(groupId) || !Number.isFinite(optionId)) continue
        const grp = byId.get(groupId)
        if (!grp) continue
        const opt = (grp.options || []).find((o) => Number(o.id) === optionId)
        if (!opt) continue
        propertiesByTagGroupId[groupId] = {
          value: optionId,
          label: String(opt.name || '').trim(),
          group: String(grp.name || '').trim(),
        }
      }
    }

    const propertiesByRuleFieldId = {}
    const ruleId = Number(producto.ruleId)
    const ruleVals = producto.ruleFieldValues || {}
    if (Number.isFinite(ruleId) && ruleId > 0 && typeof db.getInvPricingRule === 'function') {
      const rule = db.getInvPricingRule({ id: ruleId })
      const fields = Array.isArray(rule?.customFields) ? rule.customFields : []
      for (const f of fields) {
        const fid = Number(f.id)
        if (!Number.isFinite(fid)) continue
        const raw = ruleVals[fid]
        if (raw == null || raw === '') continue
        let label = String(raw)
        if (f.type === 'select' && Array.isArray(f.options)) {
          const opt = f.options.find((o) => String(o.value ?? o.id) === String(raw))
          if (opt) label = String(opt.label ?? opt.name ?? raw)
        } else if (f.type === 'checkbox') {
          label = raw ? 'Sí' : 'No'
        } else if (f.type === 'number') {
          const n = Number(raw)
          label = Number.isFinite(n) ? String(n) : String(raw)
        }
        propertiesByRuleFieldId[fid] = {
          value: raw,
          label: label.trim(),
          type: f.type || 'text',
          group: String(rule.name || '').trim(),
        }
      }
    }

    return { propertiesByTagGroupId, propertiesByRuleFieldId }
  } catch {
    return empty
  }
}

function resolveAppIconPath() {
  const candidates = [
    path.join(__dirname, '../public/branding/rose_icon.png'),
    path.join(__dirname, '../dist/branding/rose_icon.png'),
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  return undefined
}

function wireWindowState(win) {
  const send = () => {
    win.webContents.send('window:state', { maximized: win.isMaximized() })
  }
  win.on('maximize', send)
  win.on('unmaximize', send)
  win.on('enter-full-screen', send)
  win.on('leave-full-screen', send)
}

function createWindow() {
  const icon = resolveAppIconPath()

  /** @type {import('electron').BrowserWindowConstructorOptions} */
  const opts = {
    title: 'My Little Bazar',
    /* Tamaño inicial = shell launcher (760×600 en App); setShellSize ajusta al navegar. */
    width: 760,
    height: 600,
    minWidth: 760,
    minHeight: 600,
    autoHideMenuBar: true,
    /* macOS: titlebar nativa con tráfico oculto. Win/Linux: sin frame.
     * En Windows 11 se habilita Mica Material.
     */
    frame: process.platform === 'darwin',
    backgroundColor: process.platform === 'darwin' ? '#0e0e0e' : '#00000000',
    backgroundMaterial: process.platform === 'win32' ? 'mica' : undefined,
    roundedCorners: true,
    icon: icon || undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      devTools: isDev,
      /* file:// en <img> desde la app (rutas locales tras elegir foto) */
      webSecurity: false,
    },
  }

  if (process.platform === 'darwin') {
    opts.titleBarStyle = 'hiddenInset'
    opts.trafficLightPosition = { x: 14, y: 14 }
  }

  const win = new BrowserWindow(opts)
  mainWindow = win
  wireWindowState(win)

  if (isDev) {
    win.loadURL('http://127.0.0.1:5173')
    if (process.env.ELECTRON_OPEN_DEVTOOLS === '1') {
      win.webContents.openDevTools({ mode: 'detach' })
    }
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  win.on('closed', () => {
    mainWindow = null
  })
}

function createDevicesWindow() {
  if (devicesWindow && !devicesWindow.isDestroyed()) {
    devicesWindow.focus()
    return
  }

  const icon = resolveAppIconPath()
  devicesWindow = new BrowserWindow({
    parent: mainWindow ?? undefined,
    modal: Boolean(mainWindow),
    title: 'Dispositivos de caja',
    width: 720,
    height: 580,
    minWidth: 520,
    minHeight: 420,
    backgroundColor: '#f3f0f4',
    frame: false,
    icon: icon || undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      devTools: isDev,
    },
  })
  wireWindowState(devicesWindow)

  if (isDev) {
    devicesWindow.loadURL('http://127.0.0.1:5173/#devices')
  } else {
    try {
      devicesWindow.loadFile(path.join(__dirname, '../dist/index.html'), { hash: 'devices' })
    } catch {
      const u = pathToFileURL(path.join(__dirname, '../dist/index.html')).href + '#devices'
      devicesWindow.loadURL(u)
    }
  }

  devicesWindow.on('closed', () => {
    devicesWindow = null
  })
}

function createPdvWindow() {
  if (pdvWindow && !pdvWindow.isDestroyed()) {
    pdvWindow.focus()
    return pdvWindow
  }

  const icon = resolveAppIconPath()
  const darwin = process.platform === 'darwin'

  /** @type {import('electron').BrowserWindowConstructorOptions} */
  const opts = {
    title: 'Punto de venta',
    width: 1024,
    height: 680,
    minWidth: 800,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    frame: darwin,
    icon: icon || undefined,
    parent: undefined,
    modal: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      devTools: isDev,
      webSecurity: false,
    },
  }

  if (darwin) {
    opts.backgroundColor = '#171717'
  } else {
    opts.frame = false
    opts.transparent = false
    opts.backgroundColor = '#00000000'
    opts.backgroundMaterial = 'mica'
  }

  pdvWindow = new BrowserWindow(opts)
  wireWindowState(pdvWindow)

  pdvWindow.once('ready-to-show', () => {
    if (!pdvWindow || pdvWindow.isDestroyed()) return
    // Si la pantalla es relativamente pequeña, maximizar
    const { screen } = require('electron')
    const primaryDisplay = screen.getPrimaryDisplay()
    const { width, height } = primaryDisplay.workAreaSize
    if (width <= 1366 || height <= 768) {
      pdvWindow.maximize()
    } else {
      pdvWindow.show()
    }
  })

  if (isDev) {
    pdvWindow.loadURL('http://127.0.0.1:5173/#pdv').catch(() => {})
  } else {
    try {
      pdvWindow.loadFile(path.join(__dirname, '../dist/index.html'), { hash: 'pdv' })
    } catch {
      const u = pathToFileURL(path.join(__dirname, '../dist/index.html')).href + '#pdv'
      pdvWindow.loadURL(u)
    }
  }

  pdvWindow.on('closed', () => {
    pdvWindow = null
  })

  return pdvWindow
}


/** Avisá a todas las ventanas para que refresquen datos de cuentas vinculadas al POS. */
function broadcastCuentasDataChanged() {
  for (const w of BrowserWindow.getAllWindows()) {
    try {
      if (!w.isDestroyed()) w.webContents.send('bazar:cuentas-changed')
    } catch {
      /* noop */
    }
  }
}

function registerIpc() {
  ipcMain.handle('db:getProducts', (_, filters) => db.getProducts(filters))
  ipcMain.handle('db:checkRequiredTagsForProduct', (_, map) => db.checkRequiredTagsForProduct(map))
  ipcMain.handle('db:addProduct', (_, product) => db.addProduct(product))
  ipcMain.handle('db:updateProduct', (_, product) => db.updateProduct(product))
  ipcMain.handle('db:deleteProduct', (_, id) => db.deleteProduct(id))
  ipcMain.handle('db:searchProducts', (_, query) => db.searchProducts(query))
  ipcMain.handle('db:nextCodigoMsr', () => db.nextCodigoMsr())
  ipcMain.handle('db:getMonserratDbPath', () => db.getMonserratDbPath())
  ipcMain.handle('db:resetToFactorySeed', () => {
    try {
      return db.resetMonserratDatabaseToSeed()
    } catch (e) {
      return { ok: false, message: String(e?.message || e) }
    }
  })
  ipcMain.handle('db:getTagGroupsForProduct', () => db.getTagGroupsForProduct())
  ipcMain.handle('db:getProductById', (_, id) => db.getProductById(id))
  ipcMain.handle('db:getProductByCodigo', (_, codigo) => db.getProductByCodigo(codigo))
  ipcMain.handle('db:getInventoryList', (_, filters) => db.getInventoryList(filters ?? {}))
  ipcMain.handle('db:getWelcomeSnapshot', () => db.getWelcomeSnapshot())
  /* Cuaderno como DATOS (no como vista): el alta rápida lee los grupos de
   * tags de la clienta y crea grupos/opciones nuevos cuando ella escribe
   * un atributo desconocido. La vista Cuaderno dedicada fue retirada, pero
   * estos tres canales siguen siendo el sistema de aprendizaje del alta —
   * sin ellos el clasificador solo conoce el diccionario semilla y nunca
   * recuerda lo que la clienta enseñó. */
  ipcMain.handle('db:getCuadernoTagGroups', () => db.getCuadernoTagGroups())
  ipcMain.handle('db:cuadernoAddTagGroup', (_, payload) => db.cuadernoAddTagGroup(payload))
  ipcMain.handle('db:cuadernoAddTagOption', (_, payload) => db.cuadernoAddTagOption(payload))
  ipcMain.handle('productImage:pick', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    return pickProductImage(win, resolveDataRootDir())
  })
  ipcMain.handle('tagIconImage:pick', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    return pickTagIconImage(win, resolveDataRootDir())
  })
  ipcMain.handle('clientImage:pick', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    return pickClientImage(win, resolveDataRootDir())
  })
  ipcMain.handle('clientImage:save', (event, srcPath) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    return saveClientImage(win, srcPath)
  })

  const safeReportFilename = (raw, fallback, ext) => {
    let name = String(raw || fallback || `reporte.${ext}`)
      .replace(/[\\/:*?"<>|]/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
    if (!name.toLowerCase().endsWith(`.${ext}`)) name += `.${ext}`
    return name || `reporte.${ext}`
  }

  const uniqueReportPath = (filename) => {
    const parsed = path.parse(filename)
    const dir = app.getPath('downloads')
    let candidate = path.join(dir, filename)
    let i = 2
    while (fs.existsSync(candidate)) {
      candidate = path.join(dir, `${parsed.name}-${i}${parsed.ext}`)
      i += 1
    }
    return candidate
  }

  /* Exporta un reporte a PDF: renderiza el HTML en una ventana oculta y usa
   * webContents.printToPDF. El guardado siempre arranca en Descargas para que
   * la dueña encuentre el archivo sin adivinar dónde quedó. */
  ipcMain.handle('reportes:exportarPdf', async (event, payload) => {
    const html = String(payload?.html || '')
    if (!html) return { ok: false, message: 'Sin contenido para exportar.' }
    const defaultName = safeReportFilename(payload?.filename, 'reporte.pdf', 'pdf')
    const parent = BrowserWindow.fromWebContents(event.sender)
    const tempHtmlPath = path.join(os.tmpdir(), `mlb_reporte_${Date.now()}_${Math.random().toString(16).slice(2)}.html`)
    const win = new BrowserWindow({
      show: false,
      width: 820,
      height: 1160,
      webPreferences: { sandbox: true, nodeIntegration: false, contextIsolation: true },
    })
    try {
      fs.writeFileSync(tempHtmlPath, html, 'utf8')
      await win.loadFile(tempHtmlPath)
      await new Promise((r) => setTimeout(r, 150)) // respiro para layout/fuentes
      const pdf = await win.webContents.printToPDF({
        pageSize: 'Letter',
        printBackground: true,
        preferCSSPageSize: true,
        margins: { top: 0.45, bottom: 0.55, left: 0.4, right: 0.4 },
        displayHeaderFooter: true,
        headerTemplate: '<div></div>',
        footerTemplate:
          '<div style="width:100%; font-size:7px; color:#687386; padding:0 10mm; display:flex; justify-content:space-between; font-family:Inter,Segoe UI,Arial,sans-serif;">' +
          '<span>My Little Bazar</span>' +
          '<span>Pagina <span class="pageNumber"></span> de <span class="totalPages"></span></span>' +
          '</div>',
      })
      if (payload?.direct === true) {
        const filePath = uniqueReportPath(defaultName)
        fs.writeFileSync(filePath, pdf)
        try {
          shell.showItemInFolder(filePath)
        } catch {
          /* noop */
        }
        return { ok: true, path: filePath }
      }
      const res = await dialog.showSaveDialog(parent ?? undefined, {
        title: 'Guardar reporte',
        defaultPath: path.join(app.getPath('downloads'), defaultName),
        buttonLabel: 'Guardar PDF',
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      })
      if (res.canceled || !res.filePath) return { ok: false, cancelled: true }
      fs.writeFileSync(res.filePath, pdf)
      void shell.openPath(res.filePath)
      return { ok: true, path: res.filePath }
    } catch (e) {
      return { ok: false, message: String(e?.message || e) }
    } finally {
      if (!win.isDestroyed()) win.destroy()
      try {
        fs.unlinkSync(tempHtmlPath)
      } catch {
        /* noop */
      }
    }
  })

  ipcMain.handle('reportes:exportarCsv', async (event, payload) => {
    const csv = String(payload?.csv || '')
    if (!csv) return { ok: false, message: 'Sin contenido para exportar.' }
    const defaultName = safeReportFilename(payload?.filename, 'reporte.csv', 'csv')
    const parent = BrowserWindow.fromWebContents(event.sender)
    try {
      if (payload?.direct === true) {
        const filePath = uniqueReportPath(defaultName)
        fs.writeFileSync(filePath, csv.startsWith('\uFEFF') ? csv : `\uFEFF${csv}`, 'utf8')
        try {
          shell.showItemInFolder(filePath)
        } catch {
          /* noop */
        }
        return { ok: true, path: filePath }
      }
      const res = await dialog.showSaveDialog(parent ?? undefined, {
        title: 'Guardar reporte CSV',
        defaultPath: path.join(app.getPath('downloads'), defaultName),
        buttonLabel: 'Guardar CSV',
        filters: [{ name: 'CSV', extensions: ['csv'] }],
      })
      if (res.canceled || !res.filePath) return { ok: false, cancelled: true }
      fs.writeFileSync(res.filePath, csv.startsWith('\uFEFF') ? csv : `\uFEFF${csv}`, 'utf8')
      try {
        shell.showItemInFolder(res.filePath)
      } catch {
        /* noop */
      }
      return { ok: true, path: res.filePath }
    } catch (e) {
      return { ok: false, message: String(e?.message || e) }
    }
  })
  ipcMain.handle('db:getVentaItemPorCodigoDevolucion', (_, codigo) => {
    return db.getVentaItemPorCodigoDevolucion(codigo)
  })
  ipcMain.handle('db:registrarDevolucionRapida', (_, payload) => {
    const result = db.registrarDevolucionRapida(payload)
    if (result.ok) {
      broadcastCuentasDataChanged()
    }
    return result
  })
  ipcMain.handle('db:getTagLabelsForMap', (_, map) => db.getTagLabelsForMap(map))
  ipcMain.handle('db:suggestNombreFromTags', (_, payload) => db.suggestNombreFromTags(payload))
  ipcMain.handle('db:getNombreEtiquetaDesdeTags', (_, payload) => db.nombreEtiquetaDesdeTagsPayload(payload))
  ipcMain.handle('db:suggestPrecioFromTags', (_, payload) => db.suggestPrecioFromTags(payload))
  ipcMain.handle('db:getReferenceRows', (_, payload) => db.getReferenceRows(payload))
  ipcMain.handle('db:getReferenceSnapshot', (_, payload) => db.getReferenceSnapshot(payload))
  ipcMain.handle('db:getSales', (_, filters) => db.getSales(filters))
  ipcMain.handle('db:getVentaDetalle', (_, ventaId) => db.getVentaDetalle(ventaId))
  ipcMain.handle('db:addSale', (_, sale) => {
    const result = db.addSale(sale)
    if (result?.ok) {
      broadcastCuentasDataChanged()
    }
    return result
  })
  ipcMain.handle('db:findIntercambiableByCodigo', (_, payload) => {
    const st = settingsStore?.getAll?.() ?? {}
    return db.findIntercambiableByCodigo({
      codigo: payload?.codigo,
      limiteDias: payload?.limiteDias ?? st.intercambioDiasMaximos ?? 30,
    })
  })
  ipcMain.handle('db:searchIntercambiableCandidates', (_, payload) => {
    const st = settingsStore?.getAll?.() ?? {}
    return db.searchIntercambiableCandidates({
      query: payload?.query,
      limiteDias: payload?.limiteDias ?? st.intercambioDiasMaximos ?? 30,
      filterMode: payload?.filterMode || 'todos',
    })
  })
  ipcMain.handle('db:addIntercambio', (_, payload) => {
    const st = settingsStore?.getAll?.() ?? {}
    const out = db.addIntercambio({
      ...(payload || {}),
      limiteDias: payload?.limiteDias ?? st.intercambioDiasMaximos ?? 30,
    })
    broadcastCuentasDataChanged()
    return out
  })
  ipcMain.handle('db:listBanquetaSalidas', () => db.listBanquetaSalidas())
  ipcMain.handle('db:getActiveBanquetaSalida', () => db.getActiveBanquetaSalida())
  ipcMain.handle('db:createBanquetaSalida', (_, payload) => {
    const out = db.createBanquetaSalida(payload ?? {})
    broadcastCuentasDataChanged()
    return out
  })
  ipcMain.handle('db:getBanquetaSalidaDetail', (_, id) => db.getBanquetaSalidaDetail(id))
  ipcMain.handle('db:activateBanquetaSalida', (_, id) => {
    const out = db.activateBanquetaSalida(id)
    broadcastCuentasDataChanged()
    return out
  })
  ipcMain.handle('db:scanBanquetaSalidaResult', (_, payload) => {
    const out = db.scanBanquetaSalidaResult(payload ?? {})
    broadcastCuentasDataChanged()
    return out
  })
  ipcMain.handle('db:listStaleForBanqueta', (_, opts) => db.listStaleForBanqueta(opts ?? {}))
  ipcMain.handle('db:addProductToBanquetaSalida', (_, p) => {
    const out = db.addProductToBanquetaSalida(p?.salidaId, p?.codigo, p?.cantidad ?? 1)
    broadcastCuentasDataChanged()
    return out
  })
  ipcMain.handle('db:updateBanquetaSalida', (_, p) => db.updateBanquetaSalida(p ?? {}))
  ipcMain.handle('db:removeBanquetaSalidaItem', (_, itemId) => {
    const out = db.removeBanquetaSalidaItem(itemId)
    broadcastCuentasDataChanged()
    return out
  })
  ipcMain.handle('db:removeBanquetaSalidaItemsBulk', (_, itemIds) => {
    const out = db.removeBanquetaSalidaItemsBulk(itemIds)
    broadcastCuentasDataChanged()
    return out
  })
  ipcMain.handle('db:reorderBanquetaSalidaItems', (_, p) => db.reorderBanquetaSalidaItems(p?.salidaId, p?.orderedItemIds))
  ipcMain.handle('db:setBanquetaSalidaItemResult', (_, p) => {
    const out = db.setBanquetaSalidaItemResult(p ?? {})
    broadcastCuentasDataChanged()
    return out
  })
  ipcMain.handle('db:closeBanquetaSalida', (_, id) => {
    const out = db.closeBanquetaSalida(id)
    broadcastCuentasDataChanged()
    return out
  })
  ipcMain.handle('db:deleteBanquetaSalida', (_, id) => {
    const out = db.deleteBanquetaSalida(id)
    broadcastCuentasDataChanged()
    return out
  })
  ipcMain.handle('db:reactivarProductoBanqueta', (_, p) => {
    const out = db.reactivarProductoBanqueta(p ?? {})
    broadcastCuentasDataChanged()
    return out
  })
  ipcMain.handle('banqueta:printSheet', async (event, payload) => {
    const detail = payload?.detail
    if (!detail?.salida) return { ok: false, message: 'Sin salida para imprimir.' }
    const { writeBanquetaSheetPdf } = require('./banqueta-sheet-pdf.cjs')
    const name = `banqueta_${detail.salida.id || 'salida'}.pdf`
    const parent = BrowserWindow.fromWebContents(event.sender)
    const res = await dialog.showSaveDialog(parent ?? undefined, {
      title: 'Guardar hoja de banqueta',
      defaultPath: path.join(app.getPath('downloads'), name),
      buttonLabel: 'Guardar PDF',
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    })
    if (res.canceled || !res.filePath) return { ok: false, cancelled: true }
    try {
      await writeBanquetaSheetPdf(res.filePath, detail)
      void shell.openPath(res.filePath)
      return { ok: true, path: res.filePath }
    } catch (e) {
      return { ok: false, message: String(e?.message || e) }
    }
  })
  ipcMain.handle('db:previewPriceAdjust', (_, payload) => db.previewPriceAdjust(payload))
  ipcMain.handle('db:applyPriceAdjust', (_, payload) => db.applyPriceAdjust(payload))
  ipcMain.handle('db:getReferencePatternStats', (_, payload) => db.getReferencePatternStats(payload))
    ipcMain.handle('db:listInvPricingRules', () => db.listInvPricingRules())
    ipcMain.handle('db:listInvRuleCustomFieldsFlat', () => db.listInvRuleCustomFieldsFlat())
    ipcMain.handle('db:getInvPricingRule', (_, p) => db.getInvPricingRule(p))
    ipcMain.handle('db:findApplicableInvRulePrice', (_, p) => db.findApplicableInvRulePrice(p))
    ipcMain.handle('db:detectInvRuleCandidate', (_, p) => db.detectInvRuleCandidate(p))
    ipcMain.handle('db:appendInvRuleRow', (_, p) => db.appendInvRuleRow(p))
    ipcMain.handle('db:countSimilarProducts', (_, p) => db.countSimilarProducts(p))
    ipcMain.handle('db:updateInvRuleRowPrice', (_, p) => db.updateInvRuleRowPrice(p))
    ipcMain.handle('db:upsertInvPricingRule', (_, p) => db.upsertInvPricingRule(p))
    ipcMain.handle('db:deleteInvPricingRule', (_, p) => db.deleteInvPricingRule(p))

    /* ── Cuaderno (vista completa de tags) — 9 handlers nuevos.
     * cuadernoAddTagGroup y cuadernoAddTagOption ya estaban registrados arriba
     * (los usa el alta rápida), así que NO se duplican acá. */
    ipcMain.handle('db:getTagCatalogForManager', () => db.getTagCatalogForManager())
    ipcMain.handle('db:countProductsByTagOption', (_, id) => db.countProductsByTagOption(id))
    ipcMain.handle('db:cuadernoBulkAddTagOptions', (_, p) => db.cuadernoBulkAddTagOptions(p))
    ipcMain.handle('db:cuadernoRenameTagGroup', (_, p) => db.cuadernoRenameTagGroup(p))
    ipcMain.handle('db:cuadernoRenameTagOption', (_, p) => db.cuadernoRenameTagOption(p))
    ipcMain.handle('db:cuadernoDeleteTagGroup', (_, p) => db.cuadernoDeleteTagGroup(p))
    ipcMain.handle('db:cuadernoDeleteTagOption', (_, p) => db.cuadernoDeleteTagOption(p))
    ipcMain.handle('db:cuadernoMoveTagOption', (_, p) => db.cuadernoMoveTagOption(p))
    ipcMain.handle('db:cuadernoSetTagOptionActive', (_, p) => db.cuadernoSetTagOptionActive(p))
    ipcMain.handle('db:cuadernoReorderTagGroups', (_, p) => db.cuadernoReorderTagGroups(p))

  ipcMain.handle('settings:get', () => settingsStore?.getAll() ?? {})
  ipcMain.handle('settings:set', (_, patch) => {
    const prev = settingsStore?.getAll?.() ?? {}
    const next = settingsStore?.merge(patch ?? {}) ?? {}
    // Registrar cambios de módulos habilitados en el ledger (capa cognitiva)
    try {
      if (Array.isArray(patch?.enabledModules)) {
        const prevSet = new Set(Array.isArray(prev?.enabledModules) ? prev.enabledModules : [])
        const nextSet = new Set(patch.enabledModules)
        for (const id of nextSet) {
          if (!prevSet.has(id)) {
            db.recordEvent({
              type: 'module.enabled',
              actor: 'user',
              scope: 'module',
              source: 'shell',
              payload: { moduleId: id },
            })
          }
        }
        for (const id of prevSet) {
          if (!nextSet.has(id)) {
            db.recordEvent({
              type: 'module.disabled',
              actor: 'user',
              scope: 'module',
              source: 'shell',
              payload: { moduleId: id },
            })
          }
        }
      }
    } catch { /* el ledger nunca rompe settings */ }
    return next
  })

  /* Saldos — libreta de cuentas de clientas (persistencia real) -------- */
  const saldosHandler = (fn) => async (_, payload) => {
    try {
      return fn(db.getDb(), payload)
    } catch (e) {
      return { ok: false, message: String(e?.message || e) }
    }
  }
  const saldosMutationHandler = (fn) => async (_, payload) => {
    try {
      const result = fn(db.getDb(), payload)
      if (!(result && result.ok === false)) broadcastCuentasDataChanged()
      return result
    } catch (e) {
      return { ok: false, message: String(e?.message || e) }
    }
  }
  ipcMain.handle('saldos:listCuentas', saldosHandler((d, opts) => saldosStore.listCuentas(d, opts ?? {})))
  ipcMain.handle('saldos:buscarParecidos', saldosHandler((d, p) => saldosStore.buscarParecidos(d, p ?? {})))
  ipcMain.handle('saldos:crearCliente', saldosMutationHandler((d, p) => saldosStore.crearCliente(d, p ?? {})))
  ipcMain.handle('saldos:actualizarCliente', saldosMutationHandler((d, p) => saldosStore.actualizarCliente(d, p ?? {})))
  ipcMain.handle('saldos:setArchivada', saldosMutationHandler((d, p) => saldosStore.setArchivada(d, p?.clienteId, p?.archivada)))
  ipcMain.handle('saldos:eliminarCliente', saldosMutationHandler((d, p) => saldosStore.eliminarCliente(d, p?.clienteId)))
  ipcMain.handle('saldos:registrarMovimientos', saldosMutationHandler((d, p) => saldosStore.registrarMovimientos(d, p?.clienteId, p?.movimientos)))
  ipcMain.handle('saldos:anularMovimiento', saldosMutationHandler((d, p) => saldosStore.anularMovimiento(d, p?.movimientoId, p?.motivo)))
  /* Abrir enlace externo (WhatsApp manual de Saldos). Solo http/https. */
  ipcMain.handle('shell:openExternal', async (_, rawUrl) => {
    try {
      const u = new URL(String(rawUrl || ''))
      if (u.protocol !== 'https:' && u.protocol !== 'http:') return { ok: false, message: 'Enlace no permitido.' }
      await shell.openExternal(u.href)
      return { ok: true }
    } catch (e) {
      return { ok: false, message: String(e?.message || e) }
    }
  })

  ipcMain.handle('saldos:crearRecordatorio', saldosMutationHandler((d, p) => saldosStore.crearRecordatorio(d, p ?? {})))
  ipcMain.handle('saldos:completarRecordatorio', saldosMutationHandler((d, p) => saldosStore.completarRecordatorio(d, p?.recordatorioId, p?.hecho)))
  ipcMain.handle('saldos:eliminarRecordatorio', saldosMutationHandler((d, p) => saldosStore.eliminarRecordatorio(d, p?.recordatorioId)))

  /* Foto de identificación: el usuario elige una imagen y la COPIAMOS a una
   * carpeta privada de la app (nunca se sube a internet, spec caso #39).
   * Devuelve la ruta interna para guardar en el cliente. */
  ipcMain.handle('saldos:elegirImagenId', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const r = await dialog.showOpenDialog(win ?? undefined, {
      title: 'Foto de la identificación',
      buttonLabel: 'Usar esta imagen',
      properties: ['openFile'],
      filters: [{ name: 'Imágenes', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'] }],
    })
    if (r.canceled || !r.filePaths?.length) return { cancelled: true }
    try {
      const src = r.filePaths[0]
      const ext = path.extname(src).toLowerCase() || '.jpg'
      const dir = path.join(app.getPath('userData'), 'saldos-identificaciones')
      fs.mkdirSync(dir, { recursive: true })
      const dest = path.join(dir, `id_${Date.now()}_${Math.floor(Math.random() * 1e6)}${ext}`)
      fs.copyFileSync(src, dest)
      return { ok: true, cancelled: false, path: dest }
    } catch (e) {
      return { ok: false, message: String(e?.message || e) }
    }
  })

  /* Ledger — capa cognitiva (event log append-only) -------------------- */
  ipcMain.handle('ledger:query', (_, opts) => db.ledgerQuery(opts ?? {}))
  ipcMain.handle('ledger:stats', () => db.ledgerStats())
  ipcMain.handle('ledger:append', (_, evt) => {
    // Sólo permitimos appends provenientes del UI con actor explícito.
    // El backend nunca aceptará un append con actor=system desde el renderer.
    const safeEvt = {
      ...(evt || {}),
      actor: evt?.actor === 'agent' ? 'agent' : 'user',
    }
    return db.recordEvent(safeEvt)
  })

  /**
   * Vista previa del logo en el renderer (data URL). Si `rawPath` está vacío o el archivo
   * no existe, se usa `public/branding/logo.jpg` (mismo recurso que el avatar por defecto).
   */
  ipcMain.handle('assets:logoDataUrl', async (_, rawPath) => {
    const user = workspacePathToFs(String(rawPath ?? '').trim())
    let p = ''
    if (user) {
      try {
        if (fs.existsSync(user) && fs.statSync(user).isFile()) p = user
      } catch {
        /* noop */
      }
    }
    if (!p) p = resolveBrandingLogoFsPath()
    if (!p) return { ok: false, message: 'Sin imagen de logo (ni avatar ni logo por defecto)' }
    try {
      if (!fs.existsSync(p) || !fs.statSync(p).isFile()) return { ok: false, message: 'Archivo no encontrado' }
      const ext = path.extname(p).toLowerCase()
      if (!['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'].includes(ext)) {
        return { ok: false, message: 'Formato no soportado para el logo' }
      }
      const img = nativeImage.createFromPath(p)
      if (img.isEmpty()) return { ok: false, message: 'No se pudo leer la imagen' }
      const st = settingsStore?.getAll?.() ?? {}
      const styled = applyLabelLogoStyle(img, {
        style: st.labelLogoStyle,
        warmth: st.labelLogoWarmth,
        contrast: st.labelLogoContrast,
        saturation: st.labelLogoSaturation,
      })
      const png = styled.toPNG()
      const buf = Buffer.isBuffer(png) ? png : Buffer.from(png)
      return { ok: true, dataUrl: `data:image/png;base64,${buf.toString('base64')}` }
    } catch (e) {
      return { ok: false, message: String(e?.message || e) }
    }
  })

  /** Imagen arbitraria (PNG/JPEG/WebP…) a data URL, sin estilo de logo térmico. Vacío → error (sin fallback). */
  ipcMain.handle('assets:imageFileDataUrl', async (_, rawPath) => {
    const user = workspacePathToFs(String(rawPath ?? '').trim())
    if (!user) return { ok: false, message: 'Sin ruta de imagen' }
    try {
      if (!fs.existsSync(user) || !fs.statSync(user).isFile()) return { ok: false, message: 'Archivo no encontrado' }
      const ext = path.extname(user).toLowerCase()
      if (!['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'].includes(ext)) {
        return { ok: false, message: 'Formato no soportado' }
      }
      const img = nativeImage.createFromPath(user)
      if (img.isEmpty()) return { ok: false, message: 'No se pudo leer la imagen' }
      const png = img.toPNG()
      const buf = Buffer.isBuffer(png) ? png : Buffer.from(png)
      return { ok: true, dataUrl: `data:image/png;base64,${buf.toString('base64')}` }
    } catch (e) {
      return { ok: false, message: String(e?.message || e) }
    }
  })

  ipcMain.handle('settings:pickLabelPdfFolder', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const r = await dialog.showOpenDialog(win ?? undefined, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Carpeta para guardar PDFs de etiqueta',
      buttonLabel: 'Usar esta carpeta',
    })
    if (r.canceled || !r.filePaths?.length) return { cancelled: true }
    return { cancelled: false, path: r.filePaths[0] }
  })



  /* Plantillas de etiqueta --------------------------------------------- */
  ipcMain.handle('labels:list', () => labelTemplatesStore?.list() ?? { activeId: null, templates: [] })
  ipcMain.handle('labels:getActive', () => labelTemplatesStore?.getActive() ?? null)
  ipcMain.handle('labels:upsert', (_, tpl) => labelTemplatesStore?.upsert(tpl))
  ipcMain.handle('labels:remove', (_, id) => labelTemplatesStore?.remove(String(id)))
  ipcMain.handle('labels:setActive', (_, id) => labelTemplatesStore?.setActive(String(id)))
  ipcMain.handle('labels:duplicate', (_, id) => labelTemplatesStore?.duplicate(String(id)))
  ipcMain.handle('labels:restoreDefault', () => labelTemplatesStore?.restoreDefault())

  ipcMain.handle('printers:list', () => printers.listPrinterNames())
  ipcMain.handle('printers:diagnostic', () => printers.diagnosticLines().join('\n'))

  ipcMain.handle('printers:testPrint', async (_, payload) => {
    const requested = String(payload?.printerName ?? '').trim()
    if (requested && !printers.printerExists(requested)) {
      return {
        ok: false,
        message: `La impresora «${requested}» no está en la lista actual del sistema.`,
      }
    }

    const defaultN = printers.getDefaultPrinterName()
    const effective = requested || defaultN
    const resolvedLabel = effective || defaultN || '(predeterminada)'
    const when = new Date().toLocaleString('es-MX', { hour12: false })

    if (printTest.isVirtualPdf(effective)) {
      const safeTs = new Date().toISOString().replace(/[^\d]/g, '').slice(0, 14)
      const outPath = path.join(os.tmpdir(), `prueba_impresion_${safeTs}.pdf`)
      const fs = require('fs')
      try {
        await printTest.writeTestPdf(outPath, resolvedLabel, when)
        await printPdf.printPdfToQueue(outPath, effective)
        return {
          ok: true,
          message: `Prueba enviada a la cola de «${resolvedLabel}» (PDF).`,
        }
      } catch (e) {
        return { ok: false, message: `No se pudo imprimir la prueba PDF: ${e.message || e}` }
      } finally {
        try {
          fs.unlinkSync(outPath)
        } catch {
          /* ignore */
        }
      }
    }

    return printTest.sendPhysicalTestPrint(requested || undefined)
  })

  ipcMain.handle('printers:printLabel', async (_, payload) => {
    const { codigo, nombre, precio, productoId, copies } = payload || {}
    const numCopies = Math.max(1, Math.min(99, Math.floor(Number(copies) || 1)))
    const codigoTrim = String(codigo || '').trim()
    if (!codigoTrim) return { ok: false, message: 'Falta el código del producto.' }

    const precioStr = Number.isFinite(Number(precio))
      ? Math.abs(Number(precio) - Math.round(Number(precio))) < 1e-9
        ? `$${Math.round(Number(precio))}`
        : `$${Number(precio).toFixed(2)}`
      : '$0'

    const outDir = resolveLabelPdfDirectory()
    try {
      fs.mkdirSync(outDir, { recursive: true })
    } catch {
      /* ignore */
    }

    const stem = safeEtiquetaFileStem(codigoTrim, nombre)
    let outPath = path.join(outDir, `${stem}.pdf`)
    let suffix = 0
    while (fs.existsSync(outPath) && suffix < 200) {
      suffix += 1
      outPath = path.join(outDir, `${stem}_${suffix}.pdf`)
    }

    const settings = settingsStore?.getAll?.() || {}
    const template = labelTemplatesStore?.getActive?.() || null
    const propertyMaps = buildLabelPropertyMaps({ productoId, codigo: codigoTrim })
    const data = {
      empresa: String(settings.workspaceDisplayName || 'Mi bazar'),
      codigo: codigoTrim,
      nombre: String(nombre || '').trim() || '—',
      precio: precioStr,
      logoPath: effectiveWorkspaceLogoFsPath(settings),
      labelLogoStyle: settings.labelLogoStyle || 'thermal',
      labelLogoWarmth: Number.isFinite(Number(settings.labelLogoWarmth)) ? Number(settings.labelLogoWarmth) : 0,
      labelLogoContrast: Number.isFinite(Number(settings.labelLogoContrast)) ? Number(settings.labelLogoContrast) : 100,
      labelLogoSaturation: Number.isFinite(Number(settings.labelLogoSaturation))
        ? Number(settings.labelLogoSaturation)
        : 100,
      propertiesByTagGroupId: propertyMaps.propertiesByTagGroupId,
      propertiesByRuleFieldId: propertyMaps.propertiesByRuleFieldId,
    }

    let labelMeta = { barcodeOk: false, barcodeNote: '' }
    try {
      if (template) {
        labelMeta = await labelPdfRender.renderLabelPdf(outPath, template, data)
      } else {
        labelMeta = await printTest.writeLabelPdf(outPath, {
          empresa: data.empresa, codigo: data.codigo, nombre: data.nombre, precio: data.precio,
        })
      }
    } catch (e) {
      return { ok: false, message: String(e?.message || e) }
    }

    let size = 0
    try {
      size = fs.statSync(outPath).size
    } catch {
      /* ignore */
    }
    if (size < 64) {
      return {
        ok: false,
        message: `El PDF no se pudo escribir en la carpeta configurada (archivo vacío o bloqueado): ${outDir}`,
      }
    }

    const base = path.basename(outPath)
    const bcNote = String(labelMeta?.barcodeNote || '').trim()
    const bcHint =
      labelMeta?.barcodeOk === false && bcNote ? ` · Código de barras: ${bcNote}` : ''

    const openPdfInViewer = () => {
      setImmediate(() => {
        void (async () => {
          try {
            let openErr = await shell.openPath(outPath)
            if (openErr && String(openErr).length > 0) {
              try {
                await shell.openExternal(pathToFileURL(outPath).href)
                openErr = ''
              } catch {
                /* ignore */
              }
            }
            if (openErr && String(openErr).length > 0 && process.platform === 'win32') {
              try {
                await new Promise((resolve, reject) => {
                  execFile(
                    'cmd.exe',
                    ['/c', 'start', '""', outPath],
                    { windowsHide: true },
                    (err) => (err ? reject(err) : resolve()),
                  )
                })
                openErr = ''
              } catch {
                /* ignore */
              }
            }
            if (openErr && String(openErr).length > 0) {
              try {
                shell.showItemInFolder(outPath)
              } catch {
                /* ignore */
              }
            }
          } catch (e) {
            console.error('[printLabel] abrir PDF en segundo plano:', e)
          }
        })()
      })
    }

    const labelsPrinter = String(settings.devicePrinterLabelsName || '').trim()
    const defaultPrinter = printers.getDefaultPrinterName()
    const targetPrinter = labelsPrinter || defaultPrinter
    const printerOk = targetPrinter && printers.printerExists(targetPrinter)
    const isVirtual = printTest.isVirtualPdf(targetPrinter)

    if (printerOk && !isVirtual) {
      try {
        await printPdf.printPdfToQueue(outPath, targetPrinter, numCopies)
        return {
          ok: true,
          message: `${numCopies > 1 ? `${numCopies} etiquetas enviadas` : 'Etiqueta enviada'} a «${targetPrinter}» (${base}).${bcHint}`,
          path: outPath,
          barcodeOk: labelMeta?.barcodeOk === true,
        }
      } catch (e) {
        console.error('[printLabel] spool falló, abriendo PDF como respaldo:', e)
        openPdfInViewer()
        return {
          ok: false,
          message: `No se pudo enviar a «${targetPrinter}»: ${String(e?.message || e)}. Se abrió el PDF como respaldo.${bcHint}`,
          path: outPath,
          barcodeOk: labelMeta?.barcodeOk === true,
        }
      }
    }

    openPdfInViewer()
    const reason = !targetPrinter
      ? 'No hay impresora de etiquetas configurada en Ajustes → Impresión.'
      : !printerOk
        ? `La impresora «${targetPrinter}» no está disponible en el sistema.`
        : `«${targetPrinter}» es una impresora virtual (PDF/XPS).`
    return {
      ok: true,
      message: `${reason} PDF guardado (${base}) en «${outDir}». Se abre el visor.${bcHint}`,
      path: outPath,
      barcodeOk: labelMeta?.barcodeOk === true,
    }
  })

  ipcMain.handle('printers:printTicket', async (_, payload) => {
    const ventaId = payload?.ventaId || '0000'
    const outDir = resolveLabelPdfDirectory()
    try {
      fs.mkdirSync(outDir, { recursive: true })
    } catch {
      /* ignore */
    }

    const outPath = path.join(outDir, `ticket_${ventaId}.pdf`)
    const settings = settingsStore?.getAll?.() || {}
    const enrichedPayload = {
      ...payload,
      empresa: payload.empresa || String(settings.workspaceDisplayName || 'MY LITTLE BAZAR'),
      ticketDesign: settings.ticketDesign || {},
    }

    try {
      await ticketPdfRender.renderTicketPdf(outPath, enrichedPayload)
    } catch (e) {
      return { ok: false, message: `No se pudo generar el ticket PDF: ${e.message || e}` }
    }

    const openPdfInViewer = () => {
      setImmediate(() => {
        void (async () => {
          try {
            let openErr = await shell.openPath(outPath)
            if (openErr && String(openErr).length > 0) {
              try {
                await shell.openExternal(pathToFileURL(outPath).href)
                openErr = ''
              } catch {
                /* ignore */
              }
            }
            if (openErr && String(openErr).length > 0 && process.platform === 'win32') {
              try {
                await new Promise((resolve, reject) => {
                  execFile(
                    'cmd.exe',
                    ['/c', 'start', '""', outPath],
                    { windowsHide: true },
                    (err) => (err ? reject(err) : resolve()),
                  )
                })
                openErr = ''
              } catch {
                /* ignore */
              }
            }
          } catch (e) {
            console.error('[printTicket] abrir PDF en segundo plano:', e)
          }
        })()
      })
    }

    const ticketsPrinter = String(settings.devicePrinterTicketsName || '').trim()
    const defaultPrinter = printers.getDefaultPrinterName()
    const targetPrinter = ticketsPrinter || defaultPrinter
    const printerOk = targetPrinter && printers.printerExists(targetPrinter)
    const isVirtual = printTest.isVirtualPdf(targetPrinter)

    if (printerOk && !isVirtual) {
      try {
        await printPdf.printPdfToQueue(outPath, targetPrinter, 1)
        return {
          ok: true,
          message: `Ticket enviado a la impresora «${targetPrinter}».`,
          path: outPath
        }
      } catch (e) {
        console.error('[printTicket] spool falló, abriendo PDF como respaldo:', e)
        openPdfInViewer()
        return {
          ok: false,
          message: `No se pudo enviar a «${targetPrinter}»: ${String(e?.message || e)}. Se abrió el PDF como respaldo.`,
          path: outPath
        }
      }
    }

    openPdfInViewer()
    const reason = !targetPrinter
      ? 'No hay impresora de tickets configurada en Ajustes → Impresión.'
      : !printerOk
        ? `La impresora «${targetPrinter}» no está disponible en el sistema.`
        : `«${targetPrinter}» es una impresora virtual (PDF/XPS).`
    
    const base = path.basename(outPath)
    return {
      ok: true,
      message: `${reason} PDF guardado (${base}) en «${outDir}». Se abre el visor.`,
      path: outPath
    }
  })

  ipcMain.handle('devices:open', () => {
    createDevicesWindow()
    return true
  })

  ipcMain.handle('window:openPdv', () => {
    createPdvWindow()
    return true
  })

  /**
   * Iguala la ventana principal al bloque del shell (motion div) para no dejar bandas del tema
   * fuera de la “cajita”. Solo ventana principal; ignora maximizado y modo welcome compacto.
   */
  ipcMain.handle('window:setShellSize', (event, payload) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win.isDestroyed()) return false
    if (!mainWindow || win.id !== mainWindow.id) return false
    if (win.isMaximized()) return false
    if (welcomeModeActive) return false

    const width = Number(payload?.width)
    const height = Number(payload?.height)
    if (!Number.isFinite(width) || !Number.isFinite(height)) return false
    const nw = Math.max(1, Math.round(width))
    const nh = Math.max(1, Math.round(height))

    try {
      const b = win.getBounds()
      const cx = b.x + b.width / 2
      const cy = b.y + b.height / 2
      win.setContentSize(nw, nh)
      const nb = win.getBounds()
      win.setPosition(Math.round(cx - nb.width / 2), Math.round(cy - nb.height / 2))
      return true
    } catch {
      return false
    }
  })

  /**
   * Ventana compacta tipo “modal” para la bienvenida (Rive + botón), centrada en el escritorio.
   * Al salir se restauran tamaño y límites previos.
   */
  ipcMain.handle('window:setWelcomeMode', (event, compact) => {
    const w = BrowserWindow.fromWebContents(event.sender)
    if (!w || w.isDestroyed()) return false
    try {
      if (compact) {
        welcomeModeActive = true
        if (preWelcomeBounds === null) {
          preWelcomeBounds = w.getBounds()
          preWelcomeMinSize = w.getMinimumSize()
        }
        w.setMinimumSize(500, 540)
        // Solo centrar/redimensionar si NO está maximizada
        if (!w.isMaximized()) {
          const wa = screen.getPrimaryDisplay().workArea
          const ww = 560
          const wh = 640
          w.setBounds({
            x: wa.x + Math.floor((wa.width - ww) / 2),
            y: wa.y + Math.floor((wa.height - wh) / 2),
            width: ww,
            height: wh,
          })
        }
      } else {
        welcomeModeActive = false
        w.setMaximizable(true)
        if (preWelcomeBounds) {
          const [mw, mh] = preWelcomeMinSize ?? [900, 600]
          w.setMinimumSize(mw, mh)
          // Si está maximizada, dejamos maximizada (no forzar bounds)
          if (!w.isMaximized()) {
            w.setBounds(preWelcomeBounds)
          }
          preWelcomeBounds = null
          preWelcomeMinSize = null
        }
      }
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('window:isMaximized', (event) => {
    const w = BrowserWindow.fromWebContents(event.sender)
    return w?.isMaximized() ?? false
  })
  ipcMain.handle('window:minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })
  ipcMain.handle('window:maximizeToggle', (event) => {
    const w = BrowserWindow.fromWebContents(event.sender)
    if (!w || w.isDestroyed()) return
    if (w.isMaximized()) w.unmaximize()
    else w.maximize()
  })
  ipcMain.handle('window:close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
  })
}

/**
 * Detecta qué módulos opcionales están en uso al arrancar y los activa
 * automáticamente. Solo corre la primera vez después de actualizar (la flag
 * `modulesAutoDetected` se setea para no repetir). Garantiza que un usuario
 * existente no pierda acceso a Banqueta solo porque actualizamos a la
 * arquitectura modular.
 */
app.whenReady().then(() => {
  settingsStore = createSettingsStore(app.getPath('userData'))
  labelTemplatesStore = createLabelTemplatesStore(app.getPath('userData'))
  db.initDatabase()
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
