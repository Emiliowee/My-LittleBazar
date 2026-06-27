# 1 · Introducción y visión

[← Índice](README.md) · [Siguiente: Requisitos →](02-requisitos-y-compatibilidad.md)

---

## 1.1 Qué es

**My Little Bazar** es un sistema de gestión de tienda (un *point of sale* +
inventario + crédito) para una **boutique de ropa**. Es una aplicación de
escritorio para Windows que se instala en la computadora del mostrador y reúne,
en un solo lugar, todo lo que el negocio hace en el día:

- **Vender** (cobrar en efectivo, transferencia o pago mixto).
- **Fiar** y llevar la **libreta de cuentas** de cada cliente (Saldos).
- **Inventariar** la ropa con alta rápida, precios sugeridos y etiquetas.
- **Sacar mercancía a la banqueta** (vender fuera del local) y reconciliarla.
- **Imprimir etiquetas** con código de barras.
- **Sacar reportes** del día y del negocio.

El nombre interno de la base de datos y de muchas rutas es *Monserrat*, por la
dueña real para quien se construyó el sistema.

## 1.2 Para quién

| Perfil | Cómo usa el sistema |
|--------|---------------------|
| **Dueña / operaria** | Lo usa todo el día en el mostrador. No necesita saber de computadoras: la app está pensada para que cada cosa esté "donde uno la buscaría". |
| **Ayudante de tienda** | Vende y consulta; las acciones delicadas (eliminar venta, reset) están señaladas. |
| **Soporte / instalador** | Instala, configura impresora y escáner, hace respaldos y resuelve incidencias. |
| **Desarrollador** | Mantiene y extiende el código (este libro + el README técnico). |

## 1.3 Principios de diseño

El sistema se rige por unas pocas ideas firmes. Si alguna vez hay que decidir
entre dos caminos, estos principios mandan:

1. **Local primero (local-first).** Los datos son de la tienda y viven en la
   tienda. No hay nube obligatoria, no hay cuenta que crear, no se necesita
   internet para vender. Internet solo se usa, opcionalmente, para **descargar
   actualizaciones**.

2. **El dinero es sagrado y se calcula, no se escribe.** Ningún saldo se guarda
   como un número editable. La deuda de un cliente es **siempre** la suma de sus
   movimientos (cargos − abonos). Esto hace imposible "descuadrar" la libreta por
   accidente y deja un rastro auditable. Ver el [capítulo 7](07-reglas-de-negocio.md).

3. **La historia es inmutable.** Las ventas, devoluciones y movimientos no se
   "editan": se registran hechos nuevos que corrigen los anteriores (una
   devolución, una anulación). Los reportes son **agregaciones** de esa historia,
   no cifras inventadas.

4. **Rápido en el mostrador.** Menos pantallas, menos campos. El alta de un
   producto es **un solo campo de texto**; el cobro arranca con el lector de
   códigos; fiar y abonar son pocos toques.

5. **Sobrio y legible.** La identidad visual es discreta (rosa del sistema como
   acento, oro solo para momentos, líneas finas). Nada de efectos ruidosos que
   distraigan de la operación. Hay modo claro y oscuro, y el tema lo controla
   **siempre** la app (no el tema de Windows).

6. **Honesto con los límites.** Si una impresora falla, la app lo dice y ofrece
   un PDF de respaldo. Si una acción no se puede deshacer, lo advierte.

## 1.4 Alcance: qué hace y qué no

**Sí hace:**

- Punto de venta con lector de códigos, carrito y formas de pago.
- Crédito a clientes (fiar), abonos, saldo a favor e interés por atraso.
- Inventario con alta en lenguaje natural y precio sugerido.
- Etiquetas con código de barras (impresora térmica o PDF).
- Banqueta (ventas fuera del local) y devoluciones.
- Reportes (ventas, saldos, inventario, prendas sin movimiento) con export PDF/CSV.
- Respaldo automático diario y auto-actualización.

**No hace (por decisión o porque está fuera de alcance):**

- No es multi-sucursal ni multi-usuario con permisos por rol. Es una caja, una PC.
- No factura electrónica (CFDI/SAT) ni se integra con el SAT.
- No cobra con terminal bancaria integrada (la transferencia/tarjeta se registra,
  el cobro físico lo hace el banco aparte).
- No sincroniza entre computadoras por nube. Para mudar de equipo se copia el
  respaldo (ver [capítulo 8](08-operacion-y-mantenimiento.md)).

## 1.5 Documentos relacionados

- **[Guía de uso (MANUAL)](../MANUAL.md)** — el "cómo se usa" día a día, con el
  recorrido *El día completo*.
- **[README técnico](../../README.md)** — arranque rápido para desarrollar y
  compilar.
- **[Glosario](11-glosario.md)** — definición de cada término del negocio
  (fiar, enganche, vale, banqueta, paca…).

---

[← Índice](README.md) · [Siguiente: Requisitos y compatibilidad →](02-requisitos-y-compatibilidad.md)
