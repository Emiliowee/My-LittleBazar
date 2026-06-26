import { useEffect, useMemo, useRef, useState } from 'react'
import { Tag as TagIcon, Check, ArrowRight, ArrowLeft, Percent, Plus, Minus, DollarSign, ListChecks, SlidersHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import { formatPrice } from '@/lib/format'
import { ProductTagsDialog } from '@/components/inventory/ProductTagsDialog'
import { releaseModalBodyLocks } from '@/lib/releaseModalBodyLocks'
import { ModalPage, ModalStepper, ModalNavButton } from '@/components/premium'
import { cn } from '@/lib/utils'

const ROUND_OPTIONS = [
  { value: 'centavos', label: 'Centavos (2 dec.)' },
  { value: 'entero', label: 'Entero' },
  { value: 'medio', label: 'Medio peso (.50)' },
  { value: 'punto90', label: 'Punto 90 (ej. 199.90)' },
]

function optionIdsFromMap(map) {
  if (!map || typeof map !== 'object') return []
  return [...new Set(Object.values(map).map(Number).filter((n) => Number.isFinite(n)))]
}

function parseDecimalInput(raw) {
  const s = String(raw ?? '').trim().replace(',', '.')
  if (!s || s === '-' || s === '+' || s === '.') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

const fieldClass =
  'h-8 w-full rounded-md border border-border/70 bg-background px-2.5 text-[12.5px] outline-none transition-colors focus:border-ring/50 focus:shadow-[inset_0_0_0_1px_var(--ring)]'

export function PriceAdjustDialog({ open, onClose, onApplied, initialTagsByGroup, inventorySearchRef }) {
  const pricePanelRef = useRef(null)
  const [step, setStep] = useState(0)
  const [filtroModo, setFiltroModo] = useState('catmarca') // 'catmarca' (modelo de la dueña) | 'tags' (avanzado)
  const [categoria, setCategoria] = useState('')
  const [marca, setMarca] = useState('')
  const [catList, setCatList] = useState([])
  const [marcaList, setMarcaList] = useState([])
  const [tagsByGroup, setTagsByGroup] = useState({})
  const [tagsDialogOpen, setTagsDialogOpen] = useState(false)
  const [matchExact, setMatchExact] = useState(false)
  const [adjustMode, setAdjustMode] = useState('pct')
  const [pct, setPct] = useState('10')
  const [sumAmount, setSumAmount] = useState('50')
  const [sumSign, setSumSign] = useState(1)
  const [fixedPrice, setFixedPrice] = useState('0')
  const [roundMode, setRoundMode] = useState('centavos')
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  const initialRef = useRef(initialTagsByGroup)
  initialRef.current = initialTagsByGroup
  const wasOpen = useRef(false)

  useEffect(() => {
    if (open) { wasOpen.current = true; return }
    if (!wasOpen.current) return
    wasOpen.current = false
    const t = window.setTimeout(() => {
      releaseModalBodyLocks()
      inventorySearchRef?.current?.focus?.({ preventScroll: true })
    }, 50)
    return () => clearTimeout(t)
  }, [open, inventorySearchRef])

  useEffect(() => {
    if (!open) {
      setTagsDialogOpen(false); setPreview(null); setStep(0)
      return
    }
    const raw = initialRef.current
    setTagsByGroup(raw && typeof raw === 'object' ? { ...raw } : {})
    setCategoria(''); setMarca('')
    // Categorías y marcas existentes (modelo de la dueña: precio por categoría+marca).
    const inv = window.bazar?.db?.getInventoryList
    if (inv) {
      Promise.resolve(inv({ estadoIndex: 0, vistaIndex: 0, listTab: 'main' })).then((rows) => {
        const arr = Array.isArray(rows) ? rows : []
        setCatList([...new Set(arr.map((r) => String(r.categoria || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')))
        setMarcaList([...new Set(arr.map((r) => String(r.marca || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')))
      }).catch(() => {})
    }
  }, [open])

  useEffect(() => { setPreview((prev) => (prev ? null : prev)) }, [filtroModo, categoria, marca, tagsByGroup, matchExact, adjustMode, pct, sumAmount, sumSign, fixedPrice, roundMode])

  const tagOptionIds = useMemo(() => optionIdsFromMap(tagsByGroup), [tagsByGroup])
  const filtroListo = filtroModo === 'catmarca' ? !!categoria.trim() : tagOptionIds.length > 0
  const filtroPayload = filtroModo === 'catmarca' ? { categoria: categoria.trim(), marca: marca.trim() } : { tagOptionIds, matchExact }

  const runPreview = async () => {
    const api = window.bazar?.db
    if (!api?.previewPriceAdjust) { toast.error('Disponible solo en Electron'); return }
    if (!filtroListo) { toast.error(filtroModo === 'catmarca' ? 'Elegí una categoría.' : 'Elegí al menos un tag.'); return }

    let adjustValue
    if (adjustMode === 'pct') adjustValue = parseDecimalInput(pct)
    else if (adjustMode === 'sum') adjustValue = parseDecimalInput(sumAmount)
    else adjustValue = parseDecimalInput(fixedPrice)
    if (adjustValue == null) { toast.error('Número inválido'); return }
    if (adjustMode === 'pct' && Math.abs(adjustValue) < 1e-9) { toast.error('Porcentaje distinto de 0'); return }
    if (adjustMode === 'sum' && adjustValue < 1e-9) { toast.error('Monto > 0'); return }
    if (adjustMode === 'fixed' && adjustValue < 0) { toast.error('Precio no puede ser negativo'); return }

    setBusy(true)
    try {
      const res = await api.previewPriceAdjust({ ...filtroPayload, adjustMode: adjustMode === 'sum' ? 'sum' : adjustMode === 'fixed' ? 'fixed' : 'pct', adjustValue, sumSign, roundMode })
      setPreview(res)
      if (res.total === 0) toast.message('Ningún artículo coincide')
      else setStep(1)
    } catch (e) { toast.error(String(e.message || e)) }
    finally { setBusy(false) }
  }

  const apply = async () => {
    if (!preview || preview.total === 0) { toast.message('Primero generá la vista previa'); return }
    let adjustValue
    if (adjustMode === 'pct') adjustValue = parseDecimalInput(pct)
    else if (adjustMode === 'sum') adjustValue = parseDecimalInput(sumAmount)
    else adjustValue = parseDecimalInput(fixedPrice)
    if (adjustValue == null) { toast.error('Valor inválido'); return }

    const dbApply = window.bazar?.db?.applyPriceAdjust
    if (!dbApply) {
      toast.error('Base de datos no disponible.')
      return
    }
    setBusy(true)
    try {
      await dbApply({ ...filtroPayload, adjustMode: adjustMode === 'sum' ? 'sum' : adjustMode === 'fixed' ? 'fixed' : 'pct', adjustValue, sumSign, roundMode })
      toast.success(`Se actualizaron ${preview.total} precio(s)`)
      onApplied?.(); onClose(); setPreview(null); setStep(0)
    } catch (e) { toast.error(String(e.message || e)) }
    finally { setBusy(false) }
  }

  const steps = [
    { id: 'filters', label: 'Criterios' },
    { id: 'preview', label: 'Vista previa' },
  ]

  return (
    <>
      <ModalPage
        open={open}
        onClose={onClose}
        size="wide"
        title="Ajustar precios en masa"
        description="Elegí una categoría y marca (o etiquetas) y aplicá una fórmula de ajuste a todos los artículos que coincidan."
        headerRight={<ModalStepper steps={steps} current={step} onStepClick={(i) => i <= step && setStep(i)} />}
        footer={
          step === 0 ? (
            <>
              <div className="text-[11.5px] text-muted-foreground/75">
                {!filtroListo
                  ? 'Elegí qué artículos ajustar para continuar.'
                  : filtroModo === 'catmarca'
                    ? `Categoría: ${categoria}${marca ? ` · ${marca}` : ' · todas las marcas'}`
                    : `${tagOptionIds.length} tag(s) seleccionado(s).`}
              </div>
              <div className="flex items-center gap-2">
                <ModalNavButton direction="back" label="Cancelar" onClick={onClose} />
                <button
                  type="button"
                  onClick={runPreview}
                  disabled={busy || !filtroListo}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md bg-foreground px-3 text-[12.5px] font-medium text-background transition-colors hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? 'Calculando…' : 'Ver vista previa'}
                  <ArrowRight className="size-3.5" strokeWidth={2} />
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="text-[11.5px] text-muted-foreground/75">
                {preview
                  ? <><strong className="text-foreground/90 tabular-nums">{preview.total}</strong> artículo(s) serán modificados.</>
                  : 'Sin resultados.'}
              </div>
              <div className="flex items-center gap-2">
                <ModalNavButton direction="back" label="Atrás" onClick={() => setStep(0)} />
                <button
                  type="button"
                  onClick={apply}
                  disabled={busy || !preview?.total}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-[12.5px] font-semibold text-primary-foreground transition-colors hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Check className="size-3.5" strokeWidth={2} />
                  {busy ? 'Aplicando…' : `Aplicar a ${preview?.total ?? 0} artículo(s)`}
                </button>
              </div>
            </>
          )
        }
      >
        <div ref={pricePanelRef} tabIndex={-1} className="outline-none">
          {step === 0 ? (
            <FiltersStep
              filtroModo={filtroModo} setFiltroModo={setFiltroModo}
              categoria={categoria} setCategoria={setCategoria}
              marca={marca} setMarca={setMarca}
              catList={catList} marcaList={marcaList}
              tagOptionIds={tagOptionIds}
              tagsByGroup={tagsByGroup}
              onEditTags={() => setTagsDialogOpen(true)}
              matchExact={matchExact}
              setMatchExact={setMatchExact}
              adjustMode={adjustMode}
              setAdjustMode={setAdjustMode}
              pct={pct} setPct={setPct}
              sumAmount={sumAmount} setSumAmount={setSumAmount}
              sumSign={sumSign} setSumSign={setSumSign}
              fixedPrice={fixedPrice} setFixedPrice={setFixedPrice}
              roundMode={roundMode} setRoundMode={setRoundMode}
            />
          ) : (
            <PreviewStep preview={preview} adjustMode={adjustMode} pct={pct} sumAmount={sumAmount} sumSign={sumSign} fixedPrice={fixedPrice} />
          )}
        </div>
      </ModalPage>

      <ProductTagsDialog
        open={tagsDialogOpen}
        title="Tags para ajustar precios"
        initialMap={tagsByGroup}
        restoreFocusRef={pricePanelRef}
        onClose={() => setTagsDialogOpen(false)}
        onSave={(map) => setTagsByGroup(map)}
      />
    </>
  )
}

function SectionTitle({ icon, title, description }) {
  return (
    <header className="mb-3 flex items-start gap-2.5">
      <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-muted/40 text-foreground/75">
        {icon}
      </span>
      <div>
        <h3 className="text-[13.5px] font-semibold leading-tight tracking-[-0.005em] text-foreground">{title}</h3>
        {description ? (
          <p className="mt-0.5 text-[11.5px] text-muted-foreground/85">{description}</p>
        ) : null}
      </div>
    </header>
  )
}

function OptionRadio({ checked, onChange, label, description, children }) {
  return (
    <div
      onClick={onChange}
      className={cn(
        'cursor-pointer rounded-lg border p-3 transition-colors',
        checked ? 'border-primary/50 bg-primary/[0.04]' : 'border-border/60 hover:border-border hover:bg-foreground/[0.03]',
      )}
    >
      <div className="flex items-start gap-2.5">
        <span
          className={cn(
            'mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors',
            checked ? 'border-primary bg-primary' : 'border-border/80 bg-transparent',
          )}
          aria-hidden
        >
          {checked ? <span className="size-1.5 rounded-full bg-primary-foreground" /> : null}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] font-medium leading-snug tracking-[-0.005em] text-foreground/95">{label}</div>
          {description ? (
            <div className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground/80">{description}</div>
          ) : null}
          {checked && children ? <div className="mt-2.5">{children}</div> : null}
        </div>
      </div>
    </div>
  )
}

function FiltersStep({ filtroModo, setFiltroModo, categoria, setCategoria, marca, setMarca, catList, marcaList, tagOptionIds, tagsByGroup, onEditTags, matchExact, setMatchExact, adjustMode, setAdjustMode, pct, setPct, sumAmount, setSumAmount, sumSign, setSumSign, fixedPrice, setFixedPrice, roundMode, setRoundMode }) {
  const tagCount = tagOptionIds.length
  return (
    <div className="grid grid-cols-1 gap-6 p-7 lg:grid-cols-2">
      {/* Columna 1: filtros */}
      <div className="space-y-7">
        <section>
          <SectionTitle
            icon={<TagIcon className="size-3.5" strokeWidth={1.75} />}
            title="Qué artículos ajustar"
            description="Por categoría y marca (como pensás los precios), o por etiquetas."
          />
          {/* Selector de modo */}
          <div className="mb-3 inline-flex overflow-hidden rounded-lg border border-border/70">
            <button type="button" onClick={() => setFiltroModo('catmarca')}
              className={cn('px-3 py-1.5 text-[12px] font-medium transition-colors', filtroModo === 'catmarca' ? 'bg-foreground text-background' : 'text-foreground/80 hover:bg-muted/40')}>
              Categoría y marca
            </button>
            <button type="button" onClick={() => setFiltroModo('tags')}
              className={cn('border-l border-border/60 px-3 py-1.5 text-[12px] font-medium transition-colors', filtroModo === 'tags' ? 'bg-foreground text-background' : 'text-foreground/80 hover:bg-muted/40')}>
              Etiquetas
            </button>
          </div>

          {filtroModo === 'catmarca' ? (
            <div className="space-y-3">
              <div>
                <div className="mb-1 text-[12px] font-medium text-foreground/90">Categoría</div>
                <select className={fieldClass} value={categoria} onChange={(e) => setCategoria(e.target.value)}>
                  <option value="">Elegí una categoría…</option>
                  {catList.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <div className="mb-1 text-[12px] font-medium text-foreground/90">Marca <span className="text-muted-foreground/70">(opcional)</span></div>
                <select className={fieldClass} value={marca} onChange={(e) => setMarca(e.target.value)}>
                  <option value="">Todas las marcas de esa categoría</option>
                  {marcaList.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
                <p className="mt-1.5 text-[11px] text-muted-foreground/75">Ej: «Pantalón» + «Levis» ajusta solo esos. Sin marca, ajusta toda la categoría.</p>
              </div>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={onEditTags}
                className={cn(
                  'group flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors',
                  tagCount > 0 ? 'border-primary/30 bg-primary/[0.04]' : 'border-dashed border-border/70 bg-transparent hover:border-border hover:bg-foreground/[0.03]',
                )}
              >
                <span className={cn('inline-flex size-7 shrink-0 items-center justify-center rounded-md text-foreground/70', tagCount > 0 ? 'bg-primary/15 text-primary' : 'bg-muted/40')}>
                  <TagIcon className="size-3.5" strokeWidth={1.75} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] font-medium text-foreground/95">
                    {tagCount === 0 ? 'Elegir tags…' : `${tagCount} tag(s) seleccionado(s)`}
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-muted-foreground/80">
                    {tagCount === 0 ? 'Ningún filtro aplicado' : Object.values(tagsByGroup).filter(Boolean).slice(0, 6).map(String).join(' · ') + (Object.values(tagsByGroup).filter(Boolean).length > 6 ? ' …' : '')}
                  </div>
                </div>
                <span className="shrink-0 text-[11px] text-muted-foreground/70 group-hover:text-foreground/80">
                  {tagCount === 0 ? 'Elegir' : 'Cambiar'}
                </span>
              </button>

              <div className="mt-3 space-y-2">
                <OptionRadio
                  checked={!matchExact}
                  onChange={() => setMatchExact(false)}
                  label="Contiene estos tags"
                  description="El artículo debe tener todos los tags seleccionados, pero puede tener otros además."
                />
                <OptionRadio
                  checked={matchExact}
                  onChange={() => setMatchExact(true)}
                  label="Coincide exactamente"
                  description="El artículo debe tener exactamente el mismo conjunto de tags, ni más ni menos."
                />
              </div>
            </>
          )}
        </section>
      </div>

      {/* Columna 2: ajuste */}
      <div className="space-y-7">
        <section>
          <SectionTitle
            icon={<SlidersHorizontal className="size-3.5" strokeWidth={1.75} />}
            title="Cómo ajustar el precio"
          />
          <div className="space-y-2">
            <OptionRadio
              checked={adjustMode === 'pct'}
              onChange={() => setAdjustMode('pct')}
              label="Porcentaje"
              description="Aumentar o disminuir el precio actual en un %."
            >
              <div className="flex items-center gap-1.5">
                <input
                  className={cn(fieldClass, 'w-24 tabular-nums')}
                  inputMode="decimal"
                  data-no-barcode="true"
                  value={pct}
                  onChange={(e) => setPct(e.target.value)}
                  onKeyDown={(e) => e.stopPropagation()}
                />
                <span className="text-[12px] text-muted-foreground/85">
                  <Percent className="inline size-3" strokeWidth={1.75} /> del precio actual
                </span>
              </div>
            </OptionRadio>

            <OptionRadio
              checked={adjustMode === 'sum'}
              onChange={() => setAdjustMode('sum')}
              label="Sumar o restar monto"
              description="Aplicar un delta fijo a cada precio."
            >
              <div className="flex items-center gap-1.5">
                <div className="inline-flex h-8 overflow-hidden rounded-md border border-border/70">
                  <button
                    type="button"
                    onClick={() => setSumSign(1)}
                    className={cn('inline-flex items-center gap-1 px-2 text-[12px] font-medium transition-colors', sumSign === 1 ? 'bg-foreground text-background' : 'text-foreground/80 hover:bg-muted/40')}
                  >
                    <Plus className="size-3" strokeWidth={2.25} /> Sumar
                  </button>
                  <button
                    type="button"
                    onClick={() => setSumSign(-1)}
                    className={cn('inline-flex items-center gap-1 border-l border-border/60 px-2 text-[12px] font-medium transition-colors', sumSign === -1 ? 'bg-foreground text-background' : 'text-foreground/80 hover:bg-muted/40')}
                  >
                    <Minus className="size-3" strokeWidth={2.25} /> Restar
                  </button>
                </div>
                <input
                  className={cn(fieldClass, 'w-28 tabular-nums')}
                  inputMode="decimal"
                  data-no-barcode="true"
                  value={sumAmount}
                  onChange={(e) => setSumAmount(e.target.value)}
                  onKeyDown={(e) => e.stopPropagation()}
                />
                <span className="text-[12px] text-muted-foreground/85">$</span>
              </div>
            </OptionRadio>

            <OptionRadio
              checked={adjustMode === 'fixed'}
              onChange={() => setAdjustMode('fixed')}
              label="Precio fijo"
              description="Sobrescribir el precio actual con un valor único."
            >
              <div className="flex items-center gap-1.5">
                <DollarSign className="size-3.5 text-muted-foreground/80" strokeWidth={1.75} />
                <input
                  className={cn(fieldClass, 'w-28 tabular-nums')}
                  inputMode="decimal"
                  data-no-barcode="true"
                  value={fixedPrice}
                  onChange={(e) => setFixedPrice(e.target.value)}
                  onKeyDown={(e) => e.stopPropagation()}
                />
              </div>
            </OptionRadio>
          </div>
        </section>

        <section>
          <SectionTitle
            icon={<ListChecks className="size-3.5" strokeWidth={1.75} />}
            title="Redondeo"
            description={adjustMode === 'fixed' ? 'No aplica con precio fijo.' : 'Cómo terminar cada precio calculado.'}
          />
          <div className="grid grid-cols-2 gap-1.5">
            {ROUND_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                disabled={adjustMode === 'fixed'}
                onClick={() => setRoundMode(o.value)}
                className={cn(
                  'inline-flex h-8 items-center justify-center rounded-md border px-2 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                  roundMode === o.value
                    ? 'border-primary/40 bg-primary/[0.06] text-foreground'
                    : 'border-border/60 text-foreground/80 hover:bg-foreground/[0.03]',
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

function PreviewStep({ preview, adjustMode, pct, sumAmount, sumSign, fixedPrice }) {
  if (!preview) return null
  const summary = (() => {
    if (adjustMode === 'pct') return `${pct}% sobre precio actual`
    if (adjustMode === 'sum') return `${sumSign === 1 ? '+' : '−'}$${sumAmount}`
    return `Precio fijo $${fixedPrice}`
  })()

  const delta = preview.rows.reduce((acc, r) => acc + (Number(r.precioNuevo) - Number(r.precioActual)), 0)

  return (
    <div className="p-7">
      {/* Stats */}
      <div className="mb-4 grid grid-cols-3 gap-2">
        <StatCard label="Artículos afectados" value={preview.total} />
        <StatCard label="Fórmula aplicada" value={summary} mono={false} />
        <StatCard
          label="Delta total (en muestra)"
          value={formatPrice(delta)}
          accent={delta >= 0 ? 'pos' : 'neg'}
        />
      </div>

      <div className="overflow-hidden rounded-lg border border-border/60">
        <table className="w-full border-separate border-spacing-0 text-[12.5px]">
          <thead>
            <tr>
              <th className="sticky top-0 border-b border-border/60 bg-muted/30 px-3 py-1.5 text-left text-[10.5px] font-medium uppercase tracking-[0.06em] text-muted-foreground/70">Código</th>
              <th className="sticky top-0 border-b border-border/60 bg-muted/30 px-3 py-1.5 text-left text-[10.5px] font-medium uppercase tracking-[0.06em] text-muted-foreground/70">Nombre</th>
              <th className="sticky top-0 border-b border-border/60 bg-muted/30 px-3 py-1.5 text-right text-[10.5px] font-medium uppercase tracking-[0.06em] text-muted-foreground/70">Actual</th>
              <th className="sticky top-0 border-b border-border/60 bg-muted/30 px-3 py-1.5 text-right text-[10.5px] font-medium uppercase tracking-[0.06em] text-muted-foreground/70">Nuevo</th>
              <th className="sticky top-0 border-b border-border/60 bg-muted/30 px-3 py-1.5 text-right text-[10.5px] font-medium uppercase tracking-[0.06em] text-muted-foreground/70">Δ</th>
            </tr>
          </thead>
          <tbody>
            {preview.rows.map((r) => {
              const d = Number(r.precioNuevo) - Number(r.precioActual)
              return (
                <tr key={r.id} className="hover:bg-foreground/[0.03]">
                  <td className="border-b border-border/40 px-3 py-1.5 font-mono text-[11px] text-muted-foreground">{r.codigo}</td>
                  <td className="border-b border-border/40 px-3 py-1.5 text-foreground/95"><span className="line-clamp-1">{r.descripcion || '—'}</span></td>
                  <td className="border-b border-border/40 px-3 py-1.5 text-right tabular-nums text-muted-foreground">{formatPrice(r.precioActual)}</td>
                  <td className="border-b border-border/40 px-3 py-1.5 text-right tabular-nums font-medium text-foreground">{formatPrice(r.precioNuevo)}</td>
                  <td className={cn('border-b border-border/40 px-3 py-1.5 text-right tabular-nums', d > 0 ? 'text-success' : d < 0 ? 'text-destructive' : 'text-muted-foreground')}>
                    {d > 0 ? '+' : ''}{formatPrice(d)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {preview.truncated ? (
        <p className="mt-2 text-[11.5px] text-muted-foreground/75">
          Se muestran los primeros {preview.rows.length} de {preview.total}. Al aplicar se actualizan todos.
        </p>
      ) : null}
    </div>
  )
}

function StatCard({ label, value, accent, mono = true }) {
  const accentClass = accent === 'pos' ? 'text-success' : accent === 'neg' ? 'text-destructive' : 'text-foreground'
  return (
    <div className="rounded-lg border border-border/60 bg-background p-3">
      <div className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-muted-foreground/70">{label}</div>
      <div className={cn('mt-1 text-[18px] font-semibold leading-tight tracking-[-0.01em]', mono && 'tabular-nums', accentClass)}>
        {value}
      </div>
    </div>
  )
}
