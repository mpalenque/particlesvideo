# Configuración y datos persistidos

Contrato actual: **24 previa, 25 PLAY, audio siempre desde Ableton**. [Contexto](CONTEXTO-ACTUAL.md) · [Sistemas](ARQUITECTURA-Y-SISTEMAS.md) · [Operación Fluids](integracion-radiance/OPERACION.md).

## Arranque desde el proyecto activo

Directorio: `C:/Users/mpale/OneDrive/Desktop/PARTE 1/particlesvideo/visuales`.

```powershell
npm ci
npm start
```

`npm ci` instala Visuales y, mediante `postinstall`, `vendor/radiance` desde su lockfile. `npm start` levanta Vite y el bridge OSC. Por separado: `npm run dev` y `npm run osc`.

Para servir el build en el mismo puerto habitual:

```powershell
npm run build
npm run preview -- --port 5173
```

Si se usa OSC con preview, ejecutar también `npm run osc`. Mantener una sola instancia del servidor que corresponda en ese puerto.

| Ventana / conexión | Dirección |
|---|---|
| Salida | `http://localhost:5173/`, nombre `vis-salida` |
| Escenas, mapeos y Learn | `http://localhost:5173/editor.html` |
| Timeline Fluids | `http://localhost:5173/fluids.html` |
| OSC de entrada | UDP 9000 por defecto |
| Bridge al navegador | `ws://localhost:8081` por defecto |

El puerto UDP se puede cambiar desde el editor y se conserva en `vis.oscPort`. El proceso Node también admite `OSC_PORT` y `WS_PORT`; cambiar WebSocket requiere que `OscClient` apunte al mismo puerto. El bus entre las ventanas del mismo origen se llama `vis-bus`.

## Ableton y MIDI

1. En Ableton, habilitar **Track** para la salida MIDI que llega a Visuales. El set documentado usa **RTX3090 (Port 2), canal 10** para escenas; no renombrar ni reemplazar puertos existentes por una sugerencia genérica del README antiguo.
2. En `editor.html`, habilitar la entrada MIDI correspondiente y observar el monitor al disparar el clip.
3. Verificar **Note On, canal 10, número de nota 24** para previa y **número 25** para PLAY. El parser usa canales **1–16**, no 0–15.
4. El clip que inicia la música en Ableton debe enviar el cue 25 en el punto de arranque visual. La web no reproduce otra copia del track.

**Usar el número MIDI en el monitor como referencia.** El nombre de nota y de octava mostrado por Ableton, otros editores o plugins puede usar otra convención. No transformar «nota 24» en un nombre tipo C0/C1 por suposición, ni correrla una octava para que coincida con una etiqueta.

| Fuente | Destino | Argumento | Resultado |
|---|---|---|---|
| Note On ch10 nota24 | `scene.goto` | `24` | Previa negra/línea blanca, tiempo 0 detenido. |
| Note On ch10 nota25 | `scene.goto` | `25` | PLAY completo desde cero al entrar. |

Las filas `sc24` y `sc25` están en `public/mappings.default.json`. Mapper v11 puede añadirlas si faltan en una configuración anterior, conservando filas personalizadas existentes. Revisar cualquier mapeo aprendido que use esas notas con otro fin; el monitor muestra qué destinos disparó. No agregar un segundo `fluids.play` a la nota 25: seleccionar la escena ya inicia la secuencia.

Las notas repetidas de la escena activa no reinician. Para ensayo: `fluids.standby` selecciona 24; `fluids.play` selecciona 25 o continúa su pausa; `fluids.restart` reinicia explícitamente 25 desde 0. `fluids.pause` y `fluids.seek` operan sobre la secuencia de 25. `fluids.arm` sólo prepara recursos. El loop se reserva para ensayo visual: entrar en 24 o 25 lo desactiva, y nunca modifica el transporte de Ableton.

`fluids.audioMode` se conserva por compatibilidad, con el único valor **`external`**. Un ajuste o mensaje antiguo `local` no debe volver a habilitar audio web. Los controles `fluids.live.*` siguen registrados como **motor libre sin escena asignada**; los futuros mapeos de performance requieren una decisión posterior de contenido.

## OSC

| Mensaje | Uso |
|---|---|
| `/scene 24` | Seleccionar previa. |
| `/scene 25` | Seleccionar PLAY. |
| `/a/fluids/restart` | Reiniciar explícitamente el timeline. |
| `/a/fluids/pause` | Pausar el reloj visual en 25. |
| `/a/fluids/seek 30` | Buscar 30 s para ensayo, sin mover Ableton. |
| `/p/<grupo>/<nombre>` | Escribir un parámetro en su rango nativo. |
| `/pn/<grupo>/<nombre>` | Escribir un valor normalizado 0–1. |

Los IDs y rangos completos se generan desde el registro en [REFERENCIA-MIDI-OSC.md](../REFERENCIA-MIDI-OSC.md) y `.csv`, o desde el editor. El bridge sólo entrega los mensajes a Visuales; no sincroniza por sí mismo el transporte de Ableton.

## Show, assets y almacenamiento

| Dato | Archivo / clave | Quién lo usa |
|---|---|---|
| Documento incluido | `public/radiance/show/fluids.show.json` | Base de ShowSession si no existe un guardado integrado. |
| Documento editado y revisión | `localStorage['vis.radiance.show.v1']` | Output; prioridad sobre el JSON incluido. |
| WAV de referencia | `public/radiance/audio/fluids.wav` | Waveform offline, sin reproducción web. |
| Análisis de audio | `public/radiance/show/fluids.analysis.json` | Onsets y curvas de referencia del editor. |
| Worker/JS/WASM y avisos | `public/radiance/fluid/` | Motor Fluids. |
| Otros assets conservados | `public/radiance/blocks`, `depth`, `voronoi` | Contenidos futuros, sin escena nueva asignada. |
| Mapeos incluidos | `public/mappings.default.json` | Mapper y migración de filas. |
| Mapeos aprendidos | `localStorage['vis.mappings']` | Mapper; exportables en el editor. |
| Ajustes persistentes | `localStorage['vis.settings']` | Settings; no reemplazan los presets que pertenecen a una escena. |
| Entradas MIDI habilitadas | `localStorage['vis.midiInputs']` | MidiInput. |
| Puerto OSC | `localStorage['vis.oscPort']` | OscClient. |
| Calidad Parte 1 | `localStorage['vis.quality']` | Preset de calidad del equipo. |

`localhost`, `127.0.0.1` y puertos diferentes tienen almacenamientos distintos. Para transportar el show, **EXPORTAR JSON** desde el timeline; para los mapeos, exportar desde `editor.html`. No limpiar storage como primer paso de diagnóstico: puede contener ediciones más recientes que las incluidas en Git.

Las claves originales `radiance-fluids-show-doc-v1`, `radiance-tres-masas-page-v2` y `radiance-live-show-state-v2` pertenecen al proyecto original y no se usan como destino de guardado integrado. El export recuperado de Downloads no se ha cotejado con la última sesión original; un JSON posterior se puede importar explícitamente.

## Verificación antes de dar por probado un cambio

```powershell
npm run check:radiance
npm run build
```

Los tests e informes deben indicar qué asignación de escenas se probó. [Validación de cues 24/25](integracion-radiance/VALIDACION-CUES-24-25.md) registra las pruebas nuevas y su variabilidad de rendimiento. [RENDIMIENTO.md](integracion-radiance/RENDIMIENTO.md) conserva mediciones de la asignación anterior. El hardware de referencia es i7-12700 + RTX 3090; no hay garantía de 50 FPS mínimos ni de 50 Hz de física continuos.
