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
- **Piso: de shader procedural a geometría real.** Manuel lo pidió explícitamente ("cubitos pero
  finitos", "quiero que sea PURO el pixel"). Cada dash es ahora una **caja instanciada** en vez de
  un patrón pintado con un shader filtrado: cada píxel sale blanco puro o negro puro, sin el gris
  de promediar que a él le leía como ruido.

  La grilla entera (41 carriles × 110 filas = 4510 instancias) se arma **en el vertex shader** desde
  `instanceIndex`: no hay matrices que componer ni subir por frame. El scroll es el patrón
  desplazándose módulo el período, así que el loop no se nota. Param nuevo `floor.dashHeight`
  (0.03 m) porque las cajas tienen altura; `floor.contrast` se eliminó (no aplica sin filtrado).

  **El costo de esto es aliasing en movimiento**: sin filtrado, los dashes lejanos titilan cuando el
  piso avanza. Es la contrapartida inevitable de tener pixel puro, y fue una decisión consciente de
  Manuel después de ver las dos versiones. Si en la LED el titileo molesta, la palanca es bajar
  `floor.fadeFar` para que no se dibujen los que ya no se resuelven.

  Rendimiento: 444 fps solo el piso, 184 con las partículas encima (sin vsync).

## Palitos iluminados con ambient occlusion

**Punto de retorno: tag `palitos-basicos`.** Es el commit anterior a este cambio, con los palitos
como `MeshBasicNodeMaterial` transparentes sin luces ni AO. Para volver:
`git checkout palitos-basicos -- visuales/src/layers3d/particles/StickRenderer.js visuales/src/render/Compositor.js`
(y sacar `Lights` del array `ELEMENTS` de `Layer3D`).

- **Material**: pasó de `MeshBasicNodeMaterial` a `MeshStandardNodeMaterial`, con `depthWrite: true`
  para que los palitos se tapen entre sí de verdad y el GTAO tenga profundidad con la que trabajar.
  Sigue con `transparent: true` **a propósito**: con `transparent: false` el `opacityNode` se ignora
  y `particles.opacity` dejaba de fundir las partículas en las transiciones de escena. Con alpha 1
  se comporta igual que un opaco.
- **`computeVertexNormals()` obligatorio**: `createRoundedBox` reescribe posiciones e índices, así
  que las normales que traía la `BoxGeometry` quedaban mal y three avisaba
  ("Vertex attribute normal not found"). Sin normales el material iluminado no tiene con qué trabajar.
- **AO**: GTAO (`three/examples/jsm/tsl/display/GTAONode.js`) sobre el pase 3D. El MRT ahora saca
  también `normal: transformedNormalView`, que junto con la profundidad es lo que necesita.
  Params `ao.enabled`, `ao.amount`, `ao.distance`, `ao.thickness`.
  Ojo: `ao.enabled: false` solo pone la mezcla en 0, el pase se sigue calculando — no ahorra tiempo.
- **Luces** (`Lights.js`): ambiente + principal + relleno, todo parametrizado (posición, color e
  intensidad) para poder animarlo por MIDI/OSC más adelante.
- **Tamaño por partícula**: campo `age` nuevo en el struct, que avanza en segundos reales y se
  resetea al reubicar y al reaparecer por wrap. El tamaño es densidad × `particles.ageGrow`
  (crecen al nacer) × una variación fija por partícula (`particles.sizeJitter`, hash del índice) —
  sin esa variación todos los palitos miden exactamente lo mismo y se nota.
- **Titileo** (`particles.flicker`, `particles.flickerRate`): cada partícula tiene su propia fase,
  así la masa "hierve" en vez de parpadear entera. Es lo que da el efecto de estar por explotar.

Costo: 184 → 165 fps (6 ms/frame) con partículas + piso, incluyendo GTAO y luces.

## Otros ajustes

- **Escena 1**: el texto ADVERTENCIA hace scroll continuo hacia la izquierda (`warning.scroll` 90)
  y el fondo late con `warning.bgPulse` / `warning.bgPulseRate`. El latido toca **solo** el quad de
  los chevrones; la banda y el texto van en otro quad, así que nunca se apagan.
- **Escena 23** ("A punto de explotar"): torbellino mucho más fuerte (swirl y pull 4, radio 1.6),
  `particles.speed` 1.6, titileo de partículas y de la caja a 14 Hz, emisión propia al 0.5,
  y **sin piso** (`floor.opacity` 0).

## Resolución fija (no escala con la ventana)

Manuel pidió explícitamente que el contenido no se reescale al cambiar el tamaño de la ventana.
`view.mode` default pasó de `'fit'` a `'native'`: el canvas siempre mide 2688 × 1008 en CSS
(pixel a pixel), y al redimensionar la ventana solo se recentra, nunca se escala. `P` sigue
disponible para pasar a `'fit'` si hace falta ver el cuadro completo en una ventana chica durante
el desarrollo, pero ya no es el default — ni en desarrollo ni en el show.

## Antialiasing de las diagonales de la escena 1

Las franjas ámbar del fondo se pintaban columna por columna con `fillRect` de 1 px: sin
antialiasing en el borde diagonal, quedaba en escalones (visible en zoom). Reemplazado por
**trazos vectoriales**: cada franja es una polilínea por los vértices exactos del zigzag,
y Canvas2D antialíasa los bordes de cualquier trazo por defecto.

El grosor pedido (`stripe`) es vertical, pero `lineWidth` mide perpendicular al trazo; en una
pendiente perpendicular = vertical × cos(ángulo), así que se compensa (`cosAngle` calculado desde
la geometría del zigzag) para que el ancho visual de la franja sea el mismo que antes.

## MSAA de hardware en el pase 3D

Manuel pidió mejorar más el antialiasing de los carriles del piso y confirmar que se usa WebGPU.
Confirmado: `renderer.backend.constructor.name === 'WebGPUBackend'`, `isWebGPUBackend === true`.

Se agregó **MSAA 4x real** (`pass(scene, camera, { samples: 4 })`) solo al pase 3D — es
antialiasing de hardware, no un shader: suaviza el borde de cualquier geometría (cubitos del piso,
palitos, aristas de la caja) sin el costo de un post-proceso ni el efecto de "promediar" que hizo
que sacáramos el filtrado analítico del piso. La capa 2D **no** lleva MSAA (necesita líneas a pixel
exacto). `render.msaa` (bool, default true) lo prende/apaga; el `renderTarget.samples` se reasigna
cada frame pero el backend de WebGPU solo recrea el render target si el valor realmente cambió
(lo compara él mismo), así que no tiene costo cuando no cambia.

Nota técnica: WebGPU solo soporta 1 o 4 muestras por pixel (no 2 o 3), por eso el param es bool y
no un número intermedio.

Costo: sin cambio medible (242 fps con partículas + AO + luces, escena 13). Las 23 escenas siguen
a 60 fps.

## Bloques rojos, debris y persistencia de ajustes

- **Bloques rojos (escenas 14/15)**: `redBlock.height` 2.4 → 7 m y param nuevo `redBlock.y`
  (centro, default 1.5). La pantalla va de y=0 a y=3, así que el bloque va de −2 a 5 y **se pasa
  por arriba y por abajo**: nunca se le ven los bordes horizontales y lee como bloque entero.
  `redBlock.width` 2.2 → 3.2. Es un desvío deliberado del storyboard (ahí estaba apoyado en el
  piso), pedido por Manuel.
- **Debris (escenas 17+)**: ahora vuela y se apaga **en el aire**, sin llegar al piso.
  `debris.lifetime` 3 → 0.9 s, `debris.floorCollision` nuevo (default false; en true vuelve el
  rebote y la fricción de antes) y `debris.fadeFraction` (0.7) para que el fade sea largo y visible.
  El chequeo del piso solo corre **mientras bajan**: nacen a ras del suelo y suben, así que mirar
  la altura sin más las mataba en el frame en que se creaban. Medido: antes llegaban a y = −1.45 m
  (se hundían bajo el piso y se veían por los huecos entre dashes); ahora el mínimo es 0.002 m,
  suben hasta 0.79 m y ninguna queda apoyada.
- **Los ajustes del editor se guardan solos** (`core/Settings.js`). Los mapeos ya se guardaban;
  lo que se perdía al recargar eran los params de los sliders.

  La clave es que se guarda como **default** del param, no solo como valor actual: `goto` cae en el
  default cuando ni la escena ni BASE listan el param, así que pisar el default es lo que hace que
  el ajuste sobreviva al próximo cambio de escena. Si la escena SÍ lista el param, la escena sigue
  ganando — que es lo correcto, el look de esa escena está definido en `scenes/index.js`.

  Solo se registra lo que viene del editor (`{t:'set'}` por el bus). Lo que cambian las escenas, el
  MIDI/OSC o la simulación (por ejemplo `box.yaw` girando con `box.yawSpeed`) no se guarda, si no el
  archivo crecería con estado que cambia 60 veces por segundo. Se excluyen además `scene.current`,
  `line.x` y `floor.revealDist`, que son estado vivo y no configuración.
  Botón **"Restaurar ajustes de fábrica"** en el editor. Verificado con `tools/smoke-persist.mjs`:
  ajustar → recargar → siguen; restaurar → vuelven los valores de fábrica.

## Palitos: tamaño, dirección, oclusión y flujo de la escena 12

Cuatro pedidos de Manuel, con el diagnóstico de por qué pasaba cada cosa.

### 1. "Falta detalle, son demasiado chicos"

Los palitos medían 3.3 mm × 2.5 cm. Con 336 px/m en la LED eso es **1.4 px de ancho por 10 de
largo**: menos de un pixel de sombreado útil, así que no se veía ni el volumen del palito ni la
oclusión entre palitos — la masa quedaba como ruido plano de un solo color.

Ahora miden **9 mm × 8 cm (≈ 3 × 27 px)** y hay la mitad de partículas
(`BASE_THICKNESS_M` 0.00825 → 0.0140, `BASE_LENGTH_M` 0.0625 → 0.125, `particles.count`
262144 → 131072, y los presets de `master.quality` bajaron un escalón cada uno). Menos y más
grandes: con las cantidades viejas y este tamaño la caja se tapaba sola y volvía a verse plana.

**La iluminación no cambió de nivel, cambió de relación**: `light.ambient` 0.55 → 0.32 y
`light.fill` 1.1 → 0.8, con la principal quieta en 3.2. Con el ambiente alto la cara en sombra
de cada palito nunca bajaba de medio tono, así que tanto el degradado como el AO quedaban
aplastados. `particles.emissive` 0.15 → 0.08 por lo mismo.

### 2. "Se note su dirección"

Tres arreglos, uno de bug y dos de diseño:

- **Bug del `lookAt`**: `calcLookAtMatrix` usaba un eje de referencia fijo `(0,0,1)`, así que
  para una partícula que viaja **hacia la cámara** el `cross` daba el vector nulo y la
  orientación salía basura. Y con `direction` en cero (partícula frenada) `normalize` daba NaN.
  Ahora el eje de referencia se elige según la dirección y hay guarda para el vector nulo.
- **Bug del heading**: `direction` se guardaba como `mix(direction, vel, 0.1)`, o sea un vector
  cuyo módulo *era* la velocidad. Con la partícula casi quieta quedaba en ~0 y el palito
  temblaba sin rumbo. Ahora se guarda **siempre unitario**, el suavizado es por segundo real
  (`particles.turnRate`) y no por frame, y ante velocidad ~0 conserva el último rumbo.
- **Forma de cometa**: `particles.taper` afina la cola y `particles.headTail` la apaga, así el
  palito tiene punta adelante. Es lo que hace que a 3 px de ancho se lea para dónde va.

### 3. "El flujo azul tiene que salirse de pantalla y seguir emitiendo"

La escena 12 tenía `box.enabled: true` con la caja invisible: el chorro chocaba contra el techo
de la caja y se apelmazaba en un hongo **dentro del cuadro**. Ahora `box.enabled: false` y la
caja queda solo como **encuadre del emisor** (`box.width` / `box.depth` son el ancho y el fondo
del chorro, aunque el límite esté apagado).

Sacar la caja sola no alcanzaba: el techo del dominio estaba en 3.5 m, apenas por encima de la
pantalla, y las partículas chocaban igual contra la pared del dominio. Dos cambios más:

- **El dominio sube a 7 m** (`STAGE.sim.max`, grilla 90 × 75 × 60). Hay lugar de sobra arriba
  del cuadro para que el chorro se vaya antes de reciclarse.
- **El techo del reciclado no es un plano horizontal**: es el **borde superior del encuadre**,
  que en perspectiva sube con la profundidad (a 2 m de fondo hay que llegar más alto para
  salirse del cuadro). La CPU manda la recta `y = wrapA + wrapB·z` en unidades de grilla
  (`_updateWrapLine`, sale del ojo y de `STAGE.physical.heightM`) y el kernel la evalúa por
  partícula. `particles.wrapTop` dejó de ser un techo absoluto: ahora es **cuántos metros por
  encima del borde de pantalla** se recicla.

Además la escena lleva `particles.drag: 0.22`. Sin rozamiento el flujo constante acelera sin
techo y termina todo en blanco; con rozamiento el chorro llega a una velocidad estable
(flujo/roce) y se mantiene azul parejo. Verificado a los 8 s y a los 25 s: misma densidad y
misma altura, sin acumulación.

### 4. "El pasaje a blanco se hace en chunks"

Dos causas, las dos arregladas:

- La velocidad sale de **interpolar la grilla**, así que todas las partículas de una misma celda
  comparten valor: el color quedaba cuantizado al tamaño de la celda y saltaba de golpe. Ahora
  hay un campo `speedSmooth` en el struct de la partícula (promedio exponencial,
  `particles.speedSmooth`) y es ese el que colorea.
- Aunque el valor sea suave, si **todas** las partículas usan el mismo umbral una zona de
  velocidad parecida se da vuelta entera de un frame para el otro. `particles.whiteJitter`
  corre el umbral de cada partícula un poco al azar, así la zona **se disuelve** palito por
  palito. Comparado A/B: con jitter en 0 el borde rojo/blanco es un blob macizo; con 0.7 hay
  una franja mezclada de decenas de píxeles.

El campo nuevo entra en el padding que ya tenía el struct: sigue midiendo 28 floats, no ocupa
un byte más.

### AO de verdad

El radio del GTAO estaba en **0.35 m** para palitos de 9 mm que se tocan a pocos centímetros:
medía la silueta de toda la nube y no veía nada del hueco entre palito y palito. Bajó a
**0.10 m** (probado también 0.05 y 0.25; 0.10 es el que mejor separa sin perder la forma).

Con un radio chico el GTAO sale **muy ruidoso** (rota sus muestras con una textura de ruido), y
ahí subir la calidad se ve como suciedad. Se agregó el **`denoise` bilateral** de three
(`DenoiseNode`, guiado por profundidad y normal) después del AO: es lo que convierte el
granulado en sombra limpia. Params nuevos: `ao.contrast`, `ao.samples`, `ao.denoise`.

También se le dio atributo `normal` a la `EdgesGeometry` de la caja: el MRT le pide
`transformedNormalView` a todo lo del pase 3D y sin el atributo three avisaba por consola y el
buffer de normales quedaba con basura justo donde van las aristas — que es lo que después lee
el GTAO.

Costo: **5–6 ms/frame** en la escena 13 (contra 6 ms antes), o sea el denoise se paga solo con
las partículas que sacamos. Las 23 escenas siguen a 60 fps.

**Ojo con los ajustes guardados**: `Settings` persiste lo que se toca en el editor pisando el
*default*. Si en alguna sesión anterior se movieron `ao.*` o `light.*` a mano, esos valores le
ganan a los defaults nuevos — hay que borrar los ajustes del editor para ver los de fábrica.
