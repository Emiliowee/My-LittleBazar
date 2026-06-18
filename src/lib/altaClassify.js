/**
 * Clasificador de atributos para la captura progresiva del cuaderno.
 *
 * Cuando Monserrat escribe "algodón" en el campo "¿qué lo diferencia?",
 * este módulo decide a qué grupo del cuaderno pertenece. La decisión cae
 * en uno de tres estados:
 *
 *   - `match`    → el término ya existe en una opción activa del cuaderno
 *   - `suggest`  → la heurística sugiere un grupo (que puede o no existir)
 *   - `unknown`  → no hay forma de decidir; preguntar al usuario
 *
 * Diseño: opción 4 + 2 del documento.
 *  - El historial del cuaderno gana siempre (la primera vez se pregunta;
 *    a partir de ahí, "match" lo asigna en silencio).
 *  - Si no hay match en el historial, una heurística mínima cubre los
 *    términos más previsibles del bazar (telas, tallas, zonas).
 *  - Si la heurística no decide, se pregunta — pero solo la primera vez.
 */

export const STD_GROUPS = {
  TIPO: 'Tipo',
  MATERIAL: 'Material',
  TALLA: 'Talla',
  ZONA: 'Zona',
  COLOR: 'Color',
  MARCA: 'Marca',
  PERFUME: 'Perfume',
  COSMETICO: 'Cosmético',
  CALZADO: 'Calzado',
  VOLUMEN: 'Volumen',
}

/**
 * Palabras-ancla que delatan el dominio del producto antes de clasificar
 * los demás términos. Cuando el parser detecta un dominio claro:
 *
 *   - Las cantidades con unidad (100ml, 1 litro, 30gr) se taguean como
 *     VOLUMEN en lugar de TALLA cuando el dominio es perfume o cosmético
 *     — porque una "talla 100ml" en un perfume no tiene sentido.
 *   - (En commits siguientes) se romperá el empate cuando un mismo
 *     nombre aparezca en MARCA y PERFUME (ej. Carolina Herrera).
 *
 * Orden de prioridad: perfume > cosmetico > calzado > ropa. La primera
 * coincidencia gana.
 */
const DOMAIN_INDICATORS = {
  perfume: [
    'perfume', 'fragancia', 'colonia', 'locion', 'loción',
    'body mist', 'eau de parfum', 'eau de toilette', 'edp', 'edt', 'parfum',
    'splash',
  ],
  cosmetico: [
    'labial', 'pintalabios', 'lipstick', 'gloss',
    'rimel', 'rímel', 'mascara de pestañas',
    'delineador', 'eyeliner',
    'sombra', 'sombras', 'paleta de sombras',
    'base de maquillaje', 'foundation', 'corrector', 'concealer',
    'rubor', 'blush', 'iluminador', 'highlighter', 'bronceador', 'bronzer',
    'primer', 'prebase',
    'esmalte', 'pintauñas', 'gelish',
    'mascarilla', 'sérum facial', 'serum facial', 'tónico', 'tonico',
    'hidratante', 'limpiador', 'protector solar', 'bloqueador',
    'shampoo', 'champú', 'champu', 'acondicionador', 'conditioner', 'tinte',
  ],
  calzado: [
    'zapato', 'zapatos', 'zapatilla', 'zapatillas',
    'tenis', 'sneaker', 'sneakers', 'deportivos',
    'bota', 'botas', 'botin', 'botín', 'botines', 'borcegos',
    'sandalia', 'sandalias', 'huarache', 'huaraches', 'chancla', 'chanclas',
    'tacon', 'tacón', 'tacones', 'plataforma',
    'mocasin', 'mocasines', 'flats', 'balerinas',
    'crocs', 'pantuflas', 'zuecos',
  ],
  ropa: [
    'blusa', 'blusas', 'camisa', 'camisas',
    'playera', 'playeras', 'remera', 'camiseta', 'polo', 't-shirt',
    'pantalon', 'pantalón', 'jean', 'jeans', 'short', 'shorts',
    'falda', 'minifalda', 'vestido', 'vestidos',
    'leggings', 'jogger', 'joggers',
    'sueter', 'suéter', 'sweater', 'cardigan', 'sudadera', 'hoodie',
    'chamarra', 'chaqueta', 'campera', 'saco', 'blazer', 'abrigo',
    'pijama', 'camison', 'bata',
    'calzon', 'calzón', 'bra', 'brassiere', 'sosten',
    'top', 'crop', 'croptop',
    'jumpsuit', 'mono', 'overol', 'enterizo',
    'bolsa', 'bolso', 'mochila',
  ],
}

/**
 * Devuelve el dominio probable del producto a partir del texto crudo, o
 * null si no hay señal clara. Rule-based, sin red, sin LLM.
 *
 * @param {string} text
 * @returns {'perfume' | 'cosmetico' | 'calzado' | 'ropa' | null}
 */
export function detectDomain(text) {
  const raw = String(text ?? '').trim()
  if (!raw) return null
  const padded = ` ${normalizeAccents(raw)} `
  for (const [domain, indicators] of Object.entries(DOMAIN_INDICATORS)) {
    for (const ind of indicators) {
      const needle = normalizeAccents(ind)
      if (padded.includes(` ${needle} `)) return domain
      if (padded.includes(` ${needle},`)) return domain
      if (padded.includes(` ${needle}s `) && needle.length > 4) return domain
    }
  }
  return null
}

/** Términos canónicos por grupo. La heurística sirve solo para el cuaderno
 *  vacío o casi vacío — una vez la opción existe, el match por historial gana.
 *  Vocabulario optimizado para el bazar de ropa (México).
 */
