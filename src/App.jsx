import React, { useCallback, useEffect, useState } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import { toast } from 'sonner'
import { AnimatePresence, motion } from 'motion/react'
import { Toaster } from '@/components/ui/sonner'
import { ThemeProvider } from '@/theme/ThemeProvider.jsx'
import { AppConfirmProvider } from '@/components/shell/AppConfirmProvider.jsx'
import { MlbChromeHeader } from '@/components/shell/MlbChromeHeader'
import { Omnibar } from '@/components/shell/Omnibar'
import { Dashboard } from '@/components/shell/Dashboard'
import { MlbFooterNav } from '@/components/shell/MlbFooterNav'

import { MlbWorkspaceRail } from '@/components/shell/MlbWorkspace'
/* Vistas pesadas en carga diferida: el arranque solo trae el Inicio; cada
 * modulo (su JS) se descarga la primera vez que se abre. Menos bundle inicial
 * = la app abre mas rapido. */
const LauncherSettingsView = React.lazy(() => import('@/components/shell/LauncherSettingsView').then((m) => ({ default: m.LauncherSettingsView })))
const InventoryView = React.lazy(() => import('@/views/InventoryView').then((m) => ({ default: m.InventoryView })))
const SaldosView = React.lazy(() => import('@/views/SaldosView').then((m) => ({ default: m.SaldosView })))
const ReportesView = React.lazy(() => import('@/views/ReportesView').then((m) => ({ default: m.ReportesView })))
const LabelEditor = React.lazy(() => import('@/components/label-editor/LabelEditor').then((m) => ({ default: m.LabelEditor })))
const LabelTemplatesHub = React.lazy(() => import('@/components/label-editor/LabelTemplatesHub').then((m) => ({ default: m.LabelTemplatesHub })))
import { openPdvWindowAction } from '@/lib/openPdvWindow'
import { useBarcode } from '@/hooks/useBarcode'
import { useScannerKeymapFix } from '@/hooks/useScannerKeymapFix'
import { LabelEditorImmersionProvider, useLabelEditorImmersion } from '@/contexts/LabelEditorImmersionContext.jsx'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary] Se capturó un fallo en el renderizado:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center p-6 text-center bg-[var(--mlb-bg-input)]/30 backdrop-blur-md rounded-xl border border-[var(--mlb-accent-soft)]">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 text-red-500 border border-red-500/20 mb-4">
            ⚠️
          </div>
          <h3 className="text-base font-semibold text-[var(--mlb-text-normal)] mb-1">
            Algo no salió bien aquí
          </h3>
          <p className="text-[12px] text-[var(--mlb-text-muted)] max-w-sm mb-4">
            {this.state.error?.message || 'Error inesperado en este componente.'}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="px-3 py-1.5 text-[12px] font-medium rounded-lg bg-[var(--mlb-accent)] text-white hover:bg-[var(--mlb-accent-hover)] transition-colors active:scale-95 duration-100 shadow-[var(--mlb-shadow-button)]"
            >
              Reintentar
            </button>
            {this.props.onBack && (
              <button
                onClick={this.props.onBack}
                className="px-3 py-1.5 text-[12px] font-medium rounded-lg bg-[var(--mlb-bg-button)] text-[var(--mlb-text-normal)] hover:bg-[var(--mlb-bg-hover)] border border-[var(--mlb-border)] transition-colors active:scale-95 duration-100"
              >
                Regresar al inicio
              </button>
            )}
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

const LAYOUT_BY_SECTION = {
  inicio: 'launcher',
  ajustes: 'workspace',
  inventario: 'workspace',
  saldos: 'workspace',
  reportes: 'workspace',
  etiquetas: 'workspace',
}

const KNOWN_SECTIONS = new Set(Object.keys(LAYOUT_BY_SECTION))

const DEV_SETTINGS = {
  onboardingCompleted: true,
  workspaceDisplayName: 'Mi Bazar',
  enabledModules: [],
}

