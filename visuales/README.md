# Visuales LED

Visuales en tiempo real (WebGPU / three.js + TSL) para la pantalla LED de 8 × 3 m
(**2688 × 1008 px**). Controlado por MIDI desde Ableton y por OSC.
El plan completo del proyecto está en `../../PLAN.md`; los desvíos y decisiones, en `NOTAS.md`.

---

## 1. Preparar la máquina (una sola vez)

1. **Chrome** actualizado (≥ 113, con WebGPU). Node 24 ya instalado.
2. **Escala de pantalla al 100 %** en Windows para la salida LED. Si `devicePixelRatio` no es 1
   las líneas de 1 px salen borrosas — el overlay de fps y el editor avisan si pasa.
3. **loopMIDI**: crear un puerto virtual llamado `Visuales`.
4. En **Ableton**: Preferencias → Link/Tempo/MIDI → activar *Track* en la salida `Visuales`.
   Las pistas MIDI que disparan visuales salen a ese puerto, cada una en su canal.
5. `npm install` dentro de esta carpeta.

Canales sugeridos (es solo orientación, todo se mapea con "learn"):

| Canal | Para qué |
|---|---|
| 1 | Escenas (`scene.goto`) |
| 2 | Batería: rayos, barridos, golpes |
| 3 | Sintes: grillas, línea, titileo |
| cualquiera | CC para parámetros continuos |

---

## 2. Arrancar

```
npm start          # servidor de desarrollo + bridge OSC juntos
```

o por separado:

```
npm run dev        # http://localhost:5173
npm run osc        # bridge OSC (UDP 9000 → WebSocket 8081)
```

Para el show conviene el build, que es más estable que el server de desarrollo:

```
npm run build
npm run preview    # también en el 5173
```

Después, `tools/launch-show.bat` abre las dos ventanas: la **salida** en kiosk sobre la LED y el
**editor** en el monitor. Antes de usarlo, ajustar `POS_X` dentro del `.bat` a la coordenada X
donde arranca la LED en el escritorio extendido.

- **Salida**: `http://localhost:5173/` — solo el canvas, sin ninguna UI encima.
- **Editor**: `http://localhost:5173/editor.html` — va en la otra pantalla.

El editor refleja la salida: si no está abierta la ventana de salida, avisa y espera.

---

## 3. El editor

Tres columnas:

1. **Escenas** — un botón por escena (la actual queda resaltada), tiempo de transición,
   entradas MIDI con checkbox, estado del bridge OSC con **puerto UDP editable**, y stats
   (fps, ms totales, ms de simulación y de render, partículas, aviso si `dpr ≠ 1`).
2. **Parámetros** — todos los controles agrupados, y debajo una **lista de referencia**
   filtrable con el `id` de cada parámetro, su rango, su **dirección OSC** (click para copiar)
   y la fuente MIDI/OSC que lo controla hoy.
3. **Mapeos** — la tabla fuente → destino, con **Learn**, monitor de los últimos mensajes y un
   panel para **probar** sin Ableton. Botones para guardar, exportar/importar JSON, restaurar el
   default y **exportar la hoja de referencia** (`.md` y `.csv`).

### Mapear una nota

1. "+ mapeo" → elegir el destino en la lista (por ejemplo `scene.goto`, con arg `7`).
2. Click en **Learn** (la fila parpadea) y tocar la nota en Ableton.
3. **Guardar**. Los mapeos quedan en el navegador; para que viajen con el proyecto,
   **Exportar JSON** y copiar el archivo a `public/mappings.default.json`.

Modos de mapeo: `trigger` (dispara), `toggle` (invierte), `gate` (mientras está apretada),
`velocity` (según la fuerza), `set` (fija un valor) y `range` (CC / OSC continuo).
Una misma nota puede ir a varios destinos, y un mapeo puede limitarse a ciertas escenas.

---

## 4. OSC

El bridge (`npm run osc`) escucha UDP en el **9000** y lo reenvía al navegador.
El puerto se cambia en vivo desde el editor.

Sin mapear nada funcionan estas direcciones:

