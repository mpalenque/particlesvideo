# Integración de Radiance desde la escena 24

Fecha: 2026-09-06. Estado: **plan de implementación; copia y recuperación del export realizadas**.

El contenido principal a integrar es **Fluids, el show con timeline propio**, dentro de la salida y los controles de `particlesvideo/visuales`. Se conserva el proyecto Radiance completo para poder incorporar después Tres Masas, Depth Sorter, Bloques y Voronoi. Las escenas 1–23 deben conservar su funcionamiento y aspecto, incluidos los últimos ajustes de piso, rayos y torbellino.

**Asignación confirmada por Manuel:** entrar en **escena 24 da PLAY a la escena completa ya escrita en el timeline**; la **escena 25 usa el mismo motor de fluidos 2D para control en vivo por MIDI**, cuyos comportamientos se definirán después. El timeline conserva su editor, curvas y eventos como una unidad dentro de la 24. Sus secciones internas no ocupan las escenas 25 en adelante.

## 1. Lo que ya quedó conservado

| Elemento | Estado |
|---|---|
| Proyecto de origen | `C:/Users/mpale/OneDrive/Desktop/heidi/radiance-live-show` |
| Copia completa en este workspace | [radiance-live-show](radiance-live-show/) |
| Revisión de origen | `18998e4bd48558b88013c2242194001ed33923dc`; árbol limpio al inspeccionarlo |
| Archivos copiados | 6.254; 270.335.588 bytes; incluye `.git`, `.github`, código, recursos, documentación, herramientas, dependencias y `dist` |
| Verificación | SHA-256 de cada archivo de origen contra la copia: ninguna diferencia |
| Export encontrado | `C:/Users/mpale/Downloads/fluids.show.json`, fecha local de modificación 06/09/2026 01:19:47 |
| Export recuperado en la copia | [public/show/fluids.show.json](radiance-live-show/public/show/fluids.show.json) |
| Contenido del export | 152,694 segundos; 256 eventos; 400 claves en curvas; 0 clips de gesto |
| Validación del export | Parseado con `parseShowDoc` del proyecto; copia verificada por SHA-256 |

El JSON recuperado es una **adición explícita a la copia**: no existía en `public/show` del origen. La copia del repositorio conserva sus 6.254 archivos originales y suma este documento. El proyecto de `heidi` permanece como origen separado.

Registro de procedencia: [integracion-radiance/estado-copia.json](integracion-radiance/estado-copia.json).

### Estado que puede seguir solamente en el navegador

El export recuperado permite empezar con contenido escrito, pero todavía hay que compararlo con la última sesión del editor original. El almacenamiento depende del origen del navegador: cambiar de puerto o de `localhost` a `127.0.0.1` puede mostrar otro estado.

| Contenido | Clave de almacenamiento original |
|---|---|
| Timeline Fluids | `radiance-fluids-show-doc-v1` |
| Ajustes por cue de Tres Masas | `radiance-tres-masas-page-v2` |
| Faders, looks y modulación del catálogo live | `radiance-live-show-state-v2`, con migración de v1 |

Antes de fijar la versión del show integrado, comparar el export con la sesión original y guardar cualquier versión posterior como otro snapshot. Conservar también los ajustes de los otros contenidos cuando se puedan exportar. **No volver a sembrar desde el análisis para reemplazar las ediciones del usuario.** El seed es una referencia, no una copia de seguridad de la sesión.

## 2. Hallazgos que determinan la integración

| Aspecto | Parte 1 actual | Fluids que se incorpora |
|---|---|---|
| Salida del show | 2688×1008 | 2688×1008 en la página `/fluids` |
| Render | Three 0.176.0, WebGPU | Render WebGL/HRC; versión de Three separada según lockfile Radiance |
| Simulación | MLS-MPM en GPU | Solver WASM en Worker |
| Control principal | `Params`, `SceneManager`, MIDI/OSC | Documento de curvas, eventos y gestos evaluado por tiempo |
| Reloj actual | `Engine.time` con delta limitado para física | `AudioTransport` usa `AudioContext.currentTime` |
| Interfaz | Salida limpia + editor separado | `/fluids` reúne timeline, preview, audio y perform |

