'use strict'

/**
 * Lógica alineada con `src/services/producto_alta.py` (consultas via better-sqlite3).
 * @param {import('better-sqlite3').Database} db
 */

const AUTO_FILL_CUADERNO = 'cuaderno'
const AUTO_FILL_PATRONES = 'patrones'
const AUTO_FILL_OFF = 'off'

function toOptionIdSet(input) {
  const s = new Set()
  if (input == null) return s
  if (input instanceof Set) {
    for (const x of input) {
      const n = Number(x)
      if (Number.isFinite(n) && n > 0) s.add(n)
    }
    return s
  }
  if (Array.isArray(input)) {
    for (const x of input) {
      const n = Number(x)
      if (Number.isFinite(n) && n > 0) s.add(n)
    }
    return s
  }
  if (typeof input === 'object') {
    for (const v of Object.values(input)) {
      const n = Number(v)
      if (Number.isFinite(n) && n > 0) s.add(n)
    }
  }
  return s
}

function nextCodigoMsr(db) {
  const rows = db.prepare("SELECT codigo FROM productos WHERE codigo LIKE 'MSR-%' COLLATE NOCASE").all()
  let best = 0
  const re = /^MSR-(\d+)$/i
  for (const { codigo } of rows) {
    const m = re.exec(String(codigo || '').trim())
    if (m) best = Math.max(best, parseInt(m[1], 10))
  }
  return `MSR-${String(best + 1).padStart(6, '0')}`
}

function missingRequiredGroups(db, selectedOptionIds) {
  const sel = toOptionIdSet(selectedOptionIds)
  const groups = db
    .prepare(
      `SELECT id, name FROM tag_groups WHERE active = 1 AND required = 1 ORDER BY display_order, name`,
    )
    .all()
  const optStmt = db.prepare('SELECT id FROM tag_options WHERE group_id = ? AND active = 1')
  const missing = []
  for (const g of groups) {
    const activeOpts = new Set(optStmt.all(g.id).map((r) => r.id))
    if (activeOpts.size === 0) continue
    let ok = false
    for (const oid of sel) {
      if (activeOpts.has(oid)) {
        ok = true
        break
      }
    }
    if (!ok) missing.push(g.name)
  }
  return missing
}

function tagLabelsForSelection(db, groupToOption) {
  if (!groupToOption || typeof groupToOption !== 'object') return []
  const gids = Object.keys(groupToOption)
    .map(Number)
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b)
  const out = []
  const gStmt = db.prepare('SELECT name FROM tag_groups WHERE id = ?')
  const oStmt = db.prepare('SELECT name FROM tag_options WHERE id = ?')
  for (const gid of gids) {
    const oid = groupToOption[gid]
    if (oid == null) continue
    const g = gStmt.get(gid)
    const o = oStmt.get(oid)
    if (g && o) out.push(`${g.name}: ${o.name}`)
  }
  return out
}

function optionNameForGroup(db, groupName, selectedOptionIds) {
  const sel = toOptionIdSet(selectedOptionIds)
  const g = db.prepare('SELECT id FROM tag_groups WHERE name = ?').get(groupName)
  if (!g) return ''
  const opts = db
    .prepare('SELECT id, name FROM tag_options WHERE group_id = ? AND active = 1')
    .all(g.id)
  for (const o of opts) {
    if (sel.has(o.id)) return o.name
  }
  return ''
}

function optionNamesInDisplayOrder(db, groupToOption) {
  if (!groupToOption || typeof groupToOption !== 'object') return []
  const gids = Object.keys(groupToOption)
    .map(Number)
    .filter((n) => Number.isFinite(n))
  if (gids.length === 0) return []
  const ph = gids.map(() => '?').join(',')
  const groups = db
    .prepare(`SELECT id FROM tag_groups WHERE id IN (${ph}) ORDER BY display_order, name`)
    .all(...gids)
  const out = []
  for (const g of groups) {
    const oid = groupToOption[g.id]
    if (oid == null) continue
    const o = db.prepare('SELECT name FROM tag_options WHERE id = ? AND active = 1').get(oid)
    if (o && o.name) out.push(String(o.name).replace(/-/g, ' ').trim())
  }
  return out
}

