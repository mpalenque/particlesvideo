# Operación de Fluids — previa 24 y PLAY 25

**Decisión vigente, 2026-09-06: 24 prepara; 25 reproduce la secuencia visual. El audio siempre sale de Ableton.** Esta guía reemplaza la operación anterior «24 PLAY / 25 live / WAV local». [Contexto actual](../CONTEXTO-ACTUAL.md) · [Configuración completa](../CONFIGURACION.md) · [Sistemas](../ARQUITECTURA-Y-SISTEMAS.md).

## Abrir el programa y el timeline

Desde `particlesvideo/visuales`:

```powershell
npm ci
npm start
```

`npm ci` instala también las dependencias aisladas de Radiance desde su lockfile. Para producción: `npm run build`, después `npm run preview -- --port 5173`; ejecutar además `npm run osc` si se usa OSC.

| Ventana | URL |
|---|---|
| Salida, nombre `vis-salida` | `http://localhost:5173/` |
| Escenas, parámetros, MIDI/OSC y Learn | `http://localhost:5173/editor.html` |
| Timeline de Fluids | `http://localhost:5173/fluids.html` |

El editor general tiene enlace al timeline. **ABRIR SALIDA** en el timeline reutiliza la ventana `vis-salida`. Mantener la salida visible en la pantalla del show.

## Secuencia operativa

1. Enviar **Note On canal 10, nota 24**: aparece la **previa negra con sólo una línea blanca**. El motor queda preparado, sin partículas ni eventos de emisión; timeline en 0, detenido. La línea usa posición/tamaño iniciales del documento, blanca e intacta, con rotación 0.
2. Iniciar el audio desde Ableton y enviar **Note On canal 10, nota 25** en el punto de arranque: comienza desde cero la **secuencia completa del timeline**, de 152,694 s en el documento incluido.
3. Para repetir, usar **REINICIAR** / `fluids.restart`, o volver a la previa y entrar nuevamente en 25. Las notas repetidas de la misma escena activa no reinician.
4. Al final, se mantiene la escena 25 y su cierre congelado; no avanza a otra escena automáticamente.

La previa deja el estado de comienzo listo. El paso 24→25 usa ese estado preparado para iniciar el reloj sin un nuevo reset o espera del Worker en el cue. La entrada directa en 25 tiene su propia preparación y arranque desde cero. Si se pide otra escena mientras hay una preparación pendiente, esa solicitud anterior se cancela.

Las escenas **26–29 siguen libres**. El motor live y sus controles se conservan sin una escena asignada; la 25 ya no es un modo live ni la 26 lo reemplaza.

## Audio siempre externo

**La web no reproduce sonido.** `fluids.wav` permanece como referencia de waveform/análisis y puede decodificarse offline; no necesita armar salida de audio ni conceder reproducción por clic.

El reloj visual usa tiempo absoluto local desde el cue. Esto **no es sincronización absoluta con Ableton**: una nota de inicio no comunica sus pausas, seeks o saltos posteriores ni corrige deriva entre relojes. Al ensayar un fragmento, mover manualmente ambos transportes o emitir los comandos visuales correspondientes.

`fluids.audioMode` sólo admite `external`. Un ajuste antiguo `local` o `silent` no debe habilitar reproducción. `fluids.arm` conserva el nombre por compatibilidad y **sólo prepara el motor y referencias**.

## Transporte y controles

| Acción | Comportamiento actual |
|---|---|
| `fluids.standby` | Selecciona la previa 24. |
| `fluids.play` | Selecciona 25 y empieza, o continúa si su transporte estaba pausado. |
| `fluids.pause` | Pausa el reloj visual mientras está en 25. La física conserva la semántica del motor original y puede seguir moviéndose. |
| `fluids.restart` / reinicio del editor | Reinicia explícitamente la secuencia 25 desde cero, incluso si ya estaba seleccionada. |
| `fluids.seek` con segundos | Busca dentro del timeline de 25 para ensayo; no cambia la posición de Ableton. |
| Loop del editor | Sólo para ensayo visual. Entrar en 24 o 25 lo desactiva para ejecutar la secuencia completa. El audio externo no recibe ese loop automáticamente. |
| Master / blackout | Modifican la imagen; no detienen ni silencian Ableton. |

