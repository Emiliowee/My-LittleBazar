# 4 · Arquitectura del sistema

[← Instalación](03-instalacion-y-actualizaciones.md) · [Índice](README.md) · [Siguiente: Modelo de datos →](05-modelo-de-datos.md)

---

## 4.1 Visión de conjunto

My Little Bazar es una app **Electron**. Eso significa que combina:

- un **proceso principal** (Node.js) que tiene acceso al sistema operativo, a la
  base de datos y a la impresora;
- uno o más **procesos de renderizado** (Chromium) que muestran la interfaz,
  escrita en **React**.

Los dos mundos no se hablan directamente: se comunican por **IPC** (mensajes) a
través de un **puente seguro** (`preload`). Así la interfaz nunca toca el disco ni
la base de datos por su cuenta; siempre pide al proceso principal.

```
┌──────────────────────────────────────────────────────────────┐
│  Proceso principal (Node)   electron/main.cjs                  │
│  • Crea las ventanas                                           │
│  • Registra los manejadores IPC (ipcMain.handle)              │
│  • Abre la base SQLite (better-sqlite3)  → electron/database.cjs│
│  • Imprime (pdf-to-printer), elige archivos, auto-update       │
└───────────────▲───────────────────────────────┬──────────────┘
                │  IPC (canales con nombre)       │
        window.bazar.*  (contextBridge)           │
                │                                  ▼
┌───────────────┴───────────────┐   ┌─────────────────────────────┐
│ Ventana principal (Chromium)  │   │ Ventana del PDV (Chromium)  │
│ React · src/App.jsx           │   │ React · #pdv · src/PdvView  │
│ Inicio, Inventario, Saldos,   │   │ Cobro, fiar, devoluciones,  │
│ Reportes, Etiquetas, Ajustes  │   │ consultar ventas            │
└───────────────────────────────┘   └─────────────────────────────┘
        preload: electron/preload.cjs (expone window.bazar)
```

## 4.2 Procesos y archivos clave

| Archivo | Rol |
|---------|-----|
| `electron/main.cjs` | **Proceso principal.** Crea ventanas, registra todos los `ipcMain.handle(...)`, configura impresión, auto-update y respaldo. |
| `electron/preload.cjs` | **Puente seguro.** Con `contextBridge` expone `window.bazar` al renderer: `db.*`, `saldos.*`, `reportes.*`, `settings.*`, `clipboard.*`, `window.*`, etc. Es la **única** superficie de contacto. |
| `electron/database.cjs` | **Acceso a datos.** Abre SQLite, corre migraciones, expone funciones de negocio (ventas, productos, vales, etc.). |
| `electron/monserrat-path.cjs` | Resuelve **dónde** está la base de datos. |
| `electron/*-store.cjs` | Almacenes auxiliares: `settings-store`, `label-templates-store`, `saldos-store`. |
| `src/App.jsx` | Raíz de la **ventana principal** (navegación entre módulos). |
| `src/views/PdvView.jsx` | Raíz de la **ventana del PDV**. |

## 4.3 Las dos ventanas

1. **Ventana principal** — el "back office": Inicio, Inventario, Saldos,
   Reportes, Etiquetas y Configuración. Sin marco nativo en Windows (barra propia
   `MlbChromeHeader`), opaca, con tema claro/oscuro.

2. **Ventana del Punto de Venta (PDV)** — se abre aparte para cobrar. Tiene su
   propio `index` (`#pdv`). Está separada para que vender sea una pantalla
   dedicada y a pantalla cómoda, independiente del back office.

### Comunicación entre ventanas

Cuando algo en el PDV afecta a Saldos (p. ej. fiar una venta) o viceversa, las
ventanas se sincronizan por tres vías:

- **IPC `bazar:cuentas-changed`** — aviso de que las cuentas de clientes cambiaron.
- **`localStorage` `navigate_to`** — para llevar al usuario a una sección con
  contexto (p. ej. PDV → módulo Saldos con productos importados).
