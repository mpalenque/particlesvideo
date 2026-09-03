import * as THREE from 'three/webgpu';

const MAX_DT = 1 / 30; // clamp: un frame lento no debe "saltar" la simulación

// Fase 0: loop rAF mínimo + fps. Layers/compositor/params se enchufan en fases siguientes
// sin tocar esta clase (Engine solo orquesta el orden del frame).
export class Engine {
  constructor(renderer) {
    this.renderer = renderer;
    this.clock = new THREE.Clock();
    this.fpsEl = null;
    this.fpsVisible = false;
    this._frames = 0;
    this._fpsAccum = 0;
    this._running = false;

    // Placeholder hasta que Layer3D exista (Fase 1): escena vacía para que renderAsync tenga algo válido.
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, this.renderer.domElement.width / this.renderer.domElement.height, 0.1, 100);
    this.camera.position.z = 5;
  }

  initFpsOverlay() {
    this.fpsEl = document.createElement('div');
    this.fpsEl.id = 'fps';
    this.fpsEl.style.display = 'none';
    document.body.appendChild(this.fpsEl);
    window.addEventListener('keydown', (e) => {
      if (e.key === 'f' || e.key === 'F') {
        this.fpsVisible = !this.fpsVisible;
        this.fpsEl.style.display = this.fpsVisible ? 'block' : 'none';
      }
    });
  }

  start() {
    this._running = true;
    this.renderer.setAnimationLoop(() => this._tick());
  }

  stop() {
    this._running = false;
    this.renderer.setAnimationLoop(null);
  }

  async _tick() {
    const dt = Math.min(this.clock.getDelta(), MAX_DT);
    this._updateFps(dt);
    await this.renderer.renderAsync(this.scene, this.camera);
  }

  _updateFps(dt) {
    this._frames++;
    this._fpsAccum += dt;
    if (this._fpsAccum >= 0.5) {
      const fps = Math.round(this._frames / this._fpsAccum);
      if (this.fpsEl) this.fpsEl.textContent = `${fps} fps`;
      this._frames = 0;
      this._fpsAccum = 0;
    }
  }
}
