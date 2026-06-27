# 10 · Solución de problemas

[← Seguridad](09-seguridad-y-privacidad.md) · [Índice](README.md) · [Siguiente: Glosario →](11-glosario.md)

---

Guía rápida de incidencias comunes. Formato: **síntoma → causa → solución**.

## 10.1 Uso diario (dueña / operaria)

### El lector de código de barras no escribe nada
- **Causa:** no está enfocado el campo correcto, o el lector quedó en otro modo.
- **Solución:** hacer clic en el campo de búsqueda del PDV antes de escanear.
  Probar el lector en el Bloc de notas: debe "teclear" el código y un Enter. Si
  ahí tampoco, es el lector/cable.

### Lee códigos con caracteres raros
- **Causa:** el lector usa otra distribución de teclado.
- **Solución:** la app ya corrige los casos comunes. Si persiste, configurar el
  lector en modo "US keyboard" según su manual.

### No imprime la etiqueta / el ticket
- **Causa:** impresora apagada, sin papel, o no es la seleccionada.
- **Solución:** la app abre el **PDF de respaldo** y avisa: imprimir desde ahí o
  elegir la impresora correcta en **Ajustes → Impresión**. Verificar que la
  impresora aparezca en Windows.

### "No puedo copiar el código del vale"
- **Causa:** resuelto desde v1.0.4 (se usa el portapapeles nativo).
- **Solución:** actualizar a la última versión. El botón **Copiar** del vale ya
  funciona en la app instalada.

### El modo oscuro se ve raro / claro a medias
- **Causa:** versión vieja con el experimento de ventana translúcida.
- **Solución:** actualizar. Desde v1.0.4 la ventana es **opaca** y el tema lo
  controla la app por completo.

### "Perdí una venta / quiero ver las de un día"
- **Solución:** PDV → **Consultar ventas**, filtrar por día/turno. Desde ahí se ve
  el detalle y, si hace falta, se elimina una venta (revierte stock y saldos).

## 10.2 Instalación y actualización (soporte)

### Windows dice "editor desconocido" al instalar
- **Causa:** el instalador no está firmado.
- **Solución:** *Más información → Ejecutar de todas formas*. Es esperado.

### La app no se actualiza sola
- **Causa:** sin internet, o no hay versión nueva publicada.
- **Solución:** cerrar y abrir con internet. Verificar que exista una Release más
  nueva en GitHub.

### "Quiero pasar todo a otra computadora"
- **Solución:** copiar la carpeta `…\AppData\Roaming\My Little Bazar\`. Pasos en
  el [capítulo 8](08-operacion-y-mantenimiento.md).

## 10.3 Desarrollo / compilación

### `npm install` falla en `better-sqlite3`
- **Causa:** no recompiló el binario nativo para Electron.
- **Solución:** asegurarse de Node 20–24 y correr de nuevo; el `postinstall`
  ejecuta `electron-rebuild -f -w better-sqlite3`. Borrar `node_modules` y
  reinstalar si persiste.

### Al iniciar, crash con "duplicate column name"
- **Causa:** una columna agregada a mano en código de arranque **y** en una
  migración.
- **Solución:** las columnas nuevas van **solo** en migración numerada. Ver la
  regla en el [capítulo 5](05-modelo-de-datos.md) y el historial en el
  [capítulo 12](12-estado-y-roadmap.md).

### `npm run build` falla con error de `winCodeSign` / *symlink*
- **Causa:** compilar el `.exe` en Windows sin Modo de programador/admin.
- **Solución:** compilar en **CI** (empujar un tag `v*`). Alternativa: activar el
  **Modo de programador** de Windows y reintentar. La parte de Vite
  (`npm run build:vite`) sí compila local.

### Cambié algo en `main.cjs`/`preload.cjs` y no se ve
- **Causa:** la recarga en caliente solo cubre el renderer.
- **Solución:** **reiniciar Electron** (cerrar y `npm run dev`, o terminar el
  proceso `electron`).

## 10.4 Datos / base

### Sospecho que la base se dañó
- **Solución:** restaurar el respaldo más reciente
  ([capítulo 8](08-operacion-y-mantenimiento.md), sección 8.2). Los respaldos
  diarios están en `…\My Little Bazar\backups\`.

### Quiero empezar de cero
- **Solución:** respaldar primero, luego **Ajustes → Base de datos → Zona de
  peligro → reset**, o borrar `monserrat.db` con la app cerrada.

---

[← Seguridad](09-seguridad-y-privacidad.md) · [Índice](README.md) · [Siguiente: Glosario →](11-glosario.md)
