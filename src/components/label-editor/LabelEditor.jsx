import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import {
  Eye, EyeOff, Trash2, Copy, RotateCcw, Save, X, Maximize2,
  Building2, ImageIcon, ImagePlus, Type, Tag, Hash, Barcode, TextCursorInput, Minus, CheckCircle2, FilePlus,
  Beaker, Info, Grid3x3, ZoomIn, LayoutTemplate, Sparkles, ChevronDown, Undo2, Redo2, Circle, ArrowUpToLine, ArrowDownToLine,
  Plus, Search, ChevronRight, FolderClosed, Trash, FolderOpen, AlignLeft, AlignCenter, AlignRight, Move
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  BLOCK_META,
  cloneTemplate,
  createBlock,
  createDefaultTemplate,
  isBuiltinTemplateId,
  isProtectedDefaultLabelTemplate,
} from '@/lib/labelModel'
import { LabelRender } from './LabelRender'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { appConfirm } from '@/lib/appConfirm'
import { releaseModalBodyLocks } from '@/lib/releaseModalBodyLocks'
import { TemplateThumb } from './LabelTemplateThumbnail'
import { useLabelEditorImmersion } from '@/contexts/LabelEditorImmersionContext.jsx'

const MAX_UNDO = 50

const TYPE_ICONS = {
  empresa: Building2,
  logo: ImageIcon,
  imagen_fija: ImagePlus,
  nombre: Type,
  precio: Tag,
  codigo: Hash,
  codigo_barras: Barcode,
  texto_libre: TextCursorInput,
  separador: Minus,
  propiedad: Tag,
  forma: Circle,
}

const DEFAULT_SAMPLE = {
  empresa: 'Saldos Monserrat',
  nombre: 'Blusa manga corta liso',
  precio: '$350',
  codigo: 'MSR-0001',
}

const SAMPLE_PRESETS = [
  { id: 'normal', label: 'Normal', data: { empresa: 'Saldos Monserrat', nombre: 'Blusa manga corta liso', precio: '$350', codigo: 'MSR-0001' } },
  { id: 'largo', label: 'Texto largo', data: { empresa: 'Saldos Monserrat', nombre: 'Vestido estampado flores manga larga con bolsillos', precio: '$1890', codigo: 'MSR-99999' } },
  { id: 'mini', label: 'Precio corto', data: { empresa: 'Saldos Monserrat', nombre: 'Calcetín', precio: '$25', codigo: 'MSR-12' } },
]

const BLOCK_HINT = {
  empresa: 'Texto fijo. Se toma del nombre del espacio de trabajo.',
  nombre: 'Se reemplaza por el nombre del producto en cada etiqueta.',
  precio: 'Se reemplaza por el precio del producto formatted en $MXN.',
  codigo: 'Se reemplaza por el código (MSR) del producto.',
  codigo_barras: 'Genera el código de barras Code128 de la prenda.',
  texto_libre: 'Texto fijo tal cual (ej. «OFERTA», «OUTLET»).',
  separador: 'Línea divisora de secciones.',
  imagen_fija: 'Sello o logo fijo desde tu computadora.',
  propiedad: 'Propiedad del cuaderno o campo de regla. Ej: «Talla: M».',
}

