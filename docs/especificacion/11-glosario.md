# 11 · Glosario

[← Solución de problemas](10-solucion-de-problemas.md) · [Índice](README.md) · [Siguiente: Estado y roadmap →](12-estado-y-roadmap.md)

---

Términos del negocio y del sistema, en orden alfabético.

### Abono
Pago que un cliente hace para **reducir** su deuda. Es un movimiento de la cuenta.
Un abono nunca genera saldo a favor (ver [Saldo a favor](#saldo-a-favor)).

### Banqueta
Vender **fuera del local** (en la calle, en un puesto). El sistema registra qué
mercancía salió, qué se vendió y a qué precio, y reconcilia al cerrar. Las prendas
en banqueta cambian de **estado** y no estorban el inventario principal.

### Cargo
Movimiento que **aumenta** la deuda de un cliente (p. ej. fiar una compra o un
cargo por atraso).

### Cargo por atraso → ver [Interés por atraso](#interés-por-atraso)

### Cobro mixto / pago mixto
Pagar una venta combinando **efectivo + transferencia**.

### Code128
La **simbología** de código de barras que la app genera e imprime. Cualquier
lector 1D la lee.

### Cuenta (de cobro)
Banco/tarjeta donde la tienda **recibe** dinero por transferencia. Se configuran en
**Ajustes → Cobro** y aparecen al cobrar por transferencia.

### Cuenta (del cliente) / Hoja
La página de un cliente en **Saldos**: su deuda, movimientos, lo que se llevó y la
cuenta regresiva al interés.

### Devolución
Regresar una prenda. Afecta dinero, stock, reporte y, si era fiada, la cuenta del
cliente — todo a la vez. Puede generar un **vale**.

### Enganche
Pago **inicial** al fiar. Es opcional y está **topado**: no puede ser mayor que el
total a fiar.

### Estado (del producto)
`disponible`, `en_banqueta` o `desactivado`. Gobierna dónde aparece el producto.

### Fiar
Vender **a crédito**: el cliente se lleva la mercancía y queda debiendo. La deuda
se registra en **Saldos**.

### IPC
*Inter-Process Communication.* El mecanismo por el que la interfaz le pide cosas
al proceso principal de la app (ver [capítulo 4](04-arquitectura.md)).

### Interés por atraso
Cargo opcional cuando una deuda pasa cierto plazo. Se configura (días + %); puede
ser **sugerido** o **automático**.

### Inventario
El catálogo de prendas. Alta rápida en un solo campo con precio sugerido.

### Libreta
Forma coloquial de referirse a **Saldos** (la libreta digital de crédito).

### Migración
Cambio versionado del esquema de la base de datos. Se aplican en orden al abrir
(ver [capítulo 5](05-modelo-de-datos.md)).

### Movimiento
Cada hecho de una cuenta de cliente: cargo, abono, descuento, ajuste o cargo por
atraso. El saldo es la **suma** de los movimientos vigentes.

### Paca / lote
Bulto de ropa que se compra al mayoreo para revender. (La tabla existe; el alta de
paca por UI es roadmap — ver [capítulo 12](12-estado-y-roadmap.md).)

### PDV
**Punto de venta.** La ventana para cobrar.

### Pieza única
Producto del que hay **una sola** unidad (vs *stock contado*, con cantidad).

### Saldo a favor
Dinero que la tienda le debe al cliente. **Solo nace de devoluciones**; se aplica
con un **switch** en el cobro/fiar.

### Saldos
El módulo de **crédito a clientes**: la libreta digital.

### Snapshot
Copia del código/nombre/precio de un producto **en el momento de la venta**, para
que el ticket histórico no cambie aunque el producto cambie después.

### Stock contado
Producto con **cantidad** (varias unidades), vs *pieza única*.

### Vale
Crédito a favor con **código único** que nace de una devolución **sin cuenta**. Se
usa **solo en compras**, total o parcialmente.

---

[← Solución de problemas](10-solucion-de-problemas.md) · [Índice](README.md) · [Siguiente: Estado y roadmap →](12-estado-y-roadmap.md)
