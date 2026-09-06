# Operación de Fluids — escenas 24 y 25

Actualizado: 2026-09-06. **Integración funcional, presentación de producción y preview verificados. La física no cumple aún el mínimo estricto de 50 Hz durante toda la pieza.**

La escena **24 reproduce el timeline completo de Fluids**. La **25 entrega el mismo motor de fluidos 2D al control MIDI/OSC en vivo**. Las escenas 26–29 siguen reservadas. Los mapeos de selección existentes se mantienen: **canal MIDI 10, nota 24 o nota 25**. Las notas repetidas de la escena activa no reinician el show.

## Arranque

Desde `particlesvideo/visuales`:

```powershell
npm ci
npm run build
npm run preview
```

`npm ci` ejecuta el `postinstall` que instala también `vendor/radiance` desde su propio lockfile. Se conservan Three 0.176.0 para Parte 1 y las dependencias de Radiance por separado. Para OSC, ejecutar además `npm run osc`. En desarrollo se usa `npm run dev`.

1. Abrir la salida en `http://localhost:5173/` y dejarla visible. La aplicación identifica esa ventana como `vis-salida`.
2. Abrir `http://localhost:5173/editor.html` para escenas, parámetros y mapeos MIDI/OSC.
3. Abrir **Timeline Fluids** desde ese editor, o `http://localhost:5173/fluids.html` directamente. **ABRIR SALIDA** reutiliza la ventana `vis-salida`.
4. Antes del cue 24, elegir cómo se reproduce el audio. Por defecto es **WAV EN SALIDA**: hacer clic en **Armar audio de Fluids en la propia ventana de salida**. El clic en otra ventana y una nota MIDI no transfieren al navegador ese permiso de reproducción.
5. Una vez preparada y con audio habilitado, la nota 24 del canal 10 entra en la escena y reproduce desde cero. También se puede seleccionar **24 · SHOW GRABADO** en el timeline.

WASM, Worker, shaders, documento, WAV decodificado y waveform se preparan antes del show. Si llega la 24 sin audio habilitado, la salida espera el armado; el reloj no arranca oculto. Los recursos se sirven desde este proyecto, sin necesitar el servidor original de Radiance.

## Audio, transporte y final

| Modo | Funcionamiento |
|---|---|
| **WAV EN SALIDA / local** | Reproduce `public/radiance/audio/fluids.wav`. El reloj sigue `AudioContext.currentTime`, independiente del delta limitado de la física. Requiere armar audio en la salida. |
| **AUDIO EN ABLETON · RELOJ DESDE CUE / silent** | El programa no reproduce el WAV. Al entrar en 24 inicia un reloj local absoluto desde cero. Es una elección explícita para acompañar audio externo. |

El modo `silent` **no recibe la posición absoluta de Ableton**: una nota de inicio no comunica seeks, pausas ni relocalizaciones posteriores y no corrige deriva entre los relojes. La sincronización externa absoluta queda pendiente de una integración específica. Cambiar de modo de audio pausa el transporte; reanudarlo es una acción explícita.

- **Entrada en 24 / REINICIAR:** reinicia población, director, radiancia y transporte; comienza en cero. `fluids.restart` permite repetir estando ya en 24.
- **PLAY / PAUSA:** gobiernan el transporte de la 24. La pausa conserva el comportamiento del original: se detienen el reloj y la emisión temporal, pero la física puede seguir moviendo el fluido.
- **Buscar / scrub:** evalúa curvas y eventos en el tiempo elegido; conserva la historia física que ya exista. Para repetir desde una población limpia, usar **REINICIAR**.
- **Loop:** lo controla la salida; el editor sólo envía el rango y su activación. En audio local se utiliza el loop del reproductor de audio.
- **Final de la 24:** el reloj queda en 152,694 s y se congela el cierre visual. No avanza automáticamente a la 25.
- **Master y blackout:** afectan la imagen. No silencian ni pausan el audio.
- **Salir a la 25 o a Parte 1:** detiene el transporte local. No controla la reproducción de Ableton.

## Editor del timeline

`fluids.html` conserva las lanes de curvas, eventos, gestos y waveform, zoom, edición, deshacer/rehacer, grabación de gestos e importación/exportación JSON. La ventana de salida es la propietaria del documento, del audio y del motor. Abrir el timeline no crea otro solver ni otro render completo de Fluids.

