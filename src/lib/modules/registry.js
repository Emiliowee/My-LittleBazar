/**
 * Module Registry — fuente única de manifests del producto.
 *
 * Cada módulo declara sus capacidades vía defineManifest(). Esto reemplaza
 * los antiguos `moduleRegistry.js` y `modulesCatalog.js` que vivían en
 * paralelo con definiciones duplicadas. Los archivos viejos ahora delegan
 * a este módulo (compat) hasta que se borren en una segunda pasada.
 *
 * Para preguntar "¿está activo X?" usá useEnabledModules(); este registry
 * es declaración, no estado.
 */

import { defineManifest } from './manifest.js'
import { EVENT_TYPES } from '@/lib/eventTypes.js'

/**
 * Mapeo accent → hex usado por ModuleCard. Single source para que la UI
 * no tenga colores regados. Si cambiás un accent, cambiá acá una vez.
 */
const ACCENT_HEX = {
  gray: '#9B9B9B',
  blue: '#5E5CE6',
  amber: '#FF9F0A',
  green: '#32D74B',
  rose: '#FF6363',
  orange: '#FF9F0A',
  purple: '#BF5AF2',
  teal: '#64D2FF',
  yellow: '#FFD60A',
}
export function accentToHex(accent) {
  return ACCENT_HEX[accent] ?? '#9B9B9B'
}

