<div align="center">

<img src="public/branding/rose_icon.png" width="96" alt="My Little Bazar" />

# My Little Bazar

**Punto de venta e inventario para una boutique real.**
Vender, fiar, abonar, etiquetar e inventariar — pensado para usarse rápido en el mostrador.

</div>

---

## ¿Qué es?

Aplicación de escritorio (Windows) para una tienda de ropa: punto de venta, inventario,
crédito a clientes (la "libreta" de Saldos), banqueta, etiquetas e informes. Todo es
**local**: los datos viven en la computadora de la tienda, sin nube ni internet.

- **Punto de venta (PDV)** — cobro en efectivo/transferencia, pago mixto, vales y **fiar**.
- **Saldos** — la libreta digital: quién debe, qué se llevó, abonos, saldo a favor e interés por atraso.
- **Inventario** — alta rápida (un solo campo), precio sugerido por categoría+marca, etiquetas con código de barras.
- **Banqueta** — sacar mercancía a vender afuera y reconciliar lo vendido.
- **Reportes** — corte del día y análisis, exportables a PDF.

---

## Requisitos

- **Windows 10/11** (la app se entrega como instalador `.exe`).
- Para desarrollar/compilar: **Node.js 20–24** y **npm**.

---

## Desarrollo

```bash
npm install        # instala dependencias y recompila better-sqlite3 para Electron
npm run dev        # levanta Vite + Electron con recarga en caliente
```

> Si cambias algo en `electron/main.cjs` o `electron/preload.cjs`, **reinicia Electron**
> (cierra la ventana y vuelve a `npm run dev`): el HMR solo recarga la interfaz, no el proceso principal.

### Scripts útiles

| Script | Qué hace |
|---|---|
| `npm run dev` | Desarrollo (Vite + Electron) |
| `npm run build:vite` | Compila solo la interfaz (sin empaquetar) |
| `npm run build` | Genera el instalador de Windows (ver abajo) |
| `npm run lint` | ESLint |
| `npm test:*` | Pruebas (ver "Pruebas") |

---

## Generar el instalador (`.exe`)

```bash
npm run build
```

Esto compila la interfaz y empaqueta con **electron-builder**; el instalador queda en
`release/My-Little-Bazar-Setup-1.0.0.exe`.

> [!IMPORTANT]
> **En Windows, la primera vez falla por permisos de symlink** (electron-builder extrae
> herramientas de firma que traen enlaces de macOS). Es un tropiezo conocido. Soluciones:
>
> 1. **Activar el Modo de programador** (recomendado, una sola vez):
>    *Configuración → Privacidad y seguridad → Para programadores → Modo de programador → Activado.*
>    Luego corre `npm run build` normal.
> 2. **O** ejecutar la terminal **como Administrador** y correr `npm run build`.
> 3. **O** dejar que lo compile **CI** (ver abajo) — así no dependes de tu máquina.

### Compilar en CI (forma profesional)

El repositorio incluye un workflow de GitHub Actions ([.github/workflows/release.yml](.github/workflows/release.yml))
que compila el instalador en `windows-latest` (donde el permiso de symlink ya existe) y lo
publica como artefacto. Para sacar una versión:

```bash
# subí la versión en package.json (p. ej. 1.0.3) y luego:
git tag v1.0.3
git push origin v1.0.3      # el CI compila y PUBLICA el .exe + latest.yml en Releases
```

También puedes lanzarlo a mano desde la pestaña **Actions → Build installer → Run workflow**.

### Actualizaciones automáticas (electron-updater)

La app instalada **se actualiza sola**. Al abrir, busca una versión más nueva en
**GitHub Releases**, la descarga en segundo plano y la instala al cerrar — sin
reinstalar a mano. Cómo funciona el ciclo:

1. Subís `version` en `package.json` y empujás un tag `vX.Y.Z`.
2. El CI compila y **publica** en Releases el `.exe`, el `latest.yml` y el `.blockmap`
   (electron-builder con `--publish always`; los metadatos los lee el updater).
3. La caja de la tienda detecta la versión nueva al abrir y se actualiza sola.

> El auto-update funciona **a partir de la v1.0.2** (la primera que lo incluye). La
> tienda instala esa una vez; de ahí en adelante, todo es automático.

---

## Pruebas

La lógica delicada (dinero, fiado, devoluciones, vales, reportes) está cubierta con pruebas
ejecutables contra el backend real:

```bash
npm run test:escenarios       # situaciones "locas" de saldo a favor / vales / fiado
npm run test:cobro            # cobro mixto + cambio
npm run test:eliminar-venta   # borrar venta (revierte stock y saldos)
npm run test:devoluciones     # devoluciones (efectivo / vale / fiado)
npm run test:fiado-saldos     # fiar contra la libreta de Saldos
# … y más: test:venta, test:vales, test:banqueta, test:reportes, test:ajuste-precio,
#   test:compras-cliente, test:saldos, test:migrations, audit:ipc, audit:sim
```

---

## Estructura

```
electron/            Proceso principal, preload, base de datos (SQLite) y migraciones
  database.cjs       Acceso a datos: ventas, saldos, inventario, vales, devoluciones
  main.cjs           Ventanas, IPC, impresión
  preload.cjs        Puente seguro (window.bazar.*)
  migrations/        Esquema versionado de la base
src/
  views/             Pantallas (PDV, Saldos, Inventario, Reportes, Etiquetas…)
  lib/               Lógica pura (motor de saldos, reportes, formato, etiquetas)
  components/        UI reutilizable
scripts/             Pruebas y auditorías ejecutables
build/               Recursos del instalador (icono)
docs/MANUAL.md       Guía de uso para la tienda
docs/especificacion/ Especificación técnica y funcional (el "libro" del sistema)
```

---

## Documentación

- **[Especificación técnica y funcional](docs/especificacion/README.md)** — el
  "libro" completo del sistema: visión, **requisitos y compatibilidad**,
  instalación, arquitectura, modelo de datos, módulos, **reglas de negocio del
  dinero**, operación/respaldos, seguridad, solución de problemas, glosario y
  estado/roadmap (12 capítulos).
- **[Guía de uso (MANUAL)](docs/MANUAL.md)** — cómo se usa día a día en la tienda
  ("El día completo").

---

## Privacidad

Todo es local. La base de datos y las fotos de identificación se guardan solo en la
computadora de la tienda (`%APPDATA%`), nunca se suben a internet.