function foldAccents(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
}

function fragmentsForTagMatch(name) {
  const raw = String(name || '').trim()
  if (!raw) return []
  const out = []
  for (const part of new Set([raw, raw.replace(/-/g, ' '), raw.replace(/ /g, '-')])) {
    const p = part.trim()
    if (p && !out.includes(p)) out.push(p)
  }
  return out
}

function earliestMatchInDesc(normDesc, tagName) {
  const d = normDesc
  if (!d) return [-1, -1]
  let bestPos = -1
  let bestQ = -1
  for (const frag of fragmentsForTagMatch(tagName)) {
    const f = foldAccents(frag)
    if (f.length < 2) continue
    const idx = d.indexOf(f)
    if (idx >= 0 && (bestPos < 0 || idx < bestPos)) {
      bestPos = idx
      bestQ = 2
    }
  }
  if (bestPos >= 0) return [bestPos, bestQ]
  for (const frag of fragmentsForTagMatch(tagName)) {
    const f = foldAccents(frag)
    for (const token of f.split(/[\s\-/]+/)) {
      if (token.length < 2) continue
      const re = new RegExp(`(?<!\\w)${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?!\\w)`)
      const m = re.exec(d)
      if (m) {
        const pos = m.index
        if (bestPos < 0 || pos < bestPos) {
          bestPos = pos
          bestQ = 1
        }
      }
    }
  }
  return [bestPos, bestQ]
}

function scoreDescripcionVsTagsOrdenados(desc, orderedTagNames) {
  const d = foldAccents(String(desc || '').trim())
  if (!d || !orderedTagNames.length) return [-10000, 0]
  const positions = []
  let hits = 0
  let qualityPts = 0
  for (const nm of orderedTagNames) {
    if (!String(nm || '').trim()) {
      positions.push(-1)
      continue
    }
    const [idx, q] = earliestMatchInDesc(d, nm)
    positions.push(idx)
    if (idx >= 0) {
      hits += 1
      if (q >= 2) qualityPts += 22
      else if (q >= 1) qualityPts += 12
    }
  }
  if (hits === 0) return [0, 0]
  const ordenOk =
    positions.every((p) => p >= 0) &&
    positions.every((p, i) => i === 0 || positions[i - 1] <= p)
  const bonusOrden = ordenOk ? 55 : 0
  return [hits * 18 + qualityPts + bonusOrden, hits]
}

function rankKeyTodosLosTags(pOids, selected) {
  const exact = pOids.size === selected.size && [...selected].every((x) => pOids.has(x)) ? 1 : 0
  let extra = 0
  for (const x of pOids) {
    if (!selected.has(x)) extra += 1
  }
  const nP = pOids.size
  return [exact, -extra, -nP]
}

function nombreEtiquetaDesdeTags(db, groupToOption) {
  const parts = optionNamesInDisplayOrder(db, groupToOption)
  return parts.join('-')
}

function nombreDesdeTagsOrdenReferencia(db, groupToOption, textoReferencia) {
  const ordered = optionNamesInDisplayOrder(db, groupToOption)
  if (!ordered.length) return ''
  const d = foldAccents(String(textoReferencia || '').trim())
  if (!d) return ordered.join(' ')
  const tailBase = d.length + 100
  const items = []
  for (let idx = 0; idx < ordered.length; idx++) {
    const nm = ordered[idx]
    const [pos] = earliestMatchInDesc(d, nm)
    const sortKey = pos >= 0 ? pos : tailBase + idx
    items.push([sortKey, idx, nm.trim()])
  }
  items.sort((a, b) => a[0] - b[0] || a[1] - b[1])
  return items.map((x) => x[2]).join(' ')
}