const MANIFESTS = [
  defineManifest({
    id: 'inicio',
    name: 'Inicio',
    tagline: 'Tu pantalla de bienvenida.',
    description:
      'Lanzador con omnibar, ventas del día, inventario disponible y últimos ingresos. ' +
      'Es la caja a la que el sistema siempre vuelve.',
    icon: 'Home',
    accent: 'gray',
    coreLevel: 'core',
    installable: false,
    capabilities: {
      reads: ['producto', 'venta'],
      writes: [],
      emits: [],
      consumes: [
        EVENT_TYPES.SALE_COMPLETED,
        EVENT_TYPES.PRODUCT_CREATED,
      ],
    },
  }),

  defineManifest({
    id: 'inventario',
    name: 'Inventario',
    tagline: 'Tu catálogo de prendas.',
    description:
      'Alta rápida en lenguaje natural ("AM 650 pantalón mezclilla"), búsqueda, ' +
      'filtros y etiquetas auto al guardar.',
    icon: 'Package',
    accent: 'blue',
    coreLevel: 'core',
    installable: false,
    capabilities: {
      reads: ['producto', 'tag_group', 'tag_option', 'inv_pricing_rule'],
      writes: ['producto', 'producto_tag'],
      emits: [
        EVENT_TYPES.PRODUCT_CREATED,
        EVENT_TYPES.PRODUCT_UPDATED,
        EVENT_TYPES.PRODUCT_DELETED,
        EVENT_TYPES.PRODUCT_PRICE_ADJUSTED,
        EVENT_TYPES.LABEL_PRINTED,
      ],
      consumes: [],
    },
  }),

  defineManifest({
    id: 'saldos',
    name: 'Saldos',
    tagline: 'Hojas de cuentas por cliente.',
    description:
      'Libreta digital para cargos, abonos, descuentos, ajustes y cargos por atraso. ' +
      'Nace separado del modulo viejo de creditos.',
    icon: 'WalletCards',
    accent: 'rose',
    coreLevel: 'core',
    installable: false,
    capabilities: {
      reads: ['saldo_cuenta', 'saldo_movimiento'],
      writes: ['saldo_cuenta', 'saldo_movimiento'],
      emits: [],
      consumes: [],
    },
  }),

  defineManifest({
    id: 'cuaderno',
    name: 'Cuaderno',
    tagline: 'La memoria visible del bazar.',
    description:
      'Tags estilo Notion, reglas de precio que aprenden de la historia y edición ' +
      'manual con drag & drop. NO es necesario para que el inventario funcione — ' +
      'el inventario ya aprende reglas por su cuenta — pero el Cuaderno hace visible ' +
      'esa memoria y te deja manipularla. Instalalo cuando quieras entender ' +
      'qué patrones aprendió el sistema.',
    icon: 'BookOpen',
    accent: 'amber',
    coreLevel: 'free',
    installable: true,
    capabilities: {
      reads: ['tag_group', 'tag_option', 'producto', 'inv_pricing_rule'],
      writes: ['tag_group', 'tag_option', 'inv_pricing_rule'],
      emits: [EVENT_TYPES.PRODUCT_PRICE_ADJUSTED],
      consumes: [EVENT_TYPES.PRODUCT_CREATED],
    },
    featurePacks: [
      {
        id: 'tag-explorer',
        name: 'Explorador de tags',
        description: 'Editor visual de propiedades, tags y estructura del cuaderno.',
        tier: 'free',
        defaultEnabled: true,
      },
      {
        id: 'price-insights',
        name: 'Referencia de precios',
        description: 'Panel de patrones/cuaderno para sugerencia de precio en inventario.',
        tier: 'free',
        defaultEnabled: true,
      },
      {
        id: 'rule-autolearn',
        name: 'Autoaprendizaje de reglas',
        description: 'Propone y extiende reglas de precios automáticamente según historial.',
        tier: 'free',
        defaultEnabled: true,
      },
    ],
  }),

  defineManifest({
    id: 'pdv',
    name: 'Punto de venta',
    tagline: 'Cobrar rápido.',
    description: 'POS con lector de códigos, carrito y formas de pago (efectivo / transferencia).',
    icon: 'Store',
    accent: 'green',
    coreLevel: 'core',
    installable: false,
    capabilities: {
      reads: ['producto'],
      writes: ['venta', 'venta_item'],
      emits: [EVENT_TYPES.SALE_COMPLETED],
      consumes: [],
    },
  }),

  defineManifest({
    id: 'banqueta',
    name: 'Banqueta',
    tagline: 'Vender afuera del local.',
    description:
      'Cuando se sale a la calle a liquidar mercancía, registra qué se llevó, qué se ' +
      'vendió y a qué precio.',
    icon: 'Truck',
    accent: 'orange',
    coreLevel: 'free',
    capabilities: {
      reads: ['producto', 'banqueta_salida', 'banqueta_salida_item'],
      writes: ['banqueta_salida', 'banqueta_salida_item'],
      emits: [
        EVENT_TYPES.BANQUETA_OPENED,
        EVENT_TYPES.BANQUETA_CLOSED,
        EVENT_TYPES.BANQUETA_ITEM_RESULT,
      ],
      consumes: [EVENT_TYPES.PRODUCT_UPDATED],
    },
  }),

  defineManifest({
    id: 'import-excel',
    name: 'Importar Excel',
    tagline: 'Pasar cuaderno físico a inventario.',
    description:
      'Convierte una lista en Excel o CSV en inventario real con drag & drop. El ' +
      'asistente IA puede mapear columnas a tags y precios.',
    icon: 'FileSpreadsheet',
    accent: 'green',
    coreLevel: 'free',
    capabilities: {
      reads: ['tag_group', 'tag_option', 'inv_pricing_rule'],
      writes: ['producto', 'producto_tag'],
      emits: [EVENT_TYPES.PRODUCT_CREATED],
      consumes: [],
    },
    requires: ['inventario'],
  }),

  defineManifest({
    id: 'backups-csv',
    name: 'Backups CSV',
    tagline: 'Tus datos, exportables.',
    description:
      'Exportar inventario, ventas y cuaderno a CSV/Excel. Útil para compartir con ' +
      'contadora o respaldar offline.',
    icon: 'Download',
    accent: 'teal',
    coreLevel: 'free',
    capabilities: {
      reads: ['producto', 'venta', 'cliente', 'tag_option'],
      writes: [],
      emits: [],
      consumes: [],
    },
  }),

  defineManifest({
    id: 'reportes',
    name: 'Reportes',
    tagline: 'Proyecciones del ledger.',
    description:
      'Ventas, prendas estancadas, salidas de banqueta. Todo se ' +
      'calcula leyendo la historia inmutable del bazar — no son números inventados, ' +
      'son agregaciones consultables.',
    icon: 'BarChart3',
    accent: 'purple',
    coreLevel: 'free',
    capabilities: {
      reads: ['venta', 'cliente', 'producto', 'cognitive_events'],
      writes: [],
      emits: [],
      consumes: [
        EVENT_TYPES.SALE_COMPLETED,
        EVENT_TYPES.BANQUETA_CLOSED,
      ],
    },
  }),

  defineManifest({
    id: 'asistente',
    name: 'Asistente',
    tagline: 'El observador del bazar.',
    description:
      'Triángulo observador del ledger. Recuerda prendas que llevan ' +
      'meses sin moverse y patrones de venta. Sugiere — nunca decide. La decisión ' +
      'queda siempre en el operario. Funciona localmente; conectá una clave de Gemini o Groq ' +
      'desde Ajustes para activar el razonamiento con modelo de lenguaje.',
    icon: 'Sparkles',
    accent: 'rose',
    coreLevel: 'core',
    installable: false,
    capabilities: {
      reads: ['cognitive_events', 'producto', 'venta', 'cliente'],
      writes: [],
      emits: [
        EVENT_TYPES.AGENT_TURN,
        EVENT_TYPES.AGENT_TOOL_CALL,
        EVENT_TYPES.AGENT_SUGGESTION_SHOWN,
        EVENT_TYPES.AGENT_SUGGESTION_ACCEPTED,
        EVENT_TYPES.AGENT_SUGGESTION_REJECTED,
      ],
      consumes: [
        EVENT_TYPES.SALE_COMPLETED,
        EVENT_TYPES.PRODUCT_CREATED,
        EVENT_TYPES.BANQUETA_CLOSED,
      ],
    },
    featurePacks: [
      {
        id: 'memory-drawer',
        name: 'Memoria contextual',
        description: 'Panel de narrativa y patrones observados por el sistema.',
        tier: 'free',
        defaultEnabled: true,
      },
      {
        id: 'proactive-insights',
        name: 'Insights proactivos',
        description: 'Sugerencias contextuales de anomalías y oportunidades.',
        tier: 'premium',
        defaultEnabled: false,
      },
    ],
  }),

  defineManifest({
    id: 'label-editor',
    name: 'Editor de etiquetas',
    tagline: 'Tu plantilla, tu medida.',
    description:
      'Drag & drop estilo Figma para componer plantillas de etiqueta: tamaño, fuente, ' +
      'código de barras, logo, propiedades del cuaderno.',
    icon: 'Tag',
    accent: 'purple',
    coreLevel: 'premium',
    price: '$60/único',
    capabilities: {
      reads: ['label_template', 'producto', 'tag_group', 'inv_pricing_rule'],
      writes: ['label_template'],
      emits: [EVENT_TYPES.LABEL_PRINTED],
      consumes: [],
    },
  }),

  defineManifest({
    id: 'intercambios',
    name: 'Intercambios',
    tagline: 'Cambios de prenda con diferencia.',
    description:
      'Calculadora rápida cuando una persona devuelve y se lleva otra cosa. Calcula la ' +
      'diferencia, registra el movimiento.',
    icon: 'Repeat',
    accent: 'amber',
    coreLevel: 'premium',
    price: '$40/año',
    capabilities: {
      reads: ['venta', 'venta_item', 'producto'],
      writes: ['venta_item'],
      emits: [EVENT_TYPES.EXCHANGE_COMPLETED],
      consumes: [EVENT_TYPES.SALE_COMPLETED],
    },
    requires: ['pdv'],
  }),

  defineManifest({
    id: 'temas',
    name: 'Temas visuales',
    tagline: 'Sakura, Ayu, Nord, propio.',
    description: 'Paleta intercambiable. 6 temas curados + editor de tema propio.',
    icon: 'Palette',
    accent: 'rose',
    coreLevel: 'premium',
    price: '$30/único',
    capabilities: { reads: [], writes: [], emits: [], consumes: [] },
  }),

  defineManifest({
    id: 'tienda-3d',
    name: 'Vista 2D/3D del local',
    tagline: 'Mapeá tu zona física.',
    description:
      'Plano del local en 2D (o 3D simple), zonas asignadas a las prendas (AM, BM, ' +
      'CM…), visualización durante la venta.',
    icon: 'Box',
    accent: 'teal',
    coreLevel: 'soon',
    capabilities: {
      reads: ['producto', 'tag_option'],
      writes: ['producto'],
      emits: [EVENT_TYPES.PRODUCT_UPDATED],
      consumes: [],
    },
  }),
]

