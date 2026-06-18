import { buildReportePdfHtml } from '../src/lib/reportePdf.js'

let passed = 0
function assert(cond, label) {
  if (!cond) { console.error(`FAIL: ${label}`); process.exit(1) }
  passed += 1
  console.log(`  ok  ${label}`)
}

const html = buildReportePdfHtml({
  bazarNombre: 'Bazar Monserrat',
  titulo: 'Ventas',
  descripcion: 'Tickets emitidos dentro del periodo seleccionado.',
  periodoTexto: '01 jun 2026 - 17 jun 2026',
  criterios: [
    { label: 'Periodo', value: '01 jun 2026 - 17 jun 2026' },
    { label: 'Metodo', value: 'Todos' },
  ],
  metricas: [
    { label: 'Tickets', value: '7' },
    { label: 'Cobrado neto', value: '$2,054.50' },
  ],
  columnas: [
    { key: 'fecha', label: 'Fecha' },
    { key: 'cliente', label: 'Cliente' },
    { key: 'total', label: 'Total', align: 'right' },
  ],
  filas: [
    { fecha: '17 jun 2026', cliente: 'Rosa <b>', total: '$350.00' },
    { fecha: '16 jun 2026', cliente: 'Luz', total: '$320.00' },
  ],
  nota: 'Prueba de nota.',
})

assert(typeof html === 'string' && html.length > 500, 'devuelve HTML largo')
assert(html.startsWith('<!doctype html>'), 'es un documento HTML completo')
assert(html.includes('Ventas'), 'tiene el titulo del reporte')
assert(html.includes('01 jun 2026 - 17 jun 2026'), 'incluye el periodo')
assert(html.includes('Tickets'), 'incluye metricas')
assert(html.includes('Cobrado neto'), 'incluye metricas monetarias')
assert(html.includes('Cliente'), 'incluye encabezados de tabla')
assert(html.includes('$350.00'), 'incluye valores de filas')
assert(html.includes('Rosa &lt;b&gt;') && !html.includes('Rosa <b>'), 'escapa HTML de celdas')
assert(html.includes('print-color-adjust: exact'), 'fuerza imprimir colores de fondo')
assert(html.includes('Prueba de nota.'), 'incluye nota de criterio')
assert(html.includes('@page { size: Letter'), 'usa hoja Carta imprimible')
assert(html.includes('Reporte administrativo interno'), 'usa encabezado administrativo formal')
assert(html.includes('Folio interno'), 'incluye folio interno')
assert(html.includes('MXN - Pesos mexicanos'), 'declara moneda MXN')
assert(html.includes('Datos del negocio'), 'incluye datos del negocio')
assert(html.includes('Criterios aplicados'), 'incluye criterios/filtros aplicados')
assert(html.includes('<caption>Detalle - Ventas</caption>'), 'incluye caption administrativo de tabla')
assert(html.includes('display: table-header-group'), 'repite encabezado de tabla al paginar')
assert(html.includes('page-break-inside: avoid'), 'evita cortar filas/bloques importantes')

const vacio = buildReportePdfHtml({})
assert(typeof vacio === 'string' && vacio.includes('Reporte'), 'no rompe sin datos')
assert(vacio.includes('Sin columnas'), 'sin columnas muestra estado vacio')

console.log(`\nreporte-pdf ok - ${passed} verificaciones`)
process.exit(0)
