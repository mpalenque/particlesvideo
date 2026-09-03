const KEY = 'vis.settings';

// Params que son ESTADO vivo, no configuración: guardarlos no tiene sentido y además
// pelearían con quien los maneja (la escena actual, la posición de la línea, el alcance
// del piso que anima `floor.reveal`).
const NO_GUARDAR = new Set(['scene.current', 'line.x', 'floor.revealDist']);

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
export class Settings {
  constructor(params) {
    this.params = params;
    this.overrides = {};
    this._timer = null;
  }

  load() {
    let stored;
    try { stored = JSON.parse(localStorage.getItem(KEY) ?? '{}'); }
    catch { console.error('[vis] ajustes guardados ilegibles, se ignoran'); return; }

    let aplicados = 0;
    for (const [id, value] of Object.entries(stored)) {
      if (!this.params.has(id) || NO_GUARDAR.has(id)) continue;   // params que ya no existen
      this.overrides[id] = value;
      this.params.setDefault(id, value);
      this.params.set(id, value, { immediate: true });
      aplicados++;
    }
    if (aplicados) console.info(`[vis] ${aplicados} ajustes restaurados del editor`);
  }

  record(id, value) {
    if (!this.params.has(id) || NO_GUARDAR.has(id)) return;
    this.overrides[id] = value;
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
      try { localStorage.setItem(KEY, JSON.stringify(this.overrides)); }
      catch (err) { console.error('[vis] no se pudieron guardar los ajustes', err); }
    }, 250);
  }
}