function loadProductTagOptionIds(db, productoId) {
  return new Set(
    db
      .prepare('SELECT tag_option_id FROM producto_tags WHERE producto_id = ?')
      .all(productoId)
      .map((r) => r.tag_option_id),
  )
}

function fetchProductsWithAllTagOptions(db, optionIds, excludeCodigo) {
  const oids = [...new Set(optionIds.map(Number).filter((n) => Number.isFinite(n)))]
  if (oids.length === 0) return []
  const parts = oids.map(
    () => 'EXISTS (SELECT 1 FROM producto_tags pt WHERE pt.producto_id = p.id AND pt.tag_option_id = ?)',
  )
  const ex = String(excludeCodigo || '').trim()
  const params = [...oids]
  let sql = `SELECT p.* FROM inventario_activo p WHERE ${parts.join(' AND ')}`
  if (ex) {
    sql += ' AND TRIM(COALESCE(p.codigo,\'\')) != ?'
    params.push(ex)
  }
  return db.prepare(sql).all(...params)
}

function optionRowById(db, oid) {
  return db.prepare('SELECT id, name FROM tag_options WHERE id = ?').get(oid)
}

function rankedTagMatches(db, optionIds, excludeCodigo, limit = 2000) {
  const selected = toOptionIdSet(optionIds)
  if (selected.size === 0) return []
  const candidates = fetchProductsWithAllTagOptions(db, [...selected], excludeCodigo)
  const nSel = selected.size
  const rows = []
  for (const p of candidates) {
    const pOids = loadProductTagOptionIds(db, p.id)
    let ok = true
    for (const oid of selected) {
      if (!pOids.has(oid)) {
        ok = false
        break
      }
    }
    if (!ok) continue
    const rk = rankKeyTodosLosTags(pOids, selected)
    const byId = {}
    for (const tid of pOids) {
      const o = optionRowById(db, tid)
      if (o) byId[tid] = o
    }
    const sortedSel = [...selected].sort((a, b) => {
      const na = (byId[a]?.name || '').toLowerCase()
      const nb = (byId[b]?.name || '').toLowerCase()
      return na.localeCompare(nb)
    })
    const coinNames = sortedSel
      .filter((i) => byId[i])
      .map((i) => byId[i].name)
      .join(', ')
    rows.push({ rk, p, nSel, coinNames })
  }
  rows.sort((a, b) => {
    for (let i = 0; i < 3; i++) {
      if (a.rk[i] !== b.rk[i]) return b.rk[i] - a.rk[i]
    }
    return 0
  })
  return rows.slice(0, limit).map((x) => [x.p, x.nSel, x.coinNames, x.rk])
}

function sugerirNombreDesdePatronesInventario(db, groupToOption, excludeCodigo, limitScan = 800) {
  if (!groupToOption || typeof groupToOption !== 'object' || Object.keys(groupToOption).length === 0) {
    return null
  }
  const option_ids = toOptionIdSet(Object.values(groupToOption))
  const ordered = optionNamesInDisplayOrder(db, groupToOption)
  if (!ordered.length) return null
  const ranked = rankedTagMatches(db, option_ids, excludeCodigo, limitScan)
  if (!ranked.length) return null
  const keysOrder = []
  const seen = new Set()
  for (const [_p, _n, _t, rk] of ranked) {
    const key = `${rk[0]},${rk[1]},${rk[2]}`
    if (!seen.has(key)) {
      seen.add(key)
      keysOrder.push(rk)
    }
  }
  for (const rk of keysOrder) {
    const tierPs = ranked.filter((row) => row[3][0] === rk[0] && row[3][1] === rk[1] && row[3][2] === rk[2]).map((row) => row[0])
    let bestRaw = null
    let bestSc = [-10000, 0]
    for (const p of tierPs) {
      const raw = String(p.descripcion || '').trim()
      if (!raw) continue
      const sc = scoreDescripcionVsTagsOrdenados(raw, ordered)
      if (sc[0] > bestSc[0] || (sc[0] === bestSc[0] && sc[1] > bestSc[1])) {
        bestSc = sc
        bestRaw = raw
      }
    }
    if (!bestRaw) continue
    const nombre = nombreDesdeTagsOrdenReferencia(db, groupToOption, bestRaw).trim()
    if (nombre) return nombre.slice(0, 220)
  }
  return ordered.join(' ').slice(0, 220)
}

