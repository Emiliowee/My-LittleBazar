/**
 * Catálogo de emojis para el selector de categorías (renderer, sin dependencias,
 * 100% offline). Pensado para un bazar: ropa, calzado, belleza, accesorios,
 * joyería, hogar, comida, animales, naturaleza, caras y símbolos. Es amplio para
 * que la dueña tenga de dónde elegir y pueda BUSCAR por palabra en español.
 * Cada item: { e: emoji, k: palabras clave }.
 */
export const EMOJI_GROUPS = [
  {
    label: 'Sugeridos',
    items: [
      { e: '👗', k: 'vestido ropa' }, { e: '👕', k: 'playera camiseta' },
      { e: '👖', k: 'pantalon jeans' }, { e: '👠', k: 'tacon zapato' },
      { e: '👜', k: 'bolsa cartera' }, { e: '💄', k: 'labial maquillaje' },
      { e: '🧴', k: 'perfume locion crema' }, { e: '🌸', k: 'flor perfume' },
      { e: '👟', k: 'tenis calzado' }, { e: '🧥', k: 'chamarra abrigo' },
      { e: '🎀', k: 'mono lazo accesorio' }, { e: '💍', k: 'anillo joya' },
      { e: '🩴', k: 'chancla sandalia' }, { e: '🧢', k: 'gorra' },
      { e: '⭐', k: 'estrella favorito' }, { e: '🛍️', k: 'compras bolsa' },
    ],
  },
  {
    label: 'Ropa',
    items: [
      { e: '👗', k: 'vestido' }, { e: '👚', k: 'blusa top' }, { e: '👕', k: 'playera camiseta remera' },
      { e: '👔', k: 'camisa corbata' }, { e: '👖', k: 'pantalon jeans mezclilla' }, { e: '🩳', k: 'short bermuda' },
      { e: '🧥', k: 'abrigo chamarra chaqueta saco gabardina' }, { e: '🧣', k: 'bufanda' }, { e: '🧤', k: 'guantes' },
      { e: '🧦', k: 'calcetines medias' }, { e: '🥼', k: 'bata' }, { e: '🦺', k: 'chaleco' },
      { e: '👘', k: 'kimono bata' }, { e: '🥻', k: 'vestido largo sari' }, { e: '👙', k: 'bikini traje bano' },
      { e: '🩱', k: 'traje de bano' }, { e: '🩲', k: 'ropa interior calzon' }, { e: '🩰', k: 'ballet zapatillas' },
      { e: '👝', k: 'pijama' }, { e: '🧶', k: 'sueter tejido lana' }, { e: '🪡', k: 'costura aguja' },
    ],
  },
  {
    label: 'Calzado',
    items: [
      { e: '👠', k: 'tacon zapatilla' }, { e: '👡', k: 'sandalia' }, { e: '👢', k: 'bota' },
      { e: '👞', k: 'zapato mocasin' }, { e: '👟', k: 'tenis deportivo sneaker' }, { e: '🥿', k: 'balerina flat' },
      { e: '🩴', k: 'chancla sandalia flip flop' }, { e: '🥾', k: 'bota montana huarache' }, { e: '🧦', k: 'calceta' },
    ],
  },
  {
    label: 'Belleza',
    items: [
      { e: '💄', k: 'labial maquillaje lipstick' }, { e: '💅', k: 'unas esmalte manicure' }, { e: '🧴', k: 'locion crema perfume gel' },
      { e: '🧼', k: 'jabon' }, { e: '🪞', k: 'espejo' }, { e: '🪥', k: 'cepillo dientes' },
      { e: '🪮', k: 'peine cabello' }, { e: '🧖', k: 'spa facial' }, { e: '💇', k: 'corte cabello peluqueria' },
      { e: '💆', k: 'masaje relax' }, { e: '🌸', k: 'flor perfume' }, { e: '🌺', k: 'flor' },
      { e: '🌷', k: 'flor tulipan' }, { e: '🪷', k: 'loto flor' }, { e: '🧪', k: 'esencia frasco' },
      { e: '🫧', k: 'burbujas espuma' },
    ],
  },
  {
    label: 'Joyería',
    items: [
      { e: '💍', k: 'anillo' }, { e: '💎', k: 'diamante joya brillante' }, { e: '📿', k: 'collar rosario cadena' },
      { e: '👑', k: 'corona' }, { e: '⌚', k: 'reloj' }, { e: '⏱️', k: 'cronometro reloj' },
      { e: '🔗', k: 'cadena eslabon' }, { e: '✨', k: 'brillo' }, { e: '🪬', k: 'amuleto dije' },
    ],
  },
  {
    label: 'Accesorios',
    items: [
      { e: '👜', k: 'bolsa cartera' }, { e: '👝', k: 'monedero' }, { e: '👛', k: 'monedero billetera' },
      { e: '🎒', k: 'mochila' }, { e: '🧳', k: 'maleta valija equipaje' }, { e: '🕶️', k: 'lentes gafas sol' },
      { e: '👓', k: 'lentes anteojos' }, { e: '🧢', k: 'gorra cachucha' }, { e: '👒', k: 'sombrero pamela' },
      { e: '🎩', k: 'sombrero copa' }, { e: '🪖', k: 'casco' }, { e: '💼', k: 'maletin portafolio' },
      { e: '🪭', k: 'abanico' }, { e: '🌂', k: 'paraguas sombrilla' }, { e: '☂️', k: 'paraguas' },
      { e: '🧣', k: 'mascada pañuelo' }, { e: '🪡', k: 'hilo coser' }, { e: '🔑', k: 'llave llavero' },
    ],
  },
  {
    label: 'Bebé y juguetes',
    items: [
      { e: '🧸', k: 'peluche oso' }, { e: '👶', k: 'bebe' }, { e: '🍼', k: 'biberon mamila' },
      { e: '🎀', k: 'mono lazo listón' }, { e: '🪀', k: 'yoyo juguete' }, { e: '🧩', k: 'rompecabezas' },
      { e: '🎈', k: 'globo' }, { e: '🪁', k: 'papalote cometa' }, { e: '🧶', k: 'estambre lana' },
      { e: '🚗', k: 'carrito coche' }, { e: '🪆', k: 'matrioska muneca' }, { e: '🎨', k: 'pintura arte' },
      { e: '🖍️', k: 'crayon colores' }, { e: '🎲', k: 'dado juego' }, { e: '♟️', k: 'ajedrez' },
    ],
  },
  {
    label: 'Hogar',
    items: [
      { e: '🏠', k: 'casa hogar' }, { e: '🛋️', k: 'sofa sillon' }, { e: '🛏️', k: 'cama' },
      { e: '🪑', k: 'silla' }, { e: '🕯️', k: 'vela' }, { e: '🖼️', k: 'cuadro marco' },
      { e: '🧺', k: 'canasta cesto' }, { e: '🧹', k: 'escoba limpieza' }, { e: '🧽', k: 'esponja' },
      { e: '🪣', k: 'cubeta balde' }, { e: '🍽️', k: 'plato cubiertos vajilla' }, { e: '🍵', k: 'taza te' },
      { e: '🫖', k: 'tetera' }, { e: '🥄', k: 'cuchara' }, { e: '🪟', k: 'ventana cortina' },
      { e: '💡', k: 'foco luz lampara' }, { e: '🧷', k: 'seguro alfiler' }, { e: '🪴', k: 'planta maceta' },
      { e: '🕰️', k: 'reloj pared' },
    ],
  },
  {
    label: 'Comida y dulces',
    items: [
      { e: '🍬', k: 'dulce caramelo' }, { e: '🍭', k: 'paleta' }, { e: '🍫', k: 'chocolate' },
      { e: '🍪', k: 'galleta' }, { e: '🧁', k: 'cupcake mantecada' }, { e: '🍰', k: 'pastel rebanada' },
      { e: '🎂', k: 'pastel cumpleanos' }, { e: '🍩', k: 'dona' }, { e: '🍿', k: 'palomitas' },
      { e: '☕', k: 'cafe' }, { e: '🥤', k: 'bebida refresco' }, { e: '🧃', k: 'jugo' },
      { e: '🍦', k: 'helado nieve' }, { e: '🍉', k: 'sandia fruta' }, { e: '🍓', k: 'fresa fruta' },
      { e: '🍎', k: 'manzana fruta' }, { e: '🍌', k: 'platano fruta' }, { e: '🌮', k: 'taco comida' },
      { e: '🍕', k: 'pizza' }, { e: '🥖', k: 'pan' },
    ],
  },
  {
    label: 'Animales y naturaleza',
    items: [
      { e: '🐶', k: 'perro' }, { e: '🐱', k: 'gato' }, { e: '🐰', k: 'conejo' }, { e: '🐻', k: 'oso' },
      { e: '🦊', k: 'zorro' }, { e: '🐼', k: 'panda' }, { e: '🦄', k: 'unicornio' }, { e: '🐸', k: 'rana' },
      { e: '🦋', k: 'mariposa' }, { e: '🐝', k: 'abeja' }, { e: '🐢', k: 'tortuga' }, { e: '🐠', k: 'pez' },
      { e: '🌵', k: 'cactus planta' }, { e: '🌻', k: 'girasol flor' }, { e: '🌹', k: 'rosa flor' },
      { e: '🍀', k: 'trebol suerte' }, { e: '🌿', k: 'hierba hoja' }, { e: '🌳', k: 'arbol' },
      { e: '🌙', k: 'luna' }, { e: '☀️', k: 'sol' }, { e: '🌈', k: 'arcoiris' }, { e: '🔥', k: 'fuego' },
    ],
  },
  {
    label: 'Caras',
    items: [
      { e: '😀', k: 'feliz sonrisa cara' }, { e: '😍', k: 'enamorado corazon ojos' }, { e: '🥰', k: 'amor carino' },
      { e: '😎', k: 'cool lentes' }, { e: '🤩', k: 'estrellas wow' }, { e: '😊', k: 'sonrisa tierno' },
      { e: '😘', k: 'beso' }, { e: '🥳', k: 'fiesta celebracion' }, { e: '🤗', k: 'abrazo' },
      { e: '😅', k: 'risa nervios' }, { e: '😉', k: 'guino' }, { e: '🙂', k: 'sonrisa leve' },
      { e: '😴', k: 'dormido' }, { e: '🤑', k: 'dinero' }, { e: '👍', k: 'pulgar bien like' },
      { e: '👏', k: 'aplauso' }, { e: '🙌', k: 'manos arriba' }, { e: '🤝', k: 'trato mano' },
      { e: '💪', k: 'fuerza brazo' }, { e: '🫶', k: 'corazon manos amor' },
    ],
  },
  {
    label: 'Símbolos',
    items: [
      { e: '⭐', k: 'estrella' }, { e: '✨', k: 'brillo nuevo' }, { e: '🌟', k: 'estrella brillo' },
      { e: '❤️', k: 'corazon rojo' }, { e: '🩷', k: 'corazon rosa' }, { e: '💜', k: 'corazon morado' },
      { e: '💙', k: 'corazon azul' }, { e: '💚', k: 'corazon verde' }, { e: '🧡', k: 'corazon naranja' },
      { e: '💛', k: 'corazon amarillo' }, { e: '🔥', k: 'oferta fuego' }, { e: '🏷️', k: 'etiqueta precio' },
      { e: '🛍️', k: 'compras bolsa' }, { e: '💰', k: 'dinero precio' }, { e: '💵', k: 'billete dinero' },
      { e: '🎁', k: 'regalo' }, { e: '🏆', k: 'premio trofeo' }, { e: '✅', k: 'check listo ok' },
      { e: '💯', k: 'cien perfecto' }, { e: '🆕', k: 'nuevo' }, { e: '🆓', k: 'gratis' },
      { e: '📦', k: 'caja paquete' }, { e: '🛒', k: 'carrito compras' }, { e: '🔖', k: 'marcador etiqueta' },
      { e: '💖', k: 'corazon brillo' }, { e: '🌐', k: 'mundo' }, { e: '📍', k: 'ubicacion pin' },
    ],
  },
]

const norm = (s) =>
  String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()

/** Emojis cuyas palabras clave (o el propio emoji) coinciden con la búsqueda. */
export function searchEmojis(query) {
  const q = norm(query)
  if (!q) return []
  const seen = new Set()
  const out = []
  for (const g of EMOJI_GROUPS) {
    for (const it of g.items) {
      if (seen.has(it.e)) continue
      if (it.e === query || norm(it.k).includes(q)) { seen.add(it.e); out.push(it) }
    }
  }
  return out
}
