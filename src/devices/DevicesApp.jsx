import { useCallback, useEffect, useRef, useState } from 'react'
import Barcode from 'react-barcode'
import { toast } from 'sonner'
import { normalizeCode128Payload, randomNumericPayload } from '@/lib/barcodeProbe'
import { Button } from '@/components/ui/button'

const IMPRESORA_IMG = '/branding/impresora.png'
const LECTOR_IMG = '/branding/lector.png'
const selectCls = 'h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring'

function PrintersPanel({ settings, setSettings, printerNames, reload }) {
  const b = window.bazar
  const [diagBody, setDiagBody] = useState('')

  const persist = async (patch) => {
    if (!b?.settings) return
    const next = await b.settings.set(patch)
    setSettings({ devicePrinterLabelsName: next.devicePrinterLabelsName ?? '', devicePrinterTicketsName: next.devicePrinterTicketsName ?? '' })
  }

  const test = async (which) => {
    if (!b?.printers) return
    const name = which === 'labels' ? settings.devicePrinterLabelsName : settings.devicePrinterTicketsName
    const r = await b.printers.testPrint(name || undefined)
    if (r.ok) toast.success(r.message, { duration: 7000 }); else toast.error(r.message)
  }

  const diag = async () => {
    if (!b?.printers) return
    const body = await b.printers.diagnostic(); setDiagBody(body)
    try { await navigator.clipboard.writeText(body) } catch { /* ignore */ }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Impresoras</h2>
        <p className="text-sm text-muted-foreground mt-1">Asigná qué impresora usa cada función. Para prueba sin papel, elegí «Microsoft Print to PDF».</p>
      </div>

      <div className="rounded-lg border p-4 space-y-3">
        <h3 className="text-sm font-medium">Asignación</h3>
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <span className="text-sm w-20 shrink-0">Etiquetas</span>
            <select className={selectCls} value={settings.devicePrinterLabelsName} onChange={(e) => persist({ devicePrinterLabelsName: e.target.value })}>
              <option value="">Predeterminada</option>
              {printerNames.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm w-20 shrink-0">Tickets</span>
            <select className={selectCls} value={settings.devicePrinterTicketsName} onChange={(e) => persist({ devicePrinterTicketsName: e.target.value })}>
              <option value="">Predeterminada</option>
              {printerNames.map((n) => <option key={`t-${n}`} value={n}>{n}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="rounded-lg border p-4 space-y-3">
        <h3 className="text-sm font-medium">Acciones</h3>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => reload(true)}>Actualizar lista</Button>
          <Button size="sm" variant="outline" onClick={diag}>Diagnóstico…</Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => test('labels')}>Probar etiquetas</Button>
          <Button size="sm" onClick={() => test('tickets')}>Probar tickets</Button>
        </div>
        {diagBody && <pre className="text-xs bg-muted rounded-md p-3 overflow-auto max-h-48 whitespace-pre-wrap">{diagBody}</pre>}
      </div>
    </div>
  )
}

const SCAN_IDLE_MS = 280
const SCAN_AFTER_LEN_MS = 120

function ScannerPanel() {
  const scanRef = useRef(null)
  const scanValRef = useRef('')
  const idleRef = useRef(null)
  const [payloadRaw, setPayloadRaw] = useState('')
  const [expectedNorm, setExpectedNorm] = useState('')
  const [scanValue, setScanValue] = useState('')
  const [result, setResult] = useState(null)

  const refreshBarcode = useCallback((raw) => { const norm = normalizeCode128Payload(raw); setExpectedNorm(norm); setResult(null) }, [])

  const nuevoCodigo = useCallback(() => {
    if (idleRef.current) clearTimeout(idleRef.current); scanValRef.current = ''; setScanValue('')
    const raw = randomNumericPayload(12); setPayloadRaw(raw); refreshBarcode(raw)
    setTimeout(() => scanRef.current?.focus(), 0)
  }, [refreshBarcode])

  useEffect(() => { nuevoCodigo() }, [nuevoCodigo])

  const scheduleRefocus = useCallback(() => { setTimeout(() => scanRef.current?.focus(), 0) }, [])

  const confirmScan = useCallback((silentIfEmpty) => {
    if (idleRef.current) clearTimeout(idleRef.current)
    const gotRaw = scanValRef.current.trim().replace(/\r/g, '').replace(/\n/g, '')
    const got = normalizeCode128Payload(gotRaw)
    if (!got) { setResult(null); if (!silentIfEmpty) toast.message('Esperando lectura.', { duration: 4500 }); scheduleRefocus(); return }
    if (!expectedNorm) { setResult(null); toast.message('Generá un código primero.', { duration: 4000 }); scanValRef.current = ''; setScanValue(''); scheduleRefocus(); return }
    if (got === expectedNorm) { setResult('ok'); toast.success('Lectura correcta.', { duration: 4000 }) }
    else { setResult('bad'); toast.error('No coincide.', { duration: 5000 }) }
    scanValRef.current = ''; setScanValue(''); scheduleRefocus()
  }, [expectedNorm, scheduleRefocus])

  const onScanChange = (e) => {
    const v = e.target.value; scanValRef.current = v; setScanValue(v)
    if (idleRef.current) clearTimeout(idleRef.current)
    const raw = v.trim().replace(/\r/g, '').replace(/\n/g, '')
    const got = normalizeCode128Payload(raw); if (!got) return
    if (!expectedNorm) { idleRef.current = setTimeout(() => confirmScan(true), SCAN_IDLE_MS); return }
    if (got.length < expectedNorm.length) return
    idleRef.current = setTimeout(() => confirmScan(true), SCAN_AFTER_LEN_MS)
  }

  const codeForBarcode = normalizeCode128Payload(payloadRaw)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Lector en caja</h2>
        <p className="text-sm text-muted-foreground mt-1">Generamos un código al azar. Escaneá las barras con el foco en el recuadro.</p>
      </div>

      <div className="rounded-lg border p-4 space-y-4">
        <h3 className="text-sm font-medium">Probar lector con código en pantalla</h3>
        <p className="text-xs text-muted-foreground">Code 128 en pantalla. Al mandar Enter o dejar de escribir, se compara solo.</p>

        <div className="flex items-center gap-3">
          <div className="rounded-lg border bg-card p-2">
            {codeForBarcode ? (
              <Barcode value={codeForBarcode} format="CODE128" displayValue={false} width={2} height={72} margin={8} />
            ) : (
              <span className="text-xs text-muted-foreground">Código vacío</span>
            )}
          </div>
          {result === 'ok' && <div className="size-10 rounded-full bg-success/10 text-success flex items-center justify-center text-xl font-bold">✓</div>}
          {result === 'bad' && <div className="size-10 rounded-full bg-destructive/10 text-destructive flex items-center justify-center text-xl font-bold">✗</div>}
        </div>

        <div className="space-y-1">
          <span className="text-[11px] text-muted-foreground">Código generado:</span>
          <span className="block font-mono text-sm font-medium">{expectedNorm || '—'}</span>
        </div>

        <Button onClick={nuevoCodigo}>Generar otro código de prueba</Button>

        <hr className="border-border" />
        <p className="text-xs text-muted-foreground">Al abrir esta pestaña el foco va al recuadro: escaneá las barras de arriba.</p>

        <input
          ref={scanRef}
          type="password"
          className="h-10 w-full rounded-md border-2 border-dashed border-primary/30 bg-muted/30 px-3 text-center text-sm outline-none focus:border-primary focus:ring-1 focus:ring-ring"
          placeholder="Listo para escanear…"
          value={scanValue}
          onChange={onScanChange}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); confirmScan(true) } }}
          autoComplete="off"
        />
      </div>
    </div>
  )
}

