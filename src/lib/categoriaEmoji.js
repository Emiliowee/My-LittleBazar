/**
 * Emoji/imagen de categoría — iconografía amigable del producto, compartida
 * entre el PDV, el Inicio y donde haga falta. Respeta el ícono propio que la
 * dueña configura en Configuración → Categorías (`settings.categoriasMeta`).
 */

export const EMOJI_BASE = {
  'Perfumería': '🧴', 'Maquillaje': '💄',
  'Blusa': '👚', 'Camisa': '👔', 'Playera': '👕', 'Suéter': '🧶',
  'Sudadera': '🧥', 'Chamarra': '🧥', 'Saco': '🧥',
  'Pantalón': '👖', 'Short': '🩳', 'Falda': '👗', 'Vestido': '👗',
  'Zapato': '👞', 'Tenis': '👟', 'Sandalia': '🩴', 'Bota': '🥾', 'Tacón': '👠',
  'Joyería': '💍', 'Accesorio': '👜', 'Bolsa': '👜', 'Gorra': '🧢', 'Juguete': '🧸',
}

export const esRutaImagen = (v) =>
  typeof v === 'string' && (/[\\/]/.test(v) || /\.(png|jpe?g|webp|gif|bmp)$/i.test(v))

export const rutaAFileUrl = (p) =>
  `file:///${String(p).replace(/\\/g, '/').replace(/^\/+/, '')}`

export function emojiDeCategoria(categoria, categoriasMeta) {
  const nombre = String(categoria || '').trim()
  const propio = categoriasMeta?.[nombre]?.icono
  if (propio) return propio
  return EMOJI_BASE[nombre] || '🛍️'
}
