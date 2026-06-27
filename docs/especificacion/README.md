<div align="center">

<img src="../../public/branding/rose_icon.png" width="96" alt="My Little Bazar" />

# My Little Bazar — Especificación técnica y funcional

**El libro del sistema.** Qué es, cómo está hecho, qué necesita para correr,
con qué es compatible y bajo qué reglas opera.

*Versión del documento: 1.0 · Corresponde a la app v1.0.4 · Junio 2026*

</div>

---

## Cómo leer este libro

Este documento es la **referencia completa** del producto. Está escrito para tres
lectores:

- **La dueña / operaria** — capítulos 1, 7 (reglas de negocio), 8 (operación) y
  10 (solución de problemas) están en lenguaje llano. Para el uso diario,
  además, existe la [Guía de uso](../MANUAL.md) ("El día completo").
- **Soporte técnico / quien instale o mude el equipo** — capítulos 2
  (requisitos), 3 (instalación), 8 (mantenimiento/respaldos) y 10 (problemas).
- **Quien programe o continúe el desarrollo** — capítulos 4 (arquitectura),
  5 (modelo de datos), 6 (módulos), 9 (seguridad) y 12 (estado y roadmap).
  El [README técnico](../../README.md) cubre el arranque rápido de desarrollo.

No hace falta leerlo de corrido. Cada capítulo se sostiene por sí solo y enlaza
a los demás cuando hace falta.

---

## Índice

| # | Capítulo | Para quién | Qué responde |
|---|----------|-----------|--------------|
| 1 | [Introducción y visión](01-introduccion.md) | Todos | Qué es, para quién, qué filosofía lo guía |
| 2 | [Requisitos y compatibilidad](02-requisitos-y-compatibilidad.md) | Soporte / técnico | Qué computadora, qué impresora, qué escáner |
| 3 | [Instalación y actualizaciones](03-instalacion-y-actualizaciones.md) | Soporte / técnico | Cómo se instala, cómo se actualiza sola, cómo se muda |
| 4 | [Arquitectura del sistema](04-arquitectura.md) | Desarrollo | Cómo está construido por dentro |
| 5 | [Modelo de datos](05-modelo-de-datos.md) | Desarrollo | Qué se guarda, dónde y cómo |
| 6 | [Módulos y funciones](06-modulos.md) | Todos | Qué hace cada parte de la app |
| 7 | [Reglas de negocio](07-reglas-de-negocio.md) | Todos | Las reglas exactas del dinero |
| 8 | [Operación y mantenimiento](08-operacion-y-mantenimiento.md) | Soporte / dueña | Respaldos, cambio de equipo, día a día |
| 9 | [Seguridad y privacidad](09-seguridad-y-privacidad.md) | Todos | Dónde viven los datos y quién los ve |
| 10 | [Solución de problemas](10-solucion-de-problemas.md) | Todos | Qué hacer cuando algo falla |
| 11 | [Glosario](11-glosario.md) | Todos | Qué significa cada palabra del negocio |
| 12 | [Estado, deuda técnica y roadmap](12-estado-y-roadmap.md) | Desarrollo | Qué ya está, qué falta, cómo publicar |

---

## Resumen de una página

**My Little Bazar** es una aplicación de **escritorio para Windows** que combina
punto de venta, inventario, libreta de crédito ("Saldos"), etiquetas con código
de barras, banqueta y reportes para una boutique de ropa real.

- **100% local.** Los datos viven en la computadora de la tienda, en una base
  **SQLite**. No hay nube, no hay servidor, no necesita internet para operar.
- **Dinero exacto.** Toda la deuda y los saldos se calculan a partir de
  movimientos inmutables (cargos y abonos), nunca como un número editable suelto.
  Hay una **suite de pruebas** que verifica el dinero de punta a punta.
- **Rápida en el mostrador.** Alta de productos en un solo campo, cobro con
  lector de códigos, fiar y abonar en pocos toques.
- **Se actualiza sola.** El instalador trae auto-actualización: al publicar una
  versión nueva, la app la descarga e instala en el siguiente cierre.
- **Respaldo automático.** Cada día guarda una copia de la base (se conservan
  los últimos 30 días).

Construida con **Electron + React 19 + Vite + better-sqlite3**, empaquetada con
**electron-builder** (instalador NSIS) y publicada vía **GitHub Releases** con
**electron-updater**.

> Documentos hermanos: [Guía de uso](../MANUAL.md) (cómo usarla día a día) ·
> [README técnico](../../README.md) (cómo desarrollar y compilar).
