import * as THREE from 'three/webgpu';
import { uniform, uv, vec4, mix, float } from 'three/tsl';
import { STAGE } from '../config/stage.js';
import { placeQuad } from './Layer2D.js';

const POOL = 10;

// Barridos por bloque (escenas 6, 6b, 6c): el frente cruza el bloque de arriba abajo
// (o al revés) dejando una cola en gradiente. El sólido (6c) no tiene gradiente.
export class Sweeps {
  static defineParams(params) {
    params.define({ id: 'sweep.enabled', type: 'bool', default: false, label: 'Barridos', group: 'sweep' });
    params.define({ id: 'sweep.opacity', type: 'float', min: 0, max: 1, default: 1, label: 'Opacidad', group: 'sweep' });
    params.define({ id: 'sweep.duration', type: 'float', min: 0.1, max: 6, default: 1.2, label: 'Duración (s)', group: 'sweep' });
    params.define({ id: 'sweep.length', type: 'float', min: 0.1, max: 1.5, default: 0.7, label: 'Largo (frac. alto)', group: 'sweep' });
    params.define({ id: 'sweep.solidHeight', type: 'float', min: 0.1, max: 1, default: 0.5, label: 'Alto sólido', group: 'sweep' });
    params.define({ id: 'sweep.dirBlue', type: 'enum', options: ['down', 'up', 'random'], default: 'down', label: 'Sentido azul', group: 'sweep' });
    params.define({ id: 'sweep.dirWhite', type: 'enum', options: ['down', 'up', 'random'], default: 'up', label: 'Sentido blanco', group: 'sweep' });
    params.define({ id: 'sweep.dirSolid', type: 'enum', options: ['down', 'up', 'random'], default: 'random', label: 'Sentido sólido', group: 'sweep' });
    params.define({ id: 'sweep.blueColor', type: 'color', default: '#0000C8', label: 'Azul', group: 'sweep' });
    params.define({ id: 'sweep.whiteColor', type: 'color', default: '#C8C8C8', label: 'Blanco', group: 'sweep' });
    params.define({ id: 'sweep.avoidRepeat', type: 'bool', default: true, label: 'No repetir bloque', group: 'sweep', sceneReset: false });
    params.defineAction({ id: 'sweep.blue', label: 'Barrido azul (6)', group: 'sweep', argHint: 'random | 1..5' });
    params.defineAction({ id: 'sweep.white', label: 'Barrido blanco (6b)', group: 'sweep', argHint: 'random | 1..5' });
    params.defineAction({ id: 'sweep.solid', label: 'Bloque sólido (6c)', group: 'sweep', argHint: 'random | 1..5' });
  }

  constructor(ctx) {
    this.params = ctx.params;
    this.active = [];
    this.quads = [];
    this.lastBlock = -1;
    this._blue = new THREE.Color();
    this._white = new THREE.Color();
  }

  async init(scene) {
    for (let i = 0; i < POOL; i++) {
      const u = { color: uniform(new THREE.Color(0, 0, 1)), alpha: uniform(0), gradient: uniform(1), flip: uniform(0) };
      const material = new THREE.MeshBasicNodeMaterial({ transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
      // uv().y va 0..1 a lo largo del quad; con gradient=0 el barrido es sólido.
      const t = mix(uv().y, float(1).sub(uv().y), u.flip);
      const grad = mix(float(1), t, u.gradient);
      material.colorNode = vec4(u.color, grad.mul(u.alpha));

      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
      mesh.renderOrder = 8;
      mesh.visible = false;
      scene.add(mesh);
      this.quads.push({ mesh, u });
    }

    this.params.onAction('sweep.blue', (arg) => this.spawn('blue', arg));
    this.params.onAction('sweep.white', (arg) => this.spawn('white', arg));
    this.params.onAction('sweep.solid', (arg) => this.spawn('solid', arg));
  }

  spawn(type, arg) {
    if (!this.params.get('sweep.enabled')) return;

    let block;
    if (arg === undefined || arg === 'random') {
      do { block = Math.floor(Math.random() * STAGE.blocks); }
      while (this.params.get('sweep.avoidRepeat') && STAGE.blocks > 1 && block === this.lastBlock);
    } else block = Math.max(0, Math.min(STAGE.blocks - 1, Number(arg) - 1));
    this.lastBlock = block;

    const dirParam = type === 'blue' ? 'sweep.dirBlue' : type === 'white' ? 'sweep.dirWhite' : 'sweep.dirSolid';
    let dir = this.params.get(dirParam);
    if (dir === 'random') dir = Math.random() < 0.5 ? 'down' : 'up';

    this.active.push({ type, block, dir, t: 0, duration: this.params.get('sweep.duration') });
    if (this.active.length > POOL) this.active.shift();
  }

  update(dt) {
    const opacity = this.params.get('sweep.opacity');
    this._blue.set(this.params.get('sweep.blueColor'));
    this._white.set(this.params.get('sweep.whiteColor'));
    const lengthFrac = this.params.get('sweep.length');
    const solidFrac = this.params.get('sweep.solidHeight');
    const H = STAGE.height;

    for (const s of this.active) s.t += dt;
    this.active = this.active.filter((s) => s.t < s.duration);

    for (let i = 0; i < this.quads.length; i++) {
      const s = this.active[i];
      const { mesh, u } = this.quads[i];
      if (!s || opacity <= 0.001) { mesh.visible = false; continue; }

      const x0 = STAGE.blockBounds[s.block];
      const w = STAGE.blockBounds[s.block + 1] - x0;
      const len = (s.type === 'solid' ? solidFrac : lengthFrac) * H;
      const p = s.t / s.duration;

      // El frente va de fuera de pantalla a fuera de pantalla; la cola queda detrás.
      const front = s.dir === 'down' ? -len + p * (H + len * 2) : H + len - p * (H + len * 2);
      const top = s.dir === 'down' ? front - len : front;

      mesh.visible = true;
      u.color.value.copy(s.type === 'blue' || s.type === 'solid' ? this._blue : this._white);
      u.alpha.value = opacity;
      u.gradient.value = s.type === 'solid' ? 0 : 1;
      // El gradiente tiene que apagarse hacia la cola: depende del sentido y del flip de uv.
      u.flip.value = s.dir === 'down' ? 0 : 1;
      placeQuad(mesh, x0, top, w, len);
    }
  }

  dispose() {
    for (const q of this.quads) { q.mesh.geometry.dispose(); q.mesh.material.dispose(); }
  }
}
