const fs = require('fs')
const path = require('path')

const DEFAULTS = {
  /** system | light | dark — light-first (paper shell); el usuario puede fijar dark. */
  theme: 'light',
  devicePrinterLabelsName: '',
  devicePrinterTicketsName: '',
  ticketDesign: {
    paperWidthMm: 80,
    subtitle: 'Salditos Monserrat',
    footerText: 'Gracias por tu compra',
    showItemCodes: true,
    showCreditSignature: true,
  },
  /** classic | manga — estilo estructural de la pantalla principal */
  dashboardLayout: 'classic',
  /** cuaderno | patrones | off — paridad con `producto_prefs.py`; patrones = mediana inventario (más liviano que cuaderno) */
  altaAutoFillMode: 'patrones',
  altaAutofillPrecioCuaderno: true,
  altaAutofillPrecioPatrones: true,
  altaAutofillNombreDesdeTags: true,
  /** Si el código queda vacío en artículo nuevo, sugerir el siguiente MSR */
  altaAutofillCodigoMsrNuevo: true,
  /** Imprimir etiqueta automáticamente después de guardar un producto nuevo */
  printLabelAfterSave: false,
  /** Carpeta absoluta para PDFs de etiqueta; vacío = carpeta Descargas del sistema */
  labelPdfSavePath: '',
  /**
   * Nombre del bazar (workspace tipo Notion). Vacío al primer arranque
   * para forzar el flujo de onboarding que pregunta cómo se llama el bazar.
   */
  workspaceDisplayName: '',
  /** Ruta absoluta: avatar del espacio = logo de empresa en etiquetas (bloque «Logo empresa»). Vacío = logo por defecto en la barra. */
  workspaceLogoPath: '',
  /** Logo en PDF/vista previa: `thermal` = gris estilo térmica (por defecto), `original` = color del archivo. */
  labelLogoStyle: 'thermal',
  /** -30…30 en modo térmica: tinte más frío (negativo) o cálido/sepia (positivo). */
  labelLogoWarmth: 0,
  /** 70…130: contraste del logo en la etiqueta. */
  labelLogoContrast: 100,
  /** 0…200 en modo color: 100 = fiel al archivo, 0 = gris, >100 más vivo. */
  labelLogoSaturation: 100,
  /** Carpeta Banqueta en sidebar: expandida al estilo Zen/Python */
  navBanquetaFolderOpen: true,
  /** Barra lateral colapsada (legacy; migrar a sidebarHidden) */
  sidebarCollapsed: false,
  /** Barra lateral totalmente oculta (se muestra al pasar el ratón por el borde o con el botón) */
  sidebarHidden: false,
  /** Vidrio Raycast en sesión (gradiente + backdrop-filter). false = carril y pozo planos como antes */
  shellGlassEnabled: true,
  /**
   * Módulos activos en la "Tienda" de My Little Bazar. La usuaria decide
   * qué herramientas instala. Los core (`inicio`, `inventario`, `cuaderno`)
   * están SIEMPRE activos sin importar lo que diga este array.
   */
  enabledModules: ['inicio', 'inventario', 'cuaderno', 'pdv'],
  /** Marca interna: ya corrió la auto-detección de módulos en uso. */
  modulesAutoDetected: false,
  /** Política de intercambio: días en los que la cliente puede traer una prenda
   *  comprada y cambiarla por otra (mismo precio o pagando diferencia). */
  intercambioDiasMaximos: 30,
  /**
   * ── Onboarding (My Little Bazar v1) ────────────────────────────────
   * Bandera que decide si mostramos el flujo de bienvenida (nombre del
   * bazar + logo + plan) en vez del shell normal. El usuario lo termina
   * eligiendo un plan; ahí se setea en `true` y nunca más vuelve.
   */
  onboardingCompleted: false,
  /**
   * Plan elegido durante el onboarding. Determina qué módulos vienen
   * pre-instalados sin pasar por la tienda.
   *   - `free`     : PDV + Inventario.
   *   - `starter`  : free + Banqueta + Reportes + Backups CSV.
   *   - `pro`      : starter + Cubito IA + Editor de etiquetas + Intercambios + WhatsApp.
   *   - `null`     : todavía no eligió (onboarding pendiente).
   */
  selectedPlan: null,
}

/**
 * @param {string} userDataPath
 */
function createSettingsStore(userDataPath) {
  const file = path.join(userDataPath, 'bazar-settings.json')

  function read() {
    try {
      const raw = fs.readFileSync(file, 'utf8')
      const data = JSON.parse(raw)
      return { ...DEFAULTS, ...data }
    } catch {
      return { ...DEFAULTS }
    }
  }

  function write(data) {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8')
  }

  return {
    getAll() {
      return read()
    },
    /** @param {Partial<typeof DEFAULTS>} patch */
    merge(patch) {
      const next = { ...read(), ...patch }
      write(next)
      return next
    },
  }
}

module.exports = { createSettingsStore, DEFAULTS }
