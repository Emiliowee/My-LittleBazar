# 2 · Requisitos y compatibilidad

[← Introducción](01-introduccion.md) · [Índice](README.md) · [Siguiente: Instalación →](03-instalacion-y-actualizaciones.md)

---

Este capítulo dice **qué necesita** la app para correr bien y **con qué hardware**
es compatible. Hay dos escenarios distintos: la **computadora de la tienda**
(donde se usa la app instalada) y la **computadora de desarrollo** (donde se
compila el instalador).

## 2.1 Requisitos de la computadora de la tienda

Estos son los requisitos para **usar** la app ya instalada.

### Mínimos (funciona)

| Componente | Mínimo |
|------------|--------|
| **Sistema operativo** | Windows 10 64-bit (versión 1809 o posterior) |
| **Arquitectura** | x64 (64 bits) — *no* hay build de 32 bits ni ARM |
| **Procesador** | Doble núcleo, 1.6 GHz (cualquier PC de los últimos ~8 años) |
| **Memoria RAM** | 4 GB |
| **Disco** | 600 MB libres para la app + espacio para datos y respaldos |
| **Pantalla** | 1280 × 720; la ventana principal pide 760 × 600 como mínimo |
| **Internet** | No requerido para operar; sí para recibir actualizaciones |

### Recomendados (cómodo y fluido)

| Componente | Recomendado |
|------------|-------------|
| **Sistema operativo** | Windows 11 64-bit al día |
| **Procesador** | Cuatro núcleos |
| **Memoria RAM** | 8 GB |
| **Disco** | SSD con 2 GB libres (la base y los respaldos crecen con los meses) |
| **Pantalla** | 1920 × 1080 (Full HD); el punto de venta luce mejor con ancho generoso |
| **Periféricos** | Lector de código de barras USB + impresora de etiquetas/tickets |

> **Sobre el disco:** la base de datos es pequeña (megabytes), pero los
> **respaldos diarios** se acumulan hasta 30 copias. Si se manejan muchas fotos
> de identificación de clientes, conviene holgura. Ver
> [capítulo 8](08-operacion-y-mantenimiento.md).

## 2.2 Sistemas operativos

| SO | Estado | Notas |
|----|--------|-------|
| **Windows 11 (x64)** | ✅ Soportado (recomendado) | Plataforma principal de entrega. |
| **Windows 10 (x64)** | ✅ Soportado | Funciona igual; algunos efectos visuales de Win11 no aplican. |
| **Windows 7 / 8** | ❌ No soportado | Electron 41 ya no corre ahí. |
| **macOS** | ⚠️ Solo desarrollo | El código contempla macOS (DMG, titlebar nativa), pero el producto se entrega para Windows. No es un objetivo de release. |
| **Linux** | ⚠️ Parcial | El código corre en Linux para desarrollo; no hay instalador oficial. |

La app se entrega como **instalador `.exe` (NSIS)** de 64 bits llamado
`My-Little-Bazar-Setup-<versión>.exe`.

## 2.3 Compatibilidad de hardware

### 2.3.1 Lector de código de barras (escáner)

- **Tipo soportado:** cualquier lector USB que funcione como **teclado HID**
  (*keyboard wedge*) — es el tipo más común y barato. El lector "teclea" el
  código y un Enter al final; la app lo captura como si se hubiera escrito.
- **No requiere driver especial** ni configuración en la app: se conecta y
  funciona en el punto de venta y en el alta de productos.
- La app incluye un **arreglo de mapa de teclado** para escáneres que envían
  caracteres con la distribución equivocada (hook `useScannerKeymapFix`), de modo
  que los códigos se lean correctos aunque el escáner esté en otra distribución.
- **Simbologías:** se generan e imprimen códigos **Code128** (vía `bwip-js` /
  `jsbarcode`). El lector debe poder leer Code128 (todos los lectores 1D lo hacen).

### 2.3.2 Impresora de etiquetas y tickets

La impresión usa **`pdf-to-printer`** en Windows: la app arma un PDF y lo manda a
la cola de impresión de la impresora elegida en Configuración.

