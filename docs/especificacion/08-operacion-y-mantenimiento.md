# 8 · Operación y mantenimiento

[← Reglas de negocio](07-reglas-de-negocio.md) · [Índice](README.md) · [Siguiente: Seguridad →](09-seguridad-y-privacidad.md)

---

Este capítulo es para quien **mantiene** el equipo funcionando: respaldos,
cambio de computadora, impresión y limpieza.

## 8.1 Respaldos

### Automático

- Cada día, al abrir la app, se guarda una copia de `monserrat.db` en
  `…\My Little Bazar\backups\monserrat_backup_AAAA-MM-DD.db`.
- Se conservan los **últimos 30 días**; las copias más viejas se borran solas.
- Es transparente: no hay que hacer nada.

### Manual (recomendado además)

El respaldo automático vive en la **misma computadora**. Si el disco falla, se
pierde con todo. Por eso conviene, cada cierto tiempo:

1. **Ajustes → Base de datos → "Abrir carpeta de respaldos"**.
2. Copiar el archivo más reciente (`monserrat_backup_…db`) a una **USB** o a una
   carpeta en la nube (Drive, OneDrive).

> Regla práctica: una copia fuera de la computadora **cada semana** y antes de
> cualquier cambio grande (actualización mayor, formateo, cambio de equipo).

## 8.2 Restaurar un respaldo

Si la base se dañó o se quiere volver a un día anterior:

1. Cerrar la app por completo.
2. Ir a `…\My Little Bazar\`.
3. Renombrar el `monserrat.db` actual a `monserrat.db.roto` (por si acaso).
4. Copiar el respaldo deseado y renombrarlo a `monserrat.db`.
5. Abrir la app: estará en el estado de ese respaldo.

## 8.3 Mudar a otra computadora

1. En la PC vieja: cerrar la app y copiar **toda** la carpeta
   `…\AppData\Roaming\My Little Bazar\` a una USB (incluye base, respaldos,
   fotos, ajustes y plantillas).
2. En la PC nueva: instalar la app (ver [capítulo 3](03-instalacion-y-actualizaciones.md))
   y **abrirla una vez** para que cree su carpeta.
3. Cerrar la app en la PC nueva.
4. Pegar el contenido copiado dentro de `…\AppData\Roaming\My Little Bazar\`,
   reemplazando lo que haya.
5. Abrir: el negocio completo estará ahí.

> Como mínimo basta con copiar `monserrat.db`. Para conservar también fotos,
> ajustes, impresora y plantillas, copiar la carpeta completa.

## 8.4 Impresión

- Elegir la impresora predeterminada en **Ajustes → Impresión**.
- Si una impresión falla, la app **abre el PDF de respaldo** y avisa: se puede
  imprimir a mano o elegir otra impresora.
- El tamaño de etiqueta se define en el **Editor de etiquetas**.
- Los **reportes** salen en PDF tamaño **Carta** (sirve cualquier impresora
  normal).

## 8.5 Actualizaciones

Normalmente **no hay que hacer nada**: la app se actualiza sola (ver
[capítulo 3](03-instalacion-y-actualizaciones.md)). Si se quiere forzar, basta
**cerrar y volver a abrir** con internet disponible.

## 8.6 Reset de fábrica

**Ajustes → Base de datos → Zona de peligro** permite borrar todo y cargar datos
de demostración.

> ⚠️ Esto **elimina el 100 %** de productos, clientes, cuentas y ventas. **No hay
> marcha atrás.** Hacer un respaldo manual antes (8.1). Útil solo para empezar de
> cero o para pruebas.

## 8.7 Mantenimiento del código (desarrollo)

- **Pruebas antes de publicar:** correr las suites de dinero
  (`npm run test:cobro`, `test:fiado-saldos`, `test:devoluciones`, `test:vales`,
  `test:escenarios`, `test:eliminar-venta`) y `npm run lint`.
- **Cambios en `electron/main.cjs` o `preload.cjs`** requieren **reiniciar
  Electron** (la recarga en caliente solo cubre el renderer).
- **Publicar:** subir versión en `package.json` + tag `vX.Y.Z`
  (ver [capítulo 3](03-instalacion-y-actualizaciones.md)).

---

[← Reglas de negocio](07-reglas-de-negocio.md) · [Índice](README.md) · [Siguiente: Seguridad y privacidad →](09-seguridad-y-privacidad.md)