function productosCoincidenciaTags(db, optionIds, excludeCodigo, limit = 30) {
  const full = rankedTagMatches(db, optionIds, excludeCodigo, Math.max(limit, 500))
  return full.slice(0, limit).map(([p, n, t]) => [p, n, t])
}

function inventarioPrecioStatsPorTags(db, optionIds, excludeCodigo, limit = 2000) {
  const selected = toOptionIdSet(optionIds)
  if (selected.size === 0) return null
  const ranked = rankedTagMatches(db, optionIds, excludeCodigo, limit)
  if (!ranked.length) return null
  const prices = []
  for (const [p] of ranked) {
    const price = Number(p.precio)
    if (!Number.isFinite(price) || price < 0) continue
    prices.push(price)
  }
  if (!prices.length) return null
  prices.sort((a, b) => a - b)
  const n = prices.length
  const sum = prices.reduce((a, b) => a + b, 0)
  const min = prices[0]
  const max = prices[n - 1]
  const avg = sum / n
  const median = n % 2 === 1 ? prices[(n - 1) / 2] : (prices[n / 2 - 1] + prices[n / 2]) / 2
  const nSel = selected.size
  const nExact = ranked.filter((row) => row[3][0] === 1).length
  return {
    n: prices.length,
    min,
    max,
    avg,
    median,
    cobertura: 1.0,
    tags_coincidentes_mejor: nSel,
    tags_elegidos: nSel,
    conjunto_exacto: ranked[0][3][0] === 1,
    n_conjunto_exacto: nExact,
  }
}

/**
 * Si el producto trae más de una ancla, gana la primera según el orden de categorías en el cuaderno
 * (`display_order`, luego id de grupo y de opción). Sin prioridades numéricas ni empates ambiguos.
 * @returns {{ anchorId: number | null, ambiguous: false }}
 */
function resolveWinningRuleAnchorId(db, sel) {
  const ids = [...sel].filter((n) => Number.isFinite(n) && n > 0)
  if (ids.length === 0) return { anchorId: null, ambiguous: false }
  const ph = ids.map(() => '?').join(',')
  const rows = db
    .prepare(
      `SELECT o.id FROM tag_options o
       JOIN tag_groups g ON g.id = o.group_id
       WHERE COALESCE(o.is_price_rule,0) = 1 AND COALESCE(o.active,1) = 1 AND o.id IN (${ph})
       ORDER BY COALESCE(g.display_order, 999999) ASC, g.id ASC, o.id ASC`,
    )
    .all(...ids)
  if (rows.length === 0) return { anchorId: null, ambiguous: false }
  return { anchorId: rows[0].id, ambiguous: false }
}

function countPriceRuleAnchorsInSelection(db, selectedOptionIds) {
  const sel = toOptionIdSet(selectedOptionIds)
  const ids = [...sel].filter((n) => Number.isFinite(n) && n > 0)
  if (ids.length === 0) return 0
  const ph = ids.map(() => '?').join(',')
  const rows = db
    .prepare(
      `SELECT COUNT(*) AS c FROM tag_options WHERE COALESCE(is_price_rule,0) = 1 AND COALESCE(active,1) = 1 AND id IN (${ph})`,
    )
    .get(...ids)
  return Number(rows?.c) || 0
}

/**
 * Combinación ganadora para un ancla: mayor número de tags compañeros presentes en el producto.
 * @returns {null | { id: number, price: number | null, parts: number[] }}
 */