El README genérico de Radiance describe una salida **3360×1008**. Ese tamaño corresponde al catálogo `/output`; **el show seleccionado ya trabaja a 2688×1008**. No hace falta deformarlo ni adaptarlo a 3360.

Piezas reutilizables, ya separadas de React:

- [FluidScene.ts](radiance-live-show/src/scenes/fluid/FluidScene.ts): ciclo de vida del motor, documento, gestos y render de Fluids.
- [FluidsShowDirector.ts](radiance-live-show/src/scenes/fluid/FluidsShowDirector.ts): evaluación del documento por tiempo absoluto.
- [show-doc.ts](radiance-live-show/src/fluids-show/show-doc.ts): formato JSON y muestreo de curvas/eventos.
- [audio-transport.ts](radiance-live-show/src/fluids-show/audio-transport.ts): reproducción y reloj del audio.
- [FluidsEditorApp.tsx](radiance-live-show/src/fluids-show/FluidsEditorApp.tsx) y sus lanes: edición, undo/redo, importación y exportación.

Seleccionar solamente el look `fluids-show` no reproduce el show guardado: el adaptador también debe inyectar `setFluidsShowDoc(doc)`, tiempo y estado de reproducción.

## 3. Arquitectura propuesta

**Una salida, una autoridad de control y un único motor visual trabajando por frame.**

`MIDI / OSC / editor → selector de escena → Parte 1 / Fluids con timeline (24) / Fluids en vivo (25)`

### Runtime de Fluids

Crear `RadianceFluidRuntime` que exponga preparación, entrada, frame, cambio de modo de control, suspensión y liberación. Comparte motor, Worker y canvas entre dos controladores: `timeline` en la 24 y `midi` en la 25. Su arranque en modo timeline adapta las APIs existentes:

1. Crear un host/canvas dedicado dentro de `#stage`.
2. Inicializar `FluidScene` y redimensionarlo a `STAGE.width/height`.
3. Inyectar el documento recuperado y entrar en el look `fluids-show`.
4. Entregar a cada frame `fluidsShowTime`, `fluidsShowPlaying`, ganancia de geometría, calidad y dimensiones.
5. Usar `EMPTY_AUDIO` en el show escrito, como hace el editor original; la modulación por micrófono del catálogo queda disponible para una incorporación posterior.

Enviar el documento sólo cuando cambia su revisión. `setDoc()` prepara integrales sobre toda la duración; no debe ejecutarse por frame.

En modo MIDI, los parámetros y acciones llegan desde `Params` y `Mapper` al mismo solver/render 2D. Desconectar la evaluación del director de timeline, sus eventos y sus gestos; pausar el reloj por sí solo no evita que un evento sostenido siga imponiendo valores. El cambio de controlador debe ocurrir antes de ejecutar el siguiente frame. No montar un segundo FluidScene para la 25.

### Convivencia con el motor actual

- El bucle de `Engine` continúa siendo el único que solicita frames visuales. Cuando está activo Fluids, omite actualización de capas, simulación MLS-MPM y compositor de Parte 1.
- Conservar inicialmente el renderer de Parte 1 suspendido. Hoy es dueño de `setAnimationLoop`; destruirlo también detendría el scheduler. Si la memoria exige liberarlo, primero mover el scheduler a un host independiente.
- Fluids dibuja directamente en su canvas: ya contiene HRC, composición y postproceso. No añadirle nuevamente AO y bloom del compositor actual.
- Aplicar brillo, blackout y encuadre del show a la superficie activa. Ocultar el canvas anterior no basta: se debe detener su trabajo real.
- La previsualización del editor usa telemetría/capturas de la salida activa con frecuencia acotada; no crea otro solver ni otro renderer.

### Cargas y cambios asíncronos

`SceneManager.goto()` es síncrono y no espera los hooks de entrada. Introducir un coordinador de transición que prepare el runtime y confirme cuándo puede mostrarse. Debe manejar:

- Estados `preparing / ready / active / suspended / error`.
- Solicitudes repetidas a la escena actual o pendiente sin redisparar el show.
- Un identificador de solicitud para descartar una carga que terminó después de pedir otra escena.
- Vuelta a una escena de Parte 1 sin que aparezca tardíamente el canvas de Fluids.
- Preparación de WASM, Worker, recursos y shaders antes del cue crítico, idealmente durante el armado inicial del show.

