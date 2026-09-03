# NOTAS

Qué se hizo distinto al plan y por qué, y problemas conocidos. Corto.

## Fase 0

- `editor.html` se creó como placeholder vacío (el editor real es Fase 2) porque `vite.config.js`
  lo lista como entrada de build y si no existe `npm run build` falla.
- Identidad de git configurada **local** en el repo (`particlesvideo/.git/config`), no global.

## Fase 1

- **DoubleSide obligatorio en la capa 2D.** La ortográfica en píxeles
  (`OrthographicCamera(0, 2688, 0, 1008, ...)`, top=0 / bottom=1008) invierte el eje Y y con eso
  el winding de las caras: con `FrontSide` los quads quedan culleados y no se ve nada.
  Todos los materiales 2D llevan `side: THREE.DoubleSide`.
- `makePerspective` en r176 tiene la firma de 7 argumentos del plan (sin `reversedDepth`): sin cambios.
- **Off-axis verificado numéricamente**: con el ojo en (0, 1, 4) el horizonte (piso y=0 en el infinito)
  proyecta a píxel y = 672.7 y el borde inferior de la pantalla (z=0, y=0) a y = 1008 exacto.
  Coincide con la predicción del plan (§2.3).
- `tools/smoke.mjs` (agregado, no estaba en el plan): abre la salida en Chrome headless con WebGPU vía
  CDP, junta consola/excepciones, evalúa una expresión en la página y saca screenshot. Sirve para
  verificar los criterios de aceptación de cada fase sin abrir el navegador a mano.
  Uso: `node tools/smoke.mjs http://localhost:5173/ out.png 8 "expresión"`.
- `Engine` saltea el frame si el anterior no terminó (`_busy`), para no encimar frames si la GPU se atrasa.

## Fase 2

- **Canales MIDI se emiten 1..16**, no 0..15 como decía el plan (§7.1). Es lo que ya usan el archivo
  de mapeos (`"channel": 1`) y el editor, así que evita una conversión en el medio.
- El editor muestra un cartel **"Esperando la ventana de salida"** y reintenta el `hi` cada 1.5 s:
  la salida es la dueña del estado, y abrir `editor.html` solo mostraba una UI vacía sin explicación.
- `src/editor/reference.js` (archivo nuevo, no estaba en el árbol del plan): nomenclatura OSC
  automática + generación de la hoja `REFERENCIA-MIDI-OSC.md` / `.csv`. Lo usan ParamsPanel
  (lista de referencia) y MappingsPanel (botón de exportar), por eso está fuera de `panels/`.
- `tools/smoke-io.mjs` (agregado): prueba automática de la fase — abre salida + editor en el mismo
  Chrome headless y verifica bridge, learn, fan-out, filtro por escena, persistencia, OSC real por UDP
  y la hoja de referencia. 16/16 en verde.
- **Verificado con OSC real**: `/p/`, `/pn/` y `/scene` por UDP; cambiar el puerto desde el editor
  hace que el bridge reabra el socket (probado 9000 → 9001 con el mensaje llegando al param).

## Fase 3

- **Texturas 2D necesitan `flipY = false`.** Igual que el culling de la Fase 1, es consecuencia de que
  la ortográfica invierte Y: con el `flipY` por defecto de three la textura sale espejada en vertical.
  Verificado dibujando un rectángulo rojo en la esquina 0,0 del canvas.
- **No se usa `screenCoordinate`.** Las grillas sacan el píxel de `uv() × tamaño del quad`: el quad
  mapea 1:1 a píxeles, así que da coordenadas exactas sin depender de la orientación de la pantalla
  ni de la convención de Y de WebGPU. Verificado contando píxeles: líneas de exactamente 1 px.
- **Medidas de la placa sacadas del storyboard con canvas** (no a ojo): ámbar real `#F2A100`,
  período horizontal 329.5 px, chevrones de 35 px con período vertical 70 y amplitud pico a pico 96,
  banda de 48 px con líneas de 2, cajas de 225 × 24.
  El storyboard mide 1976 × 464 (4.26:1), **no** tiene el aspecto de la LED (8:3), así que no hay una
  escala única: el ritmo horizontal se escala por ancho (×1.360 → 6 columnas de 448 px, como el plan)
  y los tamaños verticales por alto (×2.172), para que la banda y el texto conserven su peso visual.
  Todo está en el objeto `LAYOUT` arriba de `WarningPlate.js` para ajustarlo a ojo en un solo lugar.
- **Celdas de grilla 84 × 63 px** (medidas del storyboard 4.png), puestas en las escenas 4/5/6, no como
  default del param: el registro mantiene 96 × 96 como dice la tabla del plan.
