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
  }

  stop() {
    this.renderer.setAnimationLoop(null);
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
      if (this.sim) await this.sim.update(dt);
      this.compositor.update();
      await this.compositor.render();
    } catch (err) {
      console.error('[vis] error en el frame', err);
      this.stop();
    }

    this.frameMs = performance.now() - t0;
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
        const dpr = window.devicePixelRatio;
        this.fpsEl.textContent = `${this.fps} fps · ${this.frameMs.toFixed(1)} ms${dpr !== 1 ? ` · dpr ${dpr} (!)` : ''}`;
      }
      this._frames = 0;
      this._fpsAccum = 0;
    }
  }
}
