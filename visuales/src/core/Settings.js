const KEY = 'vis.settings';
const FORMATO = 2;

// Params que son ESTADO vivo, no configuración: guardarlos no tiene sentido y además
// pelearían con quien los maneja (la escena actual, la posición de la línea, el alcance
// del piso que anima `floor.reveal`).
const NO_GUARDAR = new Set(['scene.current', 'line.x', 'floor.revealDist']);

// Ajustes guardados con el formato 1 (una tabla plana id → valor, sin saber contra qué default
// se habían tocado) de estos params. Todos cambiaron de valor de fábrica al recalibrar los
// palitos, y `particles.wrapTop` además cambió de SIGNIFICADO (era un techo absoluto en metros,
// ahora es el margen por encima del borde de pantalla), así que un valor viejo ahí no es un
// gusto de Manuel: es un número que ya no quiere decir lo mismo.
const OBSOLETOS_V1 = new Set([
  'particles.count', 'particles.emissive', 'particles.wrapTop',
  'light.ambient', 'light.fill',
  'ao.amount', 'ao.distance', 'ao.thickness',
]);

// Persiste los ajustes que Manuel hace en el editor, apenas los hace.
//
// Guarda el valor como **default** del param, no solo como valor actual: `SceneManager.goto`
// cae en el default cuando ni la escena ni BASE listan el param, así que pisar el default es
// lo que hace que el ajuste sobreviva al próximo cambio de escena. Si la escena SÍ lista el
// param (por ejemplo `particles.baseColor` en la 12), la escena sigue ganando — que es lo
// correcto: el look de esa escena está definido en `scenes/index.js`.
//
// Solo se registra lo que viene del editor. Lo que cambian las escenas, el MIDI/OSC o la
// propia simulación (por ejemplo `box.yaw` girando con `box.yawSpeed`) no se guarda, si no
// el archivo crecería con estado que cambia 60 veces por segundo.
//
// **Cada ajuste guarda contra qué valor de fábrica se hizo.** Si después el código cambia ese
// valor de fábrica, el ajuste guardado se descarta solo al arrancar. Sin esto, retocar un
// default en el código no tenía ningún efecto en la máquina donde ese param se había tocado
// alguna vez en el editor: el valor viejo le ganaba en silencio y había que acordarse de ir a
// borrar los ajustes a mano. Nadie se acuerda de eso a las tres de la mañana antes de un show.
export class Settings {
  constructor(params) {
    this.params = params;
    this.overrides = {};
    this._timer = null;
    // Los valores de fábrica ANTES de que `load` empiece a pisarlos con `setDefault`.
    this.fabrica = new Map(params.list().filter((p) => !p.isAction).map((p) => [p.id, p.default]));
  }

  load() {
    let stored;
    try { stored = JSON.parse(localStorage.getItem(KEY) ?? '{}'); }
    catch { console.error('[vis] ajustes guardados ilegibles, se ignoran'); return; }

    const esV1 = stored.__formato !== FORMATO;
    const entradas = esV1 ? stored : (stored.overrides ?? {});

    let aplicados = 0;
    const descartados = [];
    for (const [id, guardado] of Object.entries(entradas)) {
      if (id === '__formato') continue;
      if (!this.params.has(id) || NO_GUARDAR.has(id)) continue;   // params que ya no existen

      const fabrica = this.fabrica.get(id);
      let value;
      if (esV1) {
        if (OBSOLETOS_V1.has(id)) { descartados.push(id); continue; }
        value = guardado;
      } else {
        // El código movió el valor de fábrica desde que se guardó esto: el ajuste es viejo.
        if (guardado.d !== fabrica) { descartados.push(id); continue; }
        value = guardado.v;
      }

      this.overrides[id] = { v: value, d: fabrica };
      this.params.setDefault(id, value);
      this.params.set(id, value, { immediate: true });
      aplicados++;
    }

    if (aplicados) console.info(`[vis] ${aplicados} ajustes restaurados del editor`);
    if (descartados.length) console.info(`[vis] ${descartados.length} ajustes viejos descartados (cambió su valor de fábrica): ${descartados.join(', ')}`);
    // Se reescribe si hubo migración o descarte, para no volver a evaluarlo en cada arranque.
    // Ojo con el `entradas.length`: sin eso, una instalación limpia (sin nada guardado) entraba
    // igual por acá y escribía un registro vacío 250 ms después de arrancar — o sea pisaba
    // cualquier cosa que se hubiera guardado en ese ratito.
    const huboMigracion = esV1 && Object.keys(entradas).length > 0;
    if (huboMigracion || descartados.length) this._scheduleSave();
  }

  record(id, value) {
    if (!this.params.has(id) || NO_GUARDAR.has(id)) return;
    this.overrides[id] = { v: value, d: this.fabrica.get(id) };
    this.params.setDefault(id, value);
    this._scheduleSave();
  }

  clear() {
    this.overrides = {};
    localStorage.removeItem(KEY);
    console.info('[vis] ajustes del editor borrados (recargar para volver a los valores de fábrica)');
  }

  // Agrupa la escritura: arrastrar un slider dispara decenas de cambios por segundo.
  _scheduleSave() {
    if (this._timer) return;
    this._timer = setTimeout(() => {
      this._timer = null;
      try { localStorage.setItem(KEY, JSON.stringify({ __formato: FORMATO, overrides: this.overrides })); }
      catch (err) { console.error('[vis] no se pudieron guardar los ajustes', err); }
    }, 250);
  }
}