export function LabelEditor({ open, onClose, initialTemplateId = null, onDirty, embedded = false }) {
  const { request: requestImmersion, release: releaseImmersion } = useLabelEditorImmersion()
  const [list, setList] = useState({ activeId: null, templates: [] })
  const [, setDraftId] = useState(null)
  const [draft, setDraft] = useState(null)
  const [selectedBlockId, setSelectedBlockId] = useState(null)
  const [dirty, setDirty] = useState(false)
  const CANVAS_PX_PER_MM_AT_100 = 15
  const [zoomPct, setZoomPct] = useState(100)
  const canvasScale = (zoomPct / 100) * CANVAS_PX_PER_MM_AT_100
  const [showGrid, setShowGrid] = useState(true)
  const [logoPath, setLogoPath] = useState('')
  const [labelLogoOpts, setLabelLogoOpts] = useState({
    labelLogoStyle: 'thermal',
    labelLogoWarmth: 0,
    labelLogoContrast: 100,
    labelLogoSaturation: 100,
  })
  const [busy, setBusy] = useState(false)
  const [sampleOverride, setSampleOverride] = useState(DEFAULT_SAMPLE)
  const [showSamplePanel, setShowSamplePanel] = useState(false)
  const [previewProduct, setPreviewProduct] = useState(null)
  
  // Left Tab Control: 'insert' | 'layers'
  const [leftTab, setLeftTab] = useState('insert')
  
  // Slide-over template list control
  const [templatesOpen, setTemplatesOpen] = useState(false)
  
  const [textoLibrePulse, setTextoLibrePulse] = useState(0)
  const [histTick, setHistTick] = useState(0)
  const [newTplOpen, setNewTplOpen] = useState(false)
  const [newTplName, setNewTplName] = useState('Nueva plantilla')

  const canvasWrapRef = useRef(null)
  const draftRef = useRef(null)
  const historyRef = useRef({ past: [], future: [] })
  const isApplyingHistoryRef = useRef(false)
  const api = typeof window !== 'undefined' ? window.bazar?.labels : null

  // Canva Interaction State
  const viewportRef = useRef(null)
  const [spacePressed, setSpacePressed] = useState(false)
  const [isPanning, setIsPanning] = useState(false)
  const panStartRef = useRef({ x: 0, y: 0 })
  const scrollStartRef = useRef({ left: 0, top: 0 })

  // space key listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === 'Space') {
        const t = e.target
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) {
          return
        }
        e.preventDefault()
        setSpacePressed(true)
      }
    }
    const handleKeyUp = (e) => {
      if (e.code === 'Space') {
        setSpacePressed(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [])



  useEffect(() => {
    draftRef.current = draft
  }, [draft])

  const clearHistory = useCallback(() => {
    historyRef.current = { past: [], future: [] }
    setHistTick((t) => t + 1)
  }, [])

  const snapshotForUndo = useCallback(() => {
    if (isApplyingHistoryRef.current) return
    const d = draftRef.current
    if (!d) return
    historyRef.current.past.push(cloneTemplate(d))
    if (historyRef.current.past.length > MAX_UNDO) historyRef.current.past.shift()
    historyRef.current.future = []
    setHistTick((t) => t + 1)
  }, [])

  const undo = useCallback(() => {
    const { past, future } = historyRef.current
    if (past.length === 0 || !draftRef.current) return
    const cur = cloneTemplate(draftRef.current)
    const prev = past.pop()
    future.push(cur)
    isApplyingHistoryRef.current = true
    setDraft(prev)
    setDirty(true)
    queueMicrotask(() => {
      isApplyingHistoryRef.current = false
    })
    setHistTick((t) => t + 1)
  }, [])

  const onTextoLibreDoubleClick = useCallback((id) => {
    setSelectedBlockId(id)
    setTextoLibrePulse((n) => n + 1)
  }, [])

  const redo = useCallback(() => {
    const { past, future } = historyRef.current
    if (future.length === 0 || !draftRef.current) return
    const cur = cloneTemplate(draftRef.current)
    const next = future.pop()
    past.push(cur)
    isApplyingHistoryRef.current = true
    setDraft(next)
    setDirty(true)
    queueMicrotask(() => {
      isApplyingHistoryRef.current = false
    })
    setHistTick((t) => t + 1)
  }, [])

  const dragRef = useRef(null)

  const reload = useCallback(async () => {
    if (!api?.list) return
    try {
      const data = await api.list()
      setList(data)
      const startId = initialTemplateId || data.activeId
      const t = data.templates.find((x) => x.id === startId) || data.templates[0]
      if (t) {
        setDraftId(t.id)
        setDraft(cloneTemplate(t))
        setDirty(false)
        clearHistory()
      }
    } catch (e) { toast.error(String(e?.message || e)) }
  }, [api, initialTemplateId, clearHistory])

  useEffect(() => {
    if (!open || embedded) return
    requestImmersion()
    return () => releaseImmersion()
  }, [open, embedded, requestImmersion, releaseImmersion])

  useEffect(() => {
    if (!open) return
    void reload()
    const loadLogo = async () => {
      try {
        const s = await window.bazar?.settings?.get?.()
        setLogoPath(String(s?.workspaceLogoPath || ''))
        setLabelLogoOpts({
          labelLogoStyle: s?.labelLogoStyle === 'original' ? 'original' : 'thermal',
          labelLogoWarmth: Number.isFinite(Number(s?.labelLogoWarmth)) ? Number(s.labelLogoWarmth) : 0,
          labelLogoContrast: Number.isFinite(Number(s?.labelLogoContrast)) ? Number(s.labelLogoContrast) : 100,
          labelLogoSaturation: Number.isFinite(Number(s?.labelLogoSaturation)) ? Number(s.labelLogoSaturation) : 100,
        })
      } catch { /* noop */ }
    }
    void loadLogo()
    const onWinFocus = () => { void loadLogo() }
    window.addEventListener('focus', onWinFocus)
    return () => window.removeEventListener('focus', onWinFocus)
  }, [open, reload])

  useEffect(() => {
    if (!open) releaseModalBodyLocks()
  }, [open])

  useEffect(() => { onDirty?.(dirty) }, [dirty, onDirty])

  const switchToTemplate = useCallback(async (id) => {
    if (dirty) {
      const ok = await appConfirm('Hay cambios sin guardar. ¿Descartar?', { destructive: true, confirmLabel: 'Descartar' })
      if (!ok) return
    }
    const t = list.templates.find((x) => x.id === id)
    if (!t) return
    setDraftId(id)
    setDraft(cloneTemplate(t))
    setSelectedBlockId(null)
    setDirty(false)
    clearHistory()
  }, [dirty, list.templates, clearHistory])

  const patchDraft = useCallback((patch) => {
    snapshotForUndo()
    setDraft((d) => (d ? { ...d, ...patch } : d))
    setDirty(true)
  }, [snapshotForUndo])

  const patchBlock = useCallback((id, patch) => {
    if (!isApplyingHistoryRef.current && dragRef.current == null) {
      snapshotForUndo()
    }
    setDraft((d) => {
      if (!d) return d
      return { ...d, blocks: d.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)) }
    })
    setDirty(true)
  }, [snapshotForUndo])

  const patchLabelLogo = useCallback((partial) => {
    setLabelLogoOpts((prev) => ({ ...prev, ...partial }))
    void window.bazar?.settings?.set?.(partial).catch((e) => {
      toast.error(String(e?.message || e))
    })
  }, [])

  const addBlock = useCallback((type) => {
    snapshotForUndo()
    setDraft((d) => {
      if (!d) return d
      const w = Math.min(d.width_mm - 6, 30)
      const h = type === 'imagen_fija' ? Math.min(14, d.height_mm - 6) : 6
      const iw = type === 'imagen_fija' ? Math.min(w, 14) : w
      const block = createBlock(type, { x: 3, y: 3, w: iw, h })
      return { ...d, blocks: [...d.blocks, block] }
    })
    setSelectedBlockId(null)
    setDirty(true)
    setLeftTab('layers') // Instantly switch to layers to show newly placed block
  }, [snapshotForUndo])

  const removeBlock = useCallback((id) => {
    snapshotForUndo()
    setDraft((d) => d ? { ...d, blocks: d.blocks.filter((b) => b.id !== id) } : d)
    if (selectedBlockId === id) setSelectedBlockId(null)
    setDirty(true)
  }, [selectedBlockId, snapshotForUndo])

  const duplicateBlock = useCallback((id) => {
    snapshotForUndo()
    setDraft((d) => {
      if (!d) return d
      const src = d.blocks.find((b) => b.id === id)
      if (!src) return d
      const copy = { ...src, id: `b_${Date.now()}_${Math.floor(Math.random() * 10000)}`, x: src.x + 2, y: src.y + 2 }
      return { ...d, blocks: [...d.blocks, copy] }
    })
    setDirty(true)
  }, [snapshotForUndo])

  const moveBlock = useCallback((id, dir) => {
    snapshotForUndo()
    setDraft((d) => {
      if (!d) return d
      const ix = d.blocks.findIndex((b) => b.id === id)
      if (ix < 0) return d
      let target = ix
      if (dir === 'up') target = ix - 1
      else if (dir === 'down') target = ix + 1
      else if (dir === 'top') target = d.blocks.length - 1
      else if (dir === 'bottom') target = 0

      if (target < 0 || target >= d.blocks.length || target === ix) return d
      const blocks = d.blocks.slice()
      const [it] = blocks.splice(ix, 1)
      blocks.splice(target, 0, it)
      return { ...d, blocks }
    })
    setDirty(true)
  }, [snapshotForUndo])

  const onViewportPointerDown = useCallback((e) => {
    // Only pan if space is pressed OR we clicked directly on the viewport background
    const clickOnBg = e.target === e.currentTarget;
    if (spacePressed || clickOnBg) {
      setIsPanning(true)
      e.currentTarget.setPointerCapture(e.pointerId)
      panStartRef.current = { x: e.clientX, y: e.clientY }
      scrollStartRef.current = {
        left: viewportRef.current?.scrollLeft || 0,
        top: viewportRef.current?.scrollTop || 0,
      }
    }
  }, [spacePressed])

  const onViewportPointerMove = useCallback((e) => {
    if (!isPanning || !viewportRef.current) return
    const dx = e.clientX - panStartRef.current.x
    const dy = e.clientY - panStartRef.current.y
    viewportRef.current.scrollLeft = scrollStartRef.current.left - dx
    viewportRef.current.scrollTop = scrollStartRef.current.top - dy
  }, [isPanning])

  const onViewportPointerUp = useCallback((e) => {
    if (isPanning) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch { /* noop */ }
      setIsPanning(false)
    }
  }, [isPanning])

  // fit view to screen
  const fitToScreen = useCallback(() => {
    if (!canvasWrapRef.current) return
    const parent = canvasWrapRef.current.parentElement
    if (!parent) return
    const pWidth = parent.clientWidth - 120
    const pHeight = parent.clientHeight - 120
    if (pWidth <= 0 || pHeight <= 0) return
    const d = draftRef.current
    if (!d) return
    const tWidth = d.width_mm
    const tHeight = d.height_mm
    
    // Scale at 100% is 15px/mm.
    const scaleWidth = pWidth / (tWidth * 15)
    const scaleHeight = pHeight / (tHeight * 15)
    const bestScale = Math.min(scaleWidth, scaleHeight)
    const targetZoom = Math.max(20, Math.min(250, Math.round(bestScale * 100)))
    setZoomPct(targetZoom)
  }, [])

  const alignBlock = useCallback((alignment) => {
    if (!selectedBlockId || !draftRef.current) return
    snapshotForUndo()
    const d = draftRef.current
    const b = d.blocks.find((x) => x.id === selectedBlockId)
    if (!b) return
    let { x, y, w, h } = b
    const pad = 2 // Safety margin from margins in mm
    if (alignment === 'left') x = pad
    if (alignment === 'center_h') x = (d.width_mm - w) / 2
    if (alignment === 'right') x = d.width_mm - w - pad
    if (alignment === 'top') y = pad
    if (alignment === 'center_v') y = (d.height_mm - h) / 2
    if (alignment === 'bottom') y = d.height_mm - h - pad
    
    patchBlock(selectedBlockId, { x: round2(x), y: round2(y) })
  }, [selectedBlockId, patchBlock, snapshotForUndo])

  // Mouse wheel ctrl + scroll zoom
  useEffect(() => {
    const parent = viewportRef.current
    if (!parent) return
    const handleWheel = (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        const factor = e.deltaY < 0 ? 1.1 : 0.9
        setZoomPct((z) => Math.max(20, Math.min(250, Math.round(z * factor))))
      }
    }
    parent.addEventListener('wheel', handleWheel, { passive: false })
    return () => parent.removeEventListener('wheel', handleWheel)
  }, [])

  const lastFittedTemplateIdRef = useRef(null)
  useEffect(() => {
    if (open && draft?.id != null && draft.id !== lastFittedTemplateIdRef.current) {
      lastFittedTemplateIdRef.current = draft.id
      const timer = setTimeout(() => {
        fitToScreen()
      }, 150)
      return () => clearTimeout(timer)
    }
  }, [open, draft?.id, fitToScreen])

  const onBlockPointerDown = useCallback((e, block) => {
    if (block.visible === false) return
    const rect = canvasWrapRef.current?.getBoundingClientRect()
    const d = draftRef.current
    if (!rect || !d) return

    let targetId = block.id
    let startBlockData = { x: block.x, y: block.y, w: block.w, h: block.h, rotation: block.rotation || 0 }
    let undoSnap = cloneTemplate(d)

    if (e.altKey) {
      snapshotForUndo()
      const copyId = `b_${Date.now()}_${Math.floor(Math.random() * 10000)}`
      const copy = { ...block, id: copyId, x: block.x + 2, y: block.y + 2 }
      setDraft((prevDraft) => {
        if (!prevDraft) return prevDraft
        return { ...prevDraft, blocks: [...prevDraft.blocks, copy] }
      })
      setSelectedBlockId(copyId)
      setDirty(true)
      
      targetId = copyId
      startBlockData = { x: copy.x, y: copy.y, w: copy.w, h: copy.h, rotation: copy.rotation || 0 }
      undoSnap = cloneTemplate({ ...d, blocks: [...d.blocks, copy] })
      toast.success('Bloque duplicado (Alt + Arrastrar)')
    }

    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = {
      mode: 'move',
      id: targetId,
      startMouse: { x: e.clientX, y: e.clientY },
      startBlock: startBlockData,
      scale: rect.width / d.width_mm,
      undoSnapshot: undoSnap,
    }
  }, [snapshotForUndo])

  const onResizeHandlePointerDown = useCallback((e, block, corner) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    const rect = canvasWrapRef.current?.getBoundingClientRect()
    const d = draftRef.current
    if (!rect || !d) return
    dragRef.current = {
      mode: 'resize',
      corner,
      id: block.id,
      startMouse: { x: e.clientX, y: e.clientY },
      startBlock: { x: block.x, y: block.y, w: block.w, h: block.h, rotation: block.rotation || 0 },
      scale: rect.width / d.width_mm,
      undoSnapshot: cloneTemplate(d),
    }
  }, [])

  useEffect(() => {
    const onMove = (e) => {
      const d = dragRef.current
      if (!d) return
      const rawDx = (e.clientX - d.startMouse.x) / d.scale
      const rawDy = (e.clientY - d.startMouse.y) / d.scale
      
      if (d.mode === 'move') {
        const nx = d.startBlock.x + rawDx
        const ny = d.startBlock.y + rawDy
        patchBlock(d.id, { x: round2(nx), y: round2(ny) })
      } else if (d.mode === 'resize') {
        let { x, y, w, h, rotation } = d.startBlock
        const rad = -(rotation || 0) * (Math.PI / 180)
        const dx = rawDx * Math.cos(rad) - rawDy * Math.sin(rad)
        const dy = rawDx * Math.sin(rad) + rawDy * Math.cos(rad)

        if (d.corner.includes('e')) w = Math.max(2, w + dx)
        if (d.corner.includes('s')) h = Math.max(1, h + dy)
        if (d.corner.includes('w')) { x = x + dx; w = Math.max(2, w - dx) }
        if (d.corner.includes('n')) { y = y + dy; h = Math.max(1, h - dy) }
        
        patchBlock(d.id, { x: round2(x), y: round2(y), w: round2(w), h: round2(h) })
      }
    }
    const onUp = () => {
      const drag = dragRef.current
      dragRef.current = null
      if (!drag?.undoSnapshot || isApplyingHistoryRef.current) return
      const now = draftRef.current
      if (!now) return
      if (JSON.stringify(drag.undoSnapshot) !== JSON.stringify(now)) {
        historyRef.current.past.push(drag.undoSnapshot)
        if (historyRef.current.past.length > MAX_UNDO) historyRef.current.past.shift()
        historyRef.current.future = []
        setHistTick((t) => t + 1)
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [draft?.width_mm, draft?.height_mm, patchBlock])

  const saveCurrent = async () => {
    if (!api?.upsert || !draft) return
    setBusy(true)
    try {
      await api.upsert(draft)
      setDirty(false)
      await reload()
      toast.success('Plantilla guardada')
    } catch (e) { toast.error(String(e?.message || e)) } finally { setBusy(false) }
  }

  const openNewTemplateDialog = () => {
    if (!api?.upsert) return
    setNewTplName('Nueva plantilla')
    setNewTplOpen(true)
  }

  const submitNewTemplate = async () => {
    const name = newTplName.trim()
    if (!name) {
      toast.error('Escribí un nombre para la plantilla.')
      return
    }
    if (!api?.upsert) return
    setNewTplOpen(false)
    setBusy(true)
    try {
      const base = createDefaultTemplate()
      const created = await api.upsert({ ...base, id: undefined, name })
      await reload()
      setDraftId(created.id)
      setDraft(cloneTemplate(created))
      setDirty(false)
      clearHistory()
    } catch (e) {
      toast.error(String(e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  const duplicateTemplate = async () => {
    if (!api?.duplicate || !draft) return
    setBusy(true)
    try {
      const copy = await api.duplicate(draft.id)
      await reload()
      setDraftId(copy.id)
      setDraft(cloneTemplate(copy))
      setDirty(false)
      clearHistory()
    } catch (e) { toast.error(String(e?.message || e)) } finally { setBusy(false) }
  }

  const deleteTemplate = async () => {
    if (!api?.remove || !draft) return
    if (isProtectedDefaultLabelTemplate(draft.id)) {
      toast.error('La plantilla predeterminada no se puede eliminar.')
      return
    }
    const ok = await appConfirm(`¿Eliminar la plantilla «${draft.name}»?`, { destructive: true, confirmLabel: 'Eliminar' })
    if (!ok) return
    setBusy(true)
    try {
      await api.remove(draft.id)
      await reload()
    } catch (e) { toast.error(String(e?.message || e)) } finally { setBusy(false) }
  }

  const setActive = async () => {
    if (!api?.setActive || !draft) return
    setBusy(true)
    try { await api.setActive(draft.id); await reload(); toast.success('Plantilla marcada como activa') }
    catch (e) { toast.error(String(e?.message || e)) } finally { setBusy(false) }
  }

  const restoreOriginal = async () => {
    if (!api?.restoreDefault) return
    const ok = await appConfirm(
      'Se restaurará la plantilla «Estándar bazar» al diseño actual de fábrica. Las demás plantillas incluidas (ticket, góndola, etc.) no se borran.',
      { title: 'Restaurar plantilla', confirmLabel: 'Restaurar' },
    )
    if (!ok) return
    setBusy(true)
    try {
      const data = await api.restoreDefault()
      setList(data)
      const d = data.templates.find((x) => x.id === 'default')
      if (d) {
        setDraftId(d.id)
        setDraft(cloneTemplate(d))
        setDirty(false)
        clearHistory()
      }
      toast.success('Plantilla original restaurada')
    } catch (e) { toast.error(String(e?.message || e)) } finally { setBusy(false) }
  }

  const selectedBlock = useMemo(
    () => (draft?.blocks || []).find((b) => b.id === selectedBlockId) || null,
    [draft, selectedBlockId],
  )

  const hotkeysFilter = useCallback((e) => {
    const t = e?.target
    if (t && typeof t === 'object' && 'closest' in t && typeof t.closest === 'function') {
      if (t.closest('input, textarea, select, [contenteditable="true"], [cmdk-input-wrapper], [data-slot="command-input-wrapper"]')) {
        return false
      }
    }
    return true
  }, [])

  const hotkeysOk = open && Boolean(draft)

  useHotkeys(
    'mod+z',
    (e) => {
      e.preventDefault()
      undo()
    },
    { enabled: hotkeysOk, preventDefault: true, filter: hotkeysFilter },
    [hotkeysOk, undo, hotkeysFilter],
  )
  useHotkeys(
    'mod+shift+z',
    (e) => {
      e.preventDefault()
      redo()
    },
    { enabled: hotkeysOk, preventDefault: true, filter: hotkeysFilter },
    [hotkeysOk, redo, hotkeysFilter],
  )
  useHotkeys(
    'mod+y',
    (e) => {
      e.preventDefault()
      redo()
    },
    { enabled: hotkeysOk, preventDefault: true, filter: hotkeysFilter },
    [hotkeysOk, redo, hotkeysFilter],
  )
  useHotkeys(
    'delete, backspace',
    () => {
      if (!selectedBlockId) return
      removeBlock(selectedBlockId)
    },
    { enabled: hotkeysOk && Boolean(selectedBlockId), filter: hotkeysFilter },
    [hotkeysOk, selectedBlockId, removeBlock, hotkeysFilter],
  )

  useHotkeys(
    ['up', 'down', 'left', 'right'],
    (e) => {
      if (!selectedBlockId || !draftRef.current) return
      const d = draftRef.current
      const b = d.blocks.find(x => x.id === selectedBlockId)
      if (!b) return
      e.preventDefault()
      const step = e.shiftKey ? 5 : 0.5 // Normal nudge: 0.5mm, Shift nudge: 5mm (Canva standard)
      let { x, y } = b
      if (e.key === 'ArrowUp') y = y - step
      if (e.key === 'ArrowDown') y = y + step
      if (e.key === 'ArrowLeft') x = x - step
      if (e.key === 'ArrowRight') x = x + step
      patchBlock(selectedBlockId, { x: round2(x), y: round2(y) })
    },
    { enabled: hotkeysOk && Boolean(selectedBlockId), filter: hotkeysFilter },
    [hotkeysOk, selectedBlockId, hotkeysFilter, patchBlock],
  )

  useHotkeys(
    'mod+d',
    (e) => {
      if (!selectedBlockId) return
      e.preventDefault()
      duplicateBlock(selectedBlockId)
    },
    { enabled: hotkeysOk && Boolean(selectedBlockId), preventDefault: true, filter: hotkeysFilter },
    [hotkeysOk, selectedBlockId, duplicateBlock, hotkeysFilter],
  )

  useHotkeys(
    'mod+0',
    (e) => {
      e.preventDefault()
      fitToScreen()
    },
    { enabled: hotkeysOk, preventDefault: true, filter: hotkeysFilter },
    [hotkeysOk, fitToScreen, hotkeysFilter],
  )

  useHotkeys(
    'mod+=, mod+plus',
    (e) => {
      e.preventDefault()
      setZoomPct((z) => Math.min(250, z + 10))
    },
    { enabled: hotkeysOk, preventDefault: true, filter: hotkeysFilter },
    [hotkeysOk, hotkeysFilter],
  )

  useHotkeys(
    'mod+-',
    (e) => {
      e.preventDefault()
      setZoomPct((z) => Math.max(20, z - 10))
    },
    { enabled: hotkeysOk, preventDefault: true, filter: hotkeysFilter },
    [hotkeysOk, hotkeysFilter],
  )

  /* R: rota el bloque seleccionado 90° (0→90→180→270→0). Directo al caso de
   * etiquetas verticales/tira; lo que ves rotado ahora SÍ se imprime igual. */
  useHotkeys(
    'r',
    (e) => {
      if (!selectedBlockId || !draftRef.current) return
      const b = draftRef.current.blocks.find((x) => x.id === selectedBlockId)
      if (!b) return
      e.preventDefault()
      patchBlock(selectedBlockId, { rotation: (((Number(b.rotation) || 0) + 90) % 360) })
    },
    { enabled: hotkeysOk && Boolean(selectedBlockId), filter: hotkeysFilter },
    [hotkeysOk, selectedBlockId, hotkeysFilter, patchBlock],
  )

  /* Ctrl/Cmd+S: guardar la plantilla. */
  useHotkeys(
    'mod+s',
    (e) => {
      e.preventDefault()
      void saveCurrent()
    },
    { enabled: hotkeysOk, preventDefault: true, filter: hotkeysFilter },
    [hotkeysOk, hotkeysFilter, saveCurrent],
  )

  if (!open || !draft) return null

  void histTick
  const canUndo = historyRef.current.past.length > 0
  const canRedo = historyRef.current.future.length > 0

  const sampleData = previewProduct
    ? { ...sampleOverride, ...previewProduct.label_data, logoPath, ...labelLogoOpts }
    : { ...sampleOverride, logoPath, ...labelLogoOpts }
    
  const handleClose = async () => {
    if (dirty && !(await appConfirm('Hay cambios sin guardar. ¿Cerrar de todas formas?', { destructive: true, confirmLabel: 'Cerrar' }))) return
    onClose?.()
  }

  return (
    <div
      className={cn(
        'flex flex-col select-none',
        embedded
          ? 'relative h-full min-h-0 w-full flex-1 overflow-hidden bg-[var(--mlb-bg-app)]'
          : 'fixed inset-0 z-[240] bg-background',
      )}
      data-no-barcode="true"
    >
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--mlb-bg-app)] border-border/60 shadow-[var(--mlb-shadow-panel)]">
        
        {/* ─── Header Rediseñado Premium (Estilo Figma/Notion) ────────── */}
        <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border/50 bg-background/80 px-4 backdrop-blur">
          
          {/* Lado Izquierdo: Nombre + Dimensiones + Selector Deslizable */}
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setTemplatesOpen((v) => !v)}
              className={cn(
                'mlb-focus-ring flex items-center gap-2 rounded-lg border border-border/50 bg-[var(--mlb-bg-input)]/40 px-3 py-1.5 text-left transition-all hover:bg-[var(--mlb-bg-hover)]',
                templatesOpen && 'border-[var(--mlb-accent)]/40 bg-[var(--mlb-accent-soft)]/5 text-[var(--mlb-accent)]'
              )}
            >
              {templatesOpen ? <FolderOpen className="size-4 shrink-0" strokeWidth={1.8} /> : <FolderClosed className="size-4 shrink-0" strokeWidth={1.8} />}
              <span className="text-[12.5px] font-semibold truncate max-w-[140px]">
                {draft.name}
              </span>
              <ChevronDown className={cn('size-3.5 opacity-65 transition-transform duration-200', templatesOpen && 'rotate-180')} />
            </button>
            
            <div className="hidden items-center gap-1.5 sm:flex">
              <span className="text-[11px] font-mono bg-muted/65 text-muted-foreground border border-border/30 rounded px-1.5 py-0.5 leading-none">
                {draft.width_mm.toFixed(0)} × {draft.height_mm.toFixed(0)} mm
              </span>
              {list.activeId === draft.id ? (
                <span className="shrink-0 rounded-full border border-success/20 bg-success/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-success">
                  Activa
                </span>
              ) : null}
              {isBuiltinTemplateId(draft.id) ? (
                <span className="shrink-0 rounded border border-border/40 bg-muted/40 px-1 py-0.5 text-[9px] font-medium uppercase tracking-wider text-muted-foreground/80">
                  Sistema
                </span>
              ) : null}
            </div>
          </div>
          
          {/* Lado Central: Historial de Deshacer/Rehacer + Status */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1 bg-muted/40 border border-border/50 rounded-lg p-0.5">
              <button
                type="button"
                disabled={!canUndo || busy}
                onClick={undo}
                className="flex size-7 items-center justify-center rounded-md text-muted-foreground/85 transition-colors hover:bg-background hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
                title="Deshacer (Ctrl+Z)"
              >
                <Undo2 className="size-4" strokeWidth={1.8} />
              </button>
              <button
                type="button"
                disabled={!canRedo || busy}
                onClick={redo}
                className="flex size-7 items-center justify-center rounded-md text-muted-foreground/85 transition-colors hover:bg-background hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
                title="Rehacer (Ctrl+Y)"
              >
                <Redo2 className="size-4" strokeWidth={1.8} />
              </button>
            </div>
            
            {/* Status Indicator */}
            <div className="hidden items-center gap-1.5 md:flex">
              {dirty ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400 border border-amber-500/10">
                  <span className="size-1.5 rounded-full bg-amber-500 animate-pulse" />
                  Cambios sin guardar
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 border border-emerald-500/10">
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  Guardado
                </span>
              )}
            </div>
          </div>
          
          {/* Lado Derecho: Acciones de Plantilla + Botón Guardar principal */}
          <div className="flex shrink-0 items-center gap-1.5">
            
            {/* Botones de gestión rápida de plantilla */}
            <div className="flex items-center border-r border-border/40 pr-2 mr-1 gap-1">
              <button
                type="button"
                onClick={openNewTemplateDialog}
                disabled={busy}
                className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-40"
                title="Nueva plantilla"
              >
                <FilePlus className="size-4.5" strokeWidth={1.8} />
              </button>
              <button
                type="button"
                onClick={duplicateTemplate}
                disabled={busy || !draft.id}
                className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-40"
                title="Duplicar plantilla"
              >
                <Copy className="size-4.5" strokeWidth={1.8} />
              </button>
              {!isProtectedDefaultLabelTemplate(draft.id) ? (
                <button
                  type="button"
                  onClick={deleteTemplate}
                  disabled={busy}
                  className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-red-500/10 hover:text-red-500 transition-colors disabled:opacity-40"
                  title="Eliminar plantilla"
                >
                  <Trash className="size-4.5" strokeWidth={1.8} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={restoreOriginal}
                  disabled={busy}
                  className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-40"
                  title="Restaurar diseño de fábrica"
                >
                  <RotateCcw className="size-4.5" strokeWidth={1.8} />
                </button>
              )}
            </div>
            
            {list.activeId !== draft.id ? (
              <button
                type="button"
                disabled={busy}
                onClick={setActive}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border/70 bg-background px-3 text-[11.5px] font-semibold text-foreground/80 transition-colors hover:bg-muted/50 disabled:pointer-events-none disabled:opacity-40"
              >
                <CheckCircle2 className="size-4 text-[var(--mlb-accent)]" strokeWidth={1.8} />
                <span className="hidden sm:inline">Marcar activa</span>
              </button>
            ) : null}
            
            <button
              type="button"
              disabled={!dirty || busy}
              onClick={saveCurrent}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--mlb-accent)] px-4.5 text-[11.5px] font-semibold text-white transition-all hover:bg-[var(--mlb-accent-hover)] shadow-sm disabled:pointer-events-none disabled:opacity-40"
            >
              <Save className="size-4" strokeWidth={1.8} />
              Guardar
            </button>
            
            <button
              type="button"
              onClick={() => void handleClose()}
              className="ml-0.5 inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground/75 transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Cerrar editor"
            >
              <X className="size-5" strokeWidth={1.8} />
            </button>
          </div>
        </header>

        {/* ─── Main 3-Column Grid ────────────────────────────────────────── */}
        <div className="relative grid min-h-0 flex-1 grid-cols-[260px_minmax(0,1fr)_310px] gap-0">
          
          {/* SLIDE-OVER DESLIZANTE: MIS PLANTILLAS */}
          {templatesOpen && (
            <div className="absolute inset-y-0 left-0 z-30 w-72 bg-background border-r border-border/80 shadow-2xl flex flex-col animate-in slide-in-from-left duration-200">
              <div className="flex items-center justify-between border-b border-border/50 px-4 py-3 bg-muted/20">
                <span className="text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground">Mis Plantillas</span>
                <button
                  type="button"
                  onClick={() => setTemplatesOpen(false)}
                  className="inline-flex size-6 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto overscroll-contain p-3 space-y-2">
                {list.templates.map((t) => (
                  <TemplateThumb
                    key={t.id}
                    template={t}
                    isActive={t.id === list.activeId}
                    isCurrent={t.id === draft.id}
                    isBuiltin={isBuiltinTemplateId(t.id)}
                    compact
                    onSelect={() => {
                      void switchToTemplate(t.id)
                      setTemplatesOpen(false)
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* COLUMNA 1: CAJA DE HERRAMIENTAS (Izquierda) */}
          <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden border-r border-border/50 bg-background/50 backdrop-blur">
            
            {/* Sliding Tab Switcher */}
            <div className="flex p-1 bg-muted/40 border border-border/55 rounded-xl mx-3 mt-3">
              <button
                type="button"
                onClick={() => setLeftTab('insert')}
                className={cn(
                  'flex-1 text-center py-1.5 rounded-lg text-[11px] font-bold transition-all',
                  leftTab === 'insert'
                    ? 'bg-background text-foreground shadow-sm border border-border/20'
                    : 'text-muted-foreground hover:text-foreground/80'
                )}
              >
                Añadir bloque
              </button>
              <button
                type="button"
                onClick={() => setLeftTab('layers')}
                className={cn(
                  'flex-1 text-center py-1.5 rounded-lg text-[11px] font-bold transition-all',
                  leftTab === 'layers'
                    ? 'bg-background text-foreground shadow-sm border border-border/20'
                    : 'text-muted-foreground hover:text-foreground/80'
                )}
              >
                Capas ({draft.blocks.length})
              </button>
            </div>

            {/* CONTENIDO DE PESTAÑA: INSERTAR BLOQUE */}
            {leftTab === 'insert' && (
              <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
                <span className="block px-1 text-[9px] font-bold uppercase tracking-wider text-muted-foreground/70">
                  Haz clic para añadir a la etiqueta:
                </span>
                
                <div className="grid grid-cols-2 gap-2 pb-4">
                  {Object.keys(BLOCK_META).map((type) => {
                    const Ico = TYPE_ICONS[type] || Type
                    const meta = BLOCK_META[type] || {}
                    
                    const colorMap = {
                      empresa: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/10',
                      nombre: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/10',
                      precio: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/10',
                      codigo: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/10',
                      codigo_barras: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/10',
                      texto_libre: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/10',
                      separador: 'bg-zinc-500/15 text-zinc-600 dark:text-zinc-400 border-zinc-500/10',
                      imagen_fija: 'bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-500/10',
                      forma: 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/10',
                      propiedad: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/10',
                    }
                    
                    const colorStyle = colorMap[type] || 'bg-muted text-muted-foreground'
                    
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => addBlock(type)}
                        className="group flex flex-col items-center gap-2.5 p-3 text-center rounded-xl bg-background border border-border/50 hover:border-[var(--mlb-accent)]/30 hover:shadow-md active:scale-[0.98] transition-all"
                      >
                        <span className={cn('size-9 rounded-lg flex items-center justify-center border', colorStyle)}>
                          <Ico className="size-4.5" strokeWidth={1.8} />
                        </span>
                        <span className="text-[10.5px] font-bold text-foreground/80 leading-tight">
                          {meta.label || type}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* CONTENIDO DE PESTAÑA: CAPAS (BLOQUES PLACED) */}
            {leftTab === 'layers' && (
              <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5">
                <span className="block px-1 text-[9px] font-bold uppercase tracking-wider text-muted-foreground/70 mb-1">
                  Capas colocadas en el lienzo:
                </span>
                
                <div className="flex flex-col gap-1.5 pb-4">
                  {draft.blocks.map((b, i) => {
                    const Ico = TYPE_ICONS[b.type] || Type
                    const isSelected = selectedBlockId === b.id
                    return (
                      <div
                        key={b.id}
                        onClick={() => setSelectedBlockId(b.id)}
                        className={cn(
                          'group/row flex items-center gap-2 rounded-xl p-2 border transition-all cursor-pointer select-none',
                          isSelected
                            ? 'bg-background border-[var(--mlb-accent)]/80 shadow-[var(--shadow-xs)] ring-1 ring-[var(--mlb-accent)]/20'
                            : 'bg-background/40 border-transparent hover:bg-background/80 hover:border-border/50'
                        )}
                      >
                        {/* Eye toggle to show/hide block */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            patchBlock(b.id, { visible: !b.visible })
                          }}
                          className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground/75 hover:bg-muted hover:text-foreground transition-colors"
                          title={b.visible ? 'Ocultar capa' : 'Mostrar capa'}
                        >
                          {b.visible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                        </button>
                        
                        {/* Icon & Label */}
                        <div className="flex min-w-0 flex-1 items-center gap-1.5">
                          <span className={cn('size-6 rounded-md flex items-center justify-center bg-muted/40 border border-border/40', isSelected && 'bg-[var(--mlb-accent-soft)]/20 border-[var(--mlb-accent)]/30 text-[var(--mlb-accent)]')}>
                            <Ico className="size-3" strokeWidth={1.8} />
                          </span>
                          <span className={cn('truncate text-[11.5px] font-semibold leading-none text-foreground/85', !b.visible && 'text-muted-foreground line-through opacity-60')}>
                            {BLOCK_META[b.type]?.label || b.type}
                            {b.type === 'texto_libre' && b.text ? (
                              <span className="text-[10px] font-normal text-muted-foreground/80"> · "{b.text.slice(0, 10)}"</span>
                            ) : null}
                            {b.type === 'imagen_fija' && b.imagePath ? (
                              <span className="text-[10px] font-normal text-muted-foreground/80"> · {b.imagePath.replace(/^.*[/\\]/, '').slice(0, 10)}</span>
                            ) : null}
                          </span>
                        </div>

                        {/* Quick actions (Hover row) */}
                        <div className="flex items-center gap-0.5 opacity-0 group-hover/row:opacity-100 transition-opacity pr-1">
                          {i > 0 && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); moveBlock(b.id, 'up') }}
                              className="inline-flex size-5 items-center justify-center rounded-md text-muted-foreground/75 hover:bg-muted hover:text-foreground transition-colors font-bold text-[10px]"
                              title="Subir"
                            >
                              ↑
                            </button>
                          )}
                          {i < draft.blocks.length - 1 && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); moveBlock(b.id, 'down') }}
                              className="inline-flex size-5 items-center justify-center rounded-md text-muted-foreground/75 hover:bg-muted hover:text-foreground transition-colors font-bold text-[10px]"
                              title="Bajar"
                            >
                              ↓
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); duplicateBlock(b.id) }}
                            className="inline-flex size-5 items-center justify-center rounded-md text-muted-foreground/75 hover:bg-muted hover:text-foreground transition-colors"
                            title="Duplicar"
                          >
                            <Copy className="size-3" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); removeBlock(b.id) }}
                            className="inline-flex size-5 items-center justify-center rounded-md text-muted-foreground/75 hover:bg-destructive/10 hover:text-destructive transition-colors"
                            title="Eliminar"
                          >
                            <Trash2 className="size-3" />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                  {draft.blocks.length === 0 && (
                    <div className="px-3 py-8 text-center border border-dashed border-border rounded-2xl">
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        No hay capas. Ve a la pestaña <b className="text-foreground/80">Añadir bloque</b> para colocar elementos en el lienzo.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </aside>

          {/* COLUMNA 2: LIENZO / ESPACIO DE TRABAJO (Centro) */}
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#f4f4f3] dark:bg-[#0c0c0e]">
            
            {/* FLOATING PREVIEW WIDGET PANEL (Top-Left) */}
            <div className="absolute top-4 left-4 z-20 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setShowSamplePanel((v) => !v)}
                className={cn(
                  'shadow-lg bg-background/95 border border-border rounded-full py-1.5 px-3.5 flex items-center gap-2 backdrop-blur hover:bg-[var(--mlb-bg-hover)] transition-all font-semibold text-[11px] text-foreground/85 active:scale-95',
                  showSamplePanel && 'border-[var(--mlb-accent)]/40 bg-[var(--mlb-accent-soft)]/5 text-[var(--mlb-accent)]'
                )}
              >
                <Beaker className="size-3.5" strokeWidth={1.8} />
                <span>Previsualizar prenda</span>
              </button>
              
              {showSamplePanel && (
                <div className="w-80 bg-background/95 backdrop-blur shadow-2xl border border-border rounded-2xl p-4 flex flex-col gap-3 animate-in fade-in slide-in-from-top-2 duration-150">
                  <SamplePanel
                    value={sampleOverride}
                    onChange={setSampleOverride}
                    onClose={() => setShowSamplePanel(false)}
                    previewProduct={previewProduct}
                    onPreviewProduct={setPreviewProduct}
                  />
                </div>
              )}
            </div>

            {/* Lienzo Interactivo */}
            <div
              ref={viewportRef}
              className={cn(
                "flex min-h-0 min-w-0 flex-1 items-start justify-center overflow-auto p-12 sm:p-24 select-none canvas-container-bg scroll-smooth",
                spacePressed ? "cursor-grab active:cursor-grabbing" : "cursor-default"
              )}
              onPointerDown={(e) => {
                if (e.target === e.currentTarget) setSelectedBlockId(null);
                onViewportPointerDown(e);
              }}
              onPointerMove={onViewportPointerMove}
              onPointerUp={onViewportPointerUp}
              onPointerCancel={onViewportPointerUp}
            >
              <div
                ref={canvasWrapRef}
                className="inline-block overflow-visible rounded bg-white shadow-[0_20px_50px_rgba(0,0,0,0.12)] ring-1 ring-black/5 transition-transform"
                style={{
                  width: draft.width_mm * canvasScale,
                  height: draft.height_mm * canvasScale,
                  marginTop: 'auto',
                  marginBottom: 'auto'
                }}
              >
                <LabelRender
                  template={draft}
                  data={sampleData}
                  scale={canvasScale}
                  interactive
                  showGrid={showGrid}
                  selectedId={selectedBlockId}
                  onSelectBlock={setSelectedBlockId}
                  onBlockPointerDown={onBlockPointerDown}
                  onResizeHandlePointerDown={onResizeHandlePointerDown}
                  onTextoLibreDoubleClick={onTextoLibreDoubleClick}
                />
              </div>
            </div>
            
            {/* FLOATING ZOOM WIDGET PANEL (Bottom-Right) */}
            <div className="absolute bottom-4 right-4 z-20 flex items-center gap-2 shadow-lg bg-background/95 border border-border rounded-full py-1 px-3.5 backdrop-blur-md">
              <button
                type="button"
                onClick={() => setZoomPct((z) => Math.max(20, z - 10))}
                className="size-7 flex items-center justify-center rounded-full hover:bg-muted text-foreground transition-colors font-bold text-sm"
                title="Reducir zoom (Ctrl+-)"
              >
                -
              </button>
              <span className="w-11 text-center tabular-nums text-[11px] font-bold text-foreground/80">
                {zoomPct}%
              </span>
              <button
                type="button"
                onClick={() => setZoomPct((z) => Math.min(250, z + 10))}
                className="size-7 flex items-center justify-center rounded-full hover:bg-muted text-foreground transition-colors font-bold text-sm"
                title="Aumentar zoom (Ctrl++)"
              >
                +
              </button>
              <span className="h-4 w-px bg-border/80 mx-1" />
              <button
                type="button"
                onClick={fitToScreen}
                className="size-7 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                title="Ajustar vista (Ctrl+0)"
              >
                <Maximize2 className="size-4" strokeWidth={1.8} />
              </button>
              <button
                type="button"
                onClick={() => setShowGrid((g) => !g)}
                className={cn(
                  'size-7 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors',
                  showGrid && 'text-[var(--mlb-accent)]'
                )}
                title="Mostrar cuadrícula"
              >
                <Grid3x3 className="size-4" strokeWidth={1.8} />
              </button>
            </div>
          </div>

          {/* COLUMNA 3: CAJÓN DE PROPIEDADES CONTEXTUALES (Derecha) */}
          <aside className="min-h-0 min-w-0 overflow-y-auto overflow-x-hidden border-l border-border/50 bg-background/60 backdrop-blur">
            
            {/* Header de Propiedades */}
            <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border/50 bg-background/90 px-4 py-3.5 backdrop-blur">
              <span className="min-w-0 truncate text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground/80">
                {selectedBlock
                  ? selectedBlock.type === 'logo'
                    ? 'Propiedades del Logo'
                    : selectedBlock.type === 'imagen_fija'
                      ? 'Propiedades de Imagen'
                      : `Propiedades: ${BLOCK_META[selectedBlock.type]?.label || 'Bloque'}`
                  : 'Propiedades de Plantilla'}
              </span>
              
              {selectedBlock ? (
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => moveBlock(selectedBlock.id, 'top')}
                    className="inline-flex size-7 items-center justify-center rounded-lg border border-border/70 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    title="Traer al frente"
                  >
                    <ArrowUpToLine className="size-3.5" strokeWidth={1.8} />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveBlock(selectedBlock.id, 'bottom')}
                    className="inline-flex size-7 items-center justify-center rounded-lg border border-border/70 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    title="Enviar al fondo"
                  >
                    <ArrowDownToLine className="size-3.5" strokeWidth={1.8} />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeBlock(selectedBlock.id)}
                    className="inline-flex size-7 items-center justify-center rounded-lg border border-border/70 text-red-500 hover:bg-red-500/10 hover:border-red-500/20 transition-colors"
                    title="Eliminar bloque"
                  >
                    <Trash2 className="size-3.5" strokeWidth={1.8} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedBlockId(null)}
                    className="text-[10px] font-bold text-muted-foreground hover:text-foreground ml-1"
                  >
                    Cerrar
                  </button>
                </div>
              ) : null}
            </div>
            
            {/* Cuerpo de Propiedades */}
            {selectedBlock ? (
              <BlockProperties
                block={selectedBlock}
                onChange={(patch) => patchBlock(selectedBlock.id, patch)}
                labelLogoOpts={labelLogoOpts}
                patchLabelLogo={patchLabelLogo}
                textoLibreEditPulse={selectedBlock.type === 'texto_libre' ? textoLibrePulse : 0}
                onAlign={alignBlock}
              />
            ) : (
              <TemplateProperties draft={draft} patchDraft={patchDraft} />
            )}
          </aside>
        </div>
      </div>

      {/* DIÁLOGO: CREAR NUEVA PLANTILLA */}
      <Dialog open={newTplOpen} onOpenChange={setNewTplOpen}>
        <DialogContent className="z-[260] sm:max-w-md rounded-2xl" showCloseButton>
          <DialogHeader>
            <DialogTitle className="text-[15px] font-bold">Nueva plantilla</DialogTitle>
            <DialogDescription className="text-[13px] text-muted-foreground">
              Escribe un nombre identificativo para guardar la nueva plantilla en tu lista de diseños.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={newTplName}
            onChange={(e) => setNewTplName(e.target.value)}
            placeholder="Nombre de la plantilla"
            className="h-9 text-[13px] rounded-lg mt-2 focus:ring-[var(--mlb-accent)]/30 focus:border-[var(--mlb-accent)]"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void submitNewTemplate()
              }
            }}
          />
          <DialogFooter className="gap-2 sm:justify-end mt-4">
            <Button type="button" variant="outline" size="sm" className="rounded-lg" onClick={() => setNewTplOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" size="sm" className="rounded-lg bg-[var(--mlb-accent)] hover:bg-[var(--mlb-accent-hover)] text-white" disabled={busy} onClick={() => void submitNewTemplate()}>
              Crear plantilla
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function round2(n) { return Math.round(Number(n) * 100) / 100 }

/* ─── PANELES DE PROPIEDADES REDISEÑADOS ─────────────────────────────── */

function TemplateProperties({ draft, patchDraft }) {
  return (
    <div className="min-w-0 space-y-5 p-4 text-[12px]">
      <section className="space-y-3.5">
        <Field label="Nombre de Plantilla">
          <input
            className="h-9 w-full rounded-lg border border-border/80 bg-background px-3 text-[12px] font-semibold outline-none transition-all focus:border-[var(--mlb-accent)] focus:ring-2 focus:ring-[var(--mlb-accent-soft)]/20"
            value={draft.name || ''}
            onChange={(e) => patchDraft({ name: e.target.value })}
          />
        </Field>
        
        {/* Posición 2x2 grid */}
        <div className="grid min-w-0 grid-cols-2 gap-3">
          <Field label="Ancho (mm)">
            <NumberInput value={draft.width_mm} min={15} max={200} step={0.1} onChange={(v) => patchDraft({ width_mm: v })} />
          </Field>
          <Field label="Alto (mm)">
            <NumberInput value={draft.height_mm} min={10} max={200} step={0.1} onChange={(v) => patchDraft({ height_mm: v })} />
          </Field>
        </div>
        
        <Field label="Color de Fondo">
          <ColorInput value={draft.background || '#FFFFFF'} onChange={(v) => patchDraft({ background: v })} />
        </Field>
      </section>

      <section className="space-y-3 border-t border-border/40 pt-4.5">
        <h3 className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground/80">Borde Exterior</h3>
        <label className="flex items-center gap-2.5 text-[11.5px] font-semibold text-foreground/80 cursor-pointer">
          <input
            type="checkbox"
            className="size-4 rounded-md accent-[var(--mlb-accent)] cursor-pointer"
            checked={!!draft.border?.enabled}
            onChange={(e) => patchDraft({ border: { ...draft.border, enabled: e.target.checked } })}
          />
          Mostrar borde en etiqueta
        </label>
        
        {draft.border?.enabled ? (
          <div className="grid min-w-0 grid-cols-2 gap-3 animate-in fade-in slide-in-from-top-1 duration-150">
            <Field label="Grosor (pt)">
              <NumberInput value={draft.border?.width ?? 0.5} min={0.1} max={4} step={0.1} onChange={(v) => patchDraft({ border: { ...draft.border, width: v } })} />
            </Field>
            <Field label="Color Borde">
              <ColorInput value={draft.border?.color || '#C6C6C7'} onChange={(v) => patchDraft({ border: { ...draft.border, color: v } })} />
            </Field>
          </div>
        ) : null}
      </section>

      <div className="flex gap-2.5 rounded-2xl border border-border/50 bg-muted/15 px-3.5 py-3 text-muted-foreground/80 leading-relaxed text-[11px]">
        <Info className="size-4 shrink-0 text-[var(--mlb-accent)]" />
        <p>
          Haz clic en cualquier bloque colocado en el lienzo de trabajo para poder ajustar sus propiedades, cambiar textos o alineación.
        </p>
      </div>
    </div>
  )
}

function BlockProperties({ block, onChange, labelLogoOpts, patchLabelLogo, textoLibreEditPulse = 0, onAlign }) {
  const textoLibreRef = useRef(null)
  const hint = block.type === 'logo' ? null : BLOCK_HINT[block.type] || null

  useEffect(() => {
    if (block.type !== 'texto_libre' || !textoLibreEditPulse) return
    const el = textoLibreRef.current
    if (!el) return
    el.focus()
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [textoLibreEditPulse, block.type, block.id])
  
  return (
    <div className="min-w-0 space-y-4.5 p-4 text-[12px]">
      {hint ? (
        <div className="flex gap-2.5 rounded-2xl border border-border/50 bg-muted/15 px-3 py-2.5">
          <Info className="size-4 shrink-0 text-[var(--mlb-accent)] mt-0.5" strokeWidth={2} />
          <p className="text-[11px] leading-snug text-muted-foreground">{hint}</p>
        </div>
      ) : null}

      {/* Grid de Posición y Tamaño 2x2 */}
      <section className="space-y-3">
        <h3 className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground/80">Posición y Tamaño</h3>
        
        <div className="grid min-w-0 grid-cols-2 gap-3">
          <Field label="X (mm)"><NumberInput value={block.x} step={0.1} onChange={(v) => onChange({ x: v })} /></Field>
          <Field label="Y (mm)"><NumberInput value={block.y} step={0.1} onChange={(v) => onChange({ y: v })} /></Field>
          <Field label="Ancho (mm)"><NumberInput value={block.w} min={1} step={0.1} onChange={(v) => onChange({ w: v })} /></Field>
          <Field label="Alto (mm)"><NumberInput value={block.h} min={1} step={0.1} onChange={(v) => onChange({ h: v })} /></Field>
        </div>
        
        <Field label="Rotación del bloque (tecla R)">
          <div className="flex p-0.5 bg-muted/40 border border-border/60 rounded-lg">
            {[
              { value: 0, label: '0°' },
              { value: 90, label: '90° ↻' },
              { value: 180, label: '180°' },
              { value: 270, label: '270° ↺' }
            ].map((rot) => (
              <button
                key={rot.value}
                type="button"
                onClick={() => onChange({ rotation: rot.value })}
                className={cn(
                  'flex-1 text-center py-1 rounded-md text-[10.5px] font-bold transition-all',
                  (block.rotation || 0) === rot.value
                    ? 'bg-background text-foreground shadow-xs border border-border/30'
                    : 'text-muted-foreground hover:text-foreground/80'
                )}
              >
                {rot.label}
              </button>
            ))}
          </div>
        </Field>
      </section>

      {/* Canva-Style Quick Alignments */}
      <section className="space-y-3 border-t border-border/40 pt-4">
        <h3 className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground/80">Alineación rápida en la Etiqueta (Canva)</h3>
        <div className="grid grid-cols-3 gap-1.5">
          <button
            type="button"
            onClick={() => onAlign?.('left')}
            className="mlb-focus-ring flex flex-col items-center justify-center gap-1.5 py-2 rounded-lg bg-background border border-border/60 text-[10px] font-bold text-foreground/80 hover:bg-[var(--mlb-bg-hover)] active:scale-95 transition-all"
            title="Alinear al borde izquierdo"
          >
            <AlignLeft className="size-3.5" />
            <span>Izquierda</span>
          </button>
          <button
            type="button"
            onClick={() => onAlign?.('center_h')}
            className="mlb-focus-ring flex flex-col items-center justify-center gap-1.5 py-2 rounded-lg bg-background border border-border/60 text-[10px] font-bold text-foreground/80 hover:bg-[var(--mlb-bg-hover)] active:scale-95 transition-all"
            title="Centrar horizontalmente"
          >
            <AlignCenter className="size-3.5" />
            <span>Centro H</span>
          </button>
          <button
            type="button"
            onClick={() => onAlign?.('right')}
            className="mlb-focus-ring flex flex-col items-center justify-center gap-1.5 py-2 rounded-lg bg-background border border-border/60 text-[10px] font-bold text-foreground/80 hover:bg-[var(--mlb-bg-hover)] active:scale-95 transition-all"
            title="Alinear al borde derecho"
          >
            <AlignRight className="size-3.5" />
            <span>Derecha</span>
          </button>
          <button
            type="button"
            onClick={() => onAlign?.('top')}
            className="mlb-focus-ring flex flex-col items-center justify-center gap-1.5 py-2 rounded-lg bg-background border border-border/60 text-[10px] font-bold text-foreground/80 hover:bg-[var(--mlb-bg-hover)] active:scale-95 transition-all"
            title="Alinear al borde superior"
          >
            <ArrowUpToLine className="size-3.5" />
            <span>Arriba</span>
          </button>
          <button
            type="button"
            onClick={() => onAlign?.('center_v')}
            className="mlb-focus-ring flex flex-col items-center justify-center gap-1.5 py-2 rounded-lg bg-background border border-border/60 text-[10px] font-bold text-foreground/80 hover:bg-[var(--mlb-bg-hover)] active:scale-95 transition-all"
            title="Centrar verticalmente"
          >
            <Move className="size-3.5" />
            <span>Centro V</span>
          </button>
          <button
            type="button"
            onClick={() => onAlign?.('bottom')}
            className="mlb-focus-ring flex flex-col items-center justify-center gap-1.5 py-2 rounded-lg bg-background border border-border/60 text-[10px] font-bold text-foreground/80 hover:bg-[var(--mlb-bg-hover)] active:scale-95 transition-all"
            title="Alinear al borde inferior"
          >
            <ArrowDownToLine className="size-3.5" />
            <span>Abajo</span>
          </button>
        </div>
      </section>

      {/* TEXT CONTROLS GROUP */}
      {(block.type === 'empresa' || block.type === 'nombre' || block.type === 'codigo' || block.type === 'texto_libre' || block.type === 'precio' || block.type === 'propiedad') && (
        <section className="space-y-3.5 border-t border-border/40 pt-4.5">
          <h3 className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground/80">Estilo de Texto</h3>
          
          {block.type === 'texto_libre' ? (
            <Field label="Contenido de Texto">
              <textarea
                ref={textoLibreRef}
                rows={4}
                className="min-h-[5.5rem] w-full resize-y rounded-lg border border-border/80 bg-background px-3 py-2 text-[12px] leading-snug outline-none focus:border-[var(--mlb-accent)] focus:ring-2 focus:ring-[var(--mlb-accent-soft)]/20"
                value={block.text || ''}
                onChange={(e) => onChange({ text: e.target.value })}
                spellCheck={false}
              />
            </Field>
          ) : null}
          
          {/* Font Size visual slider + combined input */}
          <Field label="Tamaño de Letra (pt)">
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={3}
                max={72}
                step={0.5}
                value={block.fontSize || 10}
                onChange={(e) => onChange({ fontSize: Number(e.target.value) })}
                className="flex-1 accent-[var(--mlb-accent)] h-1"
              />
              <div className="w-16 shrink-0">
                <NumberInput value={block.fontSize} min={3} max={96} step={0.5} onChange={(v) => onChange({ fontSize: v })} />
              </div>
            </div>
          </Field>
          
          <div className="grid min-w-0 grid-cols-2 gap-3">
            <Field label="Estilo / Peso">
              <div className="flex p-0.5 bg-muted/40 border border-border/60 rounded-lg">
                {[
                  { value: 'normal', label: 'Regular' },
                  { value: 'bold', label: 'Negrita' }
                ].map((wt) => (
                  <button
                    key={wt.value}
                    type="button"
                    onClick={() => onChange({ fontWeight: wt.value })}
                    className={cn(
                      'flex-1 text-center py-1 rounded-md text-[11px] font-bold transition-all',
                      (block.fontWeight || 'normal') === wt.value
                        ? 'bg-background text-foreground shadow-xs border border-border/30'
                        : 'text-muted-foreground hover:text-foreground/80'
                    )}
                  >
                    {wt.label}
                  </button>
                ))}
              </div>
            </Field>
            
            <Field label="Color de Letra">
              <ColorInput value={block.color || '#141417'} onChange={(v) => onChange({ color: v })} />
            </Field>
          </div>
          
          <Field label="Alineación">
            <div className="flex p-0.5 bg-muted/40 border border-border/60 rounded-lg">
              {['left', 'center', 'right'].map((alignOpt) => (
                <button
                  key={alignOpt}
                  type="button"
                  onClick={() => onChange({ align: alignOpt })}
                  className={cn(
                    'flex-1 text-center py-1 rounded-md text-[11px] font-bold transition-all capitalize',
                    (block.align || 'left') === alignOpt
                      ? 'bg-background text-foreground shadow-xs border border-border/30'
                      : 'text-muted-foreground hover:text-foreground/80'
                  )}
                >
                  {alignOpt === 'left' ? 'Izq' : alignOpt === 'center' ? 'Centro' : 'Der'}
                </button>
              ))}
            </div>
          </Field>
          
          {block.type === 'nombre' ? (
            <Field label="Líneas Máximas de Nombre">
              <NumberInput value={block.maxLines || 2} min={1} max={6} step={1} onChange={(v) => onChange({ maxLines: Math.max(1, Math.floor(v)) })} />
            </Field>
          ) : null}
          
          {block.type === 'texto_libre' ? (
            <div className="grid min-w-0 grid-cols-2 gap-3">
              <Field label="Líneas Máximas">
                <NumberInput value={block.maxLines ?? 8} min={1} max={20} step={1} onChange={(v) => onChange({ maxLines: Math.max(1, Math.floor(v)) })} />
              </Field>
              <Field label="Interlineado">
                <NumberInput value={block.lineHeight ?? 1.2} min={1} max={2.5} step={0.05} onChange={(v) => onChange({ lineHeight: v })} />
              </Field>
            </div>
          ) : null}
        </section>
      )}

      {block.type === 'precio' ? (
        <section className="space-y-3 border-t border-border/40 pt-4.5">
          <h3 className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground/80 font-semibold">Etiqueta «PRECIO:»</h3>
          <label className="flex items-center gap-2.5 text-[11.5px] font-semibold text-foreground/85 cursor-pointer">
            <input
              type="checkbox"
              className="size-4 rounded-md accent-[var(--mlb-accent)] cursor-pointer"
              checked={block.showLabel !== false}
              onChange={(e) => onChange({ showLabel: e.target.checked })}
            />
            Mostrar prefijo «PRECIO:»
          </label>
          
          {block.showLabel !== false ? (
            <div className="space-y-3 animate-in fade-in slide-in-from-top-1 duration-150">
              <Field label="Texto Prefijo">
                <input
                  className="h-9 w-full rounded-lg border border-border/80 bg-background px-3 text-[12px] outline-none focus:border-[var(--mlb-accent)] focus:ring-2 focus:ring-[var(--mlb-accent-soft)]/20"
                  value={block.labelText || 'PRECIO:'}
                  onChange={(e) => onChange({ labelText: e.target.value })}
                />
              </Field>
              <div className="grid min-w-0 grid-cols-2 gap-3">
                <Field label="Tamaño (pt)"><NumberInput value={block.labelFontSize || 7.5} min={3} max={64} step={0.5} onChange={(v) => onChange({ labelFontSize: v })} /></Field>
                <Field label="Color"><ColorInput value={block.labelColor || '#141417'} onChange={(v) => onChange({ labelColor: v })} /></Field>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {block.type === 'codigo_barras' ? (
        <section className="space-y-3 border-t border-border/40 pt-4.5">
          <h3 className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground/80">Código de Barras</h3>
          <div className="grid min-w-0 grid-cols-2 gap-3">
            <Field label="Color Barras"><ColorInput value={block.barColor || '#000000'} onChange={(v) => onChange({ barColor: v })} /></Field>
            <Field label="Fondo Barras"><ColorInput value={block.background || '#FFFFFF'} onChange={(v) => onChange({ background: v })} /></Field>
          </div>
        </section>
      ) : null}

      {block.type === 'separador' ? (
        <section className="space-y-3 border-t border-border/40 pt-4.5">
          <h3 className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground/80">Línea Decorativa</h3>
          <div className="grid min-w-0 grid-cols-2 gap-3">
            <Field label="Grosor (pt)"><NumberInput value={block.thickness || 0.5} min={0.1} max={4} step={0.1} onChange={(v) => onChange({ thickness: v })} /></Field>
            <Field label="Color Línea"><ColorInput value={block.color || '#C6C6C7'} onChange={(v) => onChange({ color: v })} /></Field>
          </div>
        </section>
      ) : null}

      {block.type === 'imagen_fija' ? (
        <section className="space-y-3 border-t border-border/40 pt-4.5">
          <h3 className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground/80">Cargar Archivo</h3>
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              className="h-9 rounded-lg border border-border/70 bg-background px-3 text-[11.5px] font-semibold text-foreground/80 transition-colors hover:bg-muted/50"
              onClick={async () => {
                const pick = window.bazar?.productImage?.pick
                if (typeof pick !== 'function') {
                  toast.error('Elegir archivo solo está disponible en la app de escritorio.')
                  return
                }
                try {
                  const res = await pick()
                  if (res?.cancelled || !res?.path) return
                  onChange({ imagePath: String(res.path) })
                  toast.success('Imagen asignada al bloque')
                } catch (e) {
                  toast.error(String(e?.message || e))
                }
              }}
            >
              Buscar imagen...
            </button>
            {String(block.imagePath || '').trim() ? (
              <button
                type="button"
                className="h-9 rounded-lg border border-border/70 px-3 text-[11.5px] text-muted-foreground hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/20 transition-colors"
                onClick={() => onChange({ imagePath: '' })}
              >
                Quitar
              </button>
            ) : null}
          </div>
          <Field label="Ajuste de Imagen (Object Fit)">
            <SelectInput
              value={block.objectFit || 'contain'}
              onChange={(v) => onChange({ objectFit: v })}
              options={[
                { value: 'contain', label: 'Entero (contain)' },
                { value: 'cover', label: 'Recortar (cover)' },
              ]}
            />
          </Field>
        </section>
      ) : null}

      {block.type === 'propiedad' ? (
        <PropiedadConfig block={block} onChange={onChange} />
      ) : null}

      {block.type === 'forma' ? (
        <section className="space-y-3.5 border-t border-border/40 pt-4.5">
          <Field label="Tipo de Forma Geométrica">
            <SelectInput
              value={block.shapeType || 'rect'}
              onChange={(v) => onChange({ shapeType: v })}
              options={[
                { value: 'rect', label: 'Rectángulo / Cuadrado' },
                { value: 'ellipse', label: 'Elipse / Círculo' },
              ]}
            />
          </Field>
          <div className="grid min-w-0 grid-cols-2 gap-3">
            <Field label="Color de Relleno">
              <ColorInput value={block.fill || '#D1D5DB'} onChange={(v) => onChange({ fill: v })} />
            </Field>
            <Field label="Color de Borde">
              <ColorInput value={block.stroke || 'transparent'} onChange={(v) => onChange({ stroke: v })} />
            </Field>
            <Field label="Grosor Borde">
              <NumberInput value={block.strokeWidth || 0} min={0} step={0.1} onChange={(v) => onChange({ strokeWidth: v })} />
            </Field>
            {block.shapeType !== 'ellipse' && (
              <Field label="Redondear Esquinas">
                <NumberInput value={block.rx || 0} min={0} step={0.5} onChange={(v) => onChange({ rx: v })} />
              </Field>
            )}
          </div>
        </section>
      ) : null}

      {block.type === 'logo' ? (
        <section className="space-y-3 border-t border-border/40 pt-4.5">
          <Field label="Encaje del Logo (Object Fit)">
            <SelectInput
              value={block.objectFit || 'contain'}
              onChange={(v) => onChange({ objectFit: v })}
              options={[
                { value: 'contain', label: 'Entero (contain)' },
                { value: 'cover', label: 'Recortar (cover)' },
              ]}
            />
          </Field>
          <div className="space-y-3 rounded-2xl border border-border/60 bg-muted/15 p-3">
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground/80 leading-none">Estilo en Impresora</p>
            
            <div className="flex gap-2">
              <button
                type="button"
                className={cn(
                  'flex-1 rounded-lg border py-1.5 text-[11px] font-semibold transition-colors',
                  (labelLogoOpts.labelLogoStyle || 'thermal') !== 'original'
                    ? 'border-[var(--mlb-accent)]/80 bg-[var(--mlb-accent-soft)]/20 text-[var(--mlb-accent)]'
                    : 'border-border/70 bg-background text-muted-foreground hover:bg-muted/50',
                )}
                onClick={() => patchLabelLogo({ labelLogoStyle: 'thermal' })}
              >
                Monocromo B/N
              </button>
              <button
                type="button"
                className={cn(
                  'flex-1 rounded-lg border py-1.5 text-[11px] font-semibold transition-colors',
                  labelLogoOpts.labelLogoStyle === 'original'
                    ? 'border-[var(--mlb-accent)]/80 bg-[var(--mlb-accent-soft)]/20 text-[var(--mlb-accent)]'
                    : 'border-border/70 bg-background text-muted-foreground hover:bg-muted/50',
                )}
                onClick={() => patchLabelLogo({ labelLogoStyle: 'original' })}
              >
                Color original
              </button>
            </div>
            
            <div className="space-y-2 border-t border-border/40 pt-2.5">
              {(labelLogoOpts.labelLogoStyle || 'thermal') === 'original' ? (
                <>
                  <Collapsible className="group rounded-xl border border-border/50">
                    <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[11px] font-bold text-foreground/85 outline-none hover:bg-muted/40">
                      <span>Saturación del Color</span>
                      <ChevronDown className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" strokeWidth={1.8} />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-2 px-3 pb-3 pt-0">
                      <div className="flex justify-end text-[10px] text-muted-foreground font-semibold">
                        <span className="tabular-nums">{Number(labelLogoOpts.labelLogoSaturation ?? 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={200}
                        value={Number(labelLogoOpts.labelLogoSaturation ?? 100)}
                        onChange={(e) => patchLabelLogo({ labelLogoSaturation: Number(e.target.value) })}
                        className="w-full accent-[var(--mlb-accent)] h-1"
                      />
                    </CollapsibleContent>
                  </Collapsible>
                  
                  <Collapsible className="group rounded-xl border border-border/50">
                    <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[11px] font-bold text-foreground/85 outline-none hover:bg-muted/40">
                      <span>Contraste</span>
                      <ChevronDown className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" strokeWidth={1.8} />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-2 px-3 pb-3 pt-0">
                      <div className="flex justify-end text-[10px] text-muted-foreground font-semibold">
                        <span className="tabular-nums">{Number(labelLogoOpts.labelLogoContrast ?? 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min={70}
                        max={130}
                        value={Number(labelLogoOpts.labelLogoContrast ?? 100)}
                        onChange={(e) => patchLabelLogo({ labelLogoContrast: Number(e.target.value) })}
                        className="w-full accent-[var(--mlb-accent)] h-1"
                      />
                    </CollapsibleContent>
                  </Collapsible>
                </>
              ) : (
                <>
                  <Collapsible className="group rounded-xl border border-border/50">
                    <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[11px] font-bold text-foreground/85 outline-none hover:bg-muted/40">
                      <span className="min-w-0 leading-tight">Tinte (Sepia / Frío)</span>
                      <ChevronDown className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" strokeWidth={1.8} />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-2 px-3 pb-3 pt-0">
                      <div className="flex justify-end text-[10px] text-muted-foreground font-semibold">
                        <span className="tabular-nums">{Number(labelLogoOpts.labelLogoWarmth ?? 0)}</span>
                      </div>
                      <input
                        type="range"
                        min={-30}
                        max={30}
                        value={Number(labelLogoOpts.labelLogoWarmth ?? 0)}
                        onChange={(e) => patchLabelLogo({ labelLogoWarmth: Number(e.target.value) })}
                        className="w-full accent-[var(--mlb-accent)] h-1"
                      />
                    </CollapsibleContent>
                  </Collapsible>
                  
                  <Collapsible className="group rounded-xl border border-border/50">
                    <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[11px] font-bold text-foreground/85 outline-none hover:bg-muted/40">
                      <span>Contraste Térmico</span>
                      <ChevronDown className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" strokeWidth={1.8} />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-2 px-3 pb-3 pt-0">
                      <div className="flex justify-end text-[10px] text-muted-foreground font-semibold">
                        <span className="tabular-nums">{Number(labelLogoOpts.labelLogoContrast ?? 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min={70}
                        max={130}
                        value={Number(labelLogoOpts.labelLogoContrast ?? 100)}
                        onChange={(e) => patchLabelLogo({ labelLogoContrast: Number(e.target.value) })}
                        className="w-full accent-[var(--mlb-accent)] h-1"
                      />
                    </CollapsibleContent>
                  </Collapsible>
                </>
              )}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div className="min-w-0 space-y-1">
      <label className="text-[9.5px] font-extrabold uppercase tracking-widest text-muted-foreground/75 leading-none">{label}</label>
      {children}
    </div>
  )
}

function NumberInput({ value, onChange, min, max, step = 1 }) {
  const [local, setLocal] = useState(() => (value == null ? '' : String(value)))
  const focused = useRef(false)
  useEffect(() => {
    if (!focused.current) setLocal(value == null ? '' : String(value))
  }, [value])
  return (
    <input
      type="number"
      inputMode="decimal"
      className="h-9 w-full rounded-lg border border-border/80 bg-background px-3 text-[12px] tabular-nums font-semibold outline-none transition-all focus:border-[var(--mlb-accent)] focus:ring-2 focus:ring-[var(--mlb-accent-soft)]/20"
      value={local}
      min={min}
      max={max}
      step={step}
      onFocus={() => { focused.current = true }}
      onChange={(e) => {
        const raw = e.target.value
        setLocal(raw)
        if (raw === '' || raw === '-' || raw === '.') return
        const v = Number(raw)
        if (Number.isFinite(v)) onChange?.(v)
      }}
      onBlur={() => {
        focused.current = false
        const v = Number(local)
        if (!Number.isFinite(v)) { setLocal(value == null ? '' : String(value)); return }
        let clamped = v
        if (min != null && clamped < min) clamped = min
        if (max != null && clamped > max) clamped = max
        if (clamped !== v) { setLocal(String(clamped)); onChange?.(clamped) }
      }}
    />
  )
}

function toPickerHex(raw) {
  const s = String(raw || '').trim()
  if (!s) return '#000000'
  let m = s.match(/^#?([0-9a-fA-F]{6})$/i)
  if (m) return `#${m[1].toLowerCase()}`
  m = s.match(/^#?([0-9a-fA-F]{3})$/i)
  if (m) {
    const [r, g, b] = m[1].split('')
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase()
  }
  return '#000000'
}

function normalizeHex(raw) {
  const s = String(raw || '').trim().replace(/^#/, '')
  if (/^[0-9a-fA-F]{6}$/.test(s)) return `#${s.toUpperCase()}`
  if (/^[0-9a-fA-F]{3}$/.test(s)) {
    const [r, g, b] = s.split('')
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase()
  }
  return null
}

function ColorInput({ value, onChange }) {
  const inputId = useId()
  const pickerHex = useMemo(() => toPickerHex(value), [value])
  const [text, setText] = useState(() => (normalizeHex(value) || pickerHex.toUpperCase()))
  const textFocused = useRef(false)

  useEffect(() => {
    if (!textFocused.current) setText(normalizeHex(value) || toPickerHex(value).toUpperCase())
  }, [value])

  return (
    <div className="color-scheme-light flex min-w-0 items-center gap-2">
      <label
        htmlFor={inputId}
        className="relative h-9 w-9 shrink-0 cursor-pointer overflow-hidden rounded-lg border border-border shadow-[var(--shadow-xs)] ring-1 ring-inset ring-black/[0.08]"
        style={{ backgroundColor: pickerHex }}
        title="Elegir color"
      >
        <span className="sr-only">Abrir selector de color</span>
        <input
          id={inputId}
          type="color"
          value={pickerHex}
          onChange={(e) => {
            const next = `#${e.target.value.replace(/^#/, '').toUpperCase()}`
            setText(next)
            onChange?.(next)
          }}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
          aria-label="Selector de color"
        />
      </label>
      <input
        type="text"
        className="h-9 min-w-0 flex-1 rounded-lg border border-border/80 bg-background px-3 font-mono text-[11.5px] font-semibold outline-none focus:border-[var(--mlb-accent)] focus:ring-2 focus:ring-[var(--mlb-accent-soft)]/20"
        value={text}
        onFocus={() => { textFocused.current = true }}
        onChange={(e) => {
          setText(e.target.value)
          const norm = normalizeHex(e.target.value)
          if (norm) onChange?.(norm)
        }}
        onBlur={() => {
          textFocused.current = false
          const norm = normalizeHex(text)
          if (norm) { setText(norm); onChange?.(norm) }
          else setText(normalizeHex(value) || toPickerHex(value).toUpperCase())
        }}
        placeholder="#RRGGBB"
        spellCheck={false}
      />
    </div>
  )
}

function SamplePanel({ value, onChange, onClose, previewProduct, onPreviewProduct }) {
  const patch = (k, v) => onChange({ ...value, [k]: v })
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="inline-flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider text-[var(--mlb-accent)]">
          <Beaker className="size-3.5" strokeWidth={2} />
          Previsualización
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex size-6 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <X className="size-3.5" />
        </button>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[10px] text-muted-foreground font-bold uppercase mr-1">Presets:</span>
        {SAMPLE_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              onChange(p.data)
              onPreviewProduct?.(null)
            }}
            className="rounded-lg border border-border/50 bg-background/60 hover:bg-background hover:border-border px-2 py-0.5 text-[10.5px] font-semibold text-foreground transition-all"
          >
            {p.label}
          </button>
        ))}
      </div>

      <ProductPreviewPicker selected={previewProduct} onSelect={onPreviewProduct} />

      {previewProduct ? (
        <p className="text-[10px] text-muted-foreground leading-relaxed border-t border-border/40 pt-2 font-medium">
          Prenda activa: <span className="font-semibold text-foreground">{previewProduct.label_data?.codigo}</span>. Los bloques de tipo «Propiedad» se resolverán automáticamente.
        </p>
      ) : (
        <div className="space-y-2 border-t border-border/40 pt-2">
          <div className="grid grid-cols-2 gap-2">
            <SampleField label="Empresa" value={value.empresa} onChange={(v) => patch('empresa', v)} />
            <SampleField label="Nombre" value={value.nombre} onChange={(v) => patch('nombre', v)} />
            <SampleField label="Precio" value={value.precio} onChange={(v) => patch('precio', v)} />
            <SampleField label="Código" value={value.codigo} onChange={(v) => patch('codigo', v)} />
          </div>
        </div>
      )}
    </div>
  )
}

function ProductPreviewPicker({ selected, onSelect }) {
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState([])
  const [loading, setLoading] = useState(false)
  const reqId = useRef(0)
  const cacheRef = useRef({ tagGroups: null, ruleFields: null })

  const ensureCaches = useCallback(async () => {
    const api = typeof window !== 'undefined' ? window.bazar?.db : null
    if (!api) return { tagGroups: [], ruleFields: [] }
    if (cacheRef.current.tagGroups && cacheRef.current.ruleFields) {
      return cacheRef.current
    }
    try {
      const [tagGroups, ruleFields] = await Promise.all([
        api.getCuadernoTagGroups?.() ?? [],
        api.listInvRuleCustomFieldsFlat?.() ?? [],
      ])
      cacheRef.current = {
        tagGroups: Array.isArray(tagGroups) ? tagGroups : [],
        ruleFields: Array.isArray(ruleFields) ? ruleFields : [],
      }
    } catch {
      cacheRef.current = { tagGroups: [], ruleFields: [] }
    }
    return cacheRef.current
  }, [])

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setHits([])
      setLoading(false)
      return
    }
    const api = typeof window !== 'undefined' ? window.bazar?.db?.searchProducts : null
    if (typeof api !== 'function') return
    const id = ++reqId.current
    setLoading(true)
    const timer = setTimeout(async () => {
      try {
        const res = await api(q)
        if (id !== reqId.current) return
        setHits(Array.isArray(res) ? res.slice(0, 8) : [])
      } catch {
        if (id === reqId.current) setHits([])
      } finally {
        if (id === reqId.current) setLoading(false)
      }
    }, 180)
    return () => clearTimeout(timer)
  }, [query])

  const formatPrice = (p) => {
    const n = Number(p)
    if (!Number.isFinite(n) || n === 0) return '$0'
    return Math.abs(n - Math.round(n)) < 1e-9 ? `$${Math.round(n)}` : `$${n.toFixed(2)}`
  }

  const handlePick = useCallback(
    async (codigo) => {
      const api = typeof window !== 'undefined' ? window.bazar?.db : null
      if (!api?.getProductByCodigo) return
      try {
        const [{ tagGroups, ruleFields }, full] = await Promise.all([
          ensureCaches(),
          api.getProductByCodigo(codigo),
        ])
        if (!full) return
        const propertiesByTagGroupId = {}
        const groupsById = new Map((tagGroups || []).map((g) => [Number(g.id), g]))
        const tags = full.tagsByGroup || {}
        for (const [gid, oid] of Object.entries(tags)) {
          const groupId = Number(gid)
          const optionId = Number(oid)
          if (!Number.isFinite(groupId) || !Number.isFinite(optionId)) continue
          const grp = groupsById.get(groupId)
          if (!grp) continue
          const opt = (grp.options || []).find((o) => Number(o.id) === optionId)
          if (!opt) continue
          propertiesByTagGroupId[groupId] = {
            value: optionId,
            label: String(opt.name || '').trim(),
            group: String(grp.name || '').trim(),
          }
        }
        const propertiesByRuleFieldId = {}
        const ruleVals = full.ruleFieldValues || {}
        if (full.ruleId && Array.isArray(ruleFields)) {
          const fieldsForRule = ruleFields.filter((f) => Number(f.rule_id) === Number(full.ruleId))
          for (const f of fieldsForRule) {
            const raw = ruleVals[f.field_id]
            if (raw == null || raw === '') continue
            let label = String(raw)
            if (f.field_type === 'checkbox') label = raw ? 'Sí' : 'No'
            else if (f.field_type === 'number') {
              const n = Number(raw)
              label = Number.isFinite(n) ? String(n) : String(raw)
            }
            propertiesByRuleFieldId[f.field_id] = {
              value: raw,
              label: label.trim(),
              type: f.field_type || 'text',
              group: f.rule_name || '',
            }
          }
        }
        onSelect?.({
          id: full.id,
          label_data: {
            codigo: String(full.codigo || ''),
            nombre: String(full.descripcion || '').trim() || '—',
            precio: formatPrice(full.precio),
            propertiesByTagGroupId,
            propertiesByRuleFieldId,
          },
        })
        setQuery('')
        setHits([])
      } catch {
        /* noop */
      }
    },
    [ensureCaches, onSelect],
  )

  return (
    <div className="rounded-xl border border-border/80 bg-muted/20 px-3 py-2">
      <div className="flex items-center gap-2">
        <Search className="size-3.5 shrink-0 text-muted-foreground/80" strokeWidth={1.8} aria-hidden />
        {selected ? (
          <>
            <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-foreground/85">
              <span className="font-mono text-[10px] text-muted-foreground">
                [{selected.label_data?.codigo}]
              </span>
              <span className="mx-1.5 text-muted-foreground/50">·</span>
              <span className="truncate">{selected.label_data?.nombre}</span>
            </span>
            <button
              type="button"
              onClick={() => onSelect?.(null)}
              className="inline-flex h-6 items-center rounded-lg px-2 text-[10.5px] font-bold text-muted-foreground hover:bg-muted hover:text-foreground transition-all"
            >
              Quitar
            </button>
          </>
        ) : (
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar prenda del inventario real..."
            className="h-6 min-w-0 flex-1 bg-transparent px-1 text-[11.5px] font-semibold outline-none placeholder:text-muted-foreground/60"
          />
        )}
      </div>
      {!selected && hits.length > 0 ? (
        <ul className="mt-2 max-h-44 overflow-auto rounded-lg border border-border/60 bg-background py-1 shadow-md">
          {hits.map((h) => (
            <li key={h.id || h.codigo}>
              <button
                type="button"
                onClick={() => handlePick(h.codigo)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11.5px] font-medium hover:bg-muted/40 transition-colors"
              >
                <span className="font-mono text-[10px] text-muted-foreground">[{h.codigo}]</span>
                <span className="min-w-0 flex-1 truncate font-semibold">{h.descripcion || h.nombre || '—'}</span>
                <span className="shrink-0 tabular-nums text-[10.5px] text-muted-foreground">
                  {formatPrice(h.precio)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {!selected && query.trim().length >= 2 && !loading && hits.length === 0 ? (
        <p className="mt-2 text-[10.5px] font-semibold text-muted-foreground/75">Sin resultados.</p>
      ) : null}
      {!selected && loading ? (
        <p className="mt-2 text-[10.5px] font-semibold text-muted-foreground/75">Buscando...</p>
      ) : null}
    </div>
  )
}

function SampleField({ label, value, onChange }) {
  return (
    <div className="space-y-1">
      <label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/70 leading-none">{label}</label>
      <input
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 w-full rounded-lg border border-border/80 bg-background px-2.5 text-[11px] font-semibold outline-none focus:border-[var(--mlb-accent)] focus:ring-1 focus:ring-[var(--mlb-accent)]/20"
      />
    </div>
  )
}

function SelectInput({ value, onChange, options }) {
  return (
    <select
      className="h-9 w-full rounded-lg border border-border/80 bg-background px-2.5 text-[12px] font-semibold outline-none focus:border-[var(--mlb-accent)] focus:ring-2 focus:ring-[var(--mlb-accent-soft)]/20 cursor-pointer"
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
    >
      {options.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
    </select>
  )
}

function PropiedadConfig({ block, onChange }) {
  const [tagGroups, setTagGroups] = useState([])
  const [ruleFields, setRuleFields] = useState([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancel = false
    const api = typeof window !== 'undefined' ? window.bazar?.db : null
    void (async () => {
      try {
        const [g, f] = await Promise.all([
          api?.getCuadernoTagGroups?.() ?? [],
          api?.listInvRuleCustomFieldsFlat?.() ?? [],
        ])
        if (cancel) return
        setTagGroups(Array.isArray(g) ? g : [])
        setRuleFields(Array.isArray(f) ? f : [])
      } catch {
        if (!cancel) {
          setTagGroups([])
          setRuleFields([])
        }
      } finally {
        if (!cancel) setLoaded(true)
      }
    })()
    return () => {
      cancel = true
    }
  }, [])

  const source = block.source || 'tag'
  const refId = block.ref_id != null ? Number(block.ref_id) : null

  const tagOptions = useMemo(
    () =>
      [{ value: '', label: source === 'tag' ? 'Elegí un grupo…' : 'Elegí un campo…' }].concat(
        source === 'tag'
          ? tagGroups.map((g) => ({ value: String(g.id), label: String(g.name || `Grupo ${g.id}`) }))
          : ruleFields.map((f) => ({
              value: String(f.field_id),
              label: `${f.field_name}  ·  ${f.rule_name}`,
            })),
      ),
    [source, tagGroups, ruleFields],
  )

  const selectedLabel = useMemo(() => {
    if (refId == null) return ''
    if (source === 'tag') {
      const g = tagGroups.find((x) => Number(x.id) === refId)
      return g ? String(g.name || '') : `Grupo #${refId} (no existe)`
    }
    const f = ruleFields.find((x) => Number(x.field_id) === refId)
    return f ? `${f.field_name} (${f.rule_name})` : `Campo #${refId} (no existe)`
  }, [refId, source, tagGroups, ruleFields])

  return (
    <section className="space-y-3.5 border-t border-border/40 pt-4.5">
      <h3 className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground/80 font-semibold">
        Propiedad enlazada
      </h3>

      <Field label="Fuente de la Propiedad">
        <div className="flex p-0.5 bg-muted/40 border border-border/60 rounded-lg">
          {[
            { value: 'tag', label: 'Tag del cuaderno' },
            { value: 'rule_field', label: 'Campo de regla' }
          ].map((srcOpt) => (
            <button
              key={srcOpt.value}
              type="button"
              onClick={() => onChange({ source: srcOpt.value, ref_id: null })}
              className={cn(
                'flex-1 text-center py-1 rounded-md text-[10.5px] font-bold transition-all',
                source === srcOpt.value
                  ? 'bg-background text-foreground shadow-xs border border-border/30'
                  : 'text-muted-foreground hover:text-foreground/80'
              )}
            >
              {srcOpt.label}
            </button>
          ))}
        </div>
      </Field>

      <Field label={source === 'tag' ? 'Grupo de tags' : 'Campo personalizado'}>
        <SelectInput
          value={refId == null ? '' : String(refId)}
          onChange={(v) => {
            const n = v ? Number(v) : null
            onChange({ ref_id: Number.isFinite(n) && n > 0 ? n : null })
          }}
          options={tagOptions}
        />
      </Field>

      {loaded && refId != null && selectedLabel ? (
        <p className="rounded-lg bg-[var(--mlb-accent-soft)]/10 border border-[var(--mlb-accent)]/15 px-3 py-1.5 text-[11px] text-[var(--mlb-accent)] font-semibold leading-tight">
          Enlazado a: <span className="underline">{selectedLabel}</span>
        </p>
      ) : null}

      <div className="grid min-w-0 grid-cols-2 gap-3">
        <Field label="Prefijo">
          <input
            className="h-9 w-full rounded-lg border border-border/80 bg-background px-3 text-[12px] outline-none focus:border-[var(--mlb-accent)] focus:ring-2 focus:ring-[var(--mlb-accent-soft)]/20"
            value={block.prefix ?? ''}
            placeholder="Ej: «Talla: »"
            onChange={(e) => onChange({ prefix: e.target.value })}
          />
        </Field>
        <Field label="Sufijo">
          <input
            className="h-9 w-full rounded-lg border border-border/80 bg-background px-3 text-[12px] outline-none focus:border-[var(--mlb-accent)] focus:ring-2 focus:ring-[var(--mlb-accent-soft)]/20"
            value={block.suffix ?? ''}
            placeholder="Ej: « kg»"
            onChange={(e) => onChange({ suffix: e.target.value })}
          />
        </Field>
      </div>

      <label className="flex items-center gap-2.5 text-[11px] font-semibold text-foreground/85 cursor-pointer pt-1">
        <input
          type="checkbox"
          className="size-4 rounded-md accent-[var(--mlb-accent)] cursor-pointer"
          checked={block.showEmpty === true}
          onChange={(e) => onChange({ showEmpty: e.target.checked })}
        />
        <span>Mostrar fallback si no hay valor</span>
      </label>

      {block.showEmpty ? (
        <Field label="Texto fallback">
          <input
            className="h-9 w-full rounded-lg border border-border/80 bg-background px-3 text-[12px] outline-none focus:border-[var(--mlb-accent)] focus:ring-2 focus:ring-[var(--mlb-accent-soft)]/20 animate-in fade-in slide-in-from-top-1 duration-150"
            value={block.emptyText ?? '—'}
            onChange={(e) => onChange({ emptyText: e.target.value })}
          />
        </Field>
      ) : (
        <p className="text-[10.5px] leading-relaxed text-muted-foreground/85">
          Sin fallback: si el producto no tiene valor asignado para esta propiedad, el bloque quedará completamente oculto al imprimir.
        </p>
      )}
    </section>
  )
}
