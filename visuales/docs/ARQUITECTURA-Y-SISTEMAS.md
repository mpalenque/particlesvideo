# Arquitectura y entradas de los sistemas

La operación vigente está en [CONTEXTO-ACTUAL.md](CONTEXTO-ACTUAL.md): **24 previa, 25 PLAY, audio sólo en Ableton**. Este mapa identifica dónde trabajar sin duplicar motores, relojes o almacenamiento.

## Una salida con dos motores visuales

```text
Ableton → MIDI → MidiInput → Mapper → Params / SceneManager
OSC UDP → bridge Node → WebSocket → OscClient → Mapper ─┘
editor.html / fluids.html → BroadcastChannel vis-bus → Output

Output: Engine → Parte 1 (capas 2D/3D + MLS-MPM + compositor)
             └→ RadianceController → FluidRuntime → Worker WASM + HRC
                                  └→ ShowSession → documento + reloj visual
```

`Engine` es el único bucle visual. Cuando Fluids posee el frame, las capas, MLS-MPM y compositor de Parte 1 no trabajan. El renderer anterior se conserva preparado; no se suman sus luces/postproceso al render HRC. El audio externo no depende de ese bucle.

| Sistema | Entrada en el repo activo | Responsabilidad |
|---|---|---|
| Arranque | `src/main.js` | Crea y conecta registro, motores, coordinador, IO y editores. Identifica la salida como `vis-salida`. |
| Render/encuadre | `src/render/Renderer.js`, `src/config/stage.js` | Buffer 2688×1008, ajuste CSS/DPR y dimensiones físicas de Parte 1. |
| Registro | `src/core/Params.js` | Parámetros, acciones, tipos y rangos. Alimenta editor y referencia MIDI/OSC. |
| Escenas | `src/core/SceneManager.js`, `src/scenes/index.js`, `src/scenes/base.js` | Presets y acciones; protección frente a notas repetidas. Intercepta 24/25 mediante el coordinador. |
| Bucle | `src/core/Engine.js` | Orden de frame, exclusión de trabajo simultáneo y barrera `whenIdle()`. |
| Parte 1 | `src/layers2d`, `src/layers3d`, `src/layers3d/particles` | Elementos del show previo, fuerzas y simulación MLS-MPM. |
| Coordinación Fluids | `src/radiance/RadianceController.js` | Preparación, solicitudes cancelables, 24 previa, 25 timeline, comandos y publicación de estado/documento. |
| Documento y tiempo | `src/radiance/ShowSession.js` | Valida y guarda ShowDoc, rechaza revisiones viejas, controla reloj visual y waveform de referencia. No reproduce audio. |
| Motor Fluids | `vendor/radiance/src/integration/FluidRuntime.ts` | Solver, render HRC y geometría; entrada previa/timeline, limpieza y suspensión. El modo live se conserva sin escena asignada. |
| Guion escrito | `vendor/radiance/src/scenes/fluid/FluidsShowDirector.ts` | Evalúa curvas, eventos, materiales y gestos por tiempo absoluto. |
| Modelo del documento | `vendor/radiance/src/fluids-show/show-doc.ts` | ShowDoc, serialización y muestreo; compartido con el editor. |
| Física Fluids | `vendor/radiance/src/scenes/fluid/KotFluidWorkerClient.js`, `public/radiance/fluid` | Cola/intercambio de buffers y solver WASM. Tres subpasos conservados. |
| Render Fluids | `vendor/radiance/src/scenes/fluid/FluidRadianceRenderer.ts` | Transporte de luz HRC, materiales, sombras y composición propia. |
| Editor general | `editor.html`, `src/editor/main.js` | Escenas, valores, Learn, mapeos y monitor de mensajes. |
| Editor Fluids | `fluids.html`, `vendor/radiance/src/integration/editor/entry.tsx` | Punto de entrada React del editor remoto y sus lanes. |
| Edición remota | `vendor/radiance/src/integration/editor/FluidsRemoteEditor.tsx`, `RemoteTransport.ts` | Playhead, curvas, eventos, gestos, undo/redo e import/export; órdenes a Output. |
| Preview remoto | `src/radiance/PreviewCapture.js`, `src/radiance/preview.worker.js` | ImageBitmap y JPEG 672×252 a 2 Hz en Worker; no monta otro FluidRuntime. |
| Bus de ventanas | `src/io/Bridge.js` | `BroadcastChannel('vis-bus')`; enrutamiento de mensajes generales y `fluids:*`. |
| MIDI | `src/io/MidiInput.js`, `src/io/Mapper.js` | Lectura Web MIDI, canales 1–16, traducción de notas/CC a acciones y valores. |
| OSC | `tools/osc-bridge.mjs`, `src/io/OscClient.js` | UDP 9000 → WebSocket 8081 → Mapper; puertos configurables. |
| Persistencia general | `src/core/Settings.js` y `Mapper.save()` | Ajustes del editor y mapeos; separados del documento Fluids. |

## Cambio de escena y contrato de control

`RadianceController` prepara el runtime, espera que termine el frame anterior y el trabajo ya despachado al Worker, y sólo confirma la solicitud vigente. Una solicitud cancelada no debe mostrar tarde el canvas ni reactivar audio o física.

En 24, `enterStandby` deja población vacía, tiempo 0 y una línea blanca de referencia: no evalúa emisiones, fracturas ni eventos del show. Desde esa previa, la entrada 25 usa `startTimeline()` síncrono y el estado ya preparado, sin nuevo reset ni viaje de ida y vuelta al Worker en el cue. Una entrada directa en 25 usa `enterTimeline` para prepararse y comenzar desde cero. Las notas repetidas de la misma escena no vuelven a entrar. `fluids.restart` fuerza la repetición explícita de la 25.

La pausa detiene el reloj de la secuencia; la historia física sigue la semántica del motor original. Un seek cambia el tiempo de evaluación, no reconstruye toda la historia del fluido. El final natural conserva el cierre congelado. Master y blackout afectan imagen, sin comandos de transporte para Ableton.

El runtime live y `fluids.live.*` son capacidad preservada para trabajo posterior; ninguna escena 26–29 fue asignada a ese modo. No reutilizar automáticamente la nueva 25 para esos controles.

## Autoridad y persistencia

Output posee la única versión activa del documento y su revisión. El editor envía una edición basada en una revisión conocida; si quedó vieja, la salida la rechaza. El identificador de propietario ayuda a reconocer otra sesión de Output. Las ventanas del editor no deben sembrar ni guardar su copia como si fueran la autoridad.

`ShowSession` usa `performance.now()` para tiempo absoluto visual. El WAV se puede decodificar en un `OfflineAudioContext` exclusivamente para waveform; no se crea ni conecta un reproductor audible. La nota de inicio no equivale a sincronización absoluta con Ableton.

Parte 1 usa Three **0.176.0**. Radiance mantiene su paquete y dependencias por separado en `vendor/radiance`; `npm ci` instala ambos lockfiles mediante `postinstall`. Los recursos se resuelven bajo el base de la aplicación más `radiance/`, por lo que el build no depende del servidor original ni de la carpeta `heidi`.

## Documentación histórica que acompaña al código

El [índice original](origen-radiance/INDICE.md) conserva el plan del show y sus explicaciones sin modificar sus bytes. Describen el proyecto original, que tenía reproducción de audio en su propia página; eso no autoriza a reintroducir audio web en la integración actual. Los planes históricos de integración también conservan la antigua asignación de escenas, expresamente reemplazada por [el contexto vigente](CONTEXTO-ACTUAL.md).