| Dirección | Efecto |
|---|---|
| `/p/<grupo>/<nombre>` f | fija el valor en su rango nativo |
| `/pn/<grupo>/<nombre>` f (0..1) | fija el valor normalizado |
| `/a/<grupo>/<nombre>` [arg] | dispara una acción |
| `/scene` s\|i | cambia de escena |

La lista completa de nombres está en **`REFERENCIA-MIDI-OSC.md`** (y `.csv`), que se regenera
con `node tools/gen-reference.mjs` o desde el botón del editor.

---

## 5. Atajos en la ventana de salida (desarrollo)

| Tecla | Qué hace |
|---|---|
| `,` `.` | escena anterior / siguiente |
| `1`..`9` | ir a las primeras 9 escenas |
| `Espacio` | acción principal de la escena actual |
| `F` | overlay de fps |
| `E` | abrir el editor |
| `L` | invertir la línea · `R` rayo · `G` grillas · `W` pulso de la placa · `B` aristas de la caja |

En emergencia: `master.blackout` desde el editor apaga la salida.

---

## 6. Escenas

Los ids son los números del storyboard. `1b`, `2b`, `6b` y `6c` **no** son escenas: son acciones
dentro de su escena (`warning.bgOff`, `line.flip`, `sweep.white`, `sweep.solid`).
Las escenas 8 y 9 todavía no están definidas y por ahora repiten la 7.

### Agregar una escena

1. Agregar una entrada en `src/scenes/index.js` con `id`, `params` y `actions`.
2. Si necesita un elemento nuevo: crear `src/layers2d/` o `layers3d/NuevoElemento.js` con
   `static defineParams(params)` y `update(dt, t)`, registrarlo en el array `ELEMENTS` de su capa
   y agregar sus valores apagados a `src/scenes/base.js`.
3. Mapear su nota con Learn en el editor.

Regla que sostiene todo esto: **los elementos visuales no saben de MIDI, OSC ni escenas**.
Solo leen `Params` cada frame. Escenas y mapeos únicamente escriben en `Params`.

---

## 7. Calidad y rendimiento

`master.quality` en el editor cambia entre presets y se recuerda por máquina:

| Preset | Partículas | Bloom |
|---|---|---|
| `ultra` | 524 288 | sí |
| `high` (default) | 262 144 | sí |
| `medium` | 131 072 | sí |
| `low` | 65 536 | no |

Medido en la RTX 3090 del show, a 2688 × 1008 con bloom y sin vsync:
**262 144 partículas → 4.1 ms por frame (244 fps)**; **524 288 → 7.9 ms (127 fps)**.
Sobra margen para 60 fps en las dos.

**La ventana de la LED tiene que estar en primer plano.** Si Chrome la tapa o la minimiza, frena
`requestAnimationFrame`; hay una red de contención que mantiene el loop a ~4 fps, pero no
reemplaza tener la ventana al frente.

---

## 8. Herramientas de verificación (`tools/`)

Todas abren Chrome headless con WebGPU y no necesitan tocar el navegador a mano.
Requieren `npm run dev` corriendo.

| Comando | Para qué |
|---|---|
| `node tools/walk-scenes.mjs [carpeta]` | recorre las 23 escenas, dispara su acción principal y reporta fps/ms/errores |
| `node tools/shoot-scenes.mjs <carpeta>` | captura a 2688 × 1008 nativo para comparar con el storyboard |
| `node tools/smoke.mjs <url> <png> <seg> "<expr>"` | abre una página, evalúa una expresión y saca screenshot |
| `node tools/smoke-io.mjs` | prueba MIDI/OSC/mapper/editor de punta a punta |
| `node tools/gen-reference.mjs` | regenera `REFERENCIA-MIDI-OSC.md` y `.csv` |

---

## 9. OneDrive

Este sub-proyecto vive dentro de `particlesvideo/`, que está sincronizado por OneDrive.
`node_modules/` está en `.gitignore`; si el sync molesta o hace lento el `npm install`,
marcar `visuales/node_modules` como "Liberar espacio" o excluirla del sync.