La transición 23→24 se plantea como salida a negro, cambio del motor activo y entrada de Fluids. El inicio temporal de Fluids se define en relación con ese cambio: si el audio lo controla el programa, empezar `t=0` al abrir la entrada; si el audio es externo, respetar su tiempo y compensar el cue de transición. No esconder los primeros eventos porque el fundido arrancó tarde.

### Dependencias y recursos

Mantener la copia completa como referencia y extraer un paquete de runtime dentro de `particlesvideo/visuales`, con dependencias resueltas desde el lockfile de Radiance. Aislar las importaciones de su Three mediante paquete/bundle ESM propio; no actualizar globalmente Three 0.176.0 de Parte 1.

Vite actual puede consumir TypeScript del adaptador, pero la comprobación de tipos de Radiance debe conservarse con su configuración separada. El origen declara Node 22 y usa Vite 7; no copiar su `package.json` encima del de Parte 1 ni cambiar el toolchain del show incidentalmente. Resolver reproducibilidad del paquete antes de integrarlo.

Servir recursos bajo un prefijo, por ejemplo `/radiance/`, y sustituir rutas absolutas del origen mediante un resolvedor de assets. Incluir Worker, JS/WASM del solver, audio, análisis, documento, texturas y avisos de procedencia. Verificar también el build de producción: que el Worker encuentre el WASM no puede depender del servidor 4180 ni del directorio `heidi`.

No se incorpora `/fluids` entero en un iframe como solución final: esa página posee su propio render, audio, controles y almacenamiento. Se reutilizan motor y editor separando esas responsabilidades.

## 4. Escenas 24 y 25: asignación definitiva

| Escena | Contenido | Quién gobierna el motor |
|---|---|---|
| **24 — Fluids / timeline** | PLAY de toda la escena pregrabada, con el timeline original de 152,694 s | Documento, director y transporte de Fluids |
| **25 — Fluids / MIDI** | Motor de fluidos 2D para desarrollar comportamiento reactivo en vivo | Parámetros y acciones MIDI/OSC del sistema actual |
| 26–29 | Reservadas, contenido pendiente | A definir por Manuel |

Las notas de escena ya existen en canal 10: nota 24 selecciona la 24 y nota 25 selecciona la 25. Conservar IDs y mapeos aprendidos. Los futuros mapeos de performance de la 25 se añaden mediante la migración existente y quedan filtrados por escena. Los hitos del timeline permanecen dentro de la 24 y no crean nuevos IDs globales.

### Escena 24: reproducir lo ya escrito

- Entrar desde otra escena prepara/reinicia el show y da PLAY desde `t=0`. No requiere después otro mensaje de play. La preparación previa debe permitir que empiece en el cue, según la política de audio definida en §5.
- Conservar completo el timeline, incluyendo sus curvas, eventos, colores, gestos disponibles, editor y navegación de ensayo. Es automatización del motor en tiempo real, no un video que reemplace al solver.
- Reiniciar debe rearmar explícitamente director, población del solver, estado temporal del render y transporte. `seek(0)` conserva historia física, y repetir `enter('fluids-show')` no garantiza un reset del mismo look. Adaptar y comprobar `resetFluidsShow()` para esta operación.
- Una nota repetida mientras la 24 ya está activa no vuelve a iniciar la pieza. `fluids.restart` queda como acción explícita de ensayo.
- Las acciones MIDI de performance preparadas para la 25 no alteran el contenido escrito de la 24. Los controles globales de escena, master y blackout siguen disponibles.
- Al terminar el timeline, detener su transporte y conservar el cierre previsto. No entrar automáticamente en la 25: la 25 se selecciona como las demás escenas del show.

### Escena 25: el mismo motor, dirigido por MIDI

