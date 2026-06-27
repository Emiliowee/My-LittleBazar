# 7 · Reglas de negocio (el dinero)

[← Módulos](06-modulos.md) · [Índice](README.md) · [Siguiente: Operación →](08-operacion-y-mantenimiento.md)

---

Este es el capítulo más importante. Define **las reglas exactas del dinero**.
Están respaldadas por la suite de pruebas (`test:cobro`, `test:fiado-saldos`,
`test:devoluciones`, `test:vales`, `test:escenarios`, `test:eliminar-venta`…),
que verifica que el comportamiento descrito aquí se cumple.

> **Principio rector:** el saldo de un cliente nunca se guarda como número. Se
> **calcula** = Σ cargos − Σ abonos sobre movimientos **vigentes** (los anulados
> no cuentan). Esto hace imposible descuadrar la libreta a mano.

## 7.1 Cobro

Una venta se puede pagar de tres formas, combinables:

- **Efectivo** — se captura lo recibido y la app calcula el **cambio**.
- **Transferencia** — se elige a qué **cuenta** entró (las de Ajustes → Cobro).
- **Pago mixto** — parte en efectivo y parte en transferencia. La suma debe
  cubrir el total.

Al cobrar:

1. Se registra la **venta** y sus **renglones** con *snapshots* de precio.
2. Se **descuenta el stock** (o se marca la pieza única como vendida).
3. Queda el **ingreso** registrado para reportes.

Todo esto es **atómico**: si algo falla, no se aplica nada.

## 7.2 Fiar (venta a crédito)

Fiar convierte (parte de) una venta en **deuda** del cliente, registrada en
**Saldos**.

- Requiere **elegir o crear** un cliente.
- **Enganche opcional:** se puede recibir un pago inicial. El enganche está
  **topado**: nunca puede ser mayor que el total a fiar (no genera cambio ni
  saldo a favor).
- Al fiar se crea un **cargo** por el monto fiado y, si hubo enganche, un **abono**
  por el enganche, en la misma operación atómica.
- La venta fiada queda **vinculada** a la cuenta del cliente (para poder
  rastrearla y, si hace falta, revertirla).
- **Una sola libreta:** el fiado hecho desde el PDV vive en Saldos, no en una
  libreta paralela.

## 7.3 Abonos

Un abono es un pago que reduce la deuda.

- Crea un **movimiento de abono** en la cuenta.
- **Un abono nunca genera saldo a favor.** Si alguien paga de más, el exceso no
  se convierte en "favor" automáticamente (ver 7.4). El abono se topa a lo que se
  debe.

## 7.4 Saldo a favor

El "saldo a favor" es dinero que la tienda le debe al cliente (a su favor).

- **Solo nace de devoluciones** (cuando se devuelve algo de una compra con cuenta
  y el cliente decide dejarlo a favor). **No** nace de abonos ni de enganches.
- Se **aplica con un switch** (interruptor) en el cobro/fiar: el usuario decide si
  usar el favor disponible en esa operación.
- En **pago mixto**, el saldo a favor se aplica **primero**, y el efectivo de más
  se devuelve como cambio.
- En el **fiar**, el motor **netea** la cuenta, de modo que el switch "usar favor"
  no cambia el resultado final del fiado (es una decisión de diseño conocida).

## 7.5 Interés por atraso

Cargo opcional cuando una deuda se pasa de cierto plazo.

- Se configura una **regla**: días de gracia + porcentaje (`saldosConfig:
  {diasAtraso, porcentajeAtraso}`; la vista divide el porcentaje entre 100).
- Modo **sugerido**: la app avisa que toca interés y propone el cargo; el usuario
  decide aplicarlo.
- Modo **automático** (configurable): el cargo por atraso se aplica según la regla
  sin intervención.
- En la hoja del cliente hay una **cuenta regresiva** hasta que aplique interés.
- El interés es un **movimiento más** (cargo por atraso), por lo que entra en el
  cálculo del saldo como cualquier otro.

## 7.6 Devoluciones

Devolver afecta **cuatro cosas a la vez**, de forma consistente:

1. **Dinero** — se reintegra el valor (efectivo, a favor o como **vale**, según el
   caso).
2. **Stock** — la prenda vuelve a estar **disponible** (se revierte el descuento).
3. **Reporte** — la devolución queda reflejada (ajustes dentro de las ventas).
4. **Cuenta del cliente** — si la compra era fiada, la deuda baja correctamente.

Casos cubiertos por pruebas:

- Devolución en **efectivo** de una compra pagada.
- Devolución **sin cuenta** → genera un **vale** (7.7).
- Devolución de una compra **fiada** → ajusta la deuda **sin doble pérdida** (un
  error histórico, ya corregido y con guardas).
- **Intercambio** de prendas pagadas (cambiar una por otra con diferencia); el
  fiado se maneja como devolución + nueva venta.

## 7.7 Vales

- Se **generan** al devolver **sin cuenta**: el valor se entrega como vale con
  **código único**.
- Se **usan solo en compras** (como forma de pago), nunca como efectivo.
- **Canje total o parcial:** si el vale vale más que la compra, queda saldo en el
  vale; si vale menos, se completa con otra forma de pago.
- Un vale **agotado** o **inexistente/falso** es **rechazado**.
- Se ven y copian desde Saldos y desde el PDV.

## 7.8 Eliminar una venta

Eliminar una venta **revierte todo lo que provocó**, de forma atómica:

- Devuelve el **stock** de sus renglones (las prendas vuelven a disponible).
- Revierte los **movimientos de Saldos** asociados (si era fiada, la cuenta queda
  limpia).
- Quita el **ingreso** de los reportes.

Es una acción delicada: la interfaz la señala y pide confirmación.

## 7.9 Estados del producto

Un producto tiene un **estado** que gobierna dónde aparece:

| Estado | Significado |
|--------|-------------|
| `disponible` | En inventario, se puede vender. |
| `en_banqueta` | Salió a vender afuera; no estorba el inventario principal. |
| `desactivado` | Fuera de circulación (no se borra, se oculta). |

La navegación normal del inventario muestra solo `disponible`; banqueta y
desactivados se ven con filtros.

## 7.10 Invariantes (lo que SIEMPRE debe cumplirse)

- El saldo de un cliente = Σ cargos − Σ abonos (vigentes). Nunca un número suelto.
- Una venta nunca descuenta stock dos veces, ni una devolución lo reintegra dos
  veces.
- El enganche ≤ total a fiar.
- Un vale no se puede usar por más de su saldo disponible.
- Anular ≠ borrar: los movimientos conservan rastro.
- Toda operación multi-tabla es atómica.

> Si una contribución futura rompe cualquiera de estas invariantes, **las pruebas
> deben fallar**. Si no fallan, falta una prueba.

---

[← Módulos](06-modulos.md) · [Índice](README.md) · [Siguiente: Operación y mantenimiento →](08-operacion-y-mantenimiento.md)
