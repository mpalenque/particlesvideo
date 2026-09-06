# Contexto vigente — Visuales LED

**Actualizado: 2026-09-06, decisión posterior a la primera integración de Radiance.** Leer este archivo antes de usar planes o reportes anteriores. Las nuevas instrucciones de Manuel prevalecen sobre cualquier documento.

## Qué está armando Manuel

Un show visual para LED **2688×1008, 8×3 m**, con salida Chrome, editor separado y control desde Ableton mediante MIDI/OSC. Parte 1 conserva sus escenas 1–23, incluyendo línea vertical de la 2, despliegue del piso con fuga de la 7, rayos de **0,014 m** y torbellino de la 21. El show Fluids está escrito como documento de curvas y eventos; se ejecuta con un solver de partículas, no como un video.

## Decisiones actuales que reemplazan la asignación anterior

| Escena | Qué muestra y qué hace | Disparo existente |
|---|---|---|
| **24 — Previa Fluids** | Fondo negro, sólo una línea blanca intacta. Motor preparado y población vacía; tiempo en 0, detenido. La línea toma posición y tamaño iniciales del documento, con rotación 0; no ejecuta emisión ni fracturas de la secuencia. | Nota MIDI **24**, canal **10**. |
| **25 — PLAY Fluids** | Reinicia y reproduce desde 0 toda la secuencia del timeline, de 152,694 s en el export incluido. | Nota MIDI **25**, canal **10**. |
| **26–29** | Libres/reservadas. | Sin contenido nuevo asignado. |

**Audio siempre externo, en Ableton. La web nunca reproduce el WAV.** `fluids.wav` se conserva como referencia para waveform y análisis; su decodificación offline no crea reproducción audible. El reloj visual avanza desde el cue por tiempo absoluto local. No recibe la posición de Ableton ni sigue automáticamente sus pausas, seeks o saltos.

Las notas repetidas de la escena ya activa no la reinician. Repetir la secuencia requiere `fluids.restart` o una nueva entrada desde otra escena. Entrar en 24 o 25 desactiva cualquier loop de ensayo para ejecutar la secuencia completa con Ableton. El motor live de fluidos y sus controles siguen preservados como capacidad independiente **sin escena asignada**; no convertir la 26 en live por deducción.

La definición anterior «24 = PLAY / 25 = live / audio local opcional» es histórica y está reemplazada. También quedó reemplazado el pedido anterior de armar reproducción de audio con un clic: `fluids.arm` ahora sólo prepara recursos.

## Dónde operar

- Salida: `http://localhost:5173/`, ventana `vis-salida`.
- Editor de escenas, parámetros y mapeos: `http://localhost:5173/editor.html`.
- Editor del timeline Fluids: `http://localhost:5173/fluids.html`.

La salida posee documento, revisión, reloj y motor. El editor remoto conserva curvas, eventos, waveform, deshacer/rehacer, gestos e import/export, y envía órdenes a esa salida. No crea otro solver ni reproduce audio. [Operación](integracion-radiance/OPERACION.md).

## Fuentes y estado conservado

Proyecto activo: `particlesvideo/visuales`, dentro del repo `particlesvideo`. El código Radiance consumido por el build está en `vendor/radiance`; todos sus assets públicos están en `public/radiance`.

El documento incluido es `public/radiance/show/fluids.show.json`: **152,694 s, 256 eventos, 400 claves y 0 clips de gesto**, recuperado de Downloads. El documento editado de la salida se guarda con su revisión en **`vis.radiance.show.v1`**. No se comprobó si el navegador del proyecto original conserva una edición posterior; se puede importar un export más reciente sin resembrar ni borrar lo actual.

La copia completa `PARTE 1/radiance-live-show` conserva el proyecto original, código, documentación, assets y Git. El origen `C:/Users/mpale/OneDrive/Desktop/heidi/radiance-live-show` permanece separado. El plan original de Fluids **sí está preservado**, además en una copia versionable bajo [docs/origen-radiance](origen-radiance/INDICE.md), con SHA-256 por archivo.

## Verificación y límites

Para esta decisión están aprobados **217 tests de código**: 203 del paquete Radiance, 9 de sesión, 4 del preview y 1 de mapeos; TypeScript y build de producción también aprobados. Las pruebas nuevas aprobaron el flujo de escenas, MIDI, ausencia de audio web, editor remoto y recursos/cues bajo `/show/`. La previa mide una banda blanca de 320×8 px, con 2552 píxeles iluminados y ninguno coloreado en el fixture probado. [Validación de esta entrega](integracion-radiance/VALIDACION-CUES-24-25.md).

**El rendimiento varía; no está garantizado un mínimo sin caídas.** La primera prueba nueva de producción tuvo 45 intervalos >20 ms y máximo 83,6 ms; al repetir sin cambiar código, registró ~60 FPS, máximo 17,5 ms y ninguno >20 ms. El ensayo final de desarrollo, que además comprueba desactivar loops al entrar, registró 480 frames a ~60 FPS, máximo 17,8 ms y ninguno >20 ms. Había otras aplicaciones activas al observar el equipo después de la primera prueba, pero esa observación no demuestra una causa única. Se conservan ambas mediciones.

En esas pruebas anteriores la presentación sostuvo su presupuesto de 20 ms, pero el solver WASM bajó a **42,45 Hz** en una ventana de 1 s y tuvo pasos de hasta **36,4 ms**. Mantener 60 FPS de salida no demuestra física nueva en cada frame. El límite estricto de 50 Hz de física no quedó resuelto; se conservaron los tres subpasos para no cambiar el show escrito.

Los artefactos nuevos están bajo `radiance-check/cues-24-25/`. Los reportes de **210 tests y tres pasadas completas a ~60 FPS pertenecen a la asignación anterior**; no son una nueva prueba completa de los 152,694 s con esta asignación. [Informe histórico y condiciones](integracion-radiance/RENDIMIENTO.md). El funcionamiento nuevo está validado; la garantía estricta de rendimiento sigue sin cumplirse.

## Mapa de lectura para continuar

1. [Arquitectura y entradas de cada sistema](ARQUITECTURA-Y-SISTEMAS.md).
2. [Configuración de arranque, MIDI, OSC y almacenamiento](CONFIGURACION.md).
3. [Plan original de Fluids](origen-radiance/docs/plan-fluids-show.md) y [cómo funciona el motor/show original](origen-radiance/docs/fluids-show-como-funciona.md), cuando se cambie el comportamiento interno.
4. [NOTAS](../NOTAS.md) para decisiones anteriores y problemas ya encontrados; [plan de integración anterior](integracion-radiance/PLAN-INTEGRACION-RADIANCE.md) sólo como historia de implementación.

Al cambiar una decisión del show, actualizar primero su estado vigente en este archivo y los documentos operativos afectados. Conservar planes originales e informes de pruebas con su alcance histórico; no editar sus resultados para hacerlos pasar por una prueba nueva.
