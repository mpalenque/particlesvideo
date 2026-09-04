import * as THREE from 'three/webgpu';

const MAX_DT = 1 / 30; // clamp: un frame lento no debe "saltar" la simulación

// Orquesta el orden del frame (§11.8). No sabe de MIDI, escenas ni elementos concretos.
export class Engine {
  constructor(ctx, { layer2d, layer3d, compositor }) {
    this.ctx = ctx;
    this.params = ctx.params;
    this.scenes = ctx.scenes;
    this.renderer = ctx.renderer;
    this.layer2d = layer2d;
    this.layer3d = layer3d;
    this.compositor = compositor;
    this.sim = null;                 // lo setea la Fase 5

    this.clock = new THREE.Clock();
    this.time = 0;
    this.fps = 0;
    this.frameMs = 0;
    this.simMs = 0;
    this.renderMs = 0;
    this._lastFrameAt = 0;
    this.fpsEl = null;
    this.fpsVisible = false;
    this._frames = 0;
    this._fpsAccum = 0;
    this._busy = false;
  }

  initFpsOverlay() {
    this.fpsEl = document.createElement('div');
    this.fpsEl.id = 'fps';
    this.fpsEl.style.display = 'none';
    document.body.appendChild(this.fpsEl);
  }

  toggleFps() {
    this.fpsVisible = !this.fpsVisible;
    if (this.fpsEl) this.fpsEl.style.display = this.fpsVisible ? 'block' : 'none';
  }

  start() {
    this.renderer.setAnimationLoop(() => this._tick());
    // Red de contención: si la ventana queda tapada Chrome frena requestAnimationFrame y el
    // show se congela. Esto lo mantiene vivo a ~4 fps. NO reemplaza tener la ventana al frente.
    this._watchdog = setInterval(() => {
      if (!this._busy && performance.now() - this._lastFrameAt > 500) this._tick();
    }, 250);
  }

  stop() {
    this.renderer.setAnimationLoop(null);
    clearInterval(this._watchdog);
  }

  async _tick() {
    if (this._busy) return;          // no encimar frames si la GPU se atrasa
    this._busy = true;
    const t0 = performance.now();
    const dt = Math.min(this.clock.getDelta(), MAX_DT);
    this.time += dt;

    try {
      this.params.update(dt);
      this.scenes.update(dt);
      this.layer2d.update(dt, this.time);
      this.layer3d.update(dt, this.time);

      const tSim = performance.now();
      if (this.sim) await this.sim.update(dt);
      this.simMs = performance.now() - tSim;

      const tRender = performance.now();
      this.compositor.update();
      await this.compositor.render();
      this.renderMs = performance.now() - tRender;
    } catch (err) {
      console.error('[vis] error en el frame', err);
      this.stop();
    }

    this.frameMs = performance.now() - t0;
    this._lastFrameAt = performance.now();
    this._updateFps(dt);
    this.ctx.bridge?.tick(this);
    this._busy = false;
  }

  _updateFps(dt) {
    this._frames++;
    this._fpsAccum += dt;
    if (this._fpsAccum >= 0.5) {
      this.fps = Math.round(this._frames / this._fpsAccum);
      if (this.fpsEl && this.fpsVisible) {
        // El dpr ya no es un error: `fitStage` compensa la escala de pantalla dividiendo el
        // tamaño CSS del canvas, así que el cuadro sale 1:1 igual. Se sigue mostrando porque
        // con una escala que no sea múltiplo entero el navegador puede correr medio píxel al
        // redondear, y porque saber que la máquina no está en 100% ayuda a entender el resto.
        const dpr = window.devicePixelRatio;
        const aviso = dpr !== 1 ? ` · dpr ${dpr.toFixed(2)} (compensado; mejor Windows al 100%)` : '';
        this.fpsEl.textContent = `${this.fps} fps · ${this.frameMs.toFixed(1)} ms (sim ${this.simMs.toFixed(1)} · render ${this.renderMs.toFixed(1)})${aviso}`;
      }
      this._frames = 0;
      this._fpsAccum = 0;
    }
  }
}
