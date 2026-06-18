import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { TagGlyph } from '@/components/TagGlyph'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { releaseModalBodyLocks } from '@/lib/releaseModalBodyLocks'
import { notionColorDotClass, notionPastelSelectPillClasses, normalizeNotionColorKey } from '@/lib/propertyTokens'

/**
 * Edición de valores al estilo Notion (propiedad tipo Select):
 * filas nombre → celda; al abrir: buscar y elegir una opción (documentación Notion: database properties).
 */
/** `restoreFocusRef`: sin `DialogTrigger`, Radix deja el foco inútil al cerrar; conviene el panel padre (p. ej. ajuste de precios). */
export function ProductTagsDialog({ open, title = 'Propiedades', initialMap, onClose, onSave, restoreFocusRef }) {
  const [groups, setGroups] = useState([])
  const [sel, setSel] = useState({})
  const [openFor, setOpenFor] = useState(null)
  const initialRef = useRef(initialMap)
  initialRef.current = initialMap
  const wasDialogOpen = useRef(false)

  useEffect(() => {
    if (open) {
      wasDialogOpen.current = true
      return
    }
    if (!wasDialogOpen.current) return
    wasDialogOpen.current = false
    const t = window.setTimeout(() => releaseModalBodyLocks(), 0)
    return () => clearTimeout(t)
  }, [open])

  useEffect(() => {
    if (!open) {
      setOpenFor(null)
      return
    }
    const m = initialRef.current
    setSel(m && typeof m === 'object' ? { ...m } : {})
    let cancelled = false
    void (async () => {
      try {
        const g = await window.bazar?.db?.getTagGroupsForProduct?.()
        if (!cancelled) setGroups(Array.isArray(g) ? g : [])
      } catch {
        if (!cancelled) setGroups([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open])

  const setGroupValue = (gid, val) => {
    setSel((prev) => {
      const next = { ...prev }
      if (val === '' || val == null || val === 0) delete next[gid]
      else next[gid] = Number(val)
      return next
    })
  }

  const onConfirm = () => {
    const out = {}
    for (const [k, v] of Object.entries(sel)) {
      const gid = Number(k)
      const oid = Number(v)
      if (Number.isFinite(gid) && Number.isFinite(oid) && oid > 0) out[gid] = oid
    }
    onSave?.(out)
    onClose?.()
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose?.()}>
      <DialogContent
        showCloseButton
        onCloseAutoFocus={(e) => {
          // Evita el handler interno de Radix (preventDefault + focus en trigger inexistente),
          // que impide que FocusScope restaure el foco y deja la app sin teclado útil.
          e.preventDefault()
          releaseModalBodyLocks()
          const el = restoreFocusRef?.current
          window.requestAnimationFrame(() => {
            if (el && typeof el.focus === 'function') el.focus({ preventScroll: true })
            else document.querySelector('input[data-inventory-search]')?.focus?.({ preventScroll: true })
          })
        }}
        className={cn(
          'flex max-h-[min(88vh,720px)] w-[calc(100vw-1.5rem)] max-w-[520px] flex-col gap-0 overflow-hidden rounded-2xl border p-0 shadow-lg sm:max-w-[520px]',
        )}
      >
        <DialogHeader className="space-y-1 border-b px-6 pb-4 pt-6 text-left">
          <DialogTitle className="text-lg font-semibold tracking-tight">{title}</DialogTitle>
          <DialogDescription className="text-[13px] leading-relaxed">
            Como en Notion: cada fila es una propiedad tipo <strong className="font-medium text-foreground">Select</strong> (un
            valor). Abrí la celda, buscá y elegí; podés quitar el valor desde el menú.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6">
          {groups.length === 0 ? (
            <p className="py-10 text-center text-[13px] text-muted-foreground">
              No hay propiedades definidas en la base.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {groups.map((g) => {
                const gc = normalizeNotionColorKey(g.notion_color, 'gray')
                const current = sel[g.id]
                const hasSelection = current != null && Number.isFinite(Number(current)) && Number(current) > 0
                const selectedOpt = (g.options || []).find((o) => Number(o.id) === Number(current))
                const oc = selectedOpt ? normalizeNotionColorKey(selectedOpt.notion_color, 'default') : 'default'
                const popOpen = openFor === g.id

                return (
                  <div key={g.id} className="grid grid-cols-1 gap-2 py-3 sm:grid-cols-[minmax(0,38%)_1fr] sm:items-center sm:gap-4">
                    <div className="flex min-w-0 items-center gap-2 pt-0.5">
                      <span className={cn('inline-block size-1.5 shrink-0 rounded-full', notionColorDotClass(gc))} />
                      <span className="truncate text-[13px] text-muted-foreground">
                        {g.name}
                        {g.required ? <span className="text-destructive"> *</span> : null}
                      </span>
                    </div>

                    <Popover
                      open={popOpen}
                      onOpenChange={(o) => setOpenFor(o ? g.id : null)}
                    >
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className={cn(
                            'flex min-h-9 w-full max-w-full items-center justify-between gap-2 rounded-md border border-transparent bg-muted/30 px-2.5 py-1.5 text-left text-[13px] transition-colors hover:bg-muted/50',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          )}
                        >
                          <span className="flex min-w-0 flex-1 items-center gap-1.5">
                            {hasSelection && selectedOpt ? (
                              <span className={cn('inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5', notionPastelSelectPillClasses(oc, true))}>
                                <TagGlyph icon={selectedOpt.tag_icon} className="size-3.5 shrink-0" />
                                <span className="truncate font-medium">{selectedOpt.name}</span>
                              </span>
                            ) : (
                              <span className="truncate text-muted-foreground">Vacío</span>
                            )}
                          </span>
                          <ChevronDown className="size-4 shrink-0 opacity-50" aria-hidden />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent
                        className="z-[220] w-[min(100vw-2rem,320px)] p-0"
                        align="end"
                        sideOffset={4}
                        onOpenAutoFocus={(e) => e.preventDefault()}
                      >
                        <Command>
                          <CommandInput placeholder="Buscar opción…" className="h-10" />
                          <CommandList className="max-h-[240px]">
                            <CommandEmpty className="py-6 text-[13px]">Ninguna opción coincide.</CommandEmpty>
                            <CommandGroup>
                              {(g.options || []).map((o) => {
                                const active = hasSelection && Number(current) === Number(o.id)
                                const optC = normalizeNotionColorKey(o.notion_color, 'default')
                                return (
                                  <CommandItem
                                    key={o.id}
                                    value={`${o.name} ${o.id}`}
                                    onSelect={() => {
                                      setGroupValue(g.id, active ? null : o.id)
                                      setOpenFor(null)
                                    }}
                                    className="gap-2"
                                  >
                                    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px] font-medium', notionPastelSelectPillClasses(optC, active))}>
                                      <TagGlyph icon={o.tag_icon} className="size-3 shrink-0" />
                                      {o.name}
                                    </span>
                                    {active ? <Check className="ml-auto size-3.5 shrink-0" /> : null}
                                  </CommandItem>
                                )
                              })}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                        <div className="border-t border-border p-1">
                          <button
                            type="button"
                            className="w-full rounded-sm px-2 py-2 text-left text-[13px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            onClick={() => {
                              setGroupValue(g.id, null)
                              setOpenFor(null)
                            }}
                          >
                            Quitar selección
                          </button>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <DialogFooter className="border-t bg-muted/20 px-6 py-4 sm:justify-end">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" onClick={onConfirm}>
            Aplicar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
