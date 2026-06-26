import { formatPrice } from '@/lib/format'

/* ──────────────────────────────────────────────────────────────────────
 * Comprobante de VALE (crédito al portador de una devolución sin cuenta).
 *
 * `imprimirVale` abre el diálogo de impresión del sistema usando un iframe
 * oculto: la dueña elige una impresora o "Guardar como PDF" sin que tengamos
 * que cablear nada por IPC. Funciona igual en Electron y en el navegador.
 * ────────────────────────────────────────────────────────────────────── */

function fechaLarga(iso) {
  if (!iso) return ''
  const d = new Date(String(iso).includes('T') ? iso : `${iso}Z`)
  if (Number.isNaN(d.getTime())) return String(iso)
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })
}

function escapar(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ))
}

/**
 * @param {{ codigo: string, monto?: number, disponible?: number, nota?: string, createdAt?: string }} vale
 * @param {{ negocio?: string }} [opts]
 */
export function imprimirVale(vale, opts = {}) {
  const codigo = String(vale?.codigo || '').toUpperCase()
  if (!codigo) return
  const negocio = opts.negocio || 'My Little Bazar'
  const monto = Number(vale?.disponible != null ? vale.disponible : vale?.monto) || 0
  const fecha = fechaLarga(vale?.createdAt) || fechaLarga(new Date().toISOString())
  const nota = String(vale?.nota || '')

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8" />
<title>Vale ${escapar(codigo)}</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #1f1330;
    font-family: -apple-system, "Segoe UI", Roboto, system-ui, sans-serif; }
  .slip { width: 300px; margin: 0 auto; padding: 18px 16px 22px; text-align: center; }
  .eyebrow { font-size: 10px; letter-spacing: 2px; text-transform: uppercase; color: #b03a78; font-weight: 700; }
  .negocio { font-size: 15px; font-weight: 800; margin: 2px 0 12px; }
  .titulo { font-size: 13px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: #6b5b75; }
  .code { margin: 10px 0; padding: 12px 8px; border: 2px dashed #d36aa3; border-radius: 12px;
    font-family: "Courier New", monospace; font-size: 30px; font-weight: 800; letter-spacing: 3px; color: #1f1330; }
  .monto { font-size: 34px; font-weight: 800; color: #b03a78; margin: 6px 0 2px; }
  .monto small { display: block; font-size: 11px; font-weight: 600; color: #6b5b75; letter-spacing: 1px; text-transform: uppercase; }
  .nota { font-size: 12px; color: #4b3f55; margin: 12px 4px 0; }
  .pie { margin-top: 14px; padding-top: 12px; border-top: 1px solid #eadff0; font-size: 11px; color: #8a7d93; line-height: 1.5; }
  @media print { @page { margin: 8mm; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head>
<body>
  <div class="slip">
    <div class="eyebrow">Comprobante</div>
    <div class="negocio">${escapar(negocio)}</div>
    <div class="titulo">Vale de compra</div>
    <div class="code">${escapar(codigo)}</div>
    <div class="monto">${escapar(formatPrice(monto))}<small>Saldo disponible</small></div>
    ${nota ? `<div class="nota">${escapar(nota)}</div>` : ''}
    <div class="pie">
      Válido para tu próxima compra · No vence · Al portador<br />
      Emitido el ${escapar(fecha)}
    </div>
  </div>
</body></html>`

  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  Object.assign(iframe.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' })
  document.body.appendChild(iframe)
  const win = iframe.contentWindow
  if (!win) { iframe.remove(); return }
  win.document.open()
  win.document.write(html)
  win.document.close()
  const lanzar = () => {
    try { win.focus(); win.print() } catch { /* el usuario canceló o no hay impresora */ }
    setTimeout(() => { try { iframe.remove() } catch { /* noop */ } }, 1500)
  }
  if (win.document.readyState === 'complete') setTimeout(lanzar, 60)
  else iframe.onload = () => setTimeout(lanzar, 60)
}
