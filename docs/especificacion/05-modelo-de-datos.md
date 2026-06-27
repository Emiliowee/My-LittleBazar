# 5 · Modelo de datos

[← Arquitectura](04-arquitectura.md) · [Índice](README.md) · [Siguiente: Módulos →](06-modulos.md)

---

Todo el negocio vive en **una base SQLite** (`monserrat.db`). Este capítulo
describe las tablas principales, cómo evolucionan (migraciones), qué índices
aceleran las consultas y cómo se respalda.

## 5.1 Mapa de tablas

### Inventario y catálogo

| Tabla | Qué guarda |
|-------|-----------|
| `productos` | Cada prenda/artículo: código, descripción, categoría, marca, precio, stock, `pieza_unica`, **estado** (`disponible` / `en_banqueta` / `desactivado`), fechas. |
| `tag_groups` | Grupos de propiedades estilo Notion (talla, color, material…), si entran en el precio, si son obligatorios. |
| `tag_options` | Valores de cada grupo (S/M/L, rojo, mezclilla…), con color e ícono. |
| `producto_tag` | Relación producto ↔ opción de tag. |
| `tag_price_combo` / `inv_pricing_rule` / `inv_pricing_rule_row` | Reglas de **precio sugerido** según categoría/marca/propiedades. |

### Ventas

| Tabla | Qué guarda |
|-------|-----------|
| `ventas` | La venta: total, método, montos por forma de pago (`monto_efectivo`, `monto_transferencia`, `monto_credito`, `monto_vale`), cuenta bancaria, vínculo a cuenta de Saldos si fue fiada, `created_at`. |
| `venta_items` | Renglones de la venta: producto, **snapshots** de código/nombre/precio (para que el ticket no cambie aunque el producto cambie después), cantidad, `devuelto_en`. |
| `vales` | Vales de devolución: código único, monto, monto usado, estado, origen, fecha de uso. |
| `intercambios` / `intercambio_items` | (Módulo de intercambios) cambios de prenda con diferencia. |

### Saldos (crédito a clientes)

| Tabla | Qué guarda |
|-------|-----------|
| `saldos_clientes` | El cliente/cuenta: nombre, teléfono, etiquetas, identificación, archivada o no. |
| `saldos_movimientos` | **El corazón del crédito.** Cada cargo, abono, descuento, ajuste o cargo por atraso. El saldo **se calcula** sumando esto; nunca se guarda como número. |
| `saldos_recordatorios` | Recordatorios de cobro por cliente. |

### Banqueta

| Tabla | Qué guarda |
|-------|-----------|
| `banqueta_salidas` | Una salida a vender afuera: estado (abierta/cerrada), fechas. |
| `banqueta_salida_items` | Qué prendas se llevaron, qué se vendió y a qué precio. |

### Etiquetas y otros

| Almacén | Qué guarda |
|---------|-----------|
| `label_template` *(JSON store)* | Plantillas del editor de etiquetas (`bazar-label-templates.json`). |
| `bazar-settings.json` *(JSON store)* | Configuración: nombre, logo, cuentas de cobro, impresora, regla de interés, tema, etc. |
| `cognitive_events` | Bitácora de eventos (ledger) que alimenta reportes y el asistente. |

### Tablas legadas (en desuso)

`clientes` y `credito_movimientos` son del **módulo viejo de crédito**, anterior
a Saldos. Siguen existiendo porque las referencia código dormido
(`addIntercambio`), pero **no** son la libreta activa. Ver
[capítulo 12](12-estado-y-roadmap.md).

## 5.2 Snapshots: por qué el ticket no miente

Cada renglón de venta (`venta_items`) guarda **copias** del código, nombre y
precio del producto **en el momento de la venta** (`codigo_snapshot`,
`nombre_snapshot`, `precio_snapshot`). Si después se renombra o re-precia el
producto, la venta histórica y su ticket **no cambian**. Esto es parte del
principio de *historia inmutable* ([capítulo 1](01-introduccion.md)).

## 5.3 Migraciones

El esquema evoluciona con **migraciones numeradas** controladas por el
`user_version` de SQLite. Al abrir la base, la app aplica en orden las que falten:

| Migración | Qué introduce |
|-----------|---------------|
| `001_bazar_mixto_v1.sql` | Base de productos + índices de categoría/marca/paca. |
| `002_saldos_v1.sql` | Tablas de Saldos v1 (clientes + movimientos) e índices. |
| `003_saldos_v2.sql` | Foto de identificación, etiquetas de cliente, recordatorios. |
| `004_devoluciones_detalle.sql` | Detalle de devoluciones (`devuelto_en`) e índices. |

> **Regla dura del proyecto:** toda columna nueva va en una **migración
> numerada**, nunca agregada a mano en código de arranque. Romper esta regla ya
> causó una vez un *crash* en instalación nueva (columna duplicada). Detalle en
> [capítulo 12](12-estado-y-roadmap.md).

## 5.4 Índices

Los índices hacen que las consultas no se vuelvan lentas cuando se acumulan
meses de datos. Los principales:

- `productos`: `codigo`, `estado`, `categoria`, `marca`, `paca_id`.
- `ventas`: **`created_at`** (reportes y "consultar ventas por día").
- `venta_items`: `venta_id`, **`producto_id`** ("lo que se llevó" / compras del cliente).
- `vales`: `codigo`.
- `saldos_movimientos`: `cliente_id`; `saldos_clientes`: `archivada`.
- `banqueta_salidas`: `estado`; `banqueta_salida_items`: `salida_id`.

> Los dos índices en **negrita** se agregaron en la v1.0.4 como mejora de
> rendimiento ([capítulo 12](12-estado-y-roadmap.md)).

## 5.5 Respaldos

- **Automático:** al abrir la base, una vez al día, se copia `monserrat.db` a
  `backups/monserrat_backup_AAAA-MM-DD.db`. Se conservan los **últimos 30 días**
  (las copias más viejas se borran solas).
- **Acceso:** **Ajustes → Base de datos → "Abrir carpeta de respaldos"** abre la
  carpeta para copiar una copia a una USB o la nube manualmente.
- **Restaurar / mudar de equipo:** ver
  [capítulo 8 · Operación y mantenimiento](08-operacion-y-mantenimiento.md).

## 5.6 Integridad y exactitud

- **El dinero se calcula.** La deuda de un cliente = Σ cargos − Σ abonos sobre
  movimientos **vigentes** (los anulados no cuentan). No hay un campo "saldo" que
  se pueda descuadrar. Reglas exactas en el [capítulo 7](07-reglas-de-negocio.md).
- **Transacciones.** Las operaciones que tocan varias tablas (vender + descontar
  stock + registrar ingreso; fiar = cargo + enganche) se hacen de forma
  **atómica**: o se completa todo, o no se aplica nada.
- **Anular ≠ borrar.** Los movimientos se anulan marcándolos, conservando el
  rastro; no se eliminan físicamente.

---

[← Arquitectura](04-arquitectura.md) · [Índice](README.md) · [Siguiente: Módulos y funciones →](06-modulos.md)
