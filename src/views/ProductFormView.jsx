import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Loader2, RefreshCw, Printer, Package, Tag, ImagePlus, X } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { ipcErrorMessage } from '@/lib/ipcErrorMessage'
import { formatPrice } from '@/lib/format'
import { detectMarcaCategoria } from '@/lib/altaDetect'
import { emojiDeCategoria, esRutaImagen, rutaAFileUrl } from '@/lib/categoriaEmoji'
import { suggestRefPrice } from '@/lib/priceHint'
import { buildAltaSuggestions } from '@/lib/altaSuggest'

/**
 * Alta/edición. Modelo de la dueña: el precio lo define la COMBINACIÓN
 * Categoría + Marca (un "Pantalón Levis" no vale lo mismo que uno sin marca).
 *
 * Un solo campo "¿Qué es?" donde escribís y, callado: extrae precio/cantidad,
 * y rutea lo que reconoce a Categoría y Marca (que también podés escribir a mano).
 * El aviso de precio sugiere por esa combinación, desde datos reales.
 */
export function ProductFormView({ productId, initialCodigo, cloneFromId, onClose, onSaved }) {
  const api = window.bazar?.db
  const isEdit = productId != null

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [smartInput, setSmartInput] = useState('')
  const [nombre, setNombre] = useState('')
  const [categoria, setCategoria] = useState('')
  const [marca, setMarca] = useState('')
  const [precioInput, setPrecioInput] = useState('')
  const [cantidad, setCantidad] = useState('1')
  const [codigo, setCodigo] = useState('')
  const [imagenPath, setImagenPath] = useState('')
  const [imprimir, setImprimir] = useState(false)
  const [catMeta, setCatMeta] = useState({}) // iconos/imágenes de categoría configurados (Ajustes → Categorías)

  const [invRows, setInvRows] = useState([])
  const [groups, setGroups] = useState([])
  const [recentNames, setRecentNames] = useState([])

  const [showSug, setShowSug] = useState(false)
  const [activeSug, setActiveSug] = useState(0)

  const smartRef = useRef(null)
  // Marcas de "tocado a mano" → el auto-relleno no pisa lo que el usuario editó.
  const catTouched = useRef(false)
  const marcaTouched = useRef(false)
  const precioTouched = useRef(false)
  const norm = (s) => String(s ?? '').trim().toLowerCase()

  /* Carga inicial. */
  useEffect(() => {
    let alive = true
    async function run() {
      setLoading(true)
      try {
        const [gs, inv] = await Promise.all([
          api?.getCuadernoTagGroups?.() ?? [],
          api?.getInventoryList?.({ estadoIndex: 0, vistaIndex: 0, listTab: 'main' }) ?? [],
        ])
        if (!alive) return
        setGroups(Array.isArray(gs) ? gs : [])
        const rows = Array.isArray(inv) ? inv : []
        setInvRows(rows)
        setRecentNames([...new Set(rows.map((r) => String(r.descripcion || '').trim()).filter(Boolean))])

        if (isEdit) {
          const prod = await api?.getProductById?.(productId)
          if (!alive) return
          if (!prod) { toast.error('No encontré esa prenda. Quizá fue eliminada.'); onClose?.(); return }
          const desc = String(prod.descripcion || '')
          setSmartInput(desc); setNombre(desc)
          setCategoria(String(prod.categoria || ''))
          setMarca(String(prod.marca || ''))
          setPrecioInput(prod.precio != null ? String(prod.precio) : '')
          setCantidad(String(Math.max(1, Number(prod.stock) || 1)))
          setCodigo(String(prod.codigo || ''))
          setImagenPath(String(prod.imagen_path || ''))
          catTouched.current = true; marcaTouched.current = true; precioTouched.current = true
        } else if (cloneFromId) {
          // Clonar: copiar datos de la prenda origen, pero con CÓDIGO NUEVO.
          const src = await api?.getProductById?.(cloneFromId)
          const next = await api?.nextCodigoMsr?.()
          if (!alive) return
          if (src) {
            const desc = String(src.descripcion || '')
            setSmartInput(desc); setNombre(desc)
            setCategoria(String(src.categoria || ''))
            setMarca(String(src.marca || ''))
            setPrecioInput(src.precio != null ? String(src.precio) : '')
            setImagenPath(String(src.imagen_path || ''))
            catTouched.current = true; marcaTouched.current = true; precioTouched.current = true
          }
          setCodigo(next ? String(next) : '')
        } else if (initialCodigo) {
          setCodigo(String(initialCodigo))
        } else {
          const next = await api?.nextCodigoMsr?.()
          if (alive && next) setCodigo(String(next))
        }
      } catch (err) {
        if (alive) toast.error(ipcErrorMessage(err) || 'No se pudo cargar el formulario.')
      } finally {
        if (alive) setLoading(false)
      }
    }
    void run()
    return () => { alive = false }
  }, [api, isEdit, productId, initialCodigo, cloneFromId, onClose])

  useEffect(() => {
    if (!loading && !isEdit) {
      const t = setTimeout(() => smartRef.current?.focus?.(), 60)
      return () => clearTimeout(t)
    }
  }, [loading, isEdit])

  /* Iconos/imágenes de categoría que la dueña configuró, para mostrar el correcto
   * en el preview (antes mostraba siempre el emoji por defecto). */
  useEffect(() => {
    let alive = true
    void window.bazar?.settings?.get?.().then((s) => {
      if (alive && s?.categoriasMeta && typeof s.categoriasMeta === 'object') setCatMeta(s.categoriasMeta)
    }).catch(() => {})
    return () => { alive = false }
  }, [])

  const categorias = useMemo(
    () => [...new Set(invRows.map((r) => String(r.categoria || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')),
    [invRows],
  )
  const marcas = useMemo(
    () => [...new Set(invRows.map((r) => String(r.marca || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')),
    [invRows],
  )

  /* ---- Parser del campo único: precio/cantidad + detecta categoría/marca ---- */
  const parseSmart = useCallback((val) => {
    setSmartInput(val)
    const trimmed = val.trim()
    if (!trimmed) { setNombre(''); return }
    let remaining = trimmed

    // precio (+ cantidad opcional) al final: "800", "$800", "800 5"
    const m = remaining.match(/\s+(?:\$)?(\d+(?:\.\d+)?)(?:\s*(?:pesos|mxn))?(?:\s+(\d+))?\s*$/i)
    if (m) {
      if (!precioTouched.current) setPrecioInput(m[1])
      if (m[2]) setCantidad(m[2])
      remaining = remaining.substring(0, m.index).trim()
    }

    // Detección por FRASE (marca/categoría completas, incluso de varias palabras).
    // ACTUALIZA mientras escribís (no se queda pegado al primer valor); solo
    // respeta lo que editaste a mano en los campos.
    const det = detectMarcaCategoria(remaining, { categorias, marcas })
    if (det.categoria && !catTouched.current) setCategoria(det.categoria)
    if (det.marca && !marcaTouched.current) setMarca(det.marca)

    setNombre(remaining)
  }, [categorias, marcas])

  /* ---- Autocompletado del campo único ---- */
  const suggestions = useMemo(() => {
    if (isEdit) return []
    return buildAltaSuggestions({ smartInput, recentNames, groups })
  }, [isEdit, smartInput, recentNames, groups])

  useEffect(() => { setActiveSug(0) }, [smartInput])

  const applySuggestion = useCallback((item) => {
    if (!item) return
    if (item.type === 'name') {
      setSmartInput(item.value); setNombre(item.value)
      const match = invRows.find((r) => norm(r.descripcion) === norm(item.value))
      if (match) {
        if (!catTouched.current && match.categoria) setCategoria(String(match.categoria))
        if (!marcaTouched.current && match.marca) setMarca(String(match.marca))
        if (!precioTouched.current && match.precio != null) setPrecioInput(String(match.precio))
      }
    } else {
      // Tag/seed elegido: lo metemos al texto y el parser detecta marca/categoría.
      const words = smartInput.split(/\s+/); words[words.length - 1] = item.value
      parseSmart(words.join(' ') + ' ')
    }
    setShowSug(false)
    smartRef.current?.focus?.()
  }, [smartInput, parseSmart, invRows])

  const onSmartKeyDown = useCallback((e) => {
    if (!showSug || suggestions.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveSug((i) => (i + 1) % suggestions.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveSug((i) => (i - 1 + suggestions.length) % suggestions.length) }
    else if (e.key === 'Enter') { e.preventDefault(); applySuggestion(suggestions[activeSug]) }
    else if (e.key === 'Escape') { setShowSug(false) }
  }, [showSug, suggestions, activeSug, applySuggestion])

  /* ---- Precio de referencia por (categoría + marca) ---- */
  const precioRef = useMemo(
    () => suggestRefPrice({ rows: invRows, categoria, marca, excludeId: productId }),
    [invRows, categoria, marca, productId],
  )

  // Autollenado del precio: si conocés esa combinación y no tocaste el precio,
  // se llena solo (y se actualiza si cambiás categoría/marca). Editable siempre.
  useEffect(() => {
    if (precioTouched.current) return
    if (precioRef) setPrecioInput(String(precioRef.precio))
  }, [precioRef])

  const regenCodigo = useCallback(async () => {
    try { const next = await api?.nextCodigoMsr?.(); if (next) setCodigo(String(next)) } catch { /* noop */ }
  }, [api])

  const doPrint = useCallback(async (cod, nom, prc, pid, copies) => {
    try {
      const res = await window.bazar?.printers?.printLabel?.({ codigo: cod, nombre: nom, precio: prc, productoId: pid, copies })
      if (res && res.ok === false) toast.error(res.message || 'No se pudo imprimir.')
      else if (res) toast.success(res.message || 'Etiqueta enviada.')
    } catch (err) { toast.error(ipcErrorMessage(err) || 'No se pudo imprimir.') }
  }, [])

  const handleSave = useCallback(async (seguir = false) => {
    const desc = (nombre.trim() || [categoria.trim(), marca.trim()].filter(Boolean).join(' ')).trim()
    if (!desc && !categoria.trim()) { toast.error('Escribí qué es o la categoría.'); smartRef.current?.focus?.(); return }
    const precioNum = Number(precioInput)
    if (!Number.isFinite(precioNum) || precioNum < 0) { toast.error('Poné un precio válido.'); return }
    const cantNum = Math.max(1, Math.floor(Number(cantidad) || 1))

    setSaving(true)
    try {
      const payload = {
        codigo: codigo.trim(),
        descripcion: desc || categoria.trim(),
        precio: precioNum,
        pieza_unica: cantNum === 1 ? 1 : 0,
        stock: cantNum,
        categoria: categoria.trim() || null,
        marca: marca.trim() || null,
        imagen_path: imagenPath.trim() || null,
        estado: 'disponible',
        skipTagValidation: true,
        skipRuleLearning: true,
      }
      let savedId = productId
      if (isEdit) { await api.updateProduct({ id: productId, ...payload }); toast.success('Prenda actualizada.') }
      else { const res = await api.addProduct(payload); savedId = res?.id ?? null; toast.success('Prenda guardada.') }
      if (imprimir) await doPrint(payload.codigo, payload.descripcion, payload.precio, savedId, cantNum)

      /* "Guardar y seguir" (alta en cadena): para registrar MUCHAS prendas sin
       * reabrir el formulario. Conserva categoría/marca/precio como base (lo común
       * es dar de alta varias del mismo tipo), limpia lo individual y genera el
       * siguiente código. La señora puede escanear la etiqueta que ya trae cada una. */
      if (seguir && !isEdit) {
        setSmartInput(''); setNombre(''); setImagenPath(''); setCantidad('1')
        setPrecioInput(''); precioTouched.current = false
        catTouched.current = false; marcaTouched.current = false
        try { const next = await api?.nextCodigoMsr?.(); setCodigo(next ? String(next) : '') } catch { /* noop */ }
        setInvRows((prev) => (savedId ? [{ id: savedId, descripcion: payload.descripcion, categoria: payload.categoria, marca: payload.marca, precio: payload.precio }, ...prev] : prev))
        onSaved?.({ id: savedId, keepOpen: true })
        setTimeout(() => smartRef.current?.focus?.(), 40)
      } else {
        onSaved?.({ id: savedId })
      }
    } catch (err) { toast.error(ipcErrorMessage(err) || 'No se pudo guardar.') } finally { setSaving(false) }
  }, [nombre, categoria, marca, precioInput, cantidad, codigo, imagenPath, isEdit, productId, api, onSaved, doPrint, imprimir])

  const elegirImagen = useCallback(async () => {
    const pick = window.bazar?.productImage?.pick
    if (!pick) { toast.error('Agregar imagen solo en la app de escritorio.'); return }
    try {
      const r = await pick()
      if (r?.cancelled || !r?.path) return
      setImagenPath(String(r.path))
    } catch (err) { toast.error(ipcErrorMessage(err) || 'No se pudo cargar la imagen.') }
  }, [])

  const cantNumLabel = Math.max(1, Math.floor(Number(cantidad) || 1))

  return (
    <div data-no-barcode="true" className="flex h-full min-h-0 flex-col bg-[var(--mlb-bg-app)]">
      <header className="shrink-0 border-b border-[var(--mlb-border)] bg-[var(--mlb-bg-panel)] px-5 py-2.5 flex items-center justify-between gap-3">
        <button type="button" onClick={() => onClose?.()} className="mlb-focus-ring inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[12.5px] text-[var(--mlb-text-secondary)] transition-colors hover:bg-[var(--mlb-bg-hover)] hover:text-[var(--mlb-text-primary)]">
          <ArrowLeft className="size-4" /> Inventario
        </button>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => onClose?.()} className="mlb-focus-ring inline-flex h-8 items-center rounded-md px-3 text-[12.5px] text-[var(--mlb-text-secondary)] transition-colors hover:bg-[var(--mlb-bg-hover)]">Cancelar</button>
          {!isEdit && (
            <button type="button" onClick={() => void handleSave(true)} disabled={saving || loading} title="Guardar esta y dejar el formulario listo para la siguiente" className="mlb-focus-ring inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-[var(--mlb-accent)] px-3 text-[12.5px] font-semibold text-[var(--mlb-accent)] transition-colors hover:bg-[var(--mlb-accent-soft)] disabled:opacity-50">
              Guardar y seguir
            </button>
          )}
          <button type="button" onClick={() => void handleSave(false)} disabled={saving || loading} className="mlb-focus-ring inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-[var(--mlb-accent)] px-4 text-[12.5px] font-semibold text-white transition-colors hover:bg-[var(--mlb-accent-hover)] disabled:opacity-50">
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {isEdit ? 'Guardar cambios' : 'Guardar prenda'}
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="max-w-2xl pl-12 md:pl-20 pr-8 py-7">
          <h1 className="text-[20px] font-semibold tracking-[-0.015em] text-[var(--mlb-text-primary)]">
            {isEdit ? 'Editar prenda' : cloneFromId ? 'Clonar artículo' : 'Nuevo artículo'}
          </h1>
          <p className="mt-1 text-[12.5px] text-[var(--mlb-text-muted)]">
            {isEdit
              ? 'Cambiá lo que necesites y guardá.'
              : cloneFromId
                ? 'Copia de una prenda existente con un código NUEVO. Ajustá lo que cambie e imprimí su etiqueta.'
                : 'Escribí qué es. La categoría y la marca se acomodan solas; lo que falte, lo completás abajo.'}
          </p>

          {loading ? (
            <div className="mt-10 flex items-center gap-2 text-[13px] text-[var(--mlb-text-muted)]">
              <Loader2 className="size-4 animate-spin" /> Cargando…
            </div>
          ) : (
            <div className="mt-6 space-y-5">
              <Card className="p-6">
                <Field label="¿Qué es?" hint="Ej: pantalón levis 800 5 — lo último es precio y cantidad" required>
                  <div className="relative">
                    <input
                      ref={smartRef}
                      type="text"
                      value={smartInput}
                      onChange={(e) => {
                        const v = e.target.value
                        if (isEdit) { setSmartInput(v); setNombre(v) }
                        else { parseSmart(v); setShowSug(true) }
                      }}
                      onFocus={() => { if (!isEdit) setShowSug(true) }}
                      onBlur={() => setTimeout(() => setShowSug(false), 120)}
                      onKeyDown={onSmartKeyDown}
                      placeholder="ej. Pantalón"
                      className={inputCls}
                      autoComplete="off"
                    />
                    {showSug && suggestions.length > 0 && (
                      <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-xl border border-[var(--mlb-border)] bg-[var(--mlb-bg-panel)] py-1 shadow-[var(--shadow-pop)]">
                        {suggestions.map((item, idx) => (
                          <button
                            key={`${item.type}-${item.value}-${idx}`}
                            type="button"
                            onMouseDown={(e) => { e.preventDefault(); applySuggestion(item) }}
                            className={cn('flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[12.5px] transition-colors',
                              idx === activeSug ? 'bg-[var(--mlb-bg-active)] text-[var(--mlb-text-primary)]' : 'text-[var(--mlb-text-secondary)] hover:bg-[var(--mlb-bg-hover)]')}
                          >
                            <span className="flex items-center gap-2 truncate">
                              {item.type === 'name' ? <Package className="size-3.5 shrink-0 text-[var(--mlb-text-muted)]" /> : <Tag className="size-3.5 shrink-0 text-[var(--mlb-text-muted)]" />}
                              <span className="truncate">{item.value}</span>
                            </span>
                            {item.type === 'tag' && <span className="shrink-0 text-[10px] uppercase tracking-wide text-[var(--mlb-text-muted)]">{item.group}</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </Field>
              </Card>

              <Card className="space-y-5 p-6">
                <Field label="Categoría" hint="Pantalón, blusa, perfumería… como la agrupes vos.">
                  <input type="text" value={categoria}
                    onChange={(e) => { catTouched.current = true; setCategoria(e.target.value) }}
                    placeholder="ej. Pantalón" list="categorias-existentes" className={cn(inputCls, 'w-64')} autoComplete="off" />
                  <datalist id="categorias-existentes">{categorias.map((c) => <option key={c} value={c} />)}</datalist>
                </Field>

                <Field label="Marca" hint="Levis, Zara, sin marca… Junto con la categoría definen el precio.">
                  <input type="text" value={marca}
                    onChange={(e) => { marcaTouched.current = true; setMarca(e.target.value) }}
                    placeholder="ej. Levis" list="marcas-existentes" className={cn(inputCls, 'w-64')} autoComplete="off" />
                  <datalist id="marcas-existentes">{marcas.map((m) => <option key={m} value={m} />)}</datalist>
                </Field>

                <Field label="Imagen" hint="Opcional. Si le ponés foto, aparece en el punto de venta; si no, el emoji de su categoría.">
                  <div className="flex items-center gap-3">
                    <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-xl border border-[var(--mlb-border-strong)] bg-[var(--mlb-bg-input)] text-[30px] leading-none">
                      {esRutaImagen(imagenPath)
                        ? <img src={rutaAFileUrl(imagenPath)} alt="" className="size-full object-cover" />
                        : esRutaImagen(emojiDeCategoria(categoria, catMeta))
                          ? <img src={rutaAFileUrl(emojiDeCategoria(categoria, catMeta))} alt="" className="size-full object-cover" />
                          : <span aria-hidden>{emojiDeCategoria(categoria, catMeta)}</span>}
                    </div>
                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={() => void elegirImagen()}
                        className="mlb-focus-ring inline-flex items-center gap-2 rounded-lg border border-[var(--mlb-border-strong)] bg-[var(--mlb-bg-input)] px-3 py-2 text-[13px] font-medium text-[var(--mlb-text-primary)] transition-colors hover:bg-[var(--mlb-bg-hover)]"
                      >
                        <ImagePlus className="size-4" />{esRutaImagen(imagenPath) ? 'Cambiar foto' : 'Agregar foto'}
                      </button>
                      {esRutaImagen(imagenPath) ? (
                        <button
                          type="button"
                          onClick={() => setImagenPath('')}
                          className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--mlb-text-muted)] transition-colors hover:text-[var(--mlb-text-primary)]"
                        >
                          <X className="size-3.5" />Quitar foto (usar emoji)
                        </button>
                      ) : null}
                    </div>
                  </div>
                </Field>

                <Field label="Precio" required>
                  <div className="flex items-center gap-3">
                    <div className="relative w-40">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[14px] text-[var(--mlb-text-muted)]">$</span>
                      <input type="text" inputMode="decimal" value={precioInput}
                        onChange={(e) => { precioTouched.current = true; setPrecioInput(e.target.value.replace(/[^\d.]/g, '')) }}
                        placeholder="0" className={cn(inputCls, 'pl-7 font-semibold tabular-nums')} />
                    </div>
                    {precioRef && precioInput.trim() && Number(precioInput) === Number(precioRef.precio) && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-[var(--mlb-bg-active)] px-2 py-0.5 text-[11px] font-medium text-[var(--mlb-text-secondary)]">
                        Precio automático · de tu lista
                      </span>
                    )}
                    {precioRef && precioInput.trim() && Number(precioInput) !== Number(precioRef.precio) && (
                      <button
                        type="button"
                        onClick={() => { precioTouched.current = true; setPrecioInput(String(precioRef.precio)) }}
                        className="text-left text-[11.5px] text-[var(--mlb-text-muted)] transition-colors hover:text-[var(--mlb-text-primary)]"
                        title="Usar el precio que sueles poner a esta combinación"
                      >
                        tu lista: <span className="font-semibold tabular-nums text-[var(--mlb-text-secondary)]">{formatPrice(precioRef.precio)}</span> · usar
                      </button>
                    )}
                  </div>
                </Field>

                <Field label="Cantidad" hint="¿Cuántas tenés?">
                  <input type="text" inputMode="numeric" value={cantidad}
                    onChange={(e) => setCantidad(e.target.value.replace(/[^\d]/g, ''))}
                    onBlur={() => { if (!cantidad || Number(cantidad) < 1) setCantidad('1') }}
                    placeholder="1" className={cn(inputCls, 'w-24 text-center font-semibold tabular-nums')} />
                </Field>
              </Card>

              <Card className="space-y-5 p-6">
                <Field label="Código de etiqueta" hint="Se genera solo. ¿La prenda ya trae su propia etiqueta (perfume, labial…)? Tocá acá y escaneala (o escribí ese código).">
                  <div className="flex items-center gap-2">
                    <input type="text" value={codigo} onChange={(e) => setCodigo(e.target.value)} onFocus={(e) => e.target.select()} className={cn(inputCls, 'w-52 font-mono text-[13px]')} autoComplete="off" />
                    {!isEdit && (
                      <button type="button" onClick={() => void regenCodigo()} className="mlb-focus-ring inline-flex size-11 items-center justify-center rounded-xl border border-[var(--mlb-border-strong)] bg-[var(--mlb-bg-input)] text-[var(--mlb-text-muted)] transition-colors hover:text-[var(--mlb-text-primary)]" title="Generar otro código">
                        <RefreshCw className="size-4" />
                      </button>
                    )}
                  </div>
                </Field>

                <div className="flex items-center justify-between rounded-xl border border-[var(--mlb-border)] bg-[var(--mlb-bg-hover)] p-4">
                  <div className="flex items-center gap-3">
                    <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--mlb-bg-active)] text-[var(--mlb-text-secondary)]"><Printer className="size-4" /></div>
                    <div>
                      <span className="block text-[14px] font-medium text-[var(--mlb-text-primary)]">Imprimir etiquetas al guardar</span>
                      <span className="text-[12px] text-[var(--mlb-text-secondary)]">{cantNumLabel} {cantNumLabel === 1 ? 'etiqueta' : 'etiquetas'} iguales</span>
                    </div>
                  </div>
                  <label className="relative flex cursor-pointer items-center">
                    <input type="checkbox" className="peer sr-only" checked={imprimir} onChange={(e) => setImprimir(e.target.checked)} />
                    <div className="h-6 w-11 rounded-full bg-[var(--mlb-border-strong)] transition-colors after:absolute after:left-[2px] after:top-[2px] after:size-5 after:rounded-full after:bg-white after:shadow-sm after:transition-all after:content-[''] peer-checked:bg-[var(--mlb-accent)] peer-checked:after:translate-x-full" />
                  </label>
                </div>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const inputCls =
  'h-11 w-full rounded-xl border border-[var(--mlb-border-strong)] bg-[var(--mlb-bg-input)] px-3.5 text-[14px] text-[var(--mlb-text-primary)] outline-none transition-colors placeholder:text-[var(--mlb-text-muted)] focus:border-[var(--mlb-border-focus)]'

function Card({ className, children }) {
  return <div className={cn('rounded-2xl border border-[var(--mlb-border)] bg-[var(--mlb-bg-panel)] shadow-[var(--shadow-xs)]', className)}>{children}</div>
}

function Field({ label, hint, required, children }) {
  return (
    <div>
      <label className="mb-1.5 flex items-baseline gap-2">
        <span className="text-[13px] font-medium text-[var(--mlb-text-primary)]">{label}</span>
        {required && <span className="text-[11px] text-[var(--mlb-text-muted)]">obligatorio</span>}
      </label>
      {hint && <p className="mb-2 text-[12px] text-[var(--mlb-text-muted)]">{hint}</p>}
      {children}
    </div>
  )
}