export const SEED_TERMS = {
  [STD_GROUPS.TIPO]: [
    // Inferior
    'pantalon', 'pantalón',
    'pants', 'jean', 'jeans', 'short', 'shorts', 'bermuda', 'bermudas',
    'falda', 'minifalda', 'falda larga', 'maxifalda',
    'legging', 'leggings', 'mallon', 'mallón', 'jogger', 'joggers',
    // Superior
    'blusa', 'blusas',
    'camisa', 'camisas', 'guayabera',
    'playera', 'playeras', 'remera', 'remeras', 't-shirt', 'tshirt', 'camiseta', 'polo',
    'top', 'tops', 'crop', 'croptop', 'corset', 'bralette',
    'sueter', 'suéter', 'sweater', 'cardigan', 'cárdigan', 'pullover',
    'sudadera', 'sudaderas', 'hoodie',
    'chamarra', 'chamarras', 'chaqueta', 'chaquetas', 'campera', 'rompevientos',
    'saco', 'sacos', 'blazer', 'blazers',
    'abrigo', 'abrigos', 'gabardina', 'trench',
    'chaleco', 'chalecos',
    // Vestidos / sets
    'vestido', 'vestidos', 'maxivestido', 'minivestido',
    'jumpsuit', 'enterizo', 'enterito', 'mono', 'romper', 'peto', 'overol',
    'conjunto', 'set', 'traje',
    // Interior / íntimo
    'calzon', 'calzón', 'calzones', 'braga', 'pantaleta', 'bikini',
    'bra', 'brassiere', 'brasier', 'sosten', 'sostén', 'corpiño', 'top deportivo',
    'tanga', 'panty', 'bóxer', 'boxer', 'trusa',
    'pijama', 'pijamas', 'camison', 'bata',
    'fondo', 'enagua', 'faja',
    // Accesorios
    'bolsa', 'bolso', 'mochila', 'cartera', 'monedero', 'cangurera', 'mariconera', 'crossbody',
    'cinturón', 'cinturon', 'cinto',
    'gorra', 'gorro', 'sombrero', 'boina', 'sombrilla', 'paraguas',
    'bufanda', 'pañoleta', 'panoleta', 'pashmina', 'chal',
    'guantes', 'mascada', 'corbata', 'moño',
    'lentes', 'gafas', 'anteojos',
    'reloj', 'pulsera', 'collar', 'anillo', 'aretes', 'arracadas', 'joyeria',
    // Niños / bebés
    'mameluco', 'pañalero', 'panalero', 'body', 'babero', 'pañal',
    // Trajes de baño
    'traje de baño', 'traje de bano', 'bañador', 'bikini', 'trikini', 'sunga',
    // Cortes / variantes de pantalón y vestido que aparecen en pacas
    'mom jeans', 'jegging', 'jeggings', 'palazzo', 'palazzos',
    'capri', 'capris', 'pescador', 'pescadores', 'culotte', 'culottes',
    'cargo', 'cargos', 'paperbag',
    // Outerwear específico
    'puffer', 'plumífero', 'plumifero', 'parka', 'anorak', 'gabán', 'gaban',
    'kimono', 'kimono robe', 'haori',
    // Tops específicos
    'tank', 'tank top', 'musculosa', 'esqueleto',
    'halter', 'halter top', 'tube top', 'strapless',
    'off shoulder', 'hombros caídos', 'hombros caidos',
    // Otros tipos comunes
    'túnica', 'tunica', 'caftán', 'caftan', 'blusón', 'blusones', 'polera',
    'rebozo', 'huipil', 'manton', 'mantón',
    'mameluco', 'pijama enterita',
  ],
  [STD_GROUPS.CALZADO]: [
    'zapato', 'zapatos', 'zapatilla', 'zapatillas', 'tacon', 'tacones', 'plataforma',
    'tenis', 'sneaker', 'sneakers', 'deportivos',
    'sandalia', 'sandalias', 'huarache', 'huaraches', 'chancla', 'chanclas', 'flip flops',
    'bota', 'botas', 'botin', 'botines', 'botín', 'borcegos',
    'mocasines', 'mocasin', 'flats', 'balerinas', 'alpargatas',
    'pantuflas', 'zuecos', 'crocs',
    // Tacones específicos (se piden tipo y altura por separado en la práctica)
    'stiletto', 'stilettos', 'tacones de aguja', 'tacón aguja', 'tacon aguja',
    'tacón cubano', 'tacon cubano', 'kitten heel', 'tacón bajo', 'tacon bajo',
    'cuña', 'cuñas', 'cuna', 'cunas', 'wedge', 'wedges',
    // Botas específicas
    'botas altas', 'botas largas', 'over the knee', 'over-the-knee',
    'rain boots', 'botas de lluvia', 'galochas',
    'snow boots', 'botas de nieve', 'uggs', 'ugg',
    'combat boots', 'biker boots', 'doc martens', 'martens',
    // Estilos clásicos
    'oxford', 'oxfords', 'brogue', 'brogues', 'derby',
    'loafer', 'loafers', 'monk strap', 'slip on', 'slip-on',
    'boat shoes', 'topsider', 'topsiders',
    'mules', 'mulas',
    'mary jane', 'mary janes',
    'espadrille', 'espadrilles', 'espadriles',
  ],
  [STD_GROUPS.MATERIAL]: [
    'algodon', 'algodón',
    'licra', 'spandex', 'elastano',
    'encaje', 'tul', 'gasa', 'chiffon', 'chifon', 'organza',
    'mezclilla', 'denim',
    'poliester', 'polyester', 'poliéster',
    'lana', 'lino', 'seda', 'cachemira', 'cashmere',
    'satin', 'satín', 'raso',
    'gabardina', 'jersey', 'franela', 'flanela', 'polar',
    'terciopelo', 'pana', 'corduroy', 'velour',
    'piel', 'cuero', 'gamuza', 'nobuck',
    'sintetico', 'sintético', 'imitacion piel', 'imitación piel', 'vinipiel', 'cuerina',
    'nylon', 'nailon', 'acrilico', 'acrílico',
    'rayon', 'rayón', 'viscosa', 'modal',
    'bambu', 'bambú',
    'felpa', 'pelusa', 'peluche', 'sherpa',
    'algodon-licra', 'algodón-licra',
    'dril', 'tela dril',
    'lycra', 'plush',
    'lentejuela', 'lentejuelas', 'chaquira',
    'red', 'malla', 'mesh',
    'crochet', 'tejido', 'punto',
    // Tejidos premium / técnicos
    'tweed', 'jacquard', 'brocado', 'brocade',
    'tafetán', 'tafetan', 'shantung', 'crepé', 'crepe', 'georgette',
    'softshell', 'fleece', 'neopreno', 'neoprene',
    // Sintéticos de moda
    'charol', 'patent', 'vinilo', 'vinyl', 'polipiel', 'antelina',
    // Eco / sostenibles
    'tencel', 'lyocell', 'micromodal',
    'reciclado', 'reciclada', 'rpet', 'orgánico', 'organico',
    // Texturas y acabados
    'bordado', 'bordada', 'embroidered',
    'guipur', 'blonda', 'piqué', 'pique',
  ],
  [STD_GROUPS.TALLA]: [
    'ch', 'chica',
    'm', 'mediana', 'med',
    'g', 'grande',
    'xg', 'extra grande',
    'xl', 'xxl', 'xxxl', 'xxxxl',
    's', 'l', 'xs', 'xxs',
    'eg', 'eeg', 'eeeg',
    'unitalla', 'unica', 'única', 'onesize',
    // Numéricas comunes en MX (Ropa)
    '22', '24', '26', '28', '30', '32', '34', '36', '38', '40', '42', '44', '46', '48', '50',
    // Tallas de Calzado MX (Centímetros / Tallas gringas adaptadas)
    '2', '2.5', '3', '3.5', '4', '4.5', '5', '5.5', '6', '6.5', '7', '7.5', '8', '8.5', '9', '9.5', '10', '11', '12',
    // Niños
    '0', '1', '2', '3t', '4', '5', '6', '8', '10', '12', '14', '16',
    'rn', 'rn 0-3', '0-3 meses', '3-6 meses', '6-9 meses', '9-12 meses', '12-18 meses', '18-24 meses',
    // Categorías especiales
    'petite', 'tall', 'plus size', 'plus', 'curvy',
    'maternal', 'premamá', 'premama', 'maternity',
    'talla única', 'talla unica', 'one size', 'one-size',
    'doble xl', 'doble extra grande', 'triple xl', 'triple extra grande',
    // Tallas US (ropa importada de EE.UU.)
    'us 0', 'us 2', 'us 4', 'us 6', 'us 8', 'us 10', 'us 12', 'us 14', 'us 16',
    // Tallas EU (ropa importada de Europa)
    'eu 34', 'eu 36', 'eu 38', 'eu 40', 'eu 42', 'eu 44', 'eu 46', 'eu 48',
    // Tallas UK
    'uk 6', 'uk 8', 'uk 10', 'uk 12', 'uk 14', 'uk 16', 'uk 18',
  ],
  [STD_GROUPS.COLOR]: [
    'blanco', 'blanca',
    'negro', 'negra',
    'rojo', 'roja', 'guinda', 'vino', 'borgona', 'borgoña', 'cereza',
    'azul', 'azul marino', 'azul cielo', 'azul rey', 'marino', 'celeste', 'cielo', 'indigo',
    'verde', 'verde olivo', 'verde militar', 'verde menta', 'verde botella', 'esmeralda', 'jade',
    'amarillo', 'amarilla', 'mostaza', 'neon', 'neón',
    'rosa', 'rosado', 'rosada', 'palo de rosa', 'rosa pastel', 'fucsia', 'magenta', 'fiusha',
    'gris', 'gris claro', 'gris oscuro', 'plomo',
    'beige', 'arena', 'khaki', 'caqui',
    'cafe', 'café', 'cafe oscuro', 'chocolate', 'camel', 'marron', 'marrón',
    'turquesa', 'aqua', 'cian',
    'morado', 'morada', 'lila', 'lavanda', 'violeta', 'purpura',
    'naranja', 'mandarina', 'durazno', 'coral', 'salmon',
    'dorado', 'dorada', 'plateado', 'plateada', 'plata', 'oro', 'bronce', 'cobre', 'metalico',
    'crema', 'hueso', 'nude', 'piel', 'marfil',
    'estampado', 'estampada', 'floreado', 'flores', 'rayado', 'rayas', 'cuadros', 'lunares', 'puntos',
    'leopardo', 'animal print', 'tie dye', 'camuflaje', 'militar',
    'multicolor', 'tornasol', 'transparente',
    // Pasteles específicos
    'verde pastel', 'amarillo pastel', 'azul pastel', 'morado pastel', 'lila pastel',
    // Tendencias modernas
    'rose gold', 'oro rosa', 'champagne', 'champán', 'champan',
    'very peri', 'classic blue', 'ultra violet', 'greenery',
    // Patrones específicos (más fino que "estampado")
    'leopard print', 'snake print', 'cebra', 'zebra print',
    'gingham', 'vichy', 'tartan', 'cuadros escoceses',
    'paisley', 'geométrico', 'geometrico', 'abstracto', 'tribal',
    'pata de gallo', 'houndstooth', 'argyle',
    // Variantes / matices
    'burdeos', 'amaranto', 'berenjena', 'petróleo', 'petroleo',
    'azulino', 'amarillo neón', 'amarillo neon',
    'rosa neón', 'rosa neon', 'verde neón', 'verde neon',
    'naranja neón', 'naranja neon', 'azul neón', 'azul neon',
    'blanco hueso', 'blanco crema', 'blanco perla',
    'gris perla', 'gris piedra', 'gris topo', 'gris humo',
    'dorado champagne', 'plata vieja',
    'terracota', 'óxido', 'oxido', 'ladrillo', 'arena' /* dup con beige, OK */,
  ],
  [STD_GROUPS.MARCA]: [
    // Deportivas / Calzado
    'adidas', 'nike', 'puma', 'reebok', 'under armour', 'vans', 'converse', 'new balance', 'fila', 'asics', 'skechers', 'dc shoes', 'jordan', 'champion', 'kappa',
    // Casual / Jeans
    'levis', "levi's", 'wrangler', 'lee', 'guess', 'calvin klein', 'tommy hilfiger', 'tommy', 'thommy', 'diesel', 'gap', 'hollister', 'abercrombie', 'aeropostale', 'american eagle',
    // Fast Fashion / Retail
    'zara', 'h&m', 'pull&bear', 'bershka', 'stradivarius', 'mango', 'forever 21', 'forever21', 'shein', 'c&a', 'suburbia', 'coppel', 'old navy', 'massimo dutti', 'oysho', 'lefties',
    // Lujo / Diseñador
    'gucci', 'prada', 'versace', 'louis vuitton', 'dior', 'chanel', 'balenciaga', 'burberry', 'armani', 'hugo boss', 'lacoste', 'polo', 'ralph lauren', 'michael kors', 'coach', 'tous', 'carolina herrera', 'ferragamo', 'fendi', 'valentino',
    // Lencería / Íntimo
    'victoria secret', "victoria's secret", 'aerie', 'ilusión', 'ilusion', 'carnival', 'vicky form', 'rinbros', 'trueno', 'calvin klein',
    // Nacionales / Otras
    'oggi', 'furor', 'julio', 'lob', 'ivonne', 'shasa', 'cuidado con el perro', 'optima', 'yazbek',
    // Fast fashion / online retailers
    'romwe', 'zaful', 'fashion nova', 'asos', 'topshop', 'topman',
    'boohoo', 'missguided', 'prettylittlething', 'plt',
    'uniqlo', 'primark', 'next',
    // Mexicanas adicionales (calzado, hogar, marcas locales)
    'andrea', 'price shoes', 'flexi', 'milano', 'capa de ozono', 'capa ozono',
    'vianney', 'intima hogar', 'devlyn', 'high lander', 'kebo', 'mocca',
    // US imports populares en MX
    'banana republic', 'j.crew', 'jcrew', 'express', 'ann taylor', 'loft',
    'anthropologie', 'free people', 'madewell',
    'urban outfitters', 'uo',
    'hot topic', 'pacsun', 'the children\'s place', 'childrens place',
    'gymboree', 'carter\'s', 'carters', 'oshkosh',
    // Outdoor / streetwear / utility
    'the north face', 'north face', 'patagonia', 'columbia',
    'carhartt', 'dickies', 'timberland', 'merrell', 'salomon',
    'eddie bauer', 'helly hansen',
    // Athleisure premium
    'lululemon', 'athleta', 'alo', 'alo yoga',
    'hoka', 'on running', 'brooks', 'saucony', 'mizuno', 'altra',
    // Luxury / Designer adicional
    'ysl', 'yves saint laurent', 'off-white', 'off white',
    'supreme', 'bape', 'fear of god', 'essentials',
    'rick owens', 'comme des garcons', 'cdg', 'maison margiela', 'margiela',
    'givenchy', 'hermes', 'hermès', 'cartier',
    'tory burch', 'kate spade', 'marc jacobs', 'rebecca minkoff', 'longchamp',
    'fossil', 'swatch', 'casio', 'g-shock',
    // Lencería extra
    'soma', 'spanx', 'savage x fenty', 'savage fenty', 'yamamay',
    // Eyewear (en bazares de ropa importada aparecen seguido)
    'ray-ban', 'ray ban', 'rayban', 'oakley', 'persol', 'gentle monster',
    // Mochilas / maletas
    'jansport', 'totto', 'samsonite', 'swissgear', 'eastpak', 'wenger',
    // Denim alternativas
    'true religion', 'rock revival', 'miss me', '7 for all mankind', 'ag jeans',
    'splendid', 'james perse', 'vince',
    // Mexicanas mid-tier (lo que realmente aparece en pacas y mostradores MX)
    'bobby brooks', 'studio f', 'studio f hombre', 'studio f kids',
    'mossimo', 'mossimo supply', 'contempo', 'mossimo supply co',
    'cherokee', 'cklass', 'crash', 'bratty', 'stf', 'stf diseno', 'stf diseño',
    'capa de ozono', 'capa ozono', 'maui', 'milano kids',
    'marisa', 'punto blanco', 'punto', 'pakar',
    // US house brands económicas (las "ropa americana" de saldo)
    'arizona jean co', 'arizona jeans', 'st johns bay', 'st john\'s bay', 'worthington',
    'faded glory', 'george', 'athletic works', 'no boundaries', 'time and tru',
    'cat & jack', 'cat and jack', 'a new day', 'goodfellow',
    'universal thread', 'wild fable', 'knox rose', 'ava & viv',
    'inc', 'alfani', 'charter club', 'bar iii', 'apt 9', 'apt. 9',
    'sonoma', 'croft & barrow', 'jaclyn smith',
    // Underwear / loungewear budget
    'hanes', 'fruit of the loom', 'fotl', 'gildan', 'joe boxer',
    'jockey', 'bvd',
    // Mid-tier mexicanos que faltaban
    'sara cosmetics', 'sara aldrete', 'sara studio',
    // Maquillaje budget MX
    'maybelline newyork',

    // ────── PACA USA (las que llegan en fardos de saldo) ──────
    'merona', 'mossimo black', 'liz claiborne', 'liz lange',
    'ann klein', 'anne klein', 'jones new york', 'kasper',
    'chaps', 'haggar', 'van heusen', 'dockers', 'lee jeans',
    'lucky brand', 'lucky', 'silver jeans', 'paige', 'frame',
    'eddie auth', 'columbia sportswear', 'wrangler riggs',
    'tommy bahama', 'nautica', 'izod', 'perry ellis',
    'kenneth cole', 'calvin klein jeans', 'guess jeans',
    'rue 21', 'rue21', 'wet seal', 'charlotte russe',
    'maurices', 'cato', 'rainbow',
    'kohls', "kohl's", 'jcpenney', 'jcp', 'sears',
    'aerie', 'pink', 'pink victoria', 'pink vs',
    'sketchers', 'sperry', 'crocs', 'keds', 'rockport',
    'reef', 'olukai', 'teva',
    // 'george' ya está, agrego variantes Walmart
    'george walmart', 'simply vera', 'vera wang', 'simply vera wang',
    'hue', 'leggs', "l'eggs", 'silkies',
    'covington', 'just my size', 'jms',
    'isaac mizrahi', 'mizrahi', 'lauren conrad', 'lc',
    'merona target', 'xhilaration', 'mossimo target',
    'old navy maternity', 'gap maternity',
    'champion target', 'champion duo dry',
    'puma cobra', 'fila disruptor',

    // ────── MEXICANAS MID-TIER (lo que más aparece en bazar real) ──────
    'suburbia', 'coppel jeans', 'sears mexico',
    'andrea calzado', 'andrea zapatos', 'priceshoes', 'price shoes mx',
    'cklass kids', 'cklass plus', 'cklass black',
    'liverpool basics', 'fabricato', 'fabrica de francia',
    'innovasport', 'martí', 'marti', 'deportes martí',
    'el palacio', 'palacio de hierro', 'pdh',
    'parisina', 'modatelas', 'casa la rambla',
    'oggi mujer', 'oggi jeans', 'oggi kids',
    'furor jeans', 'jorge ibanez', 'jorge ibañez',
    'pineda covalin', 'macario jimenez', 'lydia lavin',
    'studio f kids', 'studio f man', 'ela',
    'beneton', 'benetton mx', 'united colors',
    'lob calzado', 'andatti', 'pirma', 'gaspar',
    'amaranta', 'milano shoes', 'milano black',
    'westies', 'romina shoes', 'romina',
    'capa de ozono kids',
    'denim and co', 'gef', 'forty plus', 'koaj',
    'baby creysi', 'creysi', 'baby colloky', 'colloky',
    'gymboree mexico', 'opaline kids', 'opaline',

    // ────── NIÑO/BEBÉ (línea floja) ──────
    'gerber', 'gerber baby', 'garanimals', 'fisher price ropa', 'fisher-price',
    'disney baby', 'disney kids', 'disney princess', 'disney store',
    'marvel kids', 'marvel ropa', 'star wars kids',
    'paw patrol', 'mickey mouse ropa', 'minnie mouse',
    'frozen ropa', 'spiderman ropa',
    'circo target', 'cherokee kids', 'genuine kids',
    '7 for all mankind kids', 'levis kids', "levi's kids",
    'h&m kids', 'h and m kids', 'zara kids', 'zara baby',
    'pumpkin patch', 'mayoral', 'boboli', 'cuatrohojas',
    'name it', 'next kids',
    'oshkosh bgosh', "oshkosh b'gosh", 'oshkosh genuine',
    'baby gap', 'gap kids', 'gymboree baby',
    'first impressions', "carter's just one you",
    'jumping beans', 'so cute', 'baby essentials',
    'rocawear kids', 'akademiks kids',

    // ────── MAQUILLAJE BUDGET MX/LATAM ──────
    'cyzone', 'esika peru', 'esika colombia',
    'pink up', 'pinkup', 'pink 21', 'pink21',
    'bissu', 'bissú',
    'prolux', 'pro lux', 'beauty creations',
    'kleancolor', 'klean color', 'saniye', 'pasion',
    'wokali', 'menow', 'me now', 'qibest', 'qic',
    'kylie cosmetics', 'kkw', 'rare beauty', 'fenty beauty',
    'jaclyn cosmetics', 'jaclyn hill',
    'mac select', 'mac matte', 'mac retro matte',
    'bh cosmetics', 'lottie london', 'makeup revolution',
    'wibo', 'eveline', 'bell cosmetics', 'bell mx',
    'natural honey', 'natural beauty',
    'dermaglow', 'cera ve', 'cerave mx',

    // ────── ALIAS / SIGLAS comunes ──────
    'ck', 'vs', 'tnf', 'th', 'cdg', 'ysl', 'd&g', 'dg',
    'a&f', 'a and f', 'lv', 'gg', 'mk', 'pcs', 'plt',
    'h y m', 'hym', 'fila vs', 'amzn',
    'mac cosmetics', 'm.a.c cosmetics', 'mac pro',
    'estee', 'lancome paris', 'clinique mx',

    // ────── PEDIDAS POR EL USUARIO (con familias/alias) ──────
    'wilson', 'wilson sporting', 'wilson tennis', 'wilson basketball', 'wilson nfl',
    'gloria vanderbilt', 'vanderbilt', 'gv', 'gloria v',
    'pandora', 'pandora joyeria', 'pandora joyería', 'pandora me', 'pandora rose', 'pandora reflexions', 'pandora moments', 'pandora shine', 'pandora disney',
    'dolce & gabbana', 'dolce and gabbana', 'dolce gabbana', 'dolce&gabbana', 'd&g junior',
    'kookai', 'kookaï', 'kookai paris',

    // ────── MARCAS BASE que faltaban (estaban como modelo solo) ──────
    // Luxury / designer
    'dkny', 'donna karan', 'donna karan new york',
    'bottega veneta', 'bottega', 'bv',
    'loewe', 'loewe paula', 'loewe puzzle',
    'moschino', 'love moschino', 'moschino jeans', 'moschino kids',
    'roberto cavalli', 'cavalli', 'just cavalli', 'roberto cavalli junior',
    'stella mccartney', 'stella mc cartney',
    'vivienne westwood', 'westwood',
    'etro', 'etro milano',
    'pucci', 'emilio pucci',
    'acne studios', 'acne',
    'jil sander', 'jil sander navy',
    'helmut lang',
    'theory', 'theory plus',
    'rag & bone', 'rag and bone', 'r&b',
    'allsaints', 'all saints',
    'reformation', 'ref',
    'isabel marant', 'isabel marant etoile',
    'ganni', 'ganni denim',
    'totême', 'toteme',
    'staud', 'cult gaia',
    'mansur gavriel', 'apc', 'a.p.c.', 'a p c',
    'jacquemus', 'jacquemus chiquito',
    'self portrait', 'self-portrait',
    'sandro', 'sandro paris', 'maje', 'maje paris',
    'the kooples',
    'paul smith', 'ps paul smith',
    'aspesi', 'iro', 'iro paris',
    'eileen fisher', 'brunello cucinelli', 'brioni',
    // Marcas de saint-laurent stand-alone
    'saint laurent', 'saint laurent paris',
    // Calzado lujo
    'manolo blahnik', 'manolo', 'blahnik',
    'christian louboutin', 'louboutin', 'cl',
    'jimmy choo zapatos', 'jimmy choo bags',
    'stuart weitzman', 'sw',
    'roger vivier',
    'aquazzura', 'gianvito rossi', 'amina muaddi',
    // Calzado mid
    'aldo', 'aldo accessories', 'aldo mx',
    'nine west', 'nine west kids',
    'steve madden', 'madden girl', 'steve madden kids',
    'sam edelman', 'circus by sam edelman',
    'naturalizer', 'easy spirit', 'frye', 'frye boots',
    'bandolino', 'bandolino bag',
    'cole haan', 'cole haan zerogrand',
    'clarks', 'clarks originals', 'clarks desert',
    'birkenstock', 'birki',
    'ugg', 'ugg australia',
    // Bags / accessories
    'longchamp ya estaba',
    'goyard', 'goyard saint louis',
    'celine', 'céline', 'celine triomphe',
    'chloe', 'chloé', 'see by chloe', 'see by chloé',
    'mulberry', 'mulberry alexa', 'mulberry bayswater',
    'proenza schouler', 'ps1',
    'alexander wang', 'alex wang',
    'givenchy bags', 'givenchy antigona',
    'balenciaga bags', 'balenciaga city',
    'chanel bags', 'chanel classic flap',
    // Joyería / relojes (faltaba toda la categoría)
    'tiffany', 'tiffany & co', 'tiffany and co', 'tiffany hardwear',
    'cartier joyeria', 'cartier love', 'love cartier', 'juste un clou',
    'van cleef', 'van cleef arpels', 'van cleef & arpels', 'alhambra',
    'bvlgari joyeria', 'bvlgari serpenti', 'bvlgari b zero',
    'swarovski', 'swarovski crystal', 'swarovski rose',
    'mejuri', 'gorjana', 'monica vinader',
    'david yurman', 'roberto coin', 'mikimoto',
    'rolex', 'omega', 'omega seamaster', 'tag heuer', 'tag-heuer',
    'patek philippe', 'audemars piguet', 'ap',
    'breitling', 'iwc', 'panerai', 'hublot', 'longines',
    'tissot', 'seiko', 'citizen', 'orient', 'bulova',
    'michael kors watches', 'kors watches',
    'apple watch', 'samsung watch', 'galaxy watch',
    // Streetwear / cult que faltaba
    'kith', 'aime leon dore', 'ald', 'palace skateboards', 'palace',
    'stussy', 'stüssy', 'noah', 'human made', 'gallery dept', 'gallery department',
    'rhude', 'awake ny', 'cactus plant flea market', 'cpfm',
    'cdg play', 'comme des garcons play',
    'a bathing ape', 'aape',
    'undercover', 'undercoverism',
    'sacai',
    // Activewear medio
    'gymshark', 'gym shark', 'fabletics', 'outdoor voices', 'ov',
    'sweaty betty', 'bandier', 'beyond yoga',
    'spanx ya estaba pero variantes',
    'set active', 'pe nation', 'splits59',
    // Niño/bebe mexico extra
    'creysi mexico', 'opaline mexico',
    'andatti kids',
    // Skincare/hair brands faltantes
    'olaplex', 'redken', 'pureology', 'matrix', 'biolage', 'aveda',
    'paul mitchell', 'tigi', 'bedhead', 'tigi bedhead',
    'ouai', 'briogeo', 'kerastase', 'kérastase',
    'morrocan oil', 'moroccan oil', 'moroccanoil',
    'living proof', 'amika', 'oribe',
    // Sportwear medio
    'asics tiger', 'mizuno running', 'brooks running',
    'on cloud', 'oncloud', 'altra', 'topo athletic',
    'hoka one one',
  ],
  [STD_GROUPS.PERFUME]: [
    'perfume', 'fragancia', 'colonia', 'locion', 'loción', 'body mist', 'splash', 'eau de parfum', 'eau de toilette', 'edp', 'edt',
    'carolina herrera', 'good girl', 'bad boy', '212', 'vip',
    'paco rabanne', '1 million', 'one million', 'invictus', 'olympea', 'phantom',
    'chanel', 'coco mademoiselle', 'chanel no 5', 'bleu de chanel',
    'dior', 'sauvage', 'miss dior', 'jadore', 'fahrenheit',
    'versace', 'eros', 'bright crystal', 'dylan blue',
    'hugo boss', 'boss bottled',
    'giorgio armani', 'acqua di gio', 'code', 'si',
    'calvin klein', 'ck one', 'eternity', 'euphoria',
    'jean paul gaultier', 'le male', 'scandal', 'classique',
    'lancome', 'la vie est belle', 'idole', 'tresor',
    'yves saint laurent', 'libre', 'y', 'black opium',
    'tom ford', 'black orchid', 'ombre leather',
    'creed', 'aventus',
    'baccarat rouge', 'ariana grande', 'cloud', 'sweet like candy',
    'bath and body works', 'victoria secret',
    'fraiche', 'saphirus', 'dossier', 'zara perfumes',
    // Carolina Herrera (línea completa)
    '212 vip', '212 vip black', '212 vip rose', '212 sexy', 'ch men', 'ch privé', 'ch prive',
    // Paco Rabanne extra
    'pure xs', 'lady million', 'fame', 'olympea legend', 'phantom legacy',
    // Versace adicional
    'pour femme versace', 'crystal noir', 'yellow diamond', 'eros flame',
    // Calvin Klein extra
    'ck be', 'ck free', 'ck all', 'defy', 'obsession', 'truth',
    // Tom Ford extra
    'lost cherry', 'bitter peach', 'tobacco vanille', 'oud wood', 'fucking fabulous',
    'tuscan leather', 'noir extreme',
    // Dior extra
    'hypnotic poison', 'poison girl', 'pure poison', 'addict', 'homme intense',
    // Gucci
    'gucci bloom', 'gucci flora', 'gucci guilty', 'memoire d\'une odeur',
    'rush', 'envy',
    // YSL extra
    'mon paris', 'opium', 'manifesto', 'l\'homme', 'm7',
    // Mexicanos / Latinos populares
    'don algodón', 'don algodon', 'd soda', 'd\'soda',
    'adolfo dominguez', 'jesus del pozo', 'halloween',
    'antonio banderas', 'queen of seduction', 'blue seduction',
    // Pop / Celebrity
    'thank u next', 'r.e.m.', 'mod blush', 'cloud pink',
    'fantasy', 'curious', 'reb\'l fleur', 'heat',
    'good girl gone bad', 'kim kardashian',
    // Casual / juventud
    'davidoff', 'cool water', 'hot water', 'echo',
    'mexx', 'cosmopolitan',
    'bvlgari', 'aqua', 'pour homme bvlgari',
    'lacoste pour homme', 'lacoste touch of pink', 'lacoste essential', 'lacoste l 12 12',
    'tommy girl', 'tommy summer',
    'hugo deep red', 'hugo just different',
    // Niche / cult (aparecen en mercados premium)
    'maison margiela', 'replica', 'by the fireplace', 'beach walk', 'jazz club',
    'jo malone', 'english pear', 'wood sage', 'lime basil', 'peony blush suede',
    'le labo', 'santal 33', 'rose 31', 'the noir 29',
    'diptyque', 'byredo', 'penhaligon', 'penhaligon\'s',
    'baccarat', 'baccarat rouge 540',
    'mfk', 'maison francis kurkdjian',
    // Body sprays económicos
    'bombshell', 'love spell', 'tease', 'pure seduction', 'aqua kiss',

    // ────── PERFUMES SALDO / IMITACIONES (lo que se vende en bazar) ──────
    'saphirus mx', 'dossier mx', 'fraiche jeunesse',
    'parfums vintage', 'parfum vintage',
    'kreed', 'mimo', 'mimo mx',
    'el palacio fragancias', 'perfumeria salaberry',
    'fragancia inspirada', 'inspirado en', 'similar a',

    // ────── CASAS PREMIUM/MID-TIER que faltan ──────
    'mont blanc', 'montblanc', 'legend', 'explorer', 'starwalker',
    'azzaro', 'wanted', 'chrome', 'pour homme azzaro',
    'givenchy gentleman', 'pi neo', 'very irresistible',
    'cartier', 'la panthere', 'declaration', 'must',
    'hermes', 'terre dhermes', 'terre d hermes', 'voyage dhermes',
    'guerlain', 'shalimar', 'mon guerlain', 'la petite robe noire', 'lhomme ideal',
    'bvlgari omnia', 'omnia crystalline', 'rose goldea', 'man in black',
    'jimmy choo', 'jimmy choo i want choo',
    'narciso rodriguez', 'narciso', 'for her', 'for him narciso',
    'kenzo', 'flower by kenzo', 'amour', 'lelephant',
    'issey miyake', 'leau dissey', "l'eau d'issey", 'fusion dissey',
    'gucci guilty pour homme', 'gucci by gucci', 'envy me',
    'jean paul gaultier scandal', 'gaultier le male', 'ultra male',
    'thierry mugler', 'mugler alien', 'mugler angel', 'aura mugler',
    'viktor rolf', 'viktor and rolf', 'flowerbomb', 'spicebomb',
    'marc jacobs daisy', 'daisy love', 'daisy dream', 'perfect marc jacobs',
    'philosophy', 'amazing grace', 'pure grace',
    'clean perfume', 'clean reserve',
    'lattafa', 'asad lattafa', 'fakhar lattafa', 'lattafa khamrah',
    'rasasi', 'hawas rasasi', 'rumz rasasi',
    'ajmal', 'amber rouge', 'amber wood',
    'al haramain', 'amber oud', 'amber oud gold',
    'parfums de marly', 'layton', 'herod', 'delina',
    'initio', 'oud for greatness', 'side effect',
    'xerjoff', 'naxos xerjoff', '40 knots',
    'kilian', 'angels share', 'good girl gone bad kilian',

    // ────── BODY MIST / CASUAL ──────
    'body mist victoria', 'body splash', 'bath body works',
    'japanese cherry blossom', 'a thousand wishes', 'into the night',
    'mango temptation', 'warm vanilla sugar', 'sweet pea',
    'eternal cologne',

    // ────── ALIAS de perfumes populares ──────
    'one million paco', '1 million paco rabanne', 'eros versace', 'eros flame versace',
    '212 men', '212 women', 'good girl carolina herrera', 'bad boy carolina herrera',
    'sauvage dior edt', 'sauvage edp', 'sauvage parfum',
  ],
  [STD_GROUPS.COSMETICO]: [
    // Tipos de producto
    'labial', 'pintalabios', 'lipstick', 'gloss', 'brillo', 'balsamo', 'tinta',
    'rimel', 'rímel', 'mascara de pestañas', 'pestañas', 'pestañina',
    'delineador', 'eyeliner',
    'sombra', 'paleta de sombras', 'sombras',
    'base', 'base de maquillaje', 'foundation',
    'corrector', 'concealer',
    'polvo', 'polvo compacto', 'polvo traslucido',
    'rubor', 'blush', 'colorete',
    'iluminador', 'highlighter',
    'bronceador', 'bronzer',
    'primer', 'prebase',
    'fijador', 'setting spray',
    'brocha', 'brochas', 'esponja', 'beauty blender',
    'esmalte', 'pintauñas', 'pinta uñas', 'gelish',
    'skincare', 'crema', 'suero', 'serum', 'bloqueador', 'protector solar', 'desmaquillante', 'agua micelar',
    // Marcas de maquillaje comunes
    'mac', 'm.a.c', 'maybelline', 'loreal', "l'oreal", 'revlon', 'covergirl', 'bissu', 'bissú', 'prolux', 'beauty creations', 'kleancolor', 'saniye', 'pink up',
    'nars', 'rare beauty', 'fenty', 'hudabeauty', 'anastasia', 'tarte', 'toofaced', 'urban decay', 'clinique', 'nyx', 'elf', 'wet n wild', 'essence', 'catrice',
    'mary kay', 'avon', 'natura', 'jafra', 'oriflame', 'lbel', 'esika',
    // Marcas premium internacionales
    'charlotte tilbury', 'pat mcgrath', 'pat mcgrath labs',
    'colourpop', 'colour pop', 'morphe', 'sigma', 'real techniques',
    'stila', 'jeffree star', 'tower 28', 'glossier',
    'drunk elephant', 'the ordinary',
    'la roche-posay', 'la roche posay', 'vichy', 'cerave', 'eucerin', 'nivea',
    'estee lauder', 'estée lauder', 'lancôme', 'lancome',
    'bobbi brown', 'benefit', 'kiko milano', 'kiko',
    'sephora collection', 'sephora',
    // Skincare — tipos
    'tónico', 'tonico', 'toner',
    'exfoliante', 'scrub', 'peeling',
    'mascarilla', 'mascara facial', 'máscara facial', 'sheet mask',
    'limpiador', 'jabón facial', 'jabon facial', 'gel limpiador',
    'hidratante', 'moisturizer',
    'contorno', 'contorno de ojos', 'eye cream',
    'sérum', 'serum facial',
    'ácido hialurónico', 'acido hialuronico', 'hialurónico', 'hialuronico', 'hyaluronic',
    'retinol', 'niacinamida', 'niacinamide',
    'vitamina c', 'vitamin c',
    'ácido salicílico', 'acido salicilico',
    'aha', 'bha', 'pha',
    'ampolla', 'ampollas',
    'protector solar', 'fps', 'spf', 'bloqueador',
    // Hair
    'shampoo', 'champú', 'champu',
    'acondicionador', 'conditioner',
    'mascarilla capilar', 'hair mask',
    'tinte', 'tinte de cabello',
    'decolorante',
    'leave-in', 'leave in',
    'serum capilar', 'sérum capilar',
    'tratamiento capilar', 'queratina', 'keratina',
    'mousse', 'gel para cabello', 'laca',
    // Body
    'loción corporal', 'locion corporal', 'body lotion',
    'body butter', 'manteca corporal',
    'body scrub', 'exfoliante corporal',
    'aceite corporal', 'body oil',
    // Nails
    'top coat', 'base coat', 'gel polish',
    'kit de uñas', 'kit de unas',
    'removedor de esmalte', 'quita esmalte',
    // Herramientas y accesorios
    'rizador de pestañas', 'lash curler',
    'pinzas', 'tweezers', 'cepillo', 'peine',

    // ────── SKINCARE POPULAR (Asia + MX) ──────
    'cosrx', 'innisfree', 'laneige', 'etude house', 'tony moly', 'tonymoly',
    'some by mi', 'klairs', 'mizon', 'missha', 'iunik', 'beauty of joseon',
    'haruharu wonder', 'pyunkang yul', 'round lab', 'anua', 'medicube',
    'isntree', 'numbuzin', 'torriden', 'biodance',
    'simple skincare', 'simple mx', 'neutrogena',
    'olay', 'oil of olay', 'pond\'s', 'ponds', 'jergens',
    'aveeno', 'aveeno baby', 'cetaphil', 'cetaphil baby',
    'bioderma', 'avene', 'avène', 'mustela',
    'roc', 'roc retinol', 'derma e',
    'paula\'s choice', 'paulas choice', 'good molecules',
    'cosrx snail', 'pixi glow', 'pixi toner',
    'glow recipe', 'plum plump', 'watermelon glow',
    'farmacy', 'green clean', 'honey halo',
    'sunday riley', 'good genes', 'lactic acid',
    'kiehls', "kiehl's", 'midnight recovery',
    'origins', 'ginzing', 'drink up',
    'fresh', 'fresh sugar', 'soy face cleanser',
    'first aid beauty', 'fab', 'ultra repair cream',

    // ────── MAQUILLAJE MEDIO/POPULAR adicional ──────
    'gigi hadid maybelline', 'maybelline color sensational',
    'loreal infallible', "l'oreal voluminous",
    'covergirl outlast', 'covergirl lashblast',
    'milani', 'milani conceal perfect', 'milani amore matte',
    'jordana', 'jordana easyliner',
    'physicians formula', 'butter bronzer', 'butter highlighter',
    'almay', 'rimmel', 'rimmel stay matte', 'rimmel scandaleyes',
    'iman cosmetics', 'flesh beauty',
    'becca', 'shimmering skin perfector',
    'natasha denona', 'denona',
    'pat mcgrath labs mothership', 'mothership palette',
    'too faced better than sex', 'too faced lip injection',
    'tarte shape tape', 'tarte amazonian clay',
    'urban decay naked', 'naked palette', 'urban decay all nighter',
    'benefit hoola', 'benefit gimme brow', 'benefit they\'re real',
    'mac ruby woo', 'mac russian red', 'mac velvet teddy', 'mac diva',
    'nyx butter gloss', 'nyx soft matte', 'nyx jumbo',
    'colourpop super shock', 'colourpop sky high',
    'elf cosmetics', 'e.l.f. cosmetics', 'elf poreless putty',
    'wet n wild megaglo', 'wet n wild megalast',
  ],
  [STD_GROUPS.VOLUMEN]: [
    // Mililitros (perfumes, body mist, lociones)
    '30ml', '50ml', '60ml', '75ml', '100ml', '125ml', '150ml', '200ml', '250ml',
    '300ml', '400ml', '500ml', '1000ml',
    '30 ml', '50 ml', '60 ml', '75 ml', '100 ml', '125 ml', '150 ml', '200 ml',
    '250 ml', '500 ml',
    // Onzas (común en perfumes importados de US)
    '1.7oz', '3.4oz', '6.8oz', '1oz', '2oz', '4oz', '8oz',
    '1.7 oz', '3.4 oz', '6.8 oz',
    // Litros (shampoo, productos grandes)
    '1l', '1 l', '1.5l', '1.5 l', '2l', '2 l',
    '1 litro', '1.5 litros', '2 litros', '500 mililitros', '1000 mililitros',
    // Gramos (cosmética sólida, jabones, mascarillas)
    '50gr', '100gr', '150gr', '200gr', '250gr', '500gr',
    '50g', '100g', '150g', '200g', '250g', '500g',
    '50 gramos', '100 gramos', '200 gramos', '500 gramos',
    // Palabras sueltas (para autocomplete)
    'mililitros', 'litros', 'onzas', 'gramos', 'kilos',
  ],
}