- Mantener el solver, el renderer y el canvas de fluidos 2D; cambiar la fuente de control a `Params`/`Mapper`.
- Al entrar, detener el transporte local y desacoplar director, automatizaciones, eventos pendientes y gestos del timeline. Con reloj externo, dejar de aplicarlo al visual sin detener Ableton.
- Una pausa en el último tiempo de la 24 no constituye modo MIDI: también hay que quitar las fuerzas/emisores/luces temporales que el director dejó activos y establecer la base del modo en vivo.
- Propuesta inicial de continuidad: 24→25 conserva las partículas existentes mientras entrega el control a MIDI. Si se entra directamente en la 25 desde Parte 1, inicializar una base propia de ensayo. El aspecto inicial definitivo y los efectos por nota los definirá Manuel; no se presupone una coreografía nueva.
- El cambio de look actual llama a `stopFluidsShow()` y resetea partículas, materiales y radiancia. Implementar una transferencia de control específica si se conserva la continuidad; no asumir que llamar al modo manual existente deja intacta la simulación.
- Vaciar interacciones y pasos pendientes del Worker al cambiar de controlador. `cancelQueuedStep()` no cancela un paso ya enviado: cerrar ese paso y su respuesta antes de iniciar el primer paso MIDI, evitando que una respuesta tardía reactive órdenes del timeline. Mantener un único Worker.
- Preparar controles mapeables de emisión, posición y color de emisores, fuerzas, gravedad, viscosidad, luz e impulsos que el motor permita. Las notas/CC y sus comportamientos concretos se asignarán después; no convertir este objetivo en reactividad obligatoria por micrófono ni reutilizar arbitrariamente los golpes del show actual.
- Los cambios MIDI y ajustes en vivo no modifican el documento ni el autosave del timeline de la 24. Guardar la configuración live por separado.

### Salidas y vuelta a la 24

Volver de la 25 a la 24 restaura el documento de referencia, rearma la escena escrita y reproduce desde el principio. No debe heredar fuerzas, gestos, colores o parámetros temporales del modo MIDI. Al volver de cualquiera de las dos a Parte 1, suspender el Worker y detener el transporte local; el motor inactivo no sigue consumiendo GPU/CPU.

Los marcadores y seeks quedan como herramientas internas del timeline para ensayo. El muestreo por tiempo absoluto reconstruye controles, no la historia física completa de las partículas. Conservar y documentar esa semántica del original; no añadir reconstrucción costosa por cada marcador ni confundir esos accesos con las escenas 25 en adelante.

## 5. Transporte, edición y MIDI/OSC

La salida actual continúa siendo dueña del estado. `Params` contiene controles y acciones live; el documento complejo vive en un almacén versionado separado, también bajo autoridad de la salida. `vis-bus` se amplía para edición y estado del timeline. La escena selecciona un único controlador del motor: timeline en 24, MIDI en 25.

Operaciones propuestas, a registrar y documentar durante implementación:

| Operación | Propósito |
|---|---|
| `fluids.arm` | Preparar recursos y transporte antes del show |
| Entrada en escena 24 | Reiniciar y dar PLAY a la pieza completa; conservar protección contra notas repetidas |
| Entrada en escena 25 | Desacoplar timeline y habilitar control MIDI del mismo motor |
| `fluids.play`, `fluids.pause`, `fluids.restart` | Transporte y ensayo de la 24; reiniciar es distinto de recibir la nota de la escena activa |
| `fluids.seek(seconds)` / `fluids.cue(id)` | Navegación interna del timeline de la 24, sin cambiar la escena global |
| `fluids.document` + revisión, por bridge | Enviar un documento editado/importado sin convertirlo en cientos de mensajes por frame |
| Telemetría de tiempo, sección, duración y preparación | Playhead y diagnóstico del editor |
| Controles de ganancia/calidad necesarios | Integración con master y presupuesto de rendimiento |
| Parámetros/acciones live de fluidos 2D | Emisión, fuerzas, materiales e impulsos por MIDI/OSC, filtrados a la 25; mapeos concretos pendientes |

La selección de escena resuelve la precedencia: las curvas gobiernan la 24 y los controles live gobiernan la 25. Si más adelante se pide intervenir MIDI sobre la pieza escrita, añadir trims explícitos como una función nueva. Conservar ahora el documento de la 24 intacto y persistir por separado los ajustes y mapeos de la 25.

El timeline original se adapta como vista del editor actual: conserva lanes, waveform, edición, undo/redo, gestos e import/export. Sus componentes dejan de crear un motor visual y un transporte independientes. El refresco del playhead puede interpolar datos del reloj, pero no gobierna la música.

