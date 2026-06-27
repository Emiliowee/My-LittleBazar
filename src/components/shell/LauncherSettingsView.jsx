import { useCallback, useEffect, useState } from 'react'
import {
  ArrowLeft, Building2, Paintbrush, Printer, Database, Info,
  ImageIcon, RotateCcw, AlertTriangle, Settings2, Tags, ChevronDown,
  Smile, Search, ReceiptText, Ruler,
} from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { toast } from 'sonner'
import { localPathToFileUrl } from '@/lib/localFileUrl'
import { cn } from '@/lib/utils'
import { NebulaSettingsSection } from './NebulaSettingsSection.jsx'
import {
  NOTION_TAG_COLOR_CLASSIC,
  notionColorDotClass,
  notionTagChipReadonlyClasses,
  normalizeNotionColorKey,
} from '@/lib/propertyTokens'
import { CATEGORIAS_BASE } from '@/lib/altaDetect'
import { emojiDeCategoria } from '@/lib/categoriaEmoji'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { EMOJI_GROUPS, searchEmojis } from '@/lib/emojiCatalog'

const DEFAULT_LOGO = '/branding/logo.jpg'

const SECTIONS = [
  { id: 'workspace',  label: 'Mi bazar',     icon: Building2 },
  { id: 'categorias', label: 'Categorías',   icon: Tags },
  { id: 'appearance', label: 'Apariencia',   icon: Paintbrush },
  { id: 'printing',   label: 'Impresión',    icon: Printer },
  { id: 'data',       label: 'Base de datos',icon: Database },
  { id: 'about',      label: 'Sistema',      icon: Info },
]