function getInitialSection() {
  if (typeof window === 'undefined') return 'inicio'
  const hash = String(window.location.hash || '').replace(/^#\/?/, '').trim()
  return KNOWN_SECTIONS.has(hash) ? hash : 'inicio'
}

function hasSettingsBridge() {
  return typeof window !== 'undefined' && typeof window.bazar?.settings?.get === 'function'
}

/* Dimensiones del shell por layout. Workspace usa flex + overflow interno
 * en las vistas; un alto menor evita que la ventana se pierda abajo del monitor. */
const LAYOUT_DIMENSIONS = {
  launcher:   { w: 760, h: 640 },
  onboarding: { w: 720, h: 640 },
  sidebar:    { w: 940, h: 720 },
  /* La sidebar Monserrat (212px) necesita más lienzo que el rail viejo de 60px.
   * Ajustado a 680px de alto para no colisionar con la barra de tareas en laptops 1366x768. */
  workspace:  { w: 1080, h: 680 },
}

const PREMIUM_EASE = [0.2, 0, 0, 1]

function MlbShell() {
  const [section, setSection] = useState(getInitialSection)
  const [settings, setSettings] = useState(() => (hasSettingsBridge() ? null : DEV_SETTINGS))
  const [settingsLoaded, setSettingsLoaded] = useState(() => !hasSettingsBridge())
  const [isMaximized, setIsMaximized] = useState(false)

  // Track maximize state
  useEffect(() => {
    const checkMax = async () => {
      const m = await window.bazar?.window?.isMaximized?.()
      setIsMaximized(!!m)
    }
    void checkMax()
    // Listen for resize events to detect maximize/unmaximize
    const onResize = () => void checkMax()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const platform =
    typeof window !== 'undefined' ? window.bazar?.runtime?.platform ?? '' : ''
  const showWindowControls = platform !== 'darwin'

  const goSection = useCallback((next) => {
    if (typeof window !== 'undefined' && KNOWN_SECTIONS.has(next)) {
      const targetHash = next === 'inicio' ? '' : `#${next}`
      if (window.location.hash !== targetHash) {
        window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${targetHash}`)
      }
    }
    setSection(next)
  }, [])

  /* Carga inicial del settings (decide si mostrar onboarding). */
  const reloadSettings = useCallback(async () => {
    const api = window.bazar?.settings
    if (!api?.get || !api?.set) {
      setSettings(DEV_SETTINGS)
      setSettingsLoaded(true)
      return
    }
    try {
      const s = await api.get()
      if (s && s.onboardingCompleted !== true) {
        s.onboardingCompleted = true
        s.workspaceDisplayName = s.workspaceDisplayName || 'Mi Bazar'
        await api.set(s)
      }
      setSettings(s || null)
    } catch {
      setSettings(null)
    } finally {
      setSettingsLoaded(true)
    }
  }, [])

  useEffect(() => {
    void reloadSettings()
  }, [reloadSettings])

  /* Re-carga settings cada vez que el usuario navega (e.g. cambia plan/logo). */
  useEffect(() => {
    if (!settingsLoaded) return
    void reloadSettings()
  }, [section, settingsLoaded, reloadSettings])

  useEffect(() => {
    const handleStorage = (e) => {
      if (e.key === 'navigate_to' && e.newValue) {
        try {
          const data = JSON.parse(e.newValue)
          if (data?.path) goSection(data.path)
        } catch { /* navigate_to corrupto: ignorar */ }
      }
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [goSection])

  const { active: labelEditorImmersive } = useLabelEditorImmersion()
  const layout = LAYOUT_BY_SECTION[section] ?? 'launcher'
  const baseDim = LAYOUT_DIMENSIONS[layout] ?? LAYOUT_DIMENSIONS.launcher
  const w =
    labelEditorImmersive && typeof window !== 'undefined'
      ? window.screen.availWidth
      : baseDim.w
  const h =
    labelEditorImmersive && typeof window !== 'undefined'
      ? window.screen.availHeight
      : baseDim.h
  const shellReady = settingsLoaded

  const handleBarcodeScan = useCallback(
    async (code) => {
      if (!shellReady) return
      if (typeof document !== 'undefined' && document.querySelector('[data-no-barcode="true"]')) return
      const db = window.bazar?.db

      if (section === 'inventario') {
        const prod = await db?.getProductByCodigo?.(code)
        if (prod) {
          window.dispatchEvent(new CustomEvent('bazar:inventory-open-product', { detail: prod.id }))
          toast.success(`${prod.descripcion || code}`)
        } else {
          toast.error(`No se encontró: ${code}`)
        }
        return
      }

      const prod = await db?.getProductByCodigo?.(code)
      if (prod) {
        void goSection('inventario')
        const pid = prod.id
        queueMicrotask(() => {
          window.dispatchEvent(new CustomEvent('bazar:inventory-open-product', { detail: pid }))
        })
        toast.success(`${prod.descripcion || code}`)
      } else {
        toast.info(`Código: ${code} — No encontrado en inventario`)
      }
    },
    [shellReady, section, goSection],
  )

  useHotkeys(
    'f1',
    () => { void openPdvWindowAction() },
    { preventDefault: true, enabled: shellReady },
    [shellReady],
  )
  useHotkeys(
    'f2',
    () => { void goSection('inventario') },
    { preventDefault: true, enabled: shellReady },
    [shellReady, goSection],
  )
  useBarcode(handleBarcodeScan, { minLength: 3, timeout: 80 })
  useScannerKeymapFix()

  useEffect(() => {
    // Don't resize Electron window when maximized — let it fill the screen
    if (isMaximized) return
    const api = window.bazar?.window
    if (!api?.setShellSize) return undefined
    const delay = platform === 'darwin' ? 420 : 0
    const t = window.setTimeout(() => {
      void api.setShellSize({ width: w, height: h })
    }, delay)
    return () => window.clearTimeout(t)
  }, [w, h, platform, isMaximized])

  return (
    <div className="mlb-desktop box-border flex h-screen min-h-0 w-screen touch-none flex-col items-center justify-center overflow-hidden p-0">
      <motion.div
        initial={false}
        className="mlb-glass flex h-full min-h-0 w-full flex-col overflow-hidden"
        style={{ WebkitAppRegion: 'no-drag' }}
      >
        {showWindowControls ? <MlbChromeHeader section={section} /> : null}

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <AnimatePresence mode="wait" initial={false}>
            {!settingsLoaded ? (
              <motion.div
                key="boot"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18, ease: PREMIUM_EASE }}
                className="grid min-h-0 flex-1 place-items-center text-[12px] text-[var(--mlb-text-muted)]"
              >
                Cargando…
              </motion.div>
            ) : layout === 'launcher' ? (
              <motion.div
                key="launcher"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18, ease: PREMIUM_EASE }}
                className="flex min-h-0 flex-1 flex-col"
              >
                <main className="min-h-0 flex-1 overflow-y-auto">
                  <ErrorBoundary>
                    <Dashboard onNavigate={goSection} settings={settings} />
                  </ErrorBoundary>
                </main>
                <MlbFooterNav section={section} onNavigate={goSection} />
              </motion.div>
            ) : (
              <motion.div
                key="workspace"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18, ease: PREMIUM_EASE }}
                className="flex min-h-0 flex-1"
              >
                <MlbWorkspaceRail
                  section={section}
                  onNavigate={goSection}
                  onBackHome={() => void goSection('inicio')}
                />
                <main
                  data-mlb-workspace-main
                  className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
                >
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                      key={`view-${section}`}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.18, ease: PREMIUM_EASE }}
                      className="flex h-full min-h-0 flex-col"
                    >
                      <React.Suspense fallback={<ViewFallback />}>
                      {section === 'inventario' && (
                        <ErrorBoundary onBack={() => void goSection('inicio')}>
                          <InventoryView />
                        </ErrorBoundary>
                      )}
                      {section === 'saldos' && (
                        <ErrorBoundary onBack={() => void goSection('inicio')}>
                          <SaldosView />
                        </ErrorBoundary>
                      )}
                      {section === 'reportes' && (
                        <ErrorBoundary onBack={() => void goSection('inicio')}>
                          <ReportesView />
                        </ErrorBoundary>
                      )}
                      {section === 'etiquetas' && (
                        <ErrorBoundary onBack={() => void goSection('inicio')}>
                          <EtiquetasLauncher onBack={() => void goSection('inicio')} />
                        </ErrorBoundary>
                      )}
                      {section === 'ajustes' && (
                        <ErrorBoundary onBack={() => void goSection('inicio')}>
                          <LauncherSettingsView
                            onBack={() => void goSection('inicio')}
                            onOpenLabelEditor={() => void goSection('etiquetas')}
                          />
                        </ErrorBoundary>
                      )}
                      </React.Suspense>
                    </motion.div>
                  </AnimatePresence>
                </main>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      <Toaster position="bottom-right" />
    </div>
  )
}

function ViewFallback() {
  return (
    <div className="grid min-h-0 flex-1 place-items-center text-[12px] text-[var(--mlb-text-muted)]">
      Cargando…
    </div>
  )
}

function EtiquetasLauncher({ onBack }) {
  const [editorTplId, setEditorTplId] = useState(null)
  const [hubKey, setHubKey] = useState(0)
  const editing = editorTplId != null

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      {!editing ? (
        <LabelTemplatesHub
          key={hubKey}
          onBack={onBack}
          onOpenEditor={(id) => setEditorTplId(id)}
        />
      ) : (
        <LabelEditor
          key={editorTplId}
          open
          initialTemplateId={editorTplId}
          onClose={() => {
            setEditorTplId(null)
            setHubKey((k) => k + 1)
          }}
        />
      )}
    </div>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <AppConfirmProvider>
        <LabelEditorImmersionProvider>
          <MlbShell />
        </LabelEditorImmersionProvider>
      </AppConfirmProvider>
    </ThemeProvider>
  )
}
