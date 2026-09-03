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

## Fase 7

- **Un slot de repulsor por rayo, desde que cae hasta que se apaga el impacto.** El plan pedía
  8 rayos simultáneos y `MAX_REPULSORS` = 8; en vez de sumar slots aparte para las ondas expansivas,
  cada rayo se queda con el suyo durante toda su vida (caída → onda de 0.3 s → libera). Así entra
  todo en los 8 slots sin cambiar el límite.
- `Debris` preasigna todo (4000 instancias, `Float32Array` por atributo, matrices y quaternions
  reutilizados): no se crea ni un objeto por frame en el loop.
- Verificado: 8 barras cayendo a la vez a 6 m/s con sus 8 repulsores publicados, 480 esquirlas
  al impactar que se apagan solas, y 245 fps sin vsync con partículas + rayos + bloom.

## Fases 8 y 9

- **`master.quality`** agrega un preset `ultra` (524 288) además de los tres del plan, porque en la
  3090 sobra margen. Se persiste en `localStorage` (depende de la máquina, no del show).
- **`simMs` y `renderMs` son tiempo de CPU, no de GPU.** `computeAsync` vuelve antes de que la GPU
  termine, así que `simMs` da casi 0 y `renderMs` se lleva casi todo. Sirven para ver dónde se traba
  la CPU, pero el número real de rendimiento es el frame time / fps. Las consultas de timestamp de
  la GPU (`?stats`) devuelven 0 en Chrome headless; en el Chrome normal de Manuel deberían andar.
- **Red de contención para el rAF frenado**: si la ventana queda tapada, un `setInterval` mantiene
  el loop a ~4 fps para que el show no quede congelado. No reemplaza tener la ventana al frente.
- **Objetos por frame**: verificado que ningún `update` crea materiales, geometrías ni vectores en
  loops calientes (`Debris` preasigna todo para sus 4000 instancias). Lo único que se asigna por
  frame son arrays de ≤ 10 elementos al compactar los pools de barridos, líneas y rayos —
  despreciable y no crece con la cantidad de partículas.
- `tools/walk-scenes.mjs`, `tools/soak.mjs` y `tools/gen-reference.mjs` agregados (ver README §8).
- **Pendiente de Manuel**: `public/mappings.default.json` tiene las filas de cada escena y un ejemplo
  de cada modo, pero **sin fuente asignada**. Hay que hacer el learn con Ableton y después
  Exportar JSON → copiar sobre ese archivo para que los mapeos viajen con el proyecto.

### Prueba de estabilidad (`node tools/soak.mjs 10 22`)

10 minutos en la escena 22 con un rayo cada 400 ms, 262 144 partículas y bloom, a 2688 × 1008:

```
fps  mín 60  máx 60
heap 68 MB → 67 MB (máx 73)
geometrías 11 (estable)
errores: ninguno
```

Sin caída de fps ni crecimiento de memoria. Cumple el criterio de la Fase 9.

## Nitidez del piso (post Fase 9)

Manuel reportó que las tiras del piso se veían pixeladas / "resampleadas". Eran dos cosas distintas:

1. **El shader difuminaba de más.** El antialias usaba `smoothstep` con `fwidth`, que es isotrópico:
   en el piso, con la cámara casi a ras, el pixel se estira muchísimo en Z respecto de X, así que
   el borde se desparramaba ~6 px. Reemplazado por **filtrado analítico** (`pulseCoverage` en
   `Floor.js`): se integra el tren de pulsos y se calcula la cobertura EXACTA del pixel, por eje
   por separado. Con pixel chico da el borde nítido con su fracción justa; con pixel grande
   converge al promedio (gris uniforme) en vez de moiré. Borde medido: 6 px → 4.3 px en el campo
   medio, y ~1 px en el cercano.
2. **La ventana reducía el canvas.** Lo que se veía en una ventana de ~1700 px era el canvas de
   2688 reducido por el navegador, no la salida real. Ahora el escalado se hace poniendo el
   **tamaño CSS del canvas** en vez de un `transform: scale()` (filtra mejor), y **`P` alterna a
   vista 1:1** para poder juzgar nitidez de verdad. El buffer de dibujo siempre es 2688 × 1008.

## Ajustes pedidos por Manuel al ver el resultado

- **Línea blanca detrás del marco rojo** (escena 2): `MovingLine` pasó de `renderOrder` 20 a 6,
  debajo del marco (10).
- **Grillas cuadradas**: el modo grueso usaba ancho-del-bloque × media pantalla (rectangular);
  ahora la celda es un cuadrado del ancho del bloque. Las finas de las escenas 4/5/6 pasaron de
  84 × 63 (medido del storyboard) a 84 × 84.
- **Los palitos se salían de la caja.** El resorte de pared era preventivo pero no garantizaba nada,
  y con la caja moviéndose o girando se escapaban. Se agregó un **clamp final** en espacio local de
  la caja que los deja siempre adentro, invirtiendo la velocidad normal con `box.wallBounce` (0.2).
- **Palitos ~25 % más grandes** y **transición a blanco mucho más tardía**
  (`whiteSpeedMin` 0.6 → 2, `whiteSpeedMax` 3 → 7): con los valores viejos apenas aceleraban
  ya se ponían blancos y se perdía el rojo/azul de la escena.
- **Piso más nítido y con más presencia a la distancia.** Tres cambios: dashes más gruesos
  (carriles 0.5 → 0.7 m, ancho 0.08 → 0.15, largo 0.4 → 0.55), el `farFade` deja de comer el campo
  medio (empieza al 85 % de `fadeFar`, que subió a 45 m) y se agregó **`floor.contrast`** (gamma
  sobre la cobertura filtrada, default 0.45). El promedio de área es físicamente correcto pero deja
  un gris muy oscuro lejos; el gamma lo levanta sin volver al aliasing.