- **Evento `mlb:settings-changed`** — cuando se guardan ajustes, las vistas
  refrescan en vivo (nombre, logo, impresora, etc.).

## 4.4 IPC: el contrato entre interfaz y sistema

Todo lo que la interfaz necesita del sistema pasa por canales con nombre. El
patrón es:

```
renderer:  window.bazar.db.getProducts(filtros)
preload:   ipcRenderer.invoke('db:getProducts', filtros)
main:      ipcMain.handle('db:getProducts', (_, filtros) => db.getProducts(filtros))
```

Familias de canales (espacios de nombres):

- **`db:*`** — productos, ventas, vales, inventario, ajustes de precio, etc.
- **`saldos:*`** — cuentas de clientes y movimientos (cargos/abonos).
- **`reportes:*`** — exportar PDF/CSV.
- **`settings:*`** — leer/guardar configuración.
- **`printers:*` / impresión** — listar impresoras, imprimir etiqueta/ticket.
- **`shell:*`** — abrir enlaces externos (WhatsApp) y carpetas (respaldos).
- **`window:*`** — minimizar/maximizar/cerrar la ventana sin marco.

> Hay una prueba **`audit:ipc`** que verifica que no queden cables IPC rotos
> (canales llamados desde el renderer sin manejador en main).

## 4.5 Capa de interfaz (renderer)

- **React 19 + Vite 6.** Vite compila el renderer a `dist/`; en desarrollo sirve
  con recarga en caliente (HMR).
- **Tailwind CSS 4** + un sistema de **tokens `--mlb-*`** (definidos en
  `src/index.css`). El tema se cambia poniendo `data-theme="light|dark"`; el
  modo oscuro es una paleta "Linear" (gris pizarra, no negro total). La ventana
  es **opaca**: el tema lo controla la app, no Windows
  (ver [capítulo 9](09-seguridad-y-privacidad.md) y el historial en
  [capítulo 12](12-estado-y-roadmap.md)).
- **Carga diferida (code-splitting).** El arranque solo carga el Inicio; las
  vistas pesadas (Inventario, Saldos, Reportes, Configuración, Editor de
  etiquetas) se descargan al abrirlas (`React.lazy` + `Suspense`). Esto reduce el
  *bundle* inicial ~30 %.
- **`motion`** para transiciones, **`lucide-react`** para íconos, **`sonner`**
  para avisos (toasts).

## 4.6 Persistencia

- **better-sqlite3**, síncrono y embebido — sin servidor. La librería es nativa y
  se recompila para Electron en el `postinstall` (`electron-rebuild`).
- Empaquetada **fuera del asar** (`asarUnpack`) junto con `bindings`,
  `file-uri-to-path` y `pdf-to-printer`, porque son binarios nativos que no pueden
  ejecutarse comprimidos dentro del asar.
- El detalle de tablas, migraciones e índices está en el
  [capítulo 5 · Modelo de datos](05-modelo-de-datos.md).

## 4.7 Empaquetado y entrega

- **electron-builder** produce el instalador **NSIS** de Windows x64.
- **electron-updater** da la auto-actualización leyendo `latest.yml` de la
  Release de GitHub.
- **GitHub Actions** (`release.yml`) compila y publica al empujar un tag `v*`.

Detalle del flujo en el [capítulo 3](03-instalacion-y-actualizaciones.md).

## 4.8 Pruebas

El proyecto trae ~20 *scripts* de prueba (`npm run test:*`) que cubren lo
crítico — sobre todo **el dinero**: ventas, crédito, saldos (motor y store),
devoluciones, cobro mixto, vales, eliminar venta, compras del cliente, ajuste de
precio, banqueta, reportes y migraciones. Más dos auditorías (`audit:ipc`,
`audit:sim`). Se corren con `npm run test:<nombre>`.

---

[← Instalación](03-instalacion-y-actualizaciones.md) · [Índice](README.md) · [Siguiente: Modelo de datos →](05-modelo-de-datos.md)
