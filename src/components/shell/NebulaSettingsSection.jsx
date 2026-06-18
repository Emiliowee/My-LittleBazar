import { useState, useEffect, useCallback, useMemo } from 'react'
import { Palette, Code2, Sun, Moon, Monitor, CheckCircle2, RotateCcw, Eye, Sliders, Layers } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { useTheme } from '@/theme/ThemeProvider.jsx'
import { NEBULA_PRESETS } from '@/theme/NebulaPresets.js'
import { cn } from '@/lib/utils'

/* ── Tokens editables desde la interfaz gráfica ─────────────────────── */
const VISUAL_TOKENS = [
  { key: '--mlb-accent',        label: 'Color de acento',       type: 'color', defaultLight: '#ff6363', defaultDark: '#ff6363' },
  { key: '--mlb-bg-desktop',    label: 'Fondo de escritorio',   type: 'color', defaultLight: '#f3f0f4', defaultDark: '#0e0e0e' },
  { key: '--mlb-bg-app',        label: 'Fondo de aplicación',   type: 'color', defaultLight: '#ffffff', defaultDark: '#161616' },
  { key: '--mlb-bg-panel',      label: 'Fondo de paneles',      type: 'color', defaultLight: '#f7f6f8', defaultDark: '#1f1f1f' },
  { key: '--mlb-text-primary',  label: 'Texto principal',       type: 'color', defaultLight: '#1a1a1a', defaultDark: '#ececec' },
  { key: '--mlb-text-secondary',label: 'Texto secundario',      type: 'color', defaultLight: '#6b6b6b', defaultDark: '#9d9d9d' },
  { key: '--mlb-border',        label: 'Borde general',         type: 'color', defaultLight: '#e0dde2', defaultDark: '#2a2a2a' },
]

function hexToStyle(hex) {
  return hex && hex.startsWith('#') ? hex : undefined
}



