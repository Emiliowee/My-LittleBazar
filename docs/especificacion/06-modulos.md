# 6 · Módulos y funciones

[← Modelo de datos](05-modelo-de-datos.md) · [Índice](README.md) · [Siguiente: Reglas de negocio →](07-reglas-de-negocio.md)

---

La app está organizada en **módulos**. Unos son **core** (siempre presentes,
parte del producto base) y otros son **opcionales / roadmap** (declarados en el
catálogo pero no necesariamente activos en la entrega actual). Esta sección
describe **lo que hace cada uno hoy**.

## 6.1 Mapa de módulos

| Módulo | Tipo | Estado en v1.0.4 |
|--------|------|------------------|
| **Inicio** | core | ✅ Activo |
| **Punto de venta (PDV)** | core | ✅ Activo (ventana propia) |
| **Inventario** | core | ✅ Activo |
| **Saldos** | core | ✅ Activo |
| **Etiquetas** | premium | ✅ Activo (editor + hub) |
| **Reportes** | free | ✅ Activo |
| **Configuración (Ajustes)** | core | ✅ Activo |
| **Banqueta** | free | ✅ Lógica activa; integrada en inventario/flujos |
| **Vales** | parte de PDV/Saldos | ✅ Activo |
| **Devoluciones / Intercambios** | premium | ✅ Devoluciones activas; intercambio acotado |
| **Cuaderno** | free | ⚙️ Datos activos (el alta aprende); vista dedicada retirada |
| **Asistente (IA)** | core (decl.) | 💤 Dormido (sin UI conectada) |
| **Importar Excel / Backups CSV / Temas / Vista 3D** | free/premium/soon | 🗺️ Roadmap (declarados, no entregados) |

> El catálogo completo (con precios y capacidades por módulo) vive en
> `src/lib/modules/registry.js`. El estado real de cada uno se detalla en el
> [capítulo 12](12-estado-y-roadmap.md).

---

## 6.2 Inicio

La pantalla de bienvenida y "caja a la que el sistema siempre vuelve".

- Saludo según la hora, nombre y logo del bazar (configurables).
- **Métricas del día:** productos disponibles, clientes con saldo, total por
  cobrar.
- **Atajos** a Punto de venta, Inventario y Saldos.
- **Últimos ingresos** (productos recién dados de alta).
- Hay un layout alternativo opcional ("manga", estilo vitrina) seleccionable por
  configuración; el predeterminado es el **sobrio**.

## 6.3 Punto de venta (PDV)

Ventana dedicada para cobrar rápido. Funciones:

- **Carrito** con lector de código de barras o búsqueda.
- **Formas de pago:** efectivo, transferencia y **pago mixto** (parte en efectivo,
  parte en transferencia), con teclado numérico y cálculo de cambio.
- **Cobro por transferencia:** se elige a qué **cuenta** entró (las de
  Ajustes → Cobro).
- **Fiar:** lanza el flujo de crédito (elegir/crear cliente, enganche opcional) y
  registra la deuda en Saldos. Una sola libreta, atómica.
- **Vales:** se pueden aplicar como pago; se generan al devolver sin cuenta.
- **Devoluciones** y **consultar ventas** (por día/turno, ver detalle, eliminar
  venta con reversa de stock y saldos).
- **Ticket** al cobrar (impresora o PDF).

Las reglas exactas del dinero están en el [capítulo 7](07-reglas-de-negocio.md).

## 6.4 Inventario

El catálogo de prendas. Funciones:

- **Alta rápida en un solo campo**, en lenguaje natural (ej. `AM 650 pantalón
  mezclilla`): un clasificador (~1275 términos sembrados) detecta categoría,
  marca, atributos y **sugiere precio** por categoría+marca.
- **Autollenado** de categoría con base sembrada + las configuradas + las usadas.
- **Búsqueda y filtros** (estado, categoría, stock, tipo de pieza).
- **Pieza única** vs **stock contado**.
- **Etiquetas automáticas** al guardar.
- **Ajuste de precios** por categoría/marca (en lote) y **clonar** producto.
- **Banqueta:** mandar a la banqueta no satura el inventario principal (se filtra
  por estado).

