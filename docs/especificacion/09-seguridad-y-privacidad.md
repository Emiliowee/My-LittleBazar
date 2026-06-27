# 9 · Seguridad y privacidad

[← Operación](08-operacion-y-mantenimiento.md) · [Índice](README.md) · [Siguiente: Solución de problemas →](10-solucion-de-problemas.md)

---

## 9.1 Los datos son locales

- Todo (productos, ventas, clientes, deudas, fotos) vive en la **computadora de
  la tienda**, en `…\AppData\Roaming\My Little Bazar\`.
- **No hay nube** ni servidor. La app **no envía** los datos del negocio a
  internet.
- El único uso de internet es **opcional**: descargar actualizaciones desde
  GitHub Releases (solo baja el instalador; no sube nada).

## 9.2 Datos sensibles de clientes

- Las **fotos de identificación** de los clientes se guardan en
  `…\My Little Bazar\saldos-identificaciones\`, **solo en el disco local**. Nunca
  se suben a internet.
- La identificación es **obligatoria** al dar de alta un cliente, con opción de
  **"omitir con motivo"** (queda registrado el motivo).
- Como los datos son locales y sin cifrado a nivel de archivo, la **protección
  real es la del usuario de Windows**: quien tenga acceso a esa cuenta de Windows
  tiene acceso a los datos. Recomendaciones:
  - Usar una **cuenta de Windows con contraseña** en la PC de la tienda.
  - No compartir esa cuenta con terceros.
  - Guardar los respaldos en un lugar igualmente protegido.

## 9.3 Endurecimiento de Electron

- **Aislamiento de contexto activado** (`contextIsolation: true`) y **sin
  integración de Node** en el renderer (`nodeIntegration: false`): la interfaz no
  puede tocar el sistema directamente.
- Toda la comunicación pasa por el **puente `preload`** (`contextBridge`), que
  expone solo un conjunto acotado de funciones (`window.bazar.*`).
- **`webSecurity: false`** está activado a propósito para permitir mostrar
  imágenes locales (`file://`) elegidas por la usuaria (fotos de producto y de
  identificación). Es una concesión conocida; como la app **no carga contenido
  remoto** ni navega a sitios externos dentro de la ventana, el riesgo práctico es
  bajo. Endurecerlo (servir imágenes por un protocolo propio) es una mejora
  futura ([capítulo 12](12-estado-y-roadmap.md)).
- Enlaces externos (p. ej. WhatsApp) se abren por `shell:openExternal`, validando
  la URL, **fuera** de la ventana de la app.

## 9.4 Integridad del dinero

La exactitud también es seguridad. Como el saldo se **calcula** desde movimientos
inmutables y las operaciones son atómicas (ver [capítulo 7](07-reglas-de-negocio.md)),
no es posible "editar" una deuda a mano ni dejar la base a medias por un corte de
luz durante una venta.

## 9.5 Distribución y firma

- El instalador se publica en **GitHub Releases** (público): cualquiera puede
  descargar el **binario**, pero el **código y los datos del negocio** no se
  publican ahí.
- El ejecutable **no está firmado** con certificado de código todavía, por lo que
  Windows SmartScreen puede advertir "editor desconocido". Firmarlo es una mejora
  pendiente.

## 9.6 Buenas prácticas recomendadas

1. Cuenta de Windows con contraseña en la PC de la tienda.
2. Respaldo manual semanal a USB/nube (ver [capítulo 8](08-operacion-y-mantenimiento.md)).
3. No instalar la app desde fuentes que no sean la Release oficial.
4. Mantener Windows actualizado.

---

[← Operación](08-operacion-y-mantenimiento.md) · [Índice](README.md) · [Siguiente: Solución de problemas →](10-solucion-de-problemas.md)
