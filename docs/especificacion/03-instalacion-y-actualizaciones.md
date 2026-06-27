# 3 · Instalación y actualizaciones

[← Requisitos](02-requisitos-y-compatibilidad.md) · [Índice](README.md) · [Siguiente: Arquitectura →](04-arquitectura.md)

---

## 3.1 Instalar la app (computadora de la tienda)

1. Conseguir el instalador **`My-Little-Bazar-Setup-<versión>.exe`** (desde la
   página de *Releases* del repositorio en GitHub, o copiado en una USB).
2. Doble clic. El instalador es **NSIS, no silencioso**: deja **elegir la
   carpeta** de instalación y crea acceso directo en **Escritorio** y en el
   **Menú Inicio** con el nombre *My Little Bazar*.
3. La instalación es **por usuario** (no requiere administrador en el caso
   normal): `perMachine: false`.
4. Al terminar, abrir desde el acceso directo.

> Windows puede mostrar un aviso de **SmartScreen** ("editor desconocido")
> porque el instalador **no está firmado con certificado de código**. Es
> esperado: *Más información → Ejecutar de todas formas*. Firmar el ejecutable es
> una mejora futura (ver [capítulo 12](12-estado-y-roadmap.md)).

### Primer arranque

En la primera vez la app crea su base de datos vacía y siembra los datos base
(categorías, diccionario del clasificador de alta). Conviene de inmediato:

- Poner **nombre y logo** del bazar en **Ajustes → Mi bazar**.
- Registrar las **cuentas de cobro** en **Ajustes → Cobro** (las que aparecen al
  cobrar por transferencia).
- Elegir la **impresora** en **Ajustes → Impresión**.

El recorrido completo de uso está en la [Guía de uso](../MANUAL.md).

## 3.2 Dónde viven los datos

Con la app **instalada**, todo se guarda en la carpeta de datos del usuario de
Windows (Electron *userData*):

```
C:\Users\<usuario>\AppData\Roaming\My Little Bazar\
├── monserrat.db                 ← la base de datos (todo el negocio)
├── backups\                     ← respaldos automáticos diarios (30 días)
│   └── monserrat_backup_AAAA-MM-DD.db
├── saldos-identificaciones\     ← fotos de identificación de clientes
├── product_images\             ← imágenes de productos
├── bazar-settings.json          ← configuración (nombre, logo, cuentas, impresora…)
└── bazar-label-templates.json   ← plantillas del editor de etiquetas
```

> En **modo desarrollo** la base se ubica en una carpeta `data/` del proyecto
> (ver `electron/monserrat-path.cjs`). La variable de entorno
> `BAZAR_MONSERRAT_DB` permite forzar una ruta (las pruebas la usan).

Esta ubicación importa para **respaldar** y para **mudar de computadora**
(ver [capítulo 8](08-operacion-y-mantenimiento.md)).

## 3.3 Actualizaciones automáticas

Desde la versión **1.0.2**, la app se **actualiza sola**:

- Al abrir (y luego cada 6 horas), busca si hay una versión más nueva publicada
  en **GitHub Releases**.
- Si la hay, la **descarga en segundo plano** y la **instala al cerrar** la app.
  No hay que reinstalar a mano.
- Si no hay internet o falla, no pasa nada: la app sigue funcionando con la
  versión actual (los errores del actualizador son silenciosos).

Mecánica interna: `electron-updater` lee el `latest.yml` que `electron-builder`
publica junto al `.exe` en la Release. Solo corre en la app **empaquetada**
(`app.isPackaged`), nunca en desarrollo.

## 3.4 Publicar una versión nueva (desarrollo)

El proceso para sacar una versión y que llegue a la tienda por auto-update:

1. Subir el número de versión en `package.json` (`"version": "X.Y.Z"`).
2. Hacer commit.
3. Crear y empujar el **tag**: `git tag vX.Y.Z && git push origin vX.Y.Z`.
4. El workflow **`.github/workflows/release.yml`** se dispara con el tag `v*`,
   compila en `windows-latest` y ejecuta `electron-builder --publish always`
   con el `GITHUB_TOKEN`, subiendo a la Release: el **`.exe`**, **`latest.yml`** y
   **`.blockmap`**.
5. Las computadoras con la app instalada detectan la Release y se actualizan
   solas.

> **Por qué CI y no compilar local:** en Windows sin Modo de programador,
> `electron-builder` falla al extraer `winCodeSign` por un *symlink* que requiere
> privilegio. El runner de GitHub sí lo tiene. Por eso el instalador oficial
> **siempre** sale de CI.

### Versionado

Se usa **SemVer** (`MAYOR.MENOR.PARCHE`):

- **PARCHE** (1.0.4 → 1.0.5): correcciones y ajustes que no cambian el flujo.
- **MENOR** (1.0.x → 1.1.0): funciones nuevas compatibles.
- **MAYOR** (1.x → 2.0.0): cambios grandes o incompatibles.

## 3.5 Desinstalar

Desde **Configuración de Windows → Aplicaciones → My Little Bazar →
Desinstalar**, o con el desinstalador del Menú Inicio.

> ⚠️ **La desinstalación no borra los datos** de
> `AppData\Roaming\My Little Bazar\` por seguridad. Si se quiere empezar de cero,
> borrar esa carpeta a mano (¡tras respaldar!). Para mudar de equipo, ver
> [capítulo 8](08-operacion-y-mantenimiento.md).

---

[← Requisitos](02-requisitos-y-compatibilidad.md) · [Índice](README.md) · [Siguiente: Arquitectura del sistema →](04-arquitectura.md)
