# 12 · Estado, deuda técnica y roadmap

[← Glosario](11-glosario.md) · [Índice](README.md)

---

Fotografía honesta de en qué punto está el sistema, qué deuda técnica arrastra y
hacia dónde puede crecer. *Corresponde a la app v1.0.4 (junio 2026).*

## 12.1 Qué ya está sólido (no rehacer)

Probado y en uso:

- **Vender, fiar (con enganche opcional topado), abonar.**
- **Saldos** con persistencia real y saldo calculado desde movimientos.
- **Devoluciones** consistentes (dinero + stock + reporte + cuenta) y **vales**
  (generar, canjear total/parcial).
- **Eliminar venta** con reversa de stock y saldos.
- **Inventario** con alta en lenguaje natural (~1275 términos), precio sugerido,
  ajuste por categoría/marca, clonar y filtro de banqueta.
- **Etiquetas** (editor + impresión, rotación respetada en PDF).
- **Reportes** (4 reportes + export PDF/CSV).
- **Configuración** completa (mi bazar, cobro, categorías, apariencia, impresión,
  respaldos, sistema).
- **Respaldo diario automático** y **auto-actualización** (desde v1.0.2).
- Suite de **~20 pruebas** + 2 auditorías, en verde.

## 12.2 Historial reciente (v1.0.x)

- **v1.0.0** — primer release: instalador NSIS, íconos, asarUnpack de nativos,
  README + MANUAL, workflow de CI.
- **v1.0.1** — UI sobria (Inicio/Saldos), logo/nombre configurables, tema oscuro
  Linear, vales en PDV.
- **v1.0.2** — **auto-actualización** (electron-updater + publish github).
- **v1.0.3** — copiar vale al generarlo, visor de vales, Inicio sobrio.
- **v1.0.4** — copiar vales arreglado (portapapeles nativo), **modo oscuro
  confiable** (se retiró el experimento translúcido/Mica), sección **Cobro** y
  botón de **respaldos** en Configuración, **Reportes** con acabado glass, y
  **rendimiento**: carga diferida de vistas + índices SQLite. Esta documentación.

## 12.3 Deuda técnica conocida

1. **Tablas legadas `clientes` / `credito_movimientos`.** Son del módulo viejo de
   crédito (anterior a Saldos). Siguen porque las referencia código dormido
   (`addIntercambio`). *Plan:* retirarlas en una pasada cuidadosa cuando se
   confirme que nada vivo las usa. Riesgo si se borran a la ligera.

2. **Capa de IA "fantasma".** Existe andamiaje del Asistente (eventos en el
   ledger, capa multi-proveedor Gemini/Groq/HF) **sin UI conectada**. *Decisión
   pendiente:* conectarla (activar el Asistente de verdad) o **podarla** para
   reducir peso. Hoy no afecta al usuario.

3. **`webSecurity: false`.** Necesario para mostrar imágenes locales `file://`.
   *Mejora futura:* servir esas imágenes por un protocolo propio
   (`app://` o `protocol.handle`) y volver a activar `webSecurity`.

4. **Ejecutable sin firmar.** Provoca el aviso de SmartScreen. *Mejora futura:*
   certificado de firma de código.

5. **Bundle inicial ~712 KB.** Ya se redujo ~30 % con carga diferida; se podría
   dividir el *vendor* (React/motion) si hiciera falta, pero el beneficio
   marginal es bajo.

6. **CLAUDE.md / catálogo de módulos vs realidad.** El `registry.js` declara
   módulos de roadmap (Importar Excel, Temas, Vista 3D…) que **no** están
   entregados. Este libro ([capítulo 6](06-modulos.md)) es la referencia del
   estado real.

## 12.4 Lecciones aprendidas (no repetir)

- **Columnas nuevas → solo en migración numerada.** Agregar una columna a mano en
  el arranque **y** en una migración causó un *crash* de "duplicate column name"
  en instalación nueva. Regla en el [capítulo 5](05-modelo-de-datos.md).
- **Rediseños globales a medias rompen el tema.** Un experimento de ventana
  translúcida (Mica) dejado sin terminar hacía que el modo oscuro dependiera del
  tema de Windows. Se revirtió a **ventana opaca**; el tema lo controla la app.
- **Compilar el `.exe` en local choca con `winCodeSign`.** El instalador oficial
  se compila **siempre en CI** (GitHub Actions, `windows-latest`).
- **Cambios en `main.cjs`/`preload.cjs` exigen reiniciar Electron.**

## 12.5 El muro de `winCodeSign` (resumen)

En Windows sin Modo de programador/administrador, `electron-builder` falla al
extraer `winCodeSign` por un *symlink* que requiere privilegio
("El cliente no dispone de un privilegio requerido"). **No es un bug del
código.** Soluciones: compilar en CI (lo estándar aquí) o activar el Modo de
programador de Windows. La compilación de Vite (`build:vite`) no se ve afectada.

## 12.6 Cómo publicar una versión (recordatorio)

1. Subir `"version"` en `package.json`.
2. Correr pruebas de dinero + `npm run lint`.
3. `git commit` → `git tag vX.Y.Z` → `git push` y `git push origin vX.Y.Z`.
4. CI compila y publica en Releases; las cajas instaladas se actualizan solas.

Detalle en el [capítulo 3](03-instalacion-y-actualizaciones.md).

## 12.7 Roadmap (ideas, no compromisos)

| Idea | Valor | Nota |
|------|-------|------|
| **Alta de paca/lote** | Alto (diferenciador) | La tabla `pacas` existe; falta UI. |
| Conectar o podar el **Asistente (IA)** | Medio | Decidir dirección. |
| Firmar el ejecutable | Medio | Quita el aviso de SmartScreen. |
| Endurecer `webSecurity` | Medio | Protocolo propio para imágenes. |
| Exportaciones CSV como módulo | Medio | Útil para la contadora. |
| Temas visuales / Vista 2D-3D del local | Bajo | Declarados, sin prioridad. |
| Retirar tablas legadas de crédito | Bajo | Limpieza segura. |

---

[← Glosario](11-glosario.md) · [Índice](README.md)

---

*Fin del libro. Para el uso diario, ver la [Guía de uso](../MANUAL.md). Para
desarrollar, el [README técnico](../../README.md).*