Un seek cambia el tiempo de evaluación de curvas y eventos, **no reconstruye toda la historia física de las partículas**. Para repetir la evolución desde una población limpia, usar la previa y el inicio o el reinicio explícito.

Los mapeos de escenas son `scene.goto` con argumentos `24` y `25`. No agregar otro `fluids.play` a la misma nota de entrada. Usar los números MIDI del monitor: las etiquetas de octava de Ableton y otras aplicaciones pueden variar. [Puertos, canales y mapeos](../CONFIGURACION.md).

## Editar y conservar el show

`fluids.html` mantiene lanes de curvas, eventos, gestos, waveform, zoom, deshacer/rehacer e importación/exportación. La salida posee el documento, su revisión y el motor; el editor sólo envía órdenes y ediciones. El preview opcional es JPEG 672×252 a 2 Hz, sin segundo solver.

Para grabar gestos, armar REC y operar sobre la superficie del editor durante la secuencia de 25. El export conserva curvas, eventos, colores y gestos. Undo/redo pertenecen a la sesión del editor y no sobreviven a una recarga.

Las ediciones llevan su revisión de base. Una revisión desactualizada se rechaza; exportar el borrador antes de elegir **CARGAR VERSIÓN DE SALIDA** si se quiere conservar. Los botones de sembrado reconstruyen contenido desde el análisis y no deben usarse para recuperar una edición escrita del usuario.

| Dato | Ubicación |
|---|---|
| Documento incluido | `public/radiance/show/fluids.show.json` |
| Documento editado y revisión | `localStorage['vis.radiance.show.v1']`, propiedad de Output |
| WAV de referencia | `public/radiance/audio/fluids.wav` |
| Waveform/análisis | Decodificación offline y `public/radiance/show/fluids.analysis.json` |
| Mapeos aprendidos / ajustes | `vis.mappings` y `vis.settings`, separados del documento |
| Plan original y explicación del show | [Documentación original preservada](../origen-radiance/INDICE.md) |

El export incluido fue recuperado de `C:/Users/mpale/Downloads/fluids.show.json`: **152,694 s, 256 eventos, 400 claves, 0 clips de gesto**. No se comprobó si el navegador original conserva una edición posterior; se puede importar un JSON más reciente sin resembrar. [Procedencia del export](estado-copia.json).

Cambiar de puerto o de `localhost` a `127.0.0.1` cambia el almacenamiento del navegador. **EXPORTAR** crea una copia trasladable. Las claves originales `radiance-fluids-show-doc-v1`, `radiance-tres-masas-page-v2` y `radiance-live-show-state-v2` permanecen separadas.

## Qué está comprobado

Para la decisión nueva hay **217 tests de código aprobados**: 203 del paquete Radiance, 9 de sesión, 4 de preview y 1 de mapeos, junto con TypeScript y build. Están aprobados el flujo 24/25, MIDI sin reinicio por notas repetidas, previa blanca y vacía, ausencia de audio web, editor remoto y recursos/cues bajo `/show/`. El último ensayo de desarrollo también comprueba desactivar el loop al entrar. [Evidencia nueva](VALIDACION-CUES-24-25.md).

El rendimiento no permite garantizar que nunca habrá caídas: la primera prueba nueva de producción registró un máximo de 83,6 ms y 45 intervalos >20 ms; su repetición sin cambios de código dio máximo 17,5 ms y ninguno >20 ms. El último ensayo de desarrollo dio máximo 17,8 ms y ninguno >20 ms. Las aplicaciones observadas activas después de la primera medición pueden competir por recursos; no se aisló una causa única.

El [informe de rendimiento anterior](RENDIMIENTO.md) conserva las tres pasadas de la asignación previa. No validan este cambio. En esas mediciones el solver bajó de 50 Hz en algunas ventanas, aunque la presentación se mantuvo a ~60 FPS; no se declara resuelto el requisito estricto de física ni ausencia de retrasos.

Se mantiene el ancho de rayos de Parte 1 en **0,014 m**. Respaldos de la primera integración: `17ff81a` en `particlesvideo` y `e91ec3b` en la copia completa de Radiance. El origen de `heidi` permanece separado y la copia documental original está verificada archivo por archivo con SHA-256.