function resolveTagPriceComboForAnchor(db, sel, anchorId) {
  let combos
  try {
    combos = db.prepare(`SELECT id, price FROM tag_price_combo WHERE anchor_option_id = ?`).all(anchorId)
  } catch {
    return null
  }
  if (!combos.length) return null
  const partStmt = db.prepare(`SELECT option_id FROM tag_price_combo_part WHERE combo_id = ?`)
  const scored = combos.map((c) => {
    const parts = partStmt.all(c.id).map((r) => r.option_id)
    return {
      id: c.id,
      priceRaw: c.price == null ? null : Number(c.price),
      parts,
      n: parts.length,
    }
  })
  scored.sort((a, b) => b.n - a.n || b.id - a.id)
  for (const c of scored) {
    let ok = true
    for (const p of c.parts) {
      if (!sel.has(p)) {
        ok = false
        break
      }
    }
    if (ok) return c
  }
  return null
}

function bestTagAnchorPrice(db, selectedOptionIds) {
  const sel = toOptionIdSet(selectedOptionIds)
  const { anchorId } = resolveWinningRuleAnchorId(db, sel)
  if (anchorId == null) return null
  const hit = resolveTagPriceComboForAnchor(db, sel, anchorId)
  if (!hit) return null
  if (hit.priceRaw == null || !Number.isFinite(Number(hit.priceRaw))) return null
  return Number(hit.priceRaw)
}

function bestMatchingPriceRule(db, selectedOptionIds) {
  const sel = toOptionIdSet(selectedOptionIds)
  const rules = db
    .prepare(`SELECT * FROM price_rules WHERE active = 1 ORDER BY priority DESC, id DESC`)
    .all()
  const condStmt = db.prepare('SELECT option_id FROM price_rule_conditions WHERE rule_id = ?')
  const matches = []
  for (const rule of rules) {
    const condOpts = condStmt.all(rule.id).map((r) => r.option_id)
    const condSet = new Set(condOpts)
    if (condSet.size === 0) continue
    let ok = true
    for (const oid of condSet) {
      if (!sel.has(oid)) {
        ok = false
        break
      }
    }
    if (ok) matches.push({ rule, condCount: condOpts.length })
  }
  if (!matches.length) return null
  matches.sort((a, b) => {
    const pa = Number(a.rule.priority || 0)
    const pb = Number(b.rule.priority || 0)
    if (pb !== pa) return pb - pa
    if (b.condCount !== a.condCount) return b.condCount - a.condCount
    return (Number(b.rule.id) || 0) - (Number(a.rule.id) || 0)
  })
  return matches[0].rule
}

function suggestedPriceFromRule(rule) {
  if (!rule) return null
  return (Number(rule.price_min) + Number(rule.price_max)) / 2
}