export function LauncherSettingsView({ onBack, onOpenLabelEditor }) {
  const [active, setActive] = useState('workspace')
  const [settings, setSettings] = useState(null)

  const reload = useCallback(async () => {
    const s = await window.bazar?.settings?.get?.()
    if (s) setSettings(s)
  }, [])

  useEffect(() => { void reload() }, [reload])

  const patch = useCallback(async (partial) => {
    setSettings((s) => ({ ...(s || {}), ...partial }))
    try { await window.bazar?.settings?.set?.(partial) } catch { /* noop */ }
    // Avisar a la sidebar / encabezados para que refresquen logo y nombre en vivo.
    try { window.dispatchEvent(new CustomEvent('mlb:settings-changed')) } catch { /* noop */ }
  }, [])

  return (
    <div className="flex h-full w-full overflow-hidden" style={{ WebkitAppRegion: 'no-drag' }}>
      {/* Sidebar estilo Mac Settings / Arc */}
      <aside className="relative flex w-[260px] shrink-0 flex-col overflow-hidden bg-[var(--mlb-bg-panel-dark)] backdrop-blur-3xl border-r border-[var(--mlb-border)] z-10">
        
        {/* Cabecera del sidebar */}
        <div className="flex flex-col gap-6 px-5 pt-8 pb-4">
          <button
            type="button"
            onClick={onBack}
            className="group flex w-fit items-center gap-1.5 rounded-full bg-[var(--mlb-bg-hover)] px-3 py-1.5 text-[12px] font-medium text-[var(--mlb-text-secondary)] transition-all hover:bg-[var(--mlb-bg-active)] hover:text-[var(--mlb-text-primary)]"
          >
            <ArrowLeft size={14} />
            Volver al inicio
          </button>
          
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--mlb-accent)] to-[var(--mlb-accent-hover)] text-white shadow-lg shadow-[var(--mlb-accent-soft)]">
              <Settings2 size={20} strokeWidth={2} />
            </div>
            <div>
              <h1 className="text-[17px] font-semibold tracking-tight text-[var(--mlb-text-primary)]">Ajustes</h1>
              <p className="text-[12px] text-[var(--mlb-text-muted)]">Preferencias del sistema</p>
            </div>
          </div>
        </div>

        {/* Navegación */}
        <nav className="flex flex-col gap-1 px-3 mt-4">
          {SECTIONS.map(({ id, label, icon: Icon }) => {
            const isActive = active === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActive(id)}
                className="group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all outline-none"
              >
                {isActive && (
                  <motion.div
                    layoutId="settings-active-tab"
                    className="absolute inset-0 rounded-xl bg-[var(--mlb-bg-active)] shadow-sm border border-[var(--mlb-border)]"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <div className={cn(
                  "relative z-10 flex h-7 w-7 items-center justify-center rounded-lg transition-colors",
                  isActive ? "bg-[var(--mlb-accent)] text-white shadow-md shadow-[var(--mlb-accent-soft)]" : "bg-[var(--mlb-bg-hover)] text-[var(--mlb-text-secondary)] group-hover:bg-[var(--mlb-bg-active)] group-hover:text-[var(--mlb-text-primary)]"
                )}>
                  <Icon size={14} strokeWidth={isActive ? 2 : 1.7} />
                </div>
                <span className={cn(
                  "relative z-10 text-[13px] transition-colors",
                  isActive ? "font-semibold text-[var(--mlb-text-primary)]" : "font-medium text-[var(--mlb-text-secondary)] group-hover:text-[var(--mlb-text-primary)]"
                )}>
                  {label}
                </span>
              </button>
            )
          })}
        </nav>

        <div className="mt-auto px-5 pb-6">
          <div className="rounded-xl border border-[var(--mlb-border)] bg-[var(--mlb-bg-panel)] p-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="h-2 w-2 rounded-full bg-[var(--mlb-success)] shadow-[0_0_8px_var(--mlb-success)]"></div>
              <span className="text-[11px] font-medium text-[var(--mlb-text-secondary)]">Sistema en línea</span>
            </div>
            <p className="text-[10px] text-[var(--mlb-text-muted)]">Todo está sincronizado y funcionando correctamente.</p>
          </div>
        </div>
      </aside>

      {/* Contenido Principal */}
      <main className="relative flex flex-1 flex-col overflow-hidden bg-[var(--mlb-bg-app)]">
        {settings ? (
          <div className="relative h-full w-full flex flex-col min-h-0">
            <AnimatePresence mode="wait">
              <motion.div
                key={active}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
                className="flex-1 overflow-y-auto min-h-0"
              >
                {active === 'appearance' ? <NebulaSettingsSection /> : (
                  <div className="max-w-3xl px-8 py-8">
                    {active === 'workspace'  ? <WorkspaceSection  settings={settings} onPatch={patch} onReload={reload} /> : null}
                    {active === 'categorias' ? <CategoriasSection settings={settings} onPatch={patch} /> : null}
                    {active === 'printing'
                      ? (
                        <PrintingSection
                          settings={settings}
                          onPatch={patch}
                          onOpenLabelEditor={onOpenLabelEditor}
                        />
                      )
                      : null}
                    {active === 'data'       ? <DataSection /> : null}
                    {active === 'about'      ? <AboutSection /> : null}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        ) : (
          <div className="grid h-full place-items-center">
            <div className="flex items-center gap-3 text-[var(--mlb-text-muted)]">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"></div>
              <span className="text-[13px] font-medium">Cargando preferencias...</span>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

function SectionHeader({ title, description }) {
  return (
    <div className="mb-10 max-w-2xl">
      <h2 className="text-[28px] font-bold tracking-tight text-[var(--mlb-text-primary)] mb-2">
        {title}
      </h2>
      {description && (
        <p className="text-[14px] leading-relaxed text-[var(--mlb-text-secondary)]">
          {description}
        </p>
      )}
    </div>
  )
}

function PremiumCard({ children, className }) {
  return (
    <div className={cn("overflow-hidden rounded-2xl border border-[var(--mlb-border-strong)] bg-[var(--mlb-bg-panel)]/50 backdrop-blur-xl shadow-sm", className)}>
      {children}
    </div>
  )
}

/* ── Workspace ─────────────────────────────────────────────────────────── */
function WorkspaceSection({ settings, onPatch }) {
  const [name, setName] = useState(String(settings.workspaceDisplayName ?? 'Mi bazar'))

  useEffect(() => {
    setName(String(settings.workspaceDisplayName ?? 'Mi bazar'))
  }, [settings.workspaceDisplayName])

  const logoPreview = settings.workspaceLogoPath
    ? localPathToFileUrl(String(settings.workspaceLogoPath))
    : DEFAULT_LOGO
  const initial = String(name || '?').trim().charAt(0).toUpperCase() || 'B'

  const pickLogo = async () => {
    const pick = window.bazar?.productImage?.pick
    if (!pick) { toast.error('Solo en escritorio'); return }
    try {
      const r = await pick()
      if (r?.cancelled || !r?.path) return
      await onPatch({ workspaceLogoPath: r.path })
      toast.success('Logo actualizado')
    } catch (err) { toast.error(String(err?.message || err)) }
  }

  return (
    <div className="flex flex-col pb-20">
      <SectionHeader
        title="Identidad del Bazar"
        description="Configura el nombre y logotipo de tu espacio de trabajo. Estos detalles se utilizan en los tickets, etiquetas y en la interfaz general."
      />
      
      <div className="grid max-w-2xl gap-8">
        <PremiumCard className="p-6">
          <div className="flex items-center gap-6">
            <div className="relative group shrink-0">
              {settings.workspaceLogoPath ? (
                <img
                  src={logoPreview}
                  alt=""
                  onError={(e) => { e.currentTarget.style.display = 'none' }}
                  className="size-24 rounded-2xl object-cover shadow-lg border border-[var(--mlb-border)]"
                />
              ) : (
                <div className="grid size-24 place-items-center rounded-2xl bg-gradient-to-br from-[var(--mlb-accent)] to-[var(--mlb-accent-hover)] text-[32px] font-bold text-white shadow-lg shadow-[var(--mlb-accent-soft)]">
                  {initial}
                </div>
              )}
              <button 
                onClick={pickLogo}
                className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/50 opacity-0 transition-opacity group-hover:opacity-100"
              >
                <ImageIcon className="text-white" size={24} />
              </button>
            </div>
            
            <div className="flex-1">
              <label className="mb-2 block text-[13px] font-medium text-[var(--mlb-text-secondary)]">Nombre comercial</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={(e) => onPatch({ workspaceDisplayName: e.target.value.trim() || 'Mi bazar' })}
                maxLength={48}
                className="w-full rounded-xl border border-[var(--mlb-border-strong)] bg-[var(--mlb-bg-input)] px-4 py-3 text-[15px] font-medium text-[var(--mlb-text-primary)] shadow-sm transition-all focus:border-[var(--mlb-accent)] focus:outline-none focus:ring-4 focus:ring-[var(--mlb-accent-soft)]"
              />
              <div className="mt-4 flex gap-3">
                <button
                  onClick={() => {
                    if (!name.trim()) { toast.error('El nombre no puede estar vacío'); return }
                    onPatch({ workspaceDisplayName: name.trim() })
                    toast.success('Nombre actualizado')
                  }}
                  className="rounded-lg bg-[var(--mlb-bg-hover)] px-4 py-2 text-[13px] font-medium text-[var(--mlb-text-secondary)] transition-colors hover:bg-[var(--mlb-accent)] hover:text-white"
                >
                  Guardar nombre
                </button>
                <button
                  type="button"
                  onClick={pickLogo}
                  className="rounded-lg bg-[var(--mlb-bg-active)] px-4 py-2 text-[13px] font-medium text-[var(--mlb-text-primary)] transition-colors hover:bg-[var(--mlb-bg-hover)]"
                >
                  Cambiar imagen
                </button>
                {settings.workspaceLogoPath && (
                  <button
                    type="button"
                    onClick={() => void onPatch({ workspaceLogoPath: '' })}
                    className="rounded-lg px-4 py-2 text-[13px] font-medium text-[var(--mlb-danger)] transition-colors hover:bg-[var(--mlb-danger)]/10"
                  >
                    Quitar logo
                  </button>
                )}
              </div>
            </div>
          </div>
        </PremiumCard>


      </div>
    </div>
  )
}

/* ── Impresión ─────────────────────────────────────────────────────────── */
const TICKET_DESIGN_DEFAULT = {
  paperWidthMm: 80,
  subtitle: 'Salditos Monserrat',
  footerText: 'Gracias por tu compra',
  showItemCodes: true,
  showCreditSignature: true,
}

function normalizeTicketDesign(raw) {
  const src = raw && typeof raw === 'object' ? raw : {}
  const width = Number(src.paperWidthMm)
  return {
    ...TICKET_DESIGN_DEFAULT,
    ...src,
    paperWidthMm: width === 58 ? 58 : 80,
    subtitle: String(src.subtitle ?? TICKET_DESIGN_DEFAULT.subtitle),
    footerText: String(src.footerText ?? TICKET_DESIGN_DEFAULT.footerText),
    showItemCodes: src.showItemCodes !== false,
    showCreditSignature: src.showCreditSignature !== false,
  }
}

function PrintingSection({ settings, onPatch, onOpenLabelEditor }) {
  const [printers, setPrinters] = useState([])
  const ticketDesign = normalizeTicketDesign(settings.ticketDesign)
  const mismaImpresora =
    settings.devicePrinterLabelsName &&
    settings.devicePrinterTicketsName &&
    settings.devicePrinterLabelsName === settings.devicePrinterTicketsName

  useEffect(() => {
    let alive = true
    void window.bazar?.printers?.list?.().then((rows) => {
      if (alive && Array.isArray(rows)) setPrinters(rows)
    }).catch(() => {})
    return () => { alive = false }
  }, [])

  const patchTicket = (partial) => {
    void onPatch({ ticketDesign: { ...ticketDesign, ...partial } })
  }

  return (
    <div className="flex flex-col pb-20">
      <SectionHeader
        title="Impresión"
        description="La app separa la impresora de etiquetas de la impresora de tickets. Así cada botón manda a la máquina correcta."
      />
      <div className="grid max-w-3xl gap-6">
        <PremiumCard className="p-8">
          <div className="mb-6 flex items-start gap-4">
            <div className="grid size-12 place-items-center rounded-xl bg-[var(--mlb-bg-active)] text-[var(--mlb-text-primary)]">
              <Printer size={20} />
            </div>
            <div>
              <h3 className="text-[16px] font-semibold text-[var(--mlb-text-primary)]">Dispositivos de impresión</h3>
              <p className="mt-1 text-[13px] leading-relaxed text-[var(--mlb-text-secondary)]">
                Etiquetas y tickets se configuran por separado. No se guardan tarjetas ni datos bancarios.
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <PrinterSelect
              icon={Printer}
              label="Etiquetas"
              description="Códigos de barras y etiquetas de inventario."
              value={settings.devicePrinterLabelsName || ''}
              printers={printers}
              onChange={(value) => void onPatch({ devicePrinterLabelsName: value })}
            />
            <PrinterSelect
              icon={ReceiptText}
              label="Tickets"
              description="Comprobantes de venta y reimpresiones."
              value={settings.devicePrinterTicketsName || ''}
              printers={printers}
              onChange={(value) => void onPatch({ devicePrinterTicketsName: value })}
            />
          </div>

          {mismaImpresora ? (
            <div className="mt-4 rounded-xl border border-[var(--mlb-border-strong)] bg-[var(--mlb-bg-hover)] px-4 py-3 text-[12.5px] font-medium text-[var(--mlb-text-secondary)]">
              Las dos salidas apuntan a la misma impresora. Si la dueña tendrá una máquina para etiquetas y otra para tickets, elegí una distinta en Tickets.
            </div>
          ) : null}
        </PremiumCard>

        <PremiumCard className="p-8">
          <div className="mt-6 flex items-center justify-between rounded-xl border border-[var(--mlb-border)] bg-[var(--mlb-bg-hover)] p-4">
            <div>
              <span className="block text-[14px] font-medium text-[var(--mlb-text-primary)]">Etiquetas</span>
              <span className="text-[12px] text-[var(--mlb-text-secondary)]">Imprimir al guardar nuevo producto</span>
            </div>
            <label className="relative flex cursor-pointer items-center">
              <input 
                type="checkbox" 
                className="peer sr-only" 
                checked={!!settings.printLabelAfterSave}
                onChange={(e) => void onPatch({ printLabelAfterSave: e.target.checked })}
              />
              <div className="peer h-6 w-11 rounded-full bg-[var(--mlb-border-strong)] after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-[var(--mlb-accent)] peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[var(--mlb-accent-soft)] dark:border-gray-600 dark:bg-gray-700"></div>
            </label>
          </div>

          <div className="mt-8 border-t border-[var(--mlb-border)] pt-6">
            <button
              type="button"
              onClick={() => onOpenLabelEditor?.()}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--mlb-border-strong)] bg-[var(--mlb-bg-panel)] px-5 text-[13px] font-medium text-[var(--mlb-text-primary)] shadow-sm transition-colors hover:bg-[var(--mlb-bg-hover)]"
            >
              <Paintbrush size={16} className="text-[var(--mlb-accent)]" />
              Abrir Editor Visual de Etiquetas
            </button>
          </div>
        </PremiumCard>

        <PremiumCard className="grid gap-7 p-8 lg:grid-cols-[1fr_260px]">
          <div>
            <div className="mb-6 flex items-start gap-4">
              <div className="grid size-12 place-items-center rounded-xl bg-[var(--mlb-bg-active)] text-[var(--mlb-text-primary)]">
                <ReceiptText size={20} />
              </div>
              <div>
                <h3 className="text-[16px] font-semibold text-[var(--mlb-text-primary)]">Diseño del ticket</h3>
                <p className="mt-1 text-[13px] leading-relaxed text-[var(--mlb-text-secondary)]">
                  Ajustes rápidos para el papel térmico y el texto del comprobante.
                </p>
              </div>
            </div>

            <div className="grid gap-4">
              <div>
                <span className="mb-2 block text-[12px] font-semibold uppercase tracking-wide text-[var(--mlb-text-muted)]">Ancho del papel</span>
                <div className="inline-grid grid-cols-2 rounded-xl border border-[var(--mlb-border-strong)] bg-[var(--mlb-bg-input)] p-1">
                  {[58, 80].map((mm) => (
                    <button
                      key={mm}
                      type="button"
                      onClick={() => patchTicket({ paperWidthMm: mm })}
                      className={cn(
                        'inline-flex h-9 min-w-24 items-center justify-center gap-2 rounded-lg px-3 text-[13px] font-semibold transition-colors',
                        ticketDesign.paperWidthMm === mm
                          ? 'bg-[var(--mlb-bg-panel)] text-[var(--mlb-text-primary)] shadow-sm'
                          : 'text-[var(--mlb-text-muted)] hover:text-[var(--mlb-text-primary)]',
                      )}
                    >
                      <Ruler size={14} strokeWidth={1.9} />
                      {mm} mm
                    </button>
                  ))}
                </div>
              </div>

              <label className="grid gap-1.5">
                <span className="text-[12px] font-semibold uppercase tracking-wide text-[var(--mlb-text-muted)]">Texto debajo del nombre</span>
                <input
                  value={ticketDesign.subtitle}
                  maxLength={42}
                  onChange={(e) => patchTicket({ subtitle: e.target.value })}
                  className="h-10 rounded-xl border border-[var(--mlb-border-strong)] bg-[var(--mlb-bg-input)] px-3 text-[14px] font-medium text-[var(--mlb-text-primary)] outline-none transition-colors focus:border-[var(--mlb-accent)]"
                />
              </label>

              <label className="grid gap-1.5">
                <span className="text-[12px] font-semibold uppercase tracking-wide text-[var(--mlb-text-muted)]">Mensaje final</span>
                <textarea
                  value={ticketDesign.footerText}
                  maxLength={90}
                  onChange={(e) => patchTicket({ footerText: e.target.value })}
                  className="min-h-20 resize-none rounded-xl border border-[var(--mlb-border-strong)] bg-[var(--mlb-bg-input)] px-3 py-2.5 text-[14px] leading-relaxed text-[var(--mlb-text-primary)] outline-none transition-colors focus:border-[var(--mlb-accent)]"
                />
              </label>

              <div className="grid gap-2 rounded-xl border border-[var(--mlb-border)] bg-[var(--mlb-bg-hover)] p-3">
                <TicketToggle
                  label="Mostrar códigos de producto"
                  checked={ticketDesign.showItemCodes}
                  onChange={(checked) => patchTicket({ showItemCodes: checked })}
                />
                <TicketToggle
                  label="Pedir firma cuando sea fiado"
                  checked={ticketDesign.showCreditSignature}
                  onChange={(checked) => patchTicket({ showCreditSignature: checked })}
                />
              </div>
            </div>
          </div>

          <TicketPreview settings={settings} design={ticketDesign} />
        </PremiumCard>
      </div>
    </div>
  )
}

function PrinterSelect({ icon: Icon, label, description, value, printers, onChange }) {
  return (
    <label className="block rounded-2xl border border-[var(--mlb-border)] bg-[var(--mlb-bg-hover)] p-4">
      <span className="mb-3 flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--mlb-bg-panel)] text-[var(--mlb-text-secondary)]">
          <Icon size={17} strokeWidth={1.9} />
        </span>
        <span>
          <span className="block text-[14px] font-semibold text-[var(--mlb-text-primary)]">{label}</span>
          <span className="mt-0.5 block text-[12px] leading-snug text-[var(--mlb-text-muted)]">{description}</span>
        </span>
      </span>
      <select
        className="w-full rounded-xl border border-[var(--mlb-border-strong)] bg-[var(--mlb-bg-input)] px-3 py-2.5 text-[13.5px] text-[var(--mlb-text-primary)] shadow-sm outline-none transition-colors focus:border-[var(--mlb-accent)]"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Automática / predeterminada</option>
        {printers.map((name) => <option key={name} value={name}>{name}</option>)}
      </select>
    </label>
  )
}

function TicketToggle({ label, checked, onChange }) {
  return (
    <label className="flex items-center justify-between gap-4">
      <span className="text-[13px] font-medium text-[var(--mlb-text-secondary)]">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 accent-[var(--mlb-accent)]"
      />
    </label>
  )
}

function TicketPreview({ settings, design }) {
  const name = String(settings.workspaceDisplayName || 'My Little Bazar').trim()
  return (
    <div className="rounded-2xl border border-[var(--mlb-border)] bg-[var(--mlb-bg-app)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--mlb-text-muted)]">Vista previa</span>
        <span className="rounded-full bg-[var(--mlb-bg-active)] px-2 py-0.5 text-[11px] font-semibold text-[var(--mlb-text-muted)]">{design.paperWidthMm} mm</span>
      </div>
      <div className="mx-auto max-w-[190px] rounded-sm bg-white px-3 py-4 font-mono text-[#111827] shadow-[0_18px_45px_rgba(15,23,42,0.14)]">
        <div className="text-center text-[12px] font-bold uppercase leading-tight">{name}</div>
        {design.subtitle ? <div className="mt-1 text-center text-[8px] uppercase tracking-wide text-[#6b7280]">{design.subtitle}</div> : null}
        <div className="my-3 border-t border-dashed border-[#9ca3af]" />
        <div className="space-y-1 text-[9px]">
          <div className="flex justify-between gap-2"><span>1x Vestido largo</span><span>$350.00</span></div>
          {design.showItemCodes ? <div className="text-[7.5px] text-[#6b7280]">MSR-00042</div> : null}
          <div className="flex justify-between gap-2"><span>1x Labial</span><span>$80.00</span></div>
          {design.showItemCodes ? <div className="text-[7.5px] text-[#6b7280]">MSR-00043</div> : null}
        </div>
        <div className="my-3 border-t border-[#111827]" />
        <div className="flex justify-between text-[11px] font-bold"><span>TOTAL</span><span>$430.00</span></div>
        {design.showCreditSignature ? <div className="mt-6 border-t border-[#111827] pt-1 text-center text-[7px] text-[#6b7280]">Firma si es fiado</div> : null}
        {design.footerText ? <div className="mt-4 text-center text-[8px] font-semibold">{design.footerText}</div> : null}
      </div>
    </div>
  )
}

/* ── Datos ─────────────────────────────────────────────────────────────── */
function DataSection() {
  const [busy, setBusy] = useState(false)
  const resetDb = async () => {
    const api = window.bazar?.db?.resetToFactorySeed
    if (!api) { toast.error('Solo disponible en escritorio.'); return }
    const confirmed = window.confirm('¿Borrar TODA la base de datos y cargar datos demo?\n\nEsta acción no se puede deshacer.')
    if (!confirmed) return
    setBusy(true)
    try {
      const res = await api()
      if (res?.ok) toast.success(`Base reiniciada: ${res.productCount ?? 0} artículos demo.`)
      else toast.error(res?.message || 'Error al reiniciar')
    } catch (e) {
      toast.error(String(e?.message || e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-col pb-20">
      <SectionHeader
        title="Base de Datos Local"
        description="El bazar almacena todo localmente mediante SQLite para garantizar máxima privacidad y rapidez."
      />
      <div className="grid max-w-2xl gap-6">
        <PremiumCard className="p-8 border-[var(--mlb-danger)]/30 bg-[var(--mlb-danger)]/5">
          <div className="mb-4 flex items-center gap-3 text-[var(--mlb-danger)]">
            <AlertTriangle size={24} strokeWidth={2} />
            <h3 className="text-[18px] font-bold">Zona de Peligro</h3>
          </div>
          <p className="mb-6 text-[14px] leading-relaxed text-[var(--mlb-text-secondary)]">
            Al realizar esta acción, se eliminará el 100% de la información de tu bazar (productos, clientes, cuentas corrientes, ventas) y se restaurarán datos de demostración. <strong>No hay marcha atrás.</strong>
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void resetDb()}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--mlb-danger)] px-6 text-[14px] font-semibold text-white shadow-md shadow-[var(--mlb-danger)]/20 transition-transform active:scale-[0.98] disabled:opacity-50"
          >
            {busy ? 'Destruyendo...' : 'Destruir base de datos y cargar demo'}
          </button>
        </PremiumCard>
      </div>
    </div>
  )
}

/* ── Acerca de ─────────────────────────────────────────────────────────── */
function AboutSection() {
  const [reset, setReset] = useState(false)
  const handleResetOnboarding = async () => {
    if (!window.bazar?.settings?.set) return
    try {
      await window.bazar.settings.set({ onboardingCompleted: false, selectedPlan: null })
      toast.success('Onboarding reiniciado. Reabrí la app para verlo.')
    } catch (err) {
      toast.error(String(err?.message || err))
    } finally {
      setReset(true)
    }
  }
  return (
    <div className="flex flex-col pb-20">
      <SectionHeader
        title="Acerca del Sistema"
      />
      <div className="grid max-w-2xl gap-6">
        <PremiumCard className="flex flex-col items-center justify-center p-12 text-center">
          <div className="mb-6 grid size-20 place-items-center rounded-3xl bg-gradient-to-br from-[var(--mlb-bg-active)] to-[var(--mlb-bg-hover)] shadow-inner">
            <Building2 size={32} className="text-[var(--mlb-accent)]" />
          </div>
          <h2 className="text-[24px] font-bold text-[var(--mlb-text-primary)]">My Little Bazar</h2>
          <p className="mt-2 text-[15px] text-[var(--mlb-text-secondary)]">El sistema operativo de tu comercio.</p>
          
          <div className="mt-8 rounded-full bg-[var(--mlb-bg-active)] px-4 py-1.5 font-mono text-[13px] text-[var(--mlb-text-primary)] border border-[var(--mlb-border-strong)]">
            Versión 1.0 (Build Estable)
          </div>
        </PremiumCard>

        <div className="mt-8 text-center">
          <button
            type="button"
            onClick={handleResetOnboarding}
            disabled={reset}
            className="inline-flex items-center gap-2 text-[13px] font-medium text-[var(--mlb-text-muted)] transition-colors hover:text-[var(--mlb-text-primary)] disabled:opacity-40"
          >
            <RotateCcw size={14} />
            Forzar reinicio de Onboarding
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Categorías ────────────────────────────────────────────────────────── */
const isImagePath = (v) =>
  !!v && (/[\\/]/.test(String(v)) || /\.(png|jpe?g|webp|gif|svg|avif)$/i.test(String(v)))

/** Selector de emoji que se ABRE (popover con buscador + categorías), estilo cuaderno. */
function EmojiPickerPopover({ value, onPick, onClear }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const results = q.trim() ? searchEmojis(q) : null

  const choose = (e) => { onPick?.(e); setOpen(false); setQ('') }

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQ('') }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex h-11 items-center gap-2.5 rounded-xl border border-[var(--mlb-border-strong)] bg-[var(--mlb-bg-input)] px-3 text-[13px] font-medium text-[var(--mlb-text-primary)] transition-colors hover:bg-[var(--mlb-bg-hover)]"
        >
          <span className="grid size-7 place-items-center rounded-md bg-[var(--mlb-bg-active)] text-[18px] leading-none">
            {value ? value : <Smile size={16} className="text-[var(--mlb-text-muted)]" />}
          </span>
          {value ? 'Cambiar emoji' : 'Elegir emoji…'}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={8} className="z-[220] w-[320px] p-0">
        <div className="border-b border-[var(--mlb-border)] p-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--mlb-text-muted)]" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar… (vestido, zapato, perfume)"
              className="h-9 w-full rounded-lg border border-[var(--mlb-border-strong)] bg-[var(--mlb-bg-input)] pl-8 pr-3 text-[13px] text-[var(--mlb-text-primary)] outline-none transition-colors placeholder:text-[var(--mlb-text-muted)] focus:border-[var(--mlb-border-focus)]"
            />
          </div>
        </div>

        <div className="max-h-64 overflow-y-auto p-2">
          {results ? (
            results.length > 0 ? (
              <div className="grid grid-cols-8 gap-0.5">
                {results.map((it) => (
                  <button key={it.e} type="button" title={it.k} onClick={() => choose(it.e)} className="grid size-9 place-items-center rounded-md text-[20px] leading-none transition-colors hover:bg-[var(--mlb-bg-hover)]">
                    {it.e}
                  </button>
                ))}
              </div>
            ) : (
              <p className="px-1 py-6 text-center text-[12px] text-[var(--mlb-text-muted)]">Sin resultados para “{q}”.</p>
            )
          ) : (
            EMOJI_GROUPS.map((g) => (
              <div key={g.label} className="mb-2 last:mb-0">
                <p className="px-1 pb-1 pt-1 text-[10px] font-medium uppercase tracking-wide text-[var(--mlb-text-muted)]">{g.label}</p>
                <div className="grid grid-cols-8 gap-0.5">
                  {g.items.map((it) => (
                    <button key={g.label + it.e} type="button" title={it.k} onClick={() => choose(it.e)} className="grid size-9 place-items-center rounded-md text-[20px] leading-none transition-colors hover:bg-[var(--mlb-bg-hover)]">
                      {it.e}
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="flex items-center justify-between border-t border-[var(--mlb-border)] px-3 py-2">
          <span className="text-[11px] text-[var(--mlb-text-muted)]">
            {value ? <>Actual: <span className="text-[14px] leading-none">{value}</span></> : 'Sin ícono'}
          </span>
          <button type="button" onClick={() => { onClear?.(); setOpen(false) }} className="text-[11.5px] font-medium text-[var(--mlb-text-secondary)] transition-colors hover:text-[var(--mlb-text-primary)]">
            Quitar ícono
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function CategoriasSection({ settings, onPatch }) {
  const [cats, setCats] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [iconMode, setIconMode] = useState('emoji')

  const meta = settings.categoriasMeta && typeof settings.categoriasMeta === 'object' ? settings.categoriasMeta : {}

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const rows = (await window.bazar?.db?.getInventoryList?.({ estadoIndex: 0, vistaIndex: 0, listTab: 'main' })) ?? []
        if (!alive) return
        const counts = new Map()
        for (const r of Array.isArray(rows) ? rows : []) {
          const c = String(r.categoria || '').trim()
          if (!c) continue
          counts.set(c, (counts.get(c) || 0) + 1)
        }
        // Siempre mostramos las categorías de fábrica + las propias (de productos).
        const baseSet = new Set(CATEGORIAS_BASE)
        setCats([
          ...CATEGORIAS_BASE.map((nombre) => ({ nombre, count: counts.get(nombre) || 0 })),
          ...[...counts.keys()]
            .filter((n) => !baseSet.has(n))
            .sort((a, b) => a.localeCompare(b, 'es'))
            .map((nombre) => ({ nombre, count: counts.get(nombre) || 0 })),
        ])
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [])

  const setCatMeta = (nombre, partial) => {
    const cur = meta[nombre] && typeof meta[nombre] === 'object' ? meta[nombre] : {}
    void onPatch({ categoriasMeta: { ...meta, [nombre]: { ...cur, ...partial } } })
  }

  const openEditor = (nombre) => {
    const willOpen = editing !== nombre
    setEditing(willOpen ? nombre : null)
    if (willOpen) setIconMode(isImagePath(meta[nombre]?.icono) ? 'imagen' : 'emoji')
  }

  const pickImage = async (nombre) => {
    const pick = window.bazar?.productImage?.pick
    if (!pick) { toast.error('Solo disponible en escritorio.'); return }
    try {
      const r = await pick()
      if (r?.cancelled || !r?.path) return
      setCatMeta(nombre, { icono: String(r.path) })
    } catch (err) { toast.error(String(err?.message || err)) }
  }

  const renderIcon = (icono) => {
    if (!icono) return null
    if (isImagePath(icono)) return <img src={localPathToFileUrl(icono)} alt="" className="size-4 rounded object-cover" />
    return <span className="text-[14px] leading-none">{icono}</span>
  }

  return (
    <div className="flex flex-col pb-20">
      <SectionHeader
        title="Categorías"
        description="Ponele un ícono y un color a cada categoría. Por ahora queda preparado: los íconos van a aparecer en el punto de venta, no en el inventario."
      />

      {loading ? (
        <div className="flex items-center gap-3 text-[var(--mlb-text-muted)]">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          <span className="text-[13px] font-medium">Cargando categorías…</span>
        </div>
      ) : (
        <PremiumCard className="divide-y divide-[var(--mlb-border)]">
          {cats.map(({ nombre, count }) => {
            const m = meta[nombre] || {}
            const color = normalizeNotionColorKey(m.color)
            const open = editing === nombre
            return (
              <div key={nombre} className="px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <span className={cn('inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[12.5px] font-medium', notionTagChipReadonlyClasses(color))}>
                    {renderIcon(emojiDeCategoria(nombre, meta))}
                    {nombre}
                  </span>
                  <span className="text-[12px] tabular-nums text-[var(--mlb-text-muted)]">
                    {count} {count === 1 ? 'artículo' : 'artículos'}
                  </span>
                  <button
                    type="button"
                    onClick={() => openEditor(nombre)}
                    className="ml-auto inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium text-[var(--mlb-text-secondary)] transition-colors hover:bg-[var(--mlb-bg-hover)] hover:text-[var(--mlb-text-primary)]"
                  >
                    Personalizar
                    <ChevronDown size={14} className={cn('transition-transform', open && 'rotate-180')} />
                  </button>
                </div>

                {open ? (
                  <div className="mt-4 space-y-4 rounded-xl border border-[var(--mlb-border)] bg-[var(--mlb-bg-app)] p-4">
                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-[12px] font-medium text-[var(--mlb-text-secondary)]">Ícono</span>
                        <div className="inline-flex rounded-lg border border-[var(--mlb-border-strong)] p-0.5 text-[11.5px]">
                          <button
                            type="button"
                            onClick={() => setIconMode('emoji')}
                            className={cn('rounded-md px-2.5 py-1 font-medium transition-colors', iconMode === 'emoji' ? 'bg-[var(--mlb-bg-active)] text-[var(--mlb-text-primary)]' : 'text-[var(--mlb-text-muted)] hover:text-[var(--mlb-text-primary)]')}
                          >
                            Emoji
                          </button>
                          <button
                            type="button"
                            onClick={() => setIconMode('imagen')}
                            className={cn('rounded-md px-2.5 py-1 font-medium transition-colors', iconMode === 'imagen' ? 'bg-[var(--mlb-bg-active)] text-[var(--mlb-text-primary)]' : 'text-[var(--mlb-text-muted)] hover:text-[var(--mlb-text-primary)]')}
                          >
                            Imagen
                          </button>
                        </div>
                      </div>

                      {iconMode === 'emoji' ? (
                        <EmojiPickerPopover
                          value={isImagePath(m.icono) ? '' : (m.icono || '')}
                          onPick={(e) => setCatMeta(nombre, { icono: e })}
                          onClear={() => setCatMeta(nombre, { icono: '' })}
                        />
                      ) : (
                        <div className="flex items-center gap-3">
                          <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg border border-[var(--mlb-border-strong)] bg-[var(--mlb-bg-input)]">
                            {isImagePath(m.icono) ? (
                              <img src={localPathToFileUrl(m.icono)} alt="" className="size-full object-cover" />
                            ) : (
                              <ImageIcon size={18} className="text-[var(--mlb-text-muted)]" />
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => void pickImage(nombre)}
                            className="inline-flex h-9 items-center gap-2 rounded-lg border border-[var(--mlb-border-strong)] bg-[var(--mlb-bg-panel)] px-3 text-[12.5px] font-medium text-[var(--mlb-text-primary)] transition-colors hover:bg-[var(--mlb-bg-hover)]"
                          >
                            <ImageIcon size={14} className="text-[var(--mlb-accent)]" />
                            Subir imagen…
                          </button>
                          {isImagePath(m.icono) ? (
                            <button
                              type="button"
                              onClick={() => setCatMeta(nombre, { icono: '' })}
                              className="text-[12px] font-medium text-[var(--mlb-danger)] transition-colors hover:underline"
                            >
                              Quitar
                            </button>
                          ) : null}
                        </div>
                      )}
                    </div>

                    <div>
                      <div className="mb-2 text-[12px] font-medium text-[var(--mlb-text-secondary)]">Color</div>
                      <div className="flex flex-wrap gap-2">
                        {NOTION_TAG_COLOR_CLASSIC.map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setCatMeta(nombre, { color: c })}
                            title={c}
                            className={cn(
                              'grid size-7 place-items-center rounded-full border-2 transition-colors',
                              color === c ? 'border-[var(--mlb-text-primary)]' : 'border-transparent hover:border-[var(--mlb-border-strong)]',
                            )}
                          >
                            <span className={cn('size-4 rounded-full', notionColorDotClass(c))} />
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            )
          })}
        </PremiumCard>
      )}
    </div>
  )
}