export function DevicesApp() {
  const [panel, setPanel] = useState('printers')
  const [settings, setSettings] = useState({ devicePrinterLabelsName: '', devicePrinterTicketsName: '' })
  const [printerNames, setPrinterNames] = useState([])

  const reload = useCallback(async (notify) => {
    const b = window.bazar; if (!b?.settings || !b?.printers) return
    const s = await b.settings.get()
    setSettings({ devicePrinterLabelsName: s.devicePrinterLabelsName ?? '', devicePrinterTicketsName: s.devicePrinterTicketsName ?? '' })
    setPrinterNames(await b.printers.list())
    if (notify) toast.message('Lista actualizada.', { duration: 3500 })
  }, [])

  useEffect(() => { reload(false) }, [reload])

  if (!window.bazar?.settings) return <p className="flex items-center justify-center h-full text-sm text-muted-foreground">Esta ventana requiere Electron.</p>

  const navBtn = (id, img, label) => (
    <button
      type="button"
      className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm transition-colors ${panel === id ? 'bg-accent font-medium' : 'text-muted-foreground hover:bg-accent/50'}`}
      onClick={() => setPanel(id)}
    >
      <img src={img} alt="" className="size-5 object-contain" />
      <span>{label}</span>
    </button>
  )

  return (
    <div className="flex h-full">
      <aside className="w-48 shrink-0 border-r p-3 space-y-1">
        {navBtn('printers', IMPRESORA_IMG, 'Impresoras')}
        {navBtn('scanner', LECTOR_IMG, 'Lector en caja')}
      </aside>
      <div className="flex-1 overflow-auto p-6">
        {panel === 'printers' ? (
          <PrintersPanel settings={settings} setSettings={setSettings} printerNames={printerNames} reload={() => reload(true)} />
        ) : (
          <ScannerPanel />
        )}
      </div>
    </div>
  )
}