| Tipo de impresora | Compatibilidad |
|-------------------|----------------|
| **Térmica de etiquetas** (rollo, p. ej. estilo Zebra/marcas genéricas) | ✅ Compatible si tiene **driver de Windows** instalado. El tamaño de etiqueta se define en el Editor de etiquetas. |
| **Térmica de tickets** (58/80 mm) | ✅ Compatible con driver de Windows. |
| **Impresora normal (láser/tinta) en hoja Carta** | ✅ Usada para reportes en PDF (hoja Carta) y como respaldo. |
| **Impresora sin driver / solo por app del fabricante** | ⚠️ Puede no aparecer en la lista; necesita driver estándar de Windows. |

**Comportamiento ante fallo:** si la impresora elegida falla, la app **no se
cuelga**: abre el PDF como respaldo y avisa con un mensaje para que se imprima a
mano o se elija otra impresora. La impresora predeterminada se configura en
**Ajustes → Impresión**.

### 2.3.3 Pantalla y resolución

- Mínimo funcional: **1280 × 720**. La ventana principal exige **760 × 600**.
- El punto de venta abre en **ventana propia** y aprovecha pantallas anchas.
- Hay **modo claro y oscuro**; el tema lo controla la app, no Windows.
- Soporta escalado de Windows (125 %, 150 %) sin romper el diseño.

### 2.3.4 Cajón de dinero, báscula, terminal bancaria

- **Cajón de dinero:** no hay integración directa. Los cajones que se abren por la
  impresora de tickets (pulso RJ11) se disparan al imprimir, según el driver.
- **Báscula:** no soportada (es una tienda de ropa, no de a granel).
- **Terminal bancaria (TPV):** no integrada. El pago con tarjeta/transferencia se
  **registra** en la venta, pero el cobro físico lo hace el banco por separado.

## 2.4 Requisitos para desarrollar / compilar

Solo aplican a quien trabaje el código fuente.

| Herramienta | Versión | Para qué |
|-------------|---------|----------|
| **Node.js** | **20 a 24** (`>=20 <25`) | Ejecutar Vite, Electron y las pruebas |
| **npm** | El que viene con Node | Instalar dependencias |
| **Git** | Cualquiera reciente | Control de versiones y publicar (tags) |
| **Windows** | 10/11 x64 | Compilar el instalador NSIS de Windows |

Dependencias nativas: **`better-sqlite3`** se recompila para Electron en el
`postinstall` (`electron-rebuild`). Si falla, ver
[capítulo 10](10-solucion-de-problemas.md).

> **Nota de compilación local:** generar el `.exe` en una PC Windows sin **Modo de
> programador** (o sin permisos de administrador) falla por un problema de
> *symlinks* de `winCodeSign`. Por eso el instalador oficial se compila en
> **CI (GitHub Actions, runner `windows-latest`)**. Detalle en
> [capítulo 3](03-instalacion-y-actualizaciones.md) y
> [capítulo 12](12-estado-y-roadmap.md).

## 2.5 Stack tecnológico (resumen de versiones)

| Capa | Tecnología | Versión |
|------|-----------|---------|
| Runtime de escritorio | Electron | 41 |
| UI | React + React DOM | 19 |
| Bundler / dev server | Vite | 6 |
| Estilos | Tailwind CSS | 4 |
| Base de datos | better-sqlite3 (SQLite) | 12 |
| Animación | motion (Framer Motion) | 12 |
| Íconos | lucide-react | — |
| PDF | pdf-lib | 1.17 |
| Impresión | pdf-to-printer | 5 |
| Código de barras | bwip-js / jsbarcode / react-barcode | — |
| Auto-actualización | electron-updater | 6 |
| Empaquetado | electron-builder (NSIS) | 26 |

El detalle de cómo encajan estas piezas está en el
[capítulo 4 · Arquitectura](04-arquitectura.md).

---

[← Introducción](01-introduccion.md) · [Índice](README.md) · [Siguiente: Instalación y actualizaciones →](03-instalacion-y-actualizaciones.md)
