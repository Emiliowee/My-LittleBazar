const fs = require('fs')
const path = require('path')
const {
  createDefaultTemplate,
  normalizeTemplate,
  createBuiltinTemplates,
} = require('./label-model.cjs')

/**
 * Persiste plantillas de etiqueta. El archivo se guarda aparte de
 * `bazar-settings.json` para no mezclar datos de UI con estructuras grandes.
 *
 * Formato en disco:
 * {
 *   activeId: "default",
 *   templates: [ { id, name, ... } ]
 * }
 *
 * Si el archivo no existe o está corrupto, se reinicia con el template original.
 */
function createLabelTemplatesStore(userDataPath) {
  const file = path.join(userDataPath, 'bazar-label-templates.json')

  function stampList(templates) {
    const now = new Date().toISOString()
    return templates.map((t) => ({
      ...normalizeTemplate(t),
      createdAt: t.createdAt || now,
      updatedAt: t.updatedAt || now,
    }))
  }

  function seed() {
    const templates = stampList(createBuiltinTemplates())
    return { activeId: 'default', templates }
  }

  function ensureDefaultTemplatePresent(templates) {
    const hasDefault = templates.some((t) => t.id === 'default')
    if (hasDefault) return false
    const now = new Date().toISOString()
    templates.unshift(
      normalizeTemplate({
        ...createDefaultTemplate(),
        createdAt: now,
        updatedAt: now,
      }),
    )
    return true
  }

  /** Una sola vez: reemplaza el layout antiguo (~59×44) por el estándar nuevo. */
  function migrateLegacyDefaultLayout(templates) {
    const ix = templates.findIndex((t) => t.id === 'default')
    if (ix < 0) return false
    const t = templates[ix]
    const w = Number(t.width_mm)
    const h = Number(t.height_mm)
    if (w > 57 && w < 62 && h > 41 && h < 46) {
      const now = new Date().toISOString()
      templates[ix] = normalizeTemplate({
        ...createDefaultTemplate(),
        createdAt: t.createdAt || now,
        updatedAt: now,
      })
      return true
    }
    return false
  }

  function read() {
    try {
      const raw = fs.readFileSync(file, 'utf8')
      const data = JSON.parse(raw)
      if (!data || !Array.isArray(data.templates) || data.templates.length === 0) {
        const s = seed()
        write(s)
        return s
      }
      const templates = data.templates.map(normalizeTemplate)
      const migrated = migrateLegacyDefaultLayout(templates)
      const ensuredDefault = ensureDefaultTemplatePresent(templates)
      /* Si faltaba `default` (corrupción) o migración de layout, persistir. Las demás builtins no se reinsertan si el usuario las borró. */
      if (migrated || ensuredDefault) {
        const hasActive = templates.some((t) => t.id === data.activeId)
        const out = {
          activeId: hasActive ? String(data.activeId) : templates[0].id,
          templates,
        }
        write(out)
        return out
      }
      const hasActive = templates.some((t) => t.id === data.activeId)
      return {
        activeId: hasActive ? String(data.activeId) : templates[0].id,
        templates,
      }
    } catch {
      const s = seed()
      write(s)
      return s
    }
  }

  function write(data) {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8')
  }

  return {
    list() {
      return read()
    },
    getActive() {
      const { templates, activeId } = read()
      return templates.find((t) => t.id === activeId) || templates[0] || createDefaultTemplate()
    },
    upsert(template) {
      const now = new Date().toISOString()
      const t = normalizeTemplate(template)
      if (!t.id) t.id = `tpl_${Date.now()}_${Math.floor(Math.random() * 10000)}`
      const data = read()
      const ix = data.templates.findIndex((x) => x.id === t.id)
      if (ix >= 0) {
        t.createdAt = data.templates[ix].createdAt || now
        t.updatedAt = now
        data.templates[ix] = t
      } else {
        t.createdAt = now
        t.updatedAt = now
        data.templates.push(t)
      }
      write(data)
      return t
    },
    remove(id) {
      const data = read()
      if (String(id) === 'default') return data
      const next = data.templates.filter((t) => t.id !== id)
      if (next.length === 0) {
        const seeded = seed()
        write(seeded)
        return seeded
      }
      const activeId = data.activeId === id ? next[0].id : data.activeId
      const out = { activeId, templates: next }
      write(out)
      return out
    },
    setActive(id) {
      const data = read()
      if (!data.templates.some((t) => t.id === id)) return data
      const out = { ...data, activeId: id }
      write(out)
      return out
    },
    restoreDefault() {
      const data = read()
      const fresh = createDefaultTemplate()
      const now = new Date().toISOString()
      fresh.createdAt = now
      fresh.updatedAt = now
      const ix = data.templates.findIndex((t) => t.id === 'default')
      if (ix >= 0) data.templates[ix] = fresh
      else data.templates.unshift(fresh)
      const out = { activeId: 'default', templates: data.templates }
      write(out)
      return out
    },
    duplicate(id) {
      const data = read()
      const src = data.templates.find((t) => t.id === id) || createDefaultTemplate()
      const now = new Date().toISOString()
      const copy = normalizeTemplate({
        ...src,
        id: `tpl_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
        name: `${src.name || 'Plantilla'} (copia)`,
        createdAt: now,
        updatedAt: now,
      })
      data.templates.push(copy)
      write(data)
      return copy
    },
  }
}

module.exports = { createLabelTemplatesStore }
