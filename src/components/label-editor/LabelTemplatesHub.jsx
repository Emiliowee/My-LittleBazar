import { useCallback, useEffect, useState } from 'react'
import {
  ArrowLeft, CheckCircle2, Copy, FilePlus, LayoutTemplate, Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { createDefaultTemplate, isBuiltinTemplateId, isProtectedDefaultLabelTemplate } from '@/lib/labelModel'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { appConfirm } from '@/lib/appConfirm'
import { TemplateThumbnailPreview } from './LabelTemplateThumbnail'

/**
 * Pantalla inicial del módulo Etiquetas en el launcher: sólo plantillas.
 * Al crear o editar se monta LabelEditor a pantalla completa.
 */
export function LabelTemplatesHub({ onBack, onOpenEditor }) {
  const api = typeof window !== 'undefined' ? window.bazar?.labels : null
  const [data, setData] = useState({ activeId: null, templates: [] })
  const [busyId, setBusyId] = useState(null)
  const [newOpen, setNewOpen] = useState(false)
  const [newName, setNewName] = useState('Nueva plantilla')

  const reload = useCallback(async () => {
    if (!api?.list) return
    try {
      const payload = await api.list()
      setData(payload || { activeId: null, templates: [] })
    } catch (e) {
      toast.error(String(e?.message || e))
    }
  }, [api])

  useEffect(() => {
    void reload()
  }, [reload])

  const setTplBusy = (id, v) => {
    setBusyId(v ? id : null)
  }

  const handleSetActive = async (templateId, e) => {
    e?.preventDefault?.()
    e?.stopPropagation?.()
    if (!api?.setActive || busyId) return
    setTplBusy(templateId, true)
    try {
      await api.setActive(templateId)
      await reload()
      toast.success('Plantilla marcada como activa')
    } catch (err) {
      toast.error(String(err?.message || err))
    } finally {
      setTplBusy(templateId, false)
    }
  }

  const handleDuplicate = async (templateId, e) => {
    e?.preventDefault?.()
    e?.stopPropagation?.()
    if (!api?.duplicate || busyId) return
    setTplBusy(templateId, true)
    try {
      const copy = await api.duplicate(templateId)
      await reload()
      onOpenEditor(copy.id)
    } catch (err) {
      toast.error(String(err?.message || err))
      setTplBusy(templateId, false)
    }
  }

  const handleDelete = async (template, e) => {
    e?.preventDefault?.()
    e?.stopPropagation?.()
    if (!api?.remove || busyId) return
    const id = template.id
    if (isProtectedDefaultLabelTemplate(id)) {
      toast.error('La plantilla predeterminada no se puede eliminar.')
      return
    }
    const ok = await appConfirm(`¿Eliminar la plantilla «${template.name}»?`, {
      destructive: true,
      confirmLabel: 'Eliminar',
    })
    if (!ok) return
    setTplBusy(id, true)
    try {
      await api.remove(id)
      await reload()
      toast.success('Plantilla eliminada')
    } catch (err) {
      toast.error(String(err?.message || err))
    } finally {
      setTplBusy(id, false)
    }
  }

  const submitNewTemplate = async () => {
    const name = newName.trim()
    if (!name) {
      toast.error('Escribí un nombre para la plantilla.')
      return
    }
    if (!api?.upsert) return
    setNewOpen(false)
    setTplBusy('_new', true)
    try {
      const base = createDefaultTemplate()
      const created = await api.upsert({ ...base, id: undefined, name })
      await reload()
      onOpenEditor(created.id)
    } catch (err) {
      toast.error(String(err?.message || err))
      setTplBusy('_new', false)
    }
  }

  const templates = Array.isArray(data.templates) ? data.templates : []
  const noApi = !api?.list

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--mlb-bg-app)]">
      <header className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-[var(--mlb-border)] bg-[var(--mlb-bg-panel-dark)] px-4 py-3">
        <div className="flex min-w-0 items-start gap-3">
          <button
            type="button"
            onClick={() => void onBack?.()}
            className="mlb-focus-ring mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-md text-[var(--mlb-text-muted)] transition-colors hover:bg-[var(--mlb-bg-hover)] hover:text-[var(--mlb-text-primary)]"
            aria-label="Volver al inicio"
          >
            <ArrowLeft size={16} strokeWidth={1.6} />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--mlb-text-muted)]">
              <LayoutTemplate size={11} strokeWidth={1.6} className="shrink-0 text-[var(--mlb-accent)]" aria-hidden />
              <span>Etiquetas</span>
            </div>
            <h1 className="mt-0.5 text-[16px] font-semibold tracking-[-0.02em] text-[var(--mlb-text-primary)]">
              Plantillas
            </h1>
            <p className="mt-1 max-w-md text-[11.5px] leading-snug text-[var(--mlb-text-secondary)]">
              Elegí una plantilla para abrir el editor visual, o creá una nueva. La activa es la que se usa al imprimir.
            </p>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          disabled={noApi || busyId === '_new'}
          onClick={() => {
            setNewName('Nueva plantilla')
            setNewOpen(true)
          }}
          className="shrink-0 gap-1.5 bg-[var(--mlb-accent)] text-white hover:bg-[var(--mlb-accent-hover)]"
        >
          <FilePlus size={14} strokeWidth={1.6} />
          Nueva plantilla
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
        {noApi ? (
          <p className="text-[12.5px] text-[var(--mlb-text-muted)]">
            No hay API de etiquetas (solo en la app de escritorio).
          </p>
        ) : templates.length === 0 ? (
          <p className="text-[12.5px] text-[var(--mlb-text-muted)]">
            No hay plantillas. Creá una con el botón de arriba.
          </p>
        ) : (
          <ul className="mx-auto grid w-full max-w-5xl list-none justify-items-center gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {templates.map((t) => {
              const isActive = t.id === data.activeId
              const b = busyId === t.id
              const builtin = isBuiltinTemplateId(t.id)
              return (
                <li key={t.id} className="w-full max-w-[168px]">
                  <div
                    className={cn(
                      'flex flex-col overflow-hidden rounded-md border bg-[var(--mlb-bg-panel)] transition-colors',
                      isActive ? 'border-[var(--mlb-accent-ring)] shadow-[var(--shadow-xs)]' : 'border-[var(--mlb-border)]',
                    )}
                  >
                    <button
                      type="button"
                      disabled={Boolean(busyId)}
                      onClick={() => onOpenEditor(t.id)}
                      className={cn(
                        'mlb-focus-ring flex flex-col gap-1 p-1.5 text-left transition-colors',
                        'hover:bg-[var(--mlb-bg-hover)]',
                        Boolean(busyId) && busyId !== t.id ? 'opacity-50' : '',
                      )}
                    >
                      <div className="mx-auto w-full max-w-[132px]">
                        <TemplateThumbnailPreview template={t} previewSize="hub" compact />
                      </div>
                      <div className="flex min-w-0 items-center gap-1">
                        <span className="min-w-0 flex-1 truncate text-[11.5px] font-medium leading-tight text-[var(--mlb-text-primary)]">
                          {t.name}
                        </span>
                        {builtin ? (
                          <span className="shrink-0 rounded bg-[var(--mlb-bg-active)] px-0.5 py-px text-[7.5px] font-medium uppercase tracking-wider text-[var(--mlb-text-muted)]">
                            incl.
                          </span>
                        ) : null}
                        {isActive ? (
                          <span
                            className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-[var(--mlb-border)] bg-[var(--mlb-bg-active)] px-1 py-px text-[8px] font-medium tabular-nums text-[var(--mlb-success)]"
                            title="Plantilla activa"
                          >
                            <CheckCircle2 size={9} strokeWidth={2} aria-hidden />
                            activa
                          </span>
                        ) : null}
                      </div>
                      <span className="text-[9.5px] tabular-nums leading-tight text-[var(--mlb-text-muted)]">
                        {(t.width_mm || 0).toFixed(0)}×{(t.height_mm || 0).toFixed(0)} mm · {t.blocks?.length ?? 0} bl.
                      </span>
                    </button>
                    <div className="flex flex-wrap items-center gap-0.5 border-t border-[var(--mlb-border)] bg-[var(--mlb-bg-panel-dark)]/50 px-1.5 py-1">
                      {!isActive ? (
                        <button
                          type="button"
                          disabled={b || Boolean(busyId)}
                          onClick={(e) => void handleSetActive(t.id, e)}
                          className="mlb-focus-ring inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9.5px] font-medium text-[var(--mlb-text-secondary)] transition-colors hover:bg-[var(--mlb-bg-hover)] hover:text-[var(--mlb-text-primary)] disabled:opacity-40"
                        >
                          <CheckCircle2 size={11} strokeWidth={1.6} />
                          Activa
                        </button>
                      ) : null}
                      <button
                        type="button"
                        disabled={b || Boolean(busyId)}
                        onClick={(e) => void handleDuplicate(t.id, e)}
                        className="mlb-focus-ring inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9.5px] font-medium text-[var(--mlb-text-secondary)] transition-colors hover:bg-[var(--mlb-bg-hover)] hover:text-[var(--mlb-text-primary)] disabled:opacity-40"
                      >
                        <Copy size={11} strokeWidth={1.6} />
                        Dup.
                      </button>
                      {!isProtectedDefaultLabelTemplate(t.id) ? (
                        <button
                          type="button"
                          disabled={b || Boolean(busyId)}
                          onClick={(e) => void handleDelete(t, e)}
                          className="mlb-focus-ring inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9.5px] font-medium text-[var(--mlb-danger)] transition-colors hover:bg-red-500/10 dark:hover:bg-red-500/15 disabled:opacity-40"
                        >
                          <Trash2 size={11} strokeWidth={1.6} />
                          Borrar
                        </button>
                      ) : null}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="sm:max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle className="text-[15px]">Nueva plantilla</DialogTitle>
            <DialogDescription className="text-[13px]">
              Se crea en blanco; podés editar bloques y tamaño en el editor.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nombre"
            className="h-9"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void submitNewTemplate()
              }
            }}
          />
          <DialogFooter className="gap-2 sm:justify-end">
            <Button type="button" variant="outline" size="sm" onClick={() => setNewOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={busyId === '_new'}
              onClick={() => void submitNewTemplate()}
              className="bg-[var(--mlb-accent)] text-white hover:bg-[var(--mlb-accent-hover)]"
            >
              Crear y abrir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