La vista previa es opcional y se actualiza a **2 FPS**. Ese número corresponde al preview; la salida continúa usando el bucle del show. Para grabar gestos, armar REC y operar sobre la superficie de interacción del editor mientras reproduce la 24. El export conserva los gestos grabados junto con las curvas y eventos.

Cada edición se envía con la revisión de documento sobre la que se hizo. Si otra ventana cambió esa revisión, la salida rechaza el reemplazo desactualizado. Ante un conflicto, **EXPORTAR** conserva la edición local antes de usar **CARGAR VERSIÓN DE SALIDA**. Deshacer/rehacer pertenecen a la sesión del editor y no sobreviven a una recarga.

Los botones de sembrado reconstruyen contenido desde el análisis de audio; no son una operación de migración ni de recuperación de ediciones. Para cargar un documento posterior escrito en el proyecto original, exportarlo allí e **IMPORTAR** ese JSON aquí.

## Escena 25: control del motor en vivo

El cambio **24→25 conserva las partículas existentes**, desacopla el director del timeline, sus geometrías, eventos y gestos, y aplica una base de control live. Una entrada directa a la **25 desde Parte 1 empieza vacía**: usar **Ráfaga** (`fluids.live.burst`) o subir **Emisión** para generar partículas. `Espacio` dispara la ráfaga principal estando en 25.

No se agregó una coreografía MIDI ni se reasignaron las notas musicales del show. Los siguientes controles están disponibles en **Parámetros**, y se pueden asignar con **Learn** en **Mapeos**, filtrando las filas a la escena 25:

| Parámetro | Rango | Valor inicial | Efecto |
|---|---|---|---|
| `fluids.live.emission` | 0–1 | 0 | Emisión continua; 1 solicita 2.400 partículas/s, limitada por población. |
| `fluids.live.x`, `fluids.live.y` | 0–1 | 0,5 | Posición normalizada del emisor y de las acciones. |
| `fluids.live.hue` | 0–1 | 0 | Tono del material emisor. |
| `fluids.live.gravity` | −1–1 | 0 | Gravedad del fluido. |
| `fluids.live.viscosity` | 0–1 | 0,5 | Viscosidad/freno de la base live. |
| `fluids.live.cohesion` | 0–1 | 0,5 | Cohesión de los materiales. |
| `fluids.live.light` | 0–3 | 1 | Intensidad luminosa. |
| `fluids.live.forceX`, `fluids.live.forceY` | −1–1 | 0 | Fuerza continua por eje. |

| Acción | Argumentos / comportamiento |
|---|---|
| `fluids.live.burst` | Cantidad numérica o payload `{count, x, y, material}`. Por defecto solicita 180; rango por ráfaga 3–3.000; materiales 0–2. La emisión respeta un techo live de 14.000 partículas. |
| `fluids.live.attractor` | Payload `{mode, x, y, radius, strength}`. Posición 0–1; radio 0,01–0,5; fuerza 0–4. Valores por defecto: `attract`, posición del emisor, radio 0,22 y fuerza 0,7. |
| `fluids.live.reset` | Vacía el fluido live y reinicia la radiancia. |

El motor procesa la emisión por sus tres subpasos; cantidades menores al margen disponible pueden ajustarse a múltiplos de tres. Si se hereda de la 24 una población superior al techo live, se conserva y no se añade más hasta que haya espacio. Las acciones live se ejecutan únicamente mientras la 25 está activa. Sus ajustes y mapeos no escriben curvas ni eventos en el documento de la 24.

## Documento, procedencia y respaldo

La referencia incluida es el export recuperado de `C:/Users/mpale/Downloads/fluids.show.json`, modificado el 06/09/2026 a las 01:19:47: **152,694 s; 256 eventos; 400 claves; 0 clips de gesto**. SHA-256:

```text
666bec48c4d0d6218e20ab6599e76ec1040502e633f825fc85614d8c803fe24d
```

Se encuentra en `public/radiance/show/fluids.show.json`. **No se verificó que coincida con la última sesión del navegador original.** Si existe un export más reciente, se puede importar después; no hace falta borrar ni resembrar la versión actual. [Estado de la copia y del export](estado-copia.json).