## 6.5 Saldos (la libreta de crédito)

La libreta digital de cuentas por cliente. Funciones:

- **Lista de clientes** con saldo, identificación y etiquetas.
- **Hoja del cliente** ("un mundo"): saldo grande, acciones (abonar, cargar,
  descuento, ajuste), historial de movimientos, **"lo que se llevó"** (qué compró,
  categoría y fecha) y **cuenta regresiva al interés**.
- **Abonar**, **fiar** (también desde aquí), **saldo a favor** (con switch),
  **interés por atraso** (configurable, con opción automática).
- **Identificación** del cliente (foto) — obligatoria al dar de alta (con opción
  "omitir con motivo"); las fotos viven localmente, nunca en internet.
- **WhatsApp manual** con plantillas (`{nombre}`, `{saldo}`, `{bazar}`).
- **Vales:** ver y copiar códigos.

Reglas de dinero: [capítulo 7](07-reglas-de-negocio.md).

## 6.6 Etiquetas

Editor de plantillas + galería:

- **Hub** de plantillas (galería con vista previa sobre prenda real).
- **Editor** estilo Figma (drag & drop): tamaño, fuente, **código de barras**
  (Code128), logo, propiedades del cuaderno, firma para fiado.
- **Rotación** de bloques respetada también en el PDF impreso.
- Imprime a impresora térmica o genera **PDF**.

## 6.7 Reportes

Lee la historia y la agrega. Cuatro reportes:

1. **Ventas** — tickets del periodo, método de pago, totales.
2. **Saldos pendientes** — quién debe, cuánto, identificación y etiquetas.
3. **Inventario activo** — existencias, estados, categorías, valor estimado.
4. **Prendas sin movimiento** — artículos quietos demasiados días (para promoción
   o banqueta).

Flujo de 3 pasos (elegir → configurar filtros → ver tabla) y **exportación a PDF
(hoja Carta) y CSV**. Acabado visual "glass" sobrio.

## 6.8 Configuración (Ajustes)

Estilo panel de ajustes con secciones:

- **Mi bazar** — nombre y logo (se reflejan en toda la app).
- **Cobro** — cuentas/tarjetas donde se recibe dinero (aparecen al cobrar).
- **Categorías** — emoji/ícono y color por categoría.
- **Apariencia** — tema Claro / Oscuro / Como Windows.
- **Impresión** — impresora predeterminada + editor de etiquetas.
- **Base de datos** — abrir carpeta de respaldos; reset de fábrica (zona de peligro).
- **Sistema** — información y reinicio de la introducción inicial.

## 6.9 Banqueta

Para vender **fuera del local**: registra qué mercancía se llevó, qué se vendió y
a qué precio, y reconcilia al cerrar. Las prendas en banqueta cambian de
**estado** y no estorban el inventario principal.

## 6.10 Vales

No es una pantalla aparte sino una función transversal:

- Se **generan** al hacer una devolución **sin cuenta** (se devuelve el valor como
  vale con código único).
- Se **ven y copian** en dos lugares: Saldos (🎟) y en el PDV
  ("Abonar y fiar → Ver vales").
- Se **usan** como pago en una compra (canje total o parcial).

## 6.11 Módulos dormidos y de roadmap

Declarados en el catálogo pero **no entregados/activados** en v1.0.4:

- **Cuaderno (vista):** el *aprendizaje* de tags y reglas de precio está activo
  (el inventario aprende solo), pero la **vista** dedicada del cuaderno se retiró.
- **Asistente (IA):** hay andamiaje (eventos, capa multi-proveedor) pero **sin UI
  conectada**: está dormido.
- **Importar Excel, Backups CSV (módulo), Temas visuales, Vista 2D/3D del
  local:** declarados como roadmap.

El detalle y la decisión pendiente sobre la capa IA están en el
[capítulo 12](12-estado-y-roadmap.md).

---

[← Modelo de datos](05-modelo-de-datos.md) · [Índice](README.md) · [Siguiente: Reglas de negocio →](07-reglas-de-negocio.md)
