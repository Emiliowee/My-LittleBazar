/**
 * Catálogo de planes — My Little Bazar v1.
 *
 * Cada bazar elige UN plan al hacer onboarding. El plan determina qué módulos
 * vienen pre-instalados; el resto se instala desde la Tienda.
 *
 * Postura: textos honestos. Nada de "soporte prioritario" ni promesas vacías.
 *
 * Módulos siempre activos (core): inicio, inventario, pdv, asistente.
 *   · El asistente arranca con narrativa local. Si configurás clave de Gemini
 *     o Groq, gana razonamiento LLM. La instalación del módulo siempre existe.
 * Módulos pre-instalados por plan: banqueta/reportes/backups
 *   (Starter+), label-editor/intercambios/whatsapp (Pro).
 * Lo que NO incluye un plan se instala desde la Tienda en cualquier momento.
 */

export const PLANS = [
  {
    id: 'free',
    name: 'Gratis',
    tagline: 'Lo esencial para arrancar.',
    price: 0,
    priceLabel: 'Gratis',
    cycle: 'siempre',
    description:
      'Punto de venta, inventario y el asistente observador. ' +
      'Otros módulos (Cuaderno, Banqueta, Reportes, Importar Excel) se instalan ' +
      'desde la Tienda cuando los necesites.',
    highlights: [
      'Punto de venta con código de barras',
      'Inventario con tags y reglas automáticas',
      'Asistente observador (narrativa local)',
    ],
    included: ['inicio', 'inventario', 'pdv', 'asistente'],
    accent: 'gray',
    cta: 'Empezar',
  },
  {
    id: 'starter',
    name: 'Starter',
    tagline: 'Para el bazar que ya creció.',
    price: 199,
    priceLabel: '$199',
    cycle: 'al año',
    description:
      'Suma Banqueta para liquidaciones, Reportes semanales y Backups en CSV. ' +
      'Pensado cuando el inventario empieza a tener cientos de prendas.',
    highlights: [
      'Todo lo de Gratis',
      'Banqueta (salidas de liquidación)',
      'Reportes semanales',
      'Backups CSV',
    ],
    included: [
      'inicio', 'inventario', 'pdv', 'asistente',
      'banqueta', 'reportes', 'backups-csv',
    ],
    accent: 'blue',
    cta: 'Elegir Starter',
    badge: 'Más completo',
  },
  {
    id: 'pro',
    name: 'Pro',
    tagline: 'Editor de etiquetas, intercambios y más.',
    price: 399,
    priceLabel: '$399',
    cycle: 'al año',
    description:
      'Editor visual de etiquetas, registro de intercambios y todos los módulos ' +
      'del plan Starter pre-instalados.',
    highlights: [
      'Todo lo de Starter',
      'Editor visual de etiquetas',
      'Intercambios sin devolución',
    ],
    included: [
      'inicio', 'inventario', 'pdv', 'asistente',
      'banqueta', 'reportes', 'backups-csv',
      'label-editor', 'intercambios',
    ],
    accent: 'rose',
    cta: 'Elegir Pro',
    badge: 'Más completo',
  },
]

export function findPlan(id) {
  return PLANS.find((p) => p.id === String(id || '')) || null
}

/**
 * Devuelve el array de IDs de módulos que el plan instala por defecto.
 * Si no hay plan, devuelve el mínimo del plan gratis.
 */
export function modulesForPlan(planId) {
  const plan = findPlan(planId)
  if (!plan) return ['inicio', 'inventario', 'pdv', 'asistente']
  return [...plan.included]
}