const BY_ID = new Map()
for (const m of MANIFESTS) BY_ID.set(m.id, m)

export function listAllManifests() {
  return MANIFESTS
}

export function getManifest(id) {
  return BY_ID.get(String(id || '')) ?? null
}

export function listCoreManifests() {
  return MANIFESTS.filter((m) => m.coreLevel === 'core')
}

export const CORE_MODULE_IDS = listCoreManifests().map((m) => m.id)

export function isCoreModule(id) {
  return CORE_MODULE_IDS.includes(String(id || ''))
}

/**
 * Devuelve los manifests filtrados por categoría visible.
 * "installed" se debe consultar contra useEnabledModules() en runtime.
 */
export function filterByCategory(category) {
  if (!category || category === 'all') return MANIFESTS
  return MANIFESTS.filter((m) => m.coreLevel === category)
}

/**
 * Para introspección desde el agente / debug: qué eventos quedarían
 * huérfanos (no emitidos) si desactivás un conjunto de módulos.
 */
export function eventCoverage(enabledIds) {
  const enabled = new Set(enabledIds || [])
  const emitted = new Set()
  const consumed = new Set()
  for (const m of MANIFESTS) {
    if (!enabled.has(m.id)) continue
    for (const e of m.capabilities.emits) emitted.add(e)
    for (const c of m.capabilities.consumes) consumed.add(c)
  }
  const orphanConsumers = []
  for (const m of MANIFESTS) {
    if (!enabled.has(m.id)) continue
    for (const c of m.capabilities.consumes) {
      if (!emitted.has(c)) orphanConsumers.push({ moduleId: m.id, eventType: c })
    }
  }
  return { emitted: [...emitted], consumed: [...consumed], orphanConsumers }
}

export const CATEGORIES = [
  { id: 'all', label: 'Todos' },
  { id: 'core', label: 'Core' },
  { id: 'free', label: 'Gratis' },
  { id: 'premium', label: 'Premium' },
  { id: 'soon', label: 'Próximamente' },
  { id: 'installed', label: 'Instalados' },
]

export const DEFAULT_ENABLED_MODULES = [...CORE_MODULE_IDS]