function snapshotReferenciaCuaderno(db, optionIds, tagsPorGrupo) {
  const tagsTxt = tagsPorGrupo ? tagLabelsForSelection(db, tagsPorGrupo) : []
  const sel = toOptionIdSet(optionIds)
  if (sel.size === 0) {
    return {
      modo: 'cuaderno',
      tags_elegidos: tagsTxt,
      encontrado: false,
      mensaje: 'Todavía no elegiste tags en Principal.',
    }
  }
  const win = resolveWinningRuleAnchorId(db, sel)
  if (win.anchorId != null) {
    const anchorId = win.anchorId
    const meta = db
      .prepare(
        `SELECT o.name AS oname, g.name AS gname FROM tag_options o JOIN tag_groups g ON g.id = o.group_id WHERE o.id = ?`,
      )
      .get(anchorId)
    const anchorLabel = meta ? `${meta.gname}: ${meta.oname}` : 'Regla'
    const hit = resolveTagPriceComboForAnchor(db, sel, anchorId)
    if (!hit) {
      return {
        modo: 'cuaderno',
        fuente: 'tag_ancla',
        tags_elegidos: tagsTxt,
        encontrado: false,
        mensaje: `Tenés la ancla «${anchorLabel}» pero no hay fila en su tabla que coincida con esta combinación (revisá el cuaderno en esta etiqueta).`,
      }
    }
    const conds = []
    if (hit.parts.length === 0) {
      conds.push(['Precio base', `${meta?.oname || 'tag'} solo (sin otros tags de la tabla)`])
    } else {
      const oStmt = db.prepare(
        `SELECT o.name AS oname, g.name AS gname FROM tag_options o JOIN tag_groups g ON g.id = o.group_id WHERE o.id = ?`,
      )
      for (const pid of hit.parts) {
        const lb = oStmt.get(pid)
        conds.push(['Junto con', lb ? `${lb.gname}: ${lb.oname}` : String(pid)])
      }
    }
    if (hit.priceRaw == null || !Number.isFinite(Number(hit.priceRaw))) {
      return {
        modo: 'cuaderno',
        fuente: 'tag_ancla',
        tags_elegidos: tagsTxt,
        encontrado: false,
        mensaje:
          'Esta combinación coincide con una fila sin precio en la tabla de la ancla: asigná precio en el cuaderno o cargalo a mano.',
        condiciones: conds,
      }
    }
    const p = Number(hit.priceRaw)
    return {
      modo: 'cuaderno',
      fuente: 'tag_ancla',
      tags_elegidos: tagsTxt,
      encontrado: true,
      mensaje: '',
      rule_name: String(meta?.oname || 'Ancla'),
      rule_notes: anchorLabel,
      price_min: p,
      price_max: p,
      sugerido: p,
      prioridad: hit.n,
      condiciones: conds,
    }
  }

  return {
    modo: 'cuaderno',
    tags_elegidos: tagsTxt,
    encontrado: false,
    mensaje:
      'No hay ancla de precio que aplique o la combinación de tags no coincide con ninguna fila. Configuralo en Cuaderno → abrí la etiqueta ancla y cargá la tabla.',
  }
}

function snapshotReferenciaPatrones(db, optionIds, excludeCodigo, tagsPorGrupo) {
  const tagsTxt = tagsPorGrupo ? tagLabelsForSelection(db, tagsPorGrupo) : []
  const sel = toOptionIdSet(optionIds)
  if (sel.size === 0) {
    return {
      modo: 'patrones',
      tags_elegidos: tagsTxt,
      encontrado: false,
      mensaje: 'Todavía no elegiste tags en Principal.',
      productos: [],
      stats: null,
    }
  }
  const rows = productosCoincidenciaTags(db, sel, excludeCodigo, 80)
  const st = inventarioPrecioStatsPorTags(db, sel, excludeCodigo)
  const prods = []
  for (const [p, nCoinc, coinTxt] of rows) {
    prods.push({
      codigo: p.codigo || '',
      nombre: String(p.descripcion || '').slice(0, 220),
      precio: Number(p.precio) || 0,
      imagen_path: String(p.imagen_path || '').trim(),
      estado: p.estado || '',
      n_coincidencias: nCoinc,
      tags_coincidentes: coinTxt || '',
    })
  }
  if (!rows.length) {
    return {
      modo: 'patrones',
      tags_elegidos: tagsTxt,
      encontrado: false,
      mensaje:
        'No hay artículos que tengan todos los tags que elegiste a la vez (ninguno cumple la combinación completa), o el código actual excluye las únicas coincidencias.',
      productos: [],
      stats: null,
    }
  }
  let statsOut = null
  if (st) {
    statsOut = {
      n: st.n,
      min: st.min,
      max: st.max,
      avg: st.avg,
      median: st.median,
      cobertura: st.cobertura,
      tags_coincidentes_mejor: st.tags_coincidentes_mejor,
      tags_elegidos: st.tags_elegidos,
      conjunto_exacto: st.conjunto_exacto,
      n_conjunto_exacto: st.n_conjunto_exacto,
    }
  }
  return {
    modo: 'patrones',
    tags_elegidos: tagsTxt,
    encontrado: true,
    mensaje: '',
    productos: prods,
    stats: statsOut,
  }
}