- `tools/shoot-scenes.mjs` (agregado): saca una captura por escena/disparador para comparar con el
  storyboard. Fuerza el viewport a 2688 × 1008 con `Emulation.setDeviceMetricsOverride` y recorta al
  canvas — **sin eso las capturas salen a escala CSS (~0.35×) y las líneas de 1 px desaparecen al
  reescalar**, que al principio pareció un bug del shader y no lo era.

### Limitaciones conocidas (no son bugs)

- **Chrome headless no da permiso de Web MIDI** (`NotAllowedError`), así que el MIDI real solo se puede
  probar en el Chrome de Manuel con loopMIDI. El parseo (note on/off, velocidad 0 = off, CC, canal)
  sí se verificó llamando al parser directamente.
- **Una pestaña en segundo plano frena `requestAnimationFrame`** (fps → 0). En el show no molesta
  porque salida y editor son ventanas visibles en monitores distintos, pero la ventana de la LED
  tiene que estar en primer plano. Se ataca en la Fase 9.

## Fase 4

- `Floor` usa `positionWorld` + `fwidth` para el antialias de carriles y dashes; el `aa` se clampea a
  un mínimo para que cerca del horizonte `smoothstep` no reciba los bordes invertidos.
- Cada elemento 3D multiplica su opacidad por `layer3d.opacity` en su `update` (explícito, sin
  acoplar los elementos a la capa).
- **Horizonte verificado con la cámara en vivo**: con el ojo a 2.2 m el punto de fuga cae en y ≈ 269 px,
  que es exactamente 1008 × (1 − 2.2/3). Con el ojo a 1.0 m cae en 672. La pantalla funciona como ventana.
- El cubo de prueba de la Fase 1 se eliminó.

## Fase 5

Port del MLS-MPM. Dos calibraciones fueron necesarias porque **la grilla del repo original era
anisotrópica** (celdas de 0.125 × 0.047 × 0.047 m) y la nuestra es isotrópica de 0.1 m:

- **`DENSITY_CALIBRATION = 9` en `MlsMpmSimulator.js`.** El volumen natural del fluido es
  `count / restDensity` celdas, que con la fórmula del original queda fijo en ~82 m³ con nuestras
  celdas — 4× la caja de 2.6 × 3 × 2.6 m. El fluido quedaba aplastado contra las paredes y se veía
  como un bloque blanco sólido. La constante lo lleva a ~9 m³ con `particles.density` en su default.
- **Tamaño del palito en metros (`BASE_THICKNESS_M` / `BASE_LENGTH_M` en `StickRenderer.js`).**
  El original metía la relación de aspecto de sus celdas en la escala del objeto; acá se expresa
  directo en metros. Calibrado contra STORYBOARD/10.png: con los defaults del plan (262144, size 2,
  length 1) da palitos de ~3.3 mm × 2.5 cm. Los defaults del registro **no** cambiaron.
- Ojo con esto si se cambia `stage.sim.cellSize`: las dos constantes están atadas al tamaño de celda.

Otros desvíos:

- La pared exterior del dominio está **siempre activa** (no solo cuando la caja está desactivada):
  es el borde del escenario, y es lo que sostiene el modo "libres" de la escena 20.
- `?stats` en la URL activa `trackTimestamp` del renderer (tiene costo, por eso no va en el show).

### Rendimiento medido (RTX 3090, 2688 × 1008, con bloom, sin vsync)

| Partículas | ms/frame | fps |
|---|---|---|
| 262 144 (default) | 4.09 | 244 |
| 524 288 (preset "ultra") | 7.87 | 127 |

Sobra margen para 60 fps en las dos: el preset "ultra" es viable para el show.
Las consultas de timestamp de la GPU devuelven 0 en Chrome headless (la feature no está
habilitada), así que la medición es de throughput real con vsync desactivado.

## Fase 6

- **`floor.revealDist` es estado (`sceneReset: false`)**, así que saltar directo a una escena 12+
  dejaba el piso invisible aunque `floor.opacity` fuera 1. Las escenas que quieren el piso ya
  extendido lo listan explícitamente (`'floor.revealDist': 60`); solo la 7 y la 11 animan el reveal.
- **Atractores y repulsores usan división protegida** (`d / max(len(d), 0.001)`) en vez de
  `normalize()`: un slot vacío tiene d = 0 y `normalize` daría NaN, que se propaga a toda la
  velocidad. Se recorren siempre los 4 / 8 slots; los vacíos tienen fuerza 0 y no aportan.
- **Escena 21**: con los valores del plan (swirl 1.2 / pull 0.6) la fuerza centrífuga dispersa las
  partículas contra las paredes del dominio en vez de juntarlas. Subido a pull 1.0 y radio 3.0.
  Es puro gusto y los dos son params mapeables, así que Manuel lo termina de afinar a ojo.
- Verificado: el yaw continuo envuelve bien en ±180 y las partículas siguen a la caja al girar y al
  trasladarse; el titileo alterna a la frecuencia y duty pedidos.