| Datos | Dónde quedan |
|---|---|
| Documento integrado y revisión | `localStorage['vis.radiance.show.v1']`, guardado por la salida. Tiene prioridad sobre el JSON incluido. |
| Configuración y mapeos live | Mecanismos existentes de Settings y Mapper; separados del documento. Exportar mapeos desde `editor.html` para llevarlos a otra máquina. |
| Datos originales de navegador | `radiance-fluids-show-doc-v1`, `radiance-tres-masas-page-v2`, `radiance-live-show-state-v2`. La integración no escribe estas claves. |
| Proyecto original | `C:/Users/mpale/OneDrive/Desktop/heidi/radiance-live-show`, conservado sin modificaciones. |
| Copia completa de respaldo | `PARTE 1/radiance-live-show`, con código, assets, documentación, herramientas e historial. |
| Fuentes consumidas por Visuales | `vendor/radiance/src`, lockfile/configuración propios y todos los assets públicos bajo `public/radiance`. |

El snapshot integrado depende del origen del navegador: `localhost`, `127.0.0.1` y distintos puertos tienen almacenamientos diferentes. **EXPORTAR** el documento es la copia trasladable.

Antes de integrar se guardaron dos commits: **`17ff81a` en `particlesvideo`** conserva el show previo; **`e91ec3b` en la copia `radiance-live-show`** conserva el timeline exportado. La copia original se verificó archivo por archivo con SHA-256: **6.254 archivos, ninguna diferencia**; el export recuperado se añadió por separado.

La integración conserva el ancho de rayo de Parte 1 en **0,014 m**. Los motores alternativos de Radiance están preservados para futuras escenas y no se ejecutan en la salida 24/25.

## Verificación y límites actuales

| Comprobación | Estado al escribir esta guía |
|---|---|
| Pruebas del paquete Radiance | 198 aprobadas. |
| Pruebas de documento/transporte integrado | 8 aprobadas; incluyen igualdad completa del documento publicado, revisiones, relojes, loops y armado de audio. |
| Preview, tipos y compilación | 4 tests del preview aprobados; 210 tests en total. TypeScript y build de producción aprobados. |
| Tres pasadas completas con build de producción | 9.156 / 9.156 / 9.155 frames activos a 60,001 FPS; p99 17,1 ms; máximos 17,8 / 17,8 / 17,9 ms; ningún intervalo >20 ms. |
| Física durante esas pasadas | Promedios 58,52 / 57,13 / 57,94 Hz; menores ventanas de 1 s 50,95 / 42,45 / 45,49 Hz. No cumple el mínimo estricto en toda la pieza. |
| Regresión 1–23 y cambios entre motores | Aprobados. Escenas 20/21 con y sin rayos: cuatro casos de 601 frames a ~60 FPS, máximo global 18,5 ms, ninguno >20 ms. |
| Editor de producción | Siete comprobaciones funcionales aprobadas, incluidas edición/ACK/deshacer, ruta MIDI, cancelación durante transición y DPR 1 / 1,3 / 1,5 / 2. |
| Rendimiento con preview remoto | Corregido: 427 frames a 60,001 FPS, p99 17,2 ms, máximo 18,6 ms y ninguno >20 ms. Las 15 capturas completaron sin errores; máximo de captura en hilo principal 0,3 ms tras preparación. |

La presentación cumplió el presupuesto de 20 ms a 2688×1008 en las tres pasadas. El solver WASM tuvo pasos de hasta 36,4 ms y snapshots de hasta 38,2 ms de antigüedad: seguir presentando a 60 FPS no significa recibir física nueva a ese ritmo. **No se declara resuelto el requisito de cero retrasos o mínimo 50 Hz de física.** Se preservan los tres subpasos del show escrito. [Mediciones completas y límites](RENDIMIENTO.md).

Una diferencia corregida al integrar: el arranque genérico original podía crear 20.000 partículas y depender de cruzar el evento `reset-fluid` de 0,05 s. Ese evento podía perderse en el primer salto de tiempo. La entrada integrada en 24 vacía explícitamente el solver antes de iniciar el reloj en cero.

Para repetir las verificaciones de código: `npm run check:radiance` y `npm run build`. [Plan y estado de integración](PLAN-INTEGRACION-RADIANCE.md).