/* ── Vista previa en miniatura ───────────────────────────────────────── */
function MiniPreview({ tokens }) {
  const bg = tokens['--mlb-bg-desktop'] || '#0e0e0e'
  const app = tokens['--mlb-bg-app'] || '#161616'
  const panel = tokens['--mlb-bg-panel'] || '#1f1f1f'
  const accent = tokens['--mlb-accent'] || '#ff6363'
  const text = tokens['--mlb-text-primary'] || '#ececec'
  const textSec = tokens['--mlb-text-secondary'] || '#9d9d9d'
  const border = tokens['--mlb-border'] || '#2a2a2a'

  return (
    <div className="flex flex-col gap-3">
      <h4 className="text-[13px] font-semibold text-[var(--mlb-text-primary)]">Vista Previa</h4>

      {/* Mini app shell */}
      <div
        className="relative overflow-hidden rounded-xl border shadow-lg"
        style={{ background: bg, borderColor: border, width: '100%', height: 220 }}
      >
        {/* Sidebar */}
        <div
          className="absolute left-0 top-0 bottom-0 flex flex-col gap-1.5 p-2"
          style={{ width: 52, background: panel, borderRight: `1px solid ${border}` }}
        >
          <div className="h-5 w-5 rounded-md mx-auto mt-1" style={{ background: accent }} />
          <div className="h-3 w-8 rounded mx-auto mt-3" style={{ background: textSec, opacity: 0.3 }} />
          <div className="h-3 w-8 rounded mx-auto mt-1" style={{ background: textSec, opacity: 0.2 }} />
          <div className="h-3 w-8 rounded mx-auto mt-1" style={{ background: textSec, opacity: 0.2 }} />
        </div>

        {/* Main content area */}
        <div className="absolute left-[52px] top-0 right-0 bottom-0 flex flex-col" style={{ background: app }}>
          {/* Header bar */}
          <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: `1px solid ${border}` }}>
            <div className="h-2.5 w-16 rounded" style={{ background: text, opacity: 0.6 }} />
            <div className="ml-auto h-2 w-8 rounded" style={{ background: textSec, opacity: 0.3 }} />
          </div>

          {/* Content cards */}
          <div className="flex-1 p-3 flex flex-col gap-2">
            <div className="flex gap-2">
              <div className="flex-1 rounded-lg p-2" style={{ background: panel, border: `1px solid ${border}` }}>
                <div className="h-2 w-12 rounded mb-1.5" style={{ background: text, opacity: 0.5 }} />
                <div className="h-1.5 w-20 rounded" style={{ background: textSec, opacity: 0.3 }} />
                <div className="h-1.5 w-16 rounded mt-1" style={{ background: textSec, opacity: 0.2 }} />
              </div>
              <div className="flex-1 rounded-lg p-2" style={{ background: panel, border: `1px solid ${border}` }}>
                <div className="h-2 w-10 rounded mb-1.5" style={{ background: text, opacity: 0.5 }} />
                <div className="h-1.5 w-14 rounded" style={{ background: textSec, opacity: 0.3 }} />
              </div>
            </div>

            {/* Table-like rows */}
            <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${border}` }}>
              {[0, 1, 2].map(i => (
                <div key={i} className="flex items-center gap-2 px-2 py-1.5" style={{ borderBottom: i < 2 ? `1px solid ${border}` : 'none', background: i === 0 ? panel : 'transparent' }}>
                  <div className="h-1.5 w-4 rounded-full" style={{ background: accent, opacity: i === 1 ? 1 : 0.4 }} />
                  <div className="h-1.5 w-12 rounded" style={{ background: text, opacity: 0.4 }} />
                  <div className="ml-auto h-1.5 w-6 rounded" style={{ background: textSec, opacity: 0.2 }} />
                </div>
              ))}
            </div>

            {/* Action button */}
            <div className="mt-auto flex justify-end">
              <div className="h-5 w-16 rounded-md" style={{ background: accent }} />
            </div>
          </div>
        </div>
      </div>

      {/* Color swatch row */}
      <div className="flex gap-1.5">
        {[bg, app, panel, accent, text, textSec, border].map((c, i) => (
          <div key={i} className="size-5 rounded-md border border-white/10 shadow-sm" style={{ background: c }} title={c} />
        ))}
      </div>
    </div>
  )
}

/* ── Componente principal ────────────────────────────────────────────── */
export function NebulaSettingsSection() {
  const { themePref, setTheme, nebulaThemeId, setNebulaTheme, customNebulaCss, setCustomCss } = useTheme()
  const [activeTab, setActiveTab] = useState('presets')
  const [draftCss, setDraftCss] = useState(customNebulaCss || '')

  // GUI color state
  const [colorOverrides, setColorOverrides] = useState({})
  const [enableMica, setEnableMica] = useState(false)

  useEffect(() => {
    setDraftCss(customNebulaCss || '')
    // Parse existing CSS to populate color pickers
    if (customNebulaCss) {
      const parsed = {}
      for (const line of customNebulaCss.split('\n')) {
        const m = line.match(/^\s*(--[\w-]+)\s*:\s*(.+?)\s*;?\s*$/)
        if (m) parsed[m[1]] = m[2]
      }
      setColorOverrides(parsed)
      setEnableMica(customNebulaCss.includes('--background: transparent'))
    }
  }, [customNebulaCss])

  const baseThemes = [
    { id: 'light',  Icon: Sun,     label: 'Claro' },
    { id: 'dark',   Icon: Moon,    label: 'Oscuro' },
    { id: 'system', Icon: Monitor, label: 'Sistema' },
  ]

  const handleColorChange = useCallback((key, value) => {
    setColorOverrides(prev => ({ ...prev, [key]: value }))
  }, [])

  const previewTokens = useMemo(() => {
    const isDark = themePref === 'dark' || (themePref === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches)
    const base = {}
    for (const t of VISUAL_TOKENS) {
      base[t.key] = isDark ? t.defaultDark : t.defaultLight
    }
    return { ...base, ...colorOverrides }
  }, [colorOverrides, themePref])

  const applyVisualChanges = useCallback(() => {
    let css = ''
    if (enableMica) {
      css += '--background: transparent;\n--mlb-bg-app: transparent;\n--mlb-bg-desktop: transparent;\n'
    }
    for (const [k, v] of Object.entries(colorOverrides)) {
      if (v && v.trim()) {
        css += `${k}: ${v};\n`
      }
    }
    setDraftCss(css)
    void setCustomCss(css)
  }, [colorOverrides, enableMica, setCustomCss])

  const handleReset = () => {
    void setNebulaTheme(null)
    void setCustomCss('')
    setDraftCss('')
    setColorOverrides({})
    setEnableMica(false)
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--mlb-border)] px-5 py-3">
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight text-[var(--mlb-text-primary)]">Apariencia</h2>
          <p className="text-[11.5px] text-[var(--mlb-text-secondary)]">Personaliza el aspecto visual del sistema.</p>
        </div>
        <div className="flex items-center rounded-lg bg-[var(--mlb-bg-active)] p-0.5 border border-[var(--mlb-border)]">
          {baseThemes.map(({ id, Icon, label }) => {
            const isActive = themePref === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => void setTheme(id)}
                className={cn(
                  'relative flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-all',
                  isActive
                    ? 'bg-[var(--mlb-bg-panel)] text-[var(--mlb-text-primary)] shadow-sm'
                    : 'text-[var(--mlb-text-muted)] hover:text-[var(--mlb-text-secondary)]'
                )}
              >
                <Icon size={12} strokeWidth={isActive ? 2 : 1.5} />
                {label}
              </button>
            )
          })}
        </div>
      </header>

      {/* Tabs */}
      <div className="flex items-center gap-0 border-b border-[var(--mlb-border)] px-5">
        {[
          { id: 'presets', label: 'Temas', icon: Palette },
          { id: 'visual',  label: 'Editor Visual', icon: Sliders },
          { id: 'css',     label: 'CSS Avanzado', icon: Code2 },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={cn(
              "relative flex items-center gap-1.5 px-4 py-2.5 text-[12.5px] font-medium transition-colors",
              activeTab === id ? "text-[var(--mlb-text-primary)]" : "text-[var(--mlb-text-muted)] hover:text-[var(--mlb-text-secondary)]"
            )}
          >
            <Icon size={13} strokeWidth={1.7} />
            {label}
            {activeTab === id && (
              <motion.div layoutId="appearance-tab" className="absolute bottom-0 left-2 right-2 h-[2px] rounded-t-full bg-[var(--mlb-accent)]" />
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          {activeTab === 'presets' && (
            <motion.div
              key="presets"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="p-5"
            >
              <div className="grid grid-cols-3 gap-3">
                {/* Default / none */}
                <button
                  onClick={() => void setNebulaTheme(null)}
                  className={cn(
                    "group relative flex aspect-[16/10] flex-col overflow-hidden rounded-xl border transition-all",
                    nebulaThemeId === null
                      ? "border-[var(--mlb-accent)] ring-2 ring-[var(--mlb-accent-soft)]"
                      : "border-[var(--mlb-border-strong)] hover:border-[var(--mlb-accent)]/40"
                  )}
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-[var(--mlb-bg-active)] to-[var(--mlb-bg-hover)]" />
                  <div className="absolute inset-0 flex flex-col p-3 z-10">
                    <div className="flex items-start justify-between">
                      <span className={cn("text-[12px] font-semibold", nebulaThemeId === null ? "text-[var(--mlb-accent)]" : "text-[var(--mlb-text-primary)]")}>Estándar</span>
                      {nebulaThemeId === null && <CheckCircle2 size={14} className="text-[var(--mlb-accent)]" />}
                    </div>
                    <span className="mt-auto text-[10px] text-[var(--mlb-text-secondary)]">Apariencia por defecto del sistema.</span>
                  </div>
                </button>

                {NEBULA_PRESETS.map(preset => {
                  const isSelected = nebulaThemeId === preset.id
                  const bg = preset.id === 'notion-clean-light' ? 'from-neutral-50 to-neutral-200'
                    : preset.id === 'notion-clean-dark' ? 'from-neutral-800 to-neutral-950'
                    : preset.id === 'duolingo-green' ? 'from-green-400 to-green-600'
                    : preset.scheme === 'dark' ? 'from-slate-800 to-slate-950'
                    : 'from-gray-100 to-white'
                  
                  const isDarkScheme = preset.scheme === 'dark'
                  
                  return (
                    <button
                      key={preset.id}
                      onClick={() => void setNebulaTheme(preset.id)}
                      className={cn(
                        "group relative flex aspect-[16/10] flex-col overflow-hidden rounded-xl border transition-all",
                        isSelected
                          ? "border-[var(--mlb-accent)] ring-2 ring-[var(--mlb-accent-soft)]"
                          : "border-[var(--mlb-border-strong)] hover:border-[var(--mlb-accent)]/40"
                      )}
                    >
                      <div className={cn("absolute inset-0 bg-gradient-to-br", bg)} />
                      <div className="absolute inset-0 flex flex-col p-3 z-10">
                        <div className="flex items-start justify-between">
                          <span className={cn(
                            "text-[12px] font-semibold drop-shadow-sm", 
                            isSelected 
                              ? "text-[var(--mlb-accent)] font-bold" 
                              : (isDarkScheme ? "text-white" : "text-neutral-900")
                          )}>
                            {preset.name}
                          </span>
                          {isSelected && <CheckCircle2 size={14} className="text-[var(--mlb-accent)]" />}
                        </div>
                        <span className={cn(
                          "mt-auto text-[10px] drop-shadow-sm line-clamp-2",
                          isDarkScheme ? "text-white/80" : "text-neutral-700"
                        )}>
                          {preset.description}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </motion.div>
          )}

          {activeTab === 'visual' && (
            <motion.div
              key="visual"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex min-h-0 flex-1"
            >
              <div className="flex flex-1 min-h-0">
                {/* Left: controls */}
                <div className="flex-1 overflow-y-auto p-5 border-r border-[var(--mlb-border)]">
                  {/* Mica toggle */}
                  <div className="flex items-center justify-between rounded-lg border border-[var(--mlb-border)] bg-[var(--mlb-bg-panel-dark)] p-3 mb-5">
                    <div>
                      <span className="text-[13px] font-medium text-[var(--mlb-text-primary)]">Material Translúcido (Mica)</span>
                      <p className="text-[11px] text-[var(--mlb-text-secondary)] mt-0.5">Requiere Windows 11. Habilita la transparencia nativa del sistema.</p>
                    </div>
                    <label className="relative flex cursor-pointer items-center">
                      <input
                        type="checkbox"
                        className="peer sr-only"
                        checked={enableMica}
                        onChange={(e) => setEnableMica(e.target.checked)}
                      />
                      <div className="peer h-5 w-9 rounded-full bg-[var(--mlb-border-strong)] after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-[var(--mlb-accent)] peer-checked:after:translate-x-full peer-focus:outline-none"></div>
                    </label>
                  </div>

                  {/* Color pickers */}
                  <div className="flex flex-col gap-3">
                    <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[var(--mlb-text-muted)]">Colores del Sistema</span>
                    {VISUAL_TOKENS.map(token => {
                      const isDark = themePref === 'dark' || (themePref === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches)
                      const fallback = isDark ? token.defaultDark : token.defaultLight
                      const currentValue = colorOverrides[token.key] || ''
                      return (
                        <div key={token.key} className="flex items-center gap-3">
                          <label className="relative flex shrink-0 cursor-pointer">
                            <input
                              type="color"
                              value={currentValue || fallback}
                              onChange={(e) => handleColorChange(token.key, e.target.value)}
                              className="absolute inset-0 opacity-0 cursor-pointer"
                            />
                            <div
                              className="size-8 rounded-lg border border-[var(--mlb-border-strong)] shadow-sm cursor-pointer"
                              style={{ background: hexToStyle(currentValue) || fallback }}
                            />
                          </label>
                          <div className="flex-1 min-w-0">
                            <span className="text-[12.5px] font-medium text-[var(--mlb-text-primary)]">{token.label}</span>
                            <span className="ml-2 text-[10px] font-mono text-[var(--mlb-text-muted)]">{token.key}</span>
                          </div>
                          {currentValue && (
                            <button
                              onClick={() => {
                                setColorOverrides(prev => {
                                  const next = { ...prev }
                                  delete next[token.key]
                                  return next
                                })
                              }}
                              className="text-[10px] text-[var(--mlb-text-muted)] hover:text-[var(--mlb-danger)]"
                            >
                              Reiniciar
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  <button
                    onClick={applyVisualChanges}
                    className="mt-6 inline-flex h-9 items-center gap-2 rounded-md bg-[var(--mlb-accent)] px-4 text-[12.5px] font-semibold text-white transition-colors hover:bg-[var(--mlb-accent-hover)]"
                  >
                    <Layers size={13} />
                    Aplicar Cambios
                  </button>
                </div>

                {/* Right: live preview */}
                <div className="w-[260px] shrink-0 overflow-y-auto p-5 bg-[var(--mlb-bg-panel-dark)]">
                  <MiniPreview tokens={previewTokens} />
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'css' && (
            <motion.div
              key="css"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="p-5 flex flex-col gap-4"
            >
              <div>
                <h4 className="text-[13px] font-semibold text-[var(--mlb-text-primary)]">Editor CSS Directo</h4>
                <p className="mt-1 text-[11.5px] text-[var(--mlb-text-secondary)]">
                  Inyecta variables CSS para sobreescribir tokens del sistema. Solo recomendado para usuarios avanzados.
                </p>
              </div>

              <textarea
                value={draftCss}
                onChange={e => setDraftCss(e.target.value)}
                placeholder="--mlb-accent: oklch(0.6 0.2 250);"
                className="min-h-[160px] w-full resize-y rounded-lg border border-[var(--mlb-border-strong)] bg-[var(--mlb-bg-input)] p-4 font-mono text-[12px] leading-relaxed text-[var(--mlb-text-primary)] focus:border-[var(--mlb-accent-ring)] focus:outline-none"
              />

              <div className="flex gap-2">
                <button
                  onClick={() => void setCustomCss(draftCss)}
                  className="inline-flex h-9 items-center gap-2 rounded-md bg-[var(--mlb-accent)] px-4 text-[12.5px] font-semibold text-white transition-colors hover:bg-[var(--mlb-accent-hover)]"
                >
                  <Code2 size={13} />
                  Aplicar
                </button>
                {customNebulaCss && (
                  <button
                    onClick={() => { setDraftCss(''); void setCustomCss(''); }}
                    className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--mlb-border-strong)] bg-[var(--mlb-bg-panel)] px-3 text-[12px] font-medium text-[var(--mlb-danger)] transition-colors hover:bg-[var(--mlb-danger)]/10"
                  >
                    Limpiar
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer reset */}
      {(nebulaThemeId || customNebulaCss) && (
        <div className="flex shrink-0 items-center justify-center border-t border-[var(--mlb-border)] py-2.5">
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 text-[11.5px] font-medium text-[var(--mlb-danger)] hover:text-[var(--mlb-danger)]/80"
          >
            <RotateCcw size={12} />
            Restaurar apariencia predeterminada
          </button>
        </div>
      )}
    </div>
  )
}