Separar pausa musical de congelación visual: en el original `fluidsShowPlaying=false` detiene reloj/emisión, pero puede continuar la física. Conservar ese comportamiento para paridad y exponer una suspensión explícita si hace falta congelar todo. El master y blackout actuales controlan imagen; no hacer que silencien audio por copiar el comportamiento de otra interfaz sin definirlo antes.

### Decisión de reloj pendiente

Se consultó si el audio lo reproduce Ableton o este programa. La arquitectura admite ambos; antes de implementar reproducción hay que seleccionar uno:

- **Audio en el programa:** reutilizar `AudioTransport` y `fluids.wav`, con `AudioContext.currentTime` como reloj. Armar audio mediante un gesto en la ventana propietaria antes de que lleguen cues MIDI; `BroadcastChannel` no transfiere la activación del usuario.
- **Audio en Ableton:** Fluids no reproduce otra copia del WAV. Añadir un transporte externo con tiempo absoluto, estado play/stop, offset del comienzo de este bloque y tratamiento de seek. OSC es una vía disponible; MIDI Clock por sí solo aporta tempo/pulsos, no una posición absoluta fiable del track. Una única nota de inicio tampoco corrige deriva ni relocalizaciones posteriores.

Para probar paridad inicialmente se puede usar el transporte local original. Eso no decide qué equipo reproducirá el audio durante el show final. En ninguno de los modos usar `Engine.time` limitado como reloj musical.

## 6. Fases y criterios de aceptación

| Fase | Trabajo | Debe quedar comprobado |
|---|---|---|
| 0 — Conservación | **Copia completa y export recuperado ya hechos.** Comparar con la sesión de navegador y fijar versión del documento | Curvas, eventos, colores y posibles gestos más recientes conservados; assets y hashes registrados |
| 1 — Referencia | Importar explícitamente el JSON recuperado en `/fluids`, o abrir la copia con un origen/perfil aislado; capturas en hitos y medición del track completo | Documento/revisión identificados: el localStorage original tiene prioridad sobre el JSON servido y no debe sustituir inadvertidamente la referencia; conservarlo sin borrar |
| 2 — Runtime aislado | Crear paquete/adaptador Fluid con controladores timeline/live, resolver dependencias y rutas Worker/WASM, mantener el contrato de frame externo | Arranca desde el proyecto destino, con el origen de `heidi` y servidor 4180 fuera de uso; un único solver y loop visual |
| 3 — Entrada en 24 | Añadir coordinador de preparación/transición y alternancia Parte 1/Fluids | 23→24 y 24→1/20/23 funcionan; el motor inactivo no consume frames ni deja audio local reproduciéndose; notas repetidas y cargas canceladas son seguras |
| 4 — Timeline completo en 24 | Conectar documento, reloj seleccionado, editor, transporte, persistencia e import/export | Entrar en 24 da PLAY a la pieza completa; editor y timeline conservados; notas repetidas no reinician ni las acciones live cambian lo escrito |
| 5 — Motor MIDI en 25 | Cambiar de controlador sobre el mismo runtime, definir base live y exponer parámetros/acciones para los mapeos posteriores de Manuel | 24→25 desactiva toda automatización del timeline; MIDI modifica el motor sin escribir en el documento; 25→24 restaura y reproduce la pieza original |
| 6 — Rendimiento y regresión | Medir show completo, transiciones, ráfagas y memoria; ejecutar pruebas de ambos proyectos | Cumple presupuesto de frame y mantiene aspecto/controles de escenas 1–23 |

La implementación comienza por cerrar el documento de referencia y extraer Fluid. Primero comprobar paridad del timeline completo en la 24; después habilitar el modo MIDI de la 25. El diseño detallado de sus reacciones se realizará con las próximas indicaciones de Manuel.

## 7. Presupuesto de rendimiento

Objetivo: 60 FPS y **presupuesto máximo de 20 ms por frame** para cumplir el mínimo solicitado de 50 FPS. Todavía no se ha medido la integración: los resultados de Parte 1 no demuestran el rendimiento de Fluids.