function filasReferenciaPrecio(db, optionIds, excludeCodigo, mode) {
  const sel = toOptionIdSet(optionIds)
  const out = []
  if (sel.size === 0) return out
  const showCuaderno = mode === AUTO_FILL_CUADERNO || mode === AUTO_FILL_OFF
  const showInventario = mode === AUTO_FILL_PATRONES || mode === AUTO_FILL_OFF
  if (showCuaderno) {
    const win = resolveWinningRuleAnchorId(db, sel)
    if (win.anchorId != null) {
      const hit = resolveTagPriceComboForAnchor(db, sel, win.anchorId)
      if (hit && hit.priceRaw != null && Number.isFinite(Number(hit.priceRaw))) {
        const p = Number(hit.priceRaw)
        out.push(['Cuaderno (ancla)', `Combinación (${hit.n} tag(s) extra)`, `$${p.toFixed(0)}`])
      } else if (hit) {
        out.push(['Cuaderno (ancla)', 'Fila sin precio', '—'])
      } else {
        out.push(['Cuaderno (ancla)', 'Sin fila que coincida', '—'])
      }
    } else {
      out.push(['Cuaderno (ancla)', 'Ninguna ancla coincide con estos tags', '—'])
    }
  }
  if (showInventario) {
    const st = inventarioPrecioStatsPorTags(db, sel, excludeCodigo)
    if (st) {
      const med = Number(st.median != null ? st.median : st.avg)
      const nSel = st.tags_elegidos
      const nex = st.n_conjunto_exacto
      const ex = nex ? `${nex} solo con esos ${nSel} tags · ` : ''
      out.push([
        'Patrones (inventario)',
        `Incluyen los ${nSel} tags elegidos (${ex}${st.n} artículo(s))`,
        `mediana ~$${med.toFixed(0)} · rango $${st.min.toFixed(0)}–${st.max.toFixed(0)}`,
      ])
    } else {
      out.push(['Patrones (inventario)', 'No hay otros artículos con estos tags', '—'])
    }
  }
  return out
}

function queryProductosAjustePorTags(db, strictExact, tagOptionIds) {
  const oids = [...toOptionIdSet(tagOptionIds)]
  if (oids.length === 0) {
    return db.prepare('SELECT * FROM inventario_activo WHERE id = -1').all()
  }
  const existsParts = oids.map(
    () => 'EXISTS (SELECT 1 FROM producto_tags pt WHERE pt.producto_id = p.id AND pt.tag_option_id = ?)',
  )
  let sql = `SELECT p.* FROM inventario_activo p WHERE ${existsParts.join(' AND ')}`
  const params = [...oids]
  if (strictExact) {
    sql += ' AND (SELECT COUNT(*) FROM producto_tags WHERE producto_id = p.id) = ?'
    params.push(oids.length)
  }
  sql += ' ORDER BY p.codigo ASC'
  return db.prepare(sql).all(...params)
}

module.exports = {
  AUTO_FILL_CUADERNO,
  AUTO_FILL_PATRONES,
  AUTO_FILL_OFF,
  toOptionIdSet,
  nextCodigoMsr,
  missingRequiredGroups,
  tagLabelsForSelection,
  optionNameForGroup,
  optionNamesInDisplayOrder,
  nombreEtiquetaDesdeTags,
  sugerirNombreDesdePatronesInventario,
  inventarioPrecioStatsPorTags,
  bestMatchingPriceRule,
  suggestedPriceFromRule,
  countPriceRuleAnchorsInSelection,
  resolveWinningRuleAnchorId,
  bestTagAnchorPrice,
  snapshotReferenciaCuaderno,
  snapshotReferenciaPatrones,
  filasReferenciaPrecio,
  rankedTagMatches,
  queryProductosAjustePorTags,
  loadProductTagOptionIds,
}
