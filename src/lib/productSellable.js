/** null = se puede vender en caja / salida; string = mensaje de error. */
export function productSellableError(p) {
  if (!p?.id) return 'Producto inválido.'
  const estado = String(p.estado || '').trim().toLowerCase()
  if (estado === 'vendido') return 'Ya figura como vendido.'
  if (estado && estado !== 'disponible') return `No disponible para venta (${estado}).`
  const precio = Number(p.precio)
  if (!Number.isFinite(precio) || precio <= 0) return 'Producto sin precio asignado.'
  const pieza = Number(p.pieza_unica) === 1
  const stock = Math.max(0, Math.floor(Number(p.stock) || 0))
  const max = pieza ? 1 : stock
  if (max < 1) return 'Sin stock.'
  return null
}