- Medir a 2688×1008 sobre la RTX 3090, con la carga de aplicaciones prevista para el show.
- Comenzar por render nativo 1× y comprobar paridad; la página original usa supersampling adaptable desde 2×. Activarlo en la salida sólo si la medición deja margen. Una reducción visual debe quedar identificada y comparada.
- Fluids permite habitualmente unas 14.000 partículas y ráfagas de hasta 36.000; el solver tiene capacidad para 40.000. Medir especialmente esos eventos del documento.
- HRC trabaja con perfiles de resolución distintos. Primero eliminar trabajo duplicado y medir; después ajustar calidad si hace falta, comparando luces y composición con la referencia.
- El Worker admite trabajo en vuelo y coalescencia: verificar duración de física, antigüedad del último snapshot y progreso real. Un canvas a 60 FPS mostrando una simulación retrasada no cumple el requisito.
- No cargar motores alternativos ni todos sus assets en GPU por haber conservado el repositorio completo.

Pruebas de aceptación:

1. Tres pasadas completas del track, incluyendo arranque frío preparado y repetición en caliente.
2. Medir intervalos reales entre frames y render efectivo, media, p95, p99, máximo y cantidad de intervalos >20 ms. Separar envío CPU, trabajo GPU cuando sea medible y tiempos del Worker.
3. Cambiar 23→24→25→24→20 repetidamente sin acumulación de Workers, listeners, contextos o memoria. Confirmar también entrada directa en 25.
4. Durante las explosiones y estrobos de la 24, inyectar notas mapeadas a la 25 y comprobar que no alteran ni reinician la pieza. Cambiar a 25 en medio de un atractor, una fractura y un gesto de prueba, incluyendo un paso del Worker en vuelo; verificar que el nuevo modo no sigue emitiendo órdenes del timeline y que sus ráfagas MIDI funcionan. Usar un documento de prueba separado si hace falta un gesto, sin modificar el show guardado.
5. Comparar eventos ancla al principio y al final del track para detectar deriva. Tras una pausa o un seek, medir recuperación temporal y continuidad física por separado.
6. Repetir las verificaciones de escenas 7, 20 y 21 de Parte 1 y una pasada de escenas 1–23.
7. Ejecutar build de producción y las pruebas relevantes existentes de documento, director y persistencia; añadir pruebas de transporte, cambio timeline/live, handoff, cancelación y propiedad del estado. Comparar el documento antes y después de una sesión MIDI: debe permanecer idéntico si no se editó explícitamente.

Si un caso supera 20 ms, registrar dónde ocurre y corregirlo antes de dar la integración por validada. No sustituir esa comprobación por los FPS del editor genérico de Radiance: algunas de sus métricas cuentan llamadas o tiempo CPU, no presentación real.

## 8. Otros contenidos conservados para después

| Contenido | Qué se conserva | Incorporación futura |
|---|---|---|
| Tres Masas | 18 cues, directores, geometría y editor dedicado | Puede reutilizar el mismo motor Fluid con sus ajustes por cue; requiere decidir ubicación después de Fluids |
| Fluid live | 11 looks y aperturas/directores existentes | Recursos para desarrollar la 25 y escenas live posteriores; conservarlos no activa sus directores automáticos en el modo MIDI |
| Depth Sorter | WebGPU, shaders, texturas y variantes Radiance | Adaptador propio; medir su WebGPU más overlay WebGL y corregir límites de tamaño antes de activarlo |
| Bloques | Planck, Three, HRC, paletas y acciones Q/W/E/R | Traducir acciones al Mapper y revisar encuadre 8:3 |
| Voronoi | Shader, atlas de bosque y variantes | Adaptador y validación del encuadre 2688×1008 |

Guardar estos contenidos no les asigna números definitivos ni los pone a renderizar. Su incorporación se hará usando el mismo contrato de runtime y los recursos ya copiados.

## Resultado esperado

Una única salida operable desde el editor y MIDI/OSC actuales: Parte 1 conserva sus escenas 1–23; **la 24 da PLAY al show completo de Fluids con su timeline conservado, y la 25 entrega ese mismo motor de fluidos 2D al control MIDI en vivo**. El resto de Radiance queda conservado localmente y disponible para ampliaciones, sin añadir carga al show activo.