/** Una zona suele ser 1-3 letras mayúsculas seguidas de M (mostrador) o S. */
const ZONE_REGEX = /^[A-Z]{1,3}[MS]$/

/** Una talla numérica ronda los 22-50 (ropa adulto MX) o 2-30 (calzado/niños). */
const NUMERIC_SIZE_REGEX = /^\d{1,2}(\.5)?$/

function normalize(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
}

function normalizeAccents(s) {
  return normalize(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

/**
 * Retorna sugerencias de SEED_TERMS para autocompletado si empiezan con la palabra ingresada.
 * Ideal para el menú estilo Notion.
 */
export function getSeedSuggestions(partialWord) {
  const target = normalizeAccents(partialWord)
  if (!target || target.length < 2) return []
  
  const results = []
  for (const [groupName, terms] of Object.entries(SEED_TERMS)) {
    for (const term of terms) {
      if (normalizeAccents(term).startsWith(target)) {
        results.push({
          type: 'tag',
          value: term,
          group: groupName,
          // Para diferenciar de las opciones reales guardadas, no pasamos groupId aún
        })
      }
    }
  }
  
  // Dedup por valor
  const unique = []
  const seen = new Set()
  for (const r of results) {
    if (!seen.has(r.value.toLowerCase())) {
      seen.add(r.value.toLowerCase())
      unique.push(r)
    }
  }
  
  return unique.slice(0, 6) // Retornamos las mejores 6
}

/**
 * Busca el término en el cuaderno existente. Si encuentra una opción activa
 * con el mismo nombre (case-insensitive, sin acentos), devuelve el match.
 *
 * @param {string} term
 * @param {Array<{ id: number, name: string, options: Array<{ id: number, name: string }> }>} groups
 */
export function findMatchInCuaderno(term, groups) {
  const target = normalizeAccents(term)
  if (!target) return null
  for (const g of groups || []) {
    const opts = Array.isArray(g?.options) ? g.options : []
    for (const o of opts) {
      if (normalizeAccents(o?.name) === target) {
        return { groupId: Number(g.id), groupName: String(g.name || ''), optionId: Number(o.id), optionName: String(o.name || '') }
      }
    }
  }
  return null
}

/**
 * Heurística sin estado: ¿a qué grupo "se parece" este término?
 * Devuelve `null` si no hay señal clara.
 *
 * @param {string} term
 * @returns {{ groupName: string, confidence: number } | null}
 */
export function heuristicGroupFor(term) {
  const raw = String(term ?? '').trim()
  if (!raw) return null

  if (ZONE_REGEX.test(raw)) return { groupName: STD_GROUPS.ZONA, confidence: 0.9 }

  const lower = normalize(raw)
  const lowerNoAcc = normalizeAccents(raw)

  if (NUMERIC_SIZE_REGEX.test(raw)) {
    return { groupName: STD_GROUPS.TALLA, confidence: 0.7 }
  }

  for (const [groupName, terms] of Object.entries(SEED_TERMS)) {
    for (const seed of terms) {
      if (lower === seed || lowerNoAcc === seed) {
        return { groupName, confidence: 0.8 }
      }
    }
  }

  return null
}

/**
 * Clasifica un término nuevo o existente en la entrada de alta rápida.
 *
 * @param {string} term
 * @param {Array<any>} groups - Datos del cuaderno actual
 * @returns {{ type: 'match', groupId: number, optionId: number, groupName: string } |
 *           { type: 'suggest', groupName: string, groupId?: number } |
 *           { type: 'unknown' }}
 */
export function classifyTerm(term, groups) {
  const exact = findMatchInCuaderno(term, groups)
  if (exact) {
    return {
      type: 'match',
      groupId: exact.groupId,
      groupName: exact.groupName,
      optionId: exact.optionId,
    }
  }

  const guess = heuristicGroupFor(term)
  if (guess && guess.confidence > 0.5) {
    const existingGroup = (groups || []).find(
      (g) => normalizeAccents(g?.name) === normalizeAccents(guess.groupName)
    )
    return {
      type: 'suggest',
      groupName: guess.groupName,
      groupId: existingGroup ? Number(existingGroup.id) : undefined,
    }
  }

  return { type: 'unknown' }
}

/** Lista de grupos estándar para mostrar al usuario cuando no hay match ni heurística. */
export const STANDARD_GROUP_CHOICES = [
  STD_GROUPS.TIPO,
  STD_GROUPS.MATERIAL,
  STD_GROUPS.TALLA,
  STD_GROUPS.COLOR,
  STD_GROUPS.MARCA,
  STD_GROUPS.ZONA,
  STD_GROUPS.PERFUME,
  STD_GROUPS.COSMETICO,
  STD_GROUPS.CALZADO,
  STD_GROUPS.VOLUMEN,
]

export const STANDARD_GROUPS = STD_GROUPS

