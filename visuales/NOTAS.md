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

### Limitaciones conocidas (no son bugs)

- **Chrome headless no da permiso de Web MIDI** (`NotAllowedError`), así que el MIDI real solo se puede
  probar en el Chrome de Manuel con loopMIDI. El parseo (note on/off, velocidad 0 = off, CC, canal)
  sí se verificó llamando al parser directamente.
- **Una pestaña en segundo plano frena `requestAnimationFrame`** (fps → 0). En el show no molesta
  porque salida y editor son ventanas visibles en monitores distintos, pero la ventana de la LED
  tiene que estar en primer plano. Se ataca en la Fase 9.
