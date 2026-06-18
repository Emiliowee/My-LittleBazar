/**
 * Tipos canónicos del event ledger.
 *
 * Esta es la única fuente que define qué eventos puede emitir el sistema.
 * Si querés agregar un evento nuevo, agrégalo acá y documentá:
 *   - qué entidad observa,
 *   - qué módulos lo emiten,
 *   - qué módulos pueden consumirlo.
 *
 * Convención de nombres: `<scope>.<verbo>` en minúsculas.
 *   scope ∈ {sale, payment, product, customer, banqueta, label, agent, module}
 *   verbo en pasado para hechos (`created`, `completed`, `closed`), en
 *   gerundio NUNCA (el ledger registra hechos, no intenciones).
 */

export const EVENT_TYPES = Object.freeze({
  // Ventas y stock
  SALE_COMPLETED: 'sale.completed',
  SALE_REVERSED: 'sale.reversed',
  EXCHANGE_COMPLETED: 'exchange.completed',

  // Productos
  PRODUCT_CREATED: 'product.created',
  PRODUCT_UPDATED: 'product.updated',
  PRODUCT_DELETED: 'product.deleted',
  PRODUCT_PRICE_ADJUSTED: 'product.price_adjusted',

  // Clientes y crédito
  CUSTOMER_CREATED: 'customer.created',
  CUSTOMER_UPDATED: 'customer.updated',
  CUSTOMER_DELETED: 'customer.deleted',

  // Banqueta
  BANQUETA_OPENED: 'banqueta.opened',
  BANQUETA_CLOSED: 'banqueta.closed',
  BANQUETA_ITEM_RESULT: 'banqueta.item_result',

  // Etiquetas
  LABEL_PRINTED: 'label.printed',

  // Agente y módulos
  AGENT_TURN: 'agent.turn',
  AGENT_TOOL_CALL: 'agent.tool_call',
  AGENT_SUGGESTION_SHOWN: 'agent.suggestion_shown',
  AGENT_SUGGESTION_ACCEPTED: 'agent.suggestion_accepted',
  AGENT_SUGGESTION_REJECTED: 'agent.suggestion_rejected',
  MODULE_ENABLED: 'module.enabled',
  MODULE_DISABLED: 'module.disabled',
})

/**
 * Scopes de entidad — usados como índice rápido en el ledger.
 * Ayudan al agente a saber "todo lo que pasó con esta venta".
 */
export const EVENT_SCOPES = Object.freeze({
  SALE: 'sale',
  PRODUCT: 'product',
  CUSTOMER: 'customer',
  CREDIT: 'credit',
  BANQUETA: 'banqueta',
  LABEL: 'label',
  AGENT: 'agent',
  MODULE: 'module',
})

export const EVENT_ACTORS = Object.freeze({
  USER: 'user',
  AGENT: 'agent',
  SYSTEM: 'system',
})

/**
 * Documenta qué módulo emite cada evento. Sirve a:
 *   - el manifest registry (capabilities.emits)
 *   - el agente (para saber "este evento no llegará si X módulo no está activo")
 */
export const EVENT_PRODUCERS = Object.freeze({
  [EVENT_TYPES.SALE_COMPLETED]: ['pdv'],
  [EVENT_TYPES.SALE_REVERSED]: ['pdv'],
  [EVENT_TYPES.EXCHANGE_COMPLETED]: ['intercambios'],
  [EVENT_TYPES.PRODUCT_CREATED]: ['inventario'],
  [EVENT_TYPES.PRODUCT_UPDATED]: ['inventario'],
  [EVENT_TYPES.PRODUCT_DELETED]: ['inventario'],
  [EVENT_TYPES.PRODUCT_PRICE_ADJUSTED]: ['inventario', 'cuaderno'],
  [EVENT_TYPES.CUSTOMER_CREATED]: ['pdv'],
  [EVENT_TYPES.CUSTOMER_UPDATED]: ['pdv'],
  [EVENT_TYPES.CUSTOMER_DELETED]: ['pdv'],
  [EVENT_TYPES.BANQUETA_OPENED]: ['banqueta'],
  [EVENT_TYPES.BANQUETA_CLOSED]: ['banqueta'],
  [EVENT_TYPES.BANQUETA_ITEM_RESULT]: ['banqueta'],
  [EVENT_TYPES.LABEL_PRINTED]: ['inventario', 'label-editor'],
  [EVENT_TYPES.AGENT_TURN]: ['asistente'],
  [EVENT_TYPES.AGENT_TOOL_CALL]: ['asistente'],
  [EVENT_TYPES.AGENT_SUGGESTION_SHOWN]: ['asistente'],
  [EVENT_TYPES.AGENT_SUGGESTION_ACCEPTED]: ['asistente'],
  [EVENT_TYPES.AGENT_SUGGESTION_REJECTED]: ['asistente'],
  [EVENT_TYPES.MODULE_ENABLED]: ['shell'],
  [EVENT_TYPES.MODULE_DISABLED]: ['shell'],
})

export function eventBelongsToModule(eventType, moduleId) {
  const producers = EVENT_PRODUCERS[eventType] || []
  return producers.includes(moduleId)
}
