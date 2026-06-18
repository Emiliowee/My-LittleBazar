/**
 * Validación + autocompletado para alta/edición de productos. Extraído de
 * `InventoryView.jsx` para que el flujo "alta rápida" lo reutilice sin
 * duplicar la lógica de sugerencia de nombre/precio y validación de reglas.
 */

export function parsePrecio(text) {
  const t = String(text ?? '').trim().replace(',', '.')
  if (!t) return null
  const v = Number(t)
  return Number.isFinite(v) && v >= 0 ? v : null
}

export function optionIdPositive(v) {
  if (v == null || v === '') return false
  if (typeof v === 'bigint') return v > 0n
  const n = Number(v)
  return Number.isFinite(n) && n > 0
}

export function draftHasAnyTag(map) {
  if (!map || typeof map !== 'object') return false
  return Object.values(map).some(optionIdPositive)
}

/**
 * @param {object} [opts]
 * @param {boolean} [opts.allowNoTags=false] Si es true, permite guardar sin tags
 * y desactiva la validación/auto-rellenos dependientes del cuaderno.
 * @param {boolean} [opts.ruleAutolearn=true] Si es false, evita auto-aprendizaje
 * de reglas de precio en backend para este guardado.
 * @returns {Promise<{ ok: true, payload: object, esNuevo: boolean, editId: number } | { ok: false, error: string }>}
 */
export async function buildInventorySavePayload(api, d, opts = {}) {
  const allowNoTags = opts?.allowNoTags === true
  const ruleAutolearn = opts?.ruleAutolearn !== false
  const hasTags = draftHasAnyTag(d.tagsByGroup)
  if (!hasTags && !allowNoTags) return { ok: false, error: 'Elegí al menos un tag.' }
  const codigo = String(d.codigo ?? '').trim()
  if (!codigo) return { ok: false, error: 'El código es obligatorio' }
  let descripcion = String(d.descripcion ?? '').trim()
  if (!descripcion && hasTags && api.suggestNombreFromTags) {
    try {
      const raw = await window.bazar?.settings?.get?.()
      const st = raw && typeof raw === 'object' ? raw : {}
      if (st.altaAutofillNombreDesdeTags !== false) {
        const sn = await api.suggestNombreFromTags({ tagsByGroup: d.tagsByGroup, excludeCodigo: codigo || undefined })
        if (sn && String(sn).trim()) descripcion = String(sn).trim()
      }
      if (!descripcion && api.getNombreEtiquetaDesdeTags) {
        const et = await api.getNombreEtiquetaDesdeTags({ tagsByGroup: d.tagsByGroup })
        if (et && String(et).trim()) descripcion = String(et).trim()
      }
    } catch { /* ignore */ }
  }
  if (!descripcion) return { ok: false, error: 'El nombre / descripción es obligatorio' }

  let precio = parsePrecio(d.precio)
  if (precio === null && hasTags && api.suggestPrecioFromTags) {
    try {
      // Si el draft trae una regla (elegida por el usuario o detectada por
      // `findApplicableInvRulePrice` desde el alta rápida), preferir el precio
      // exacto de la regla antes que la mediana de patrones.
      if (d.ruleId) {
        const precioVal = await api.suggestPrecioFromTags({
          tagsByGroup: d.tagsByGroup,
          ruleId: Number(d.ruleId),
          excludeCodigo: codigo || undefined,
        })
        if (precioVal != null && Number.isFinite(Number(precioVal))) {
          precio = Number(precioVal)
        }
      }
      if (precio === null) {
        const raw = await window.bazar?.settings?.get?.()
        const st = raw && typeof raw === 'object' ? raw : {}
        const mode = st.altaAutoFillMode || 'patrones'
        if (mode !== 'off') {
          const skipC = st.altaAutofillPrecioCuaderno === false
          const skipP = st.altaAutofillPrecioPatrones === false
          let precioVal = null
          if (mode === 'cuaderno' && !skipC) {
            precioVal = await api.suggestPrecioFromTags({
              tagsByGroup: d.tagsByGroup,
              mode: 'cuaderno',
              excludeCodigo: codigo || undefined,
            })
          } else if (mode === 'patrones' && !skipP) {
            precioVal = await api.suggestPrecioFromTags({
              tagsByGroup: d.tagsByGroup,
              mode: 'patrones',
              excludeCodigo: codigo || undefined,
            })
          }
          if (precioVal != null && Number.isFinite(Number(precioVal))) precio = Number(precioVal)
        }
      }
    } catch { /* ignore */ }
  }
  if (precio === null) return { ok: false, error: 'Indica un precio válido (número ≥ 0)' }

  if (hasTags && d.ruleId && typeof api.getInvPricingRule === 'function') {
    try {
      const rule = await api.getInvPricingRule({ id: Number(d.ruleId) })
      const cfs = Array.isArray(rule?.customFields) ? rule.customFields : []
      const vals =
        d.ruleFieldValues && typeof d.ruleFieldValues === 'object' && !Array.isArray(d.ruleFieldValues)
          ? d.ruleFieldValues
          : {}
      for (const f of cfs) {
        if (!f.required) continue
        const v = vals[f.id]
        let ok = true
        if (f.type === 'checkbox') ok = typeof v === 'boolean'
        else if (f.type === 'number') {
          const s = String(v ?? '').trim().replace(',', '.')
          ok = s !== '' && Number.isFinite(Number(s))
        } else if (f.type === 'select') {
          const opts = Array.isArray(f.options) ? f.options : []
          ok = typeof v === 'string' && opts.includes(v)
        } else if (f.type === 'image') ok = typeof v === 'string' && v.trim().length > 0
        else ok = typeof v === 'string' && v.trim().length > 0
        if (!ok) {
          return {
            ok: false,
            error: `Completá el campo obligatorio de la regla: «${String(f.name || '').trim() || 'Campo'}».`,
          }
        }
      }
    } catch {
      /* si falla la regla, no bloqueamos el guardado */
    }
  }

  const esNuevo = d.id == null
  const editId = Number(d.id)
  const tagsByGroup = hasTags && d.tagsByGroup && typeof d.tagsByGroup === 'object' ? { ...d.tagsByGroup } : {}
  const pieza_unica = d.pieza_unica !== false
  let stock = Math.max(1, Math.floor(Number(String(d.stock ?? '').replace(',', '.')) || 1))
  if (pieza_unica) stock = 1
  const ruleIdVal =
    hasTags &&
    d.ruleId != null &&
    String(d.ruleId).trim() !== '' &&
    Number.isFinite(Number(d.ruleId)) &&
    Number(d.ruleId) > 0
      ? Math.floor(Number(d.ruleId))
      : null
  const ruleFieldValues =
    hasTags &&
    d.ruleFieldValues &&
    typeof d.ruleFieldValues === 'object' &&
    !Array.isArray(d.ruleFieldValues)
      ? { ...d.ruleFieldValues }
      : {}
  const categoria =
    typeof d.categoria === 'string' && d.categoria.trim() ? d.categoria.trim() : null
  const payload = {
    codigo,
    descripcion,
    precio,
    estado: esNuevo ? 'disponible' : String(d.estado ?? 'disponible'),
    imagen_path: String(d.imagen_path ?? '').trim(),
    tagsByGroup,
    ruleId: ruleIdVal,
    ruleFieldValues,
    pieza_unica,
    stock,
    categoria,
    skipTagValidation: !hasTags && allowNoTags,
    skipRuleLearning: !ruleAutolearn,
  }
  return { ok: true, payload, esNuevo, editId }
}
