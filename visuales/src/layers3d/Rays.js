import * as THREE from 'three/webgpu';
import { uniform, mrt, float } from 'three/tsl';
import { MAX_REPULSORS } from './particles/Forces.js';

const POOL = MAX_REPULSORS;   // un slot de repulsor por rayo, desde que cae hasta que se apaga el impacto
const SHOCK_TIME = 0.3;

// Rayos blancos que caen y explotan en el piso (escenas 17+). Cada rayo publica un repulsor
// de segmento mientras cae, y al tocar el piso dispara debris y una onda expansiva.
export class Rays {
  static defineParams(params) {
    params.define({ id: 'rays.enabled', type: 'bool', default: false, label: 'Rayos', group: 'rays' });
    params.define({ id: 'rays.opacity', type: 'float', min: 0, max: 1, default: 0, label: 'Opacidad', group: 'rays' });
    params.define({ id: 'rays.fallSpeed', type: 'float', min: 0.5, max: 30, default: 6, label: 'Velocidad (m/s)', group: 'rays' });
    params.define({ id: 'rays.length', type: 'float', min: 0.1, max: 4, default: 0.8, label: 'Largo (m)', group: 'rays' });
    params.define({ id: 'rays.width', type: 'float', min: 0.01, max: 0.5, default: 0.1, label: 'Ancho (m)', group: 'rays' });
    params.define({ id: 'rays.startY', type: 'float', min: 3, max: 8, default: 4.5, label: 'Altura inicial (m)', group: 'rays' });
    params.define({ id: 'rays.zMin', type: 'float', min: -5, max: 0, default: -2.5, label: 'Z mínimo (m)', group: 'rays' });
    params.define({ id: 'rays.zMax', type: 'float', min: -5, max: 0, default: -0.5, label: 'Z máximo (m)', group: 'rays' });
    params.define({ id: 'rays.repelRadius', type: 'float', min: 0.1, max: 5, default: 1.0, label: 'Radio repulsión (m)', group: 'rays' });
    params.define({ id: 'rays.repelStrength', type: 'float', min: 0, max: 10, default: 3, label: 'Fuerza repulsión', group: 'rays' });
    params.define({ id: 'rays.impactRadius', type: 'float', min: 0.1, max: 6, default: 1.5, label: 'Radio impacto (m)', group: 'rays' });
    params.define({ id: 'rays.impactStrength', type: 'float', min: 0, max: 10, default: 4, label: 'Fuerza impacto', group: 'rays' });
    params.define({ id: 'rays.bloom', type: 'float', min: 0, max: 1, default: 1, label: 'Bloom', group: 'rays' });
    params.define({ id: 'rays.color', type: 'color', default: '#FFFFFF', label: 'Color', group: 'rays' });
    params.defineAction({ id: 'ray.spawn', label: 'Disparar rayo', group: 'rays', argHint: 'random | left | center | right | número' });
  }

  constructor(ctx) {
    this.params = ctx.params;
    this.ctx = ctx;
    this.rays = [];        // { x, y, z, slot, shock } — shock >= 0 mientras dura la onda
    this.uColor = uniform(new THREE.Color('#ffffff'));
    this.uOpacity = uniform(0);
    this.uBloom = uniform(1);
    this._color = '';
    this._bloomOn = null;
  }

  async init(scene) {
    this.material = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
    this.material.colorNode = this.uColor;
    this.material.opacityNode = this.uOpacity;

    this.bars = [];
    for (let i = 0; i < POOL; i++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), this.material);
      bar.visible = false;
      scene.add(bar);
      this.bars.push(bar);
    }

    this.params.onAction('ray.spawn', (arg) => this.spawn(arg));
  }

  spawn(arg) {
    if (!this.params.get('rays.enabled')) return;
    const slot = this._freeSlot();
    if (slot < 0) return;

    let x;
    if (arg === undefined || arg === 'random') x = (Math.random() * 2 - 1) * 3.8;
    else if (arg === 'left') x = -2.5 + (Math.random() * 2 - 1) * 0.4;
    else if (arg === 'center') x = 0 + (Math.random() * 2 - 1) * 0.4;
    else if (arg === 'right') x = 2.5 + (Math.random() * 2 - 1) * 0.4;
    else x = Number(arg);
    if (!Number.isFinite(x)) x = 0;

    const zMin = this.params.get('rays.zMin');
    const zMax = this.params.get('rays.zMax');
    const z = zMin + Math.random() * (zMax - zMin);

    this.rays.push({ x, y: this.params.get('rays.startY'), z, slot, shock: -1 });
  }

  _freeSlot() {
    const used = new Set(this.rays.map((r) => r.slot));
    for (let i = 0; i < POOL; i++) if (!used.has(i)) return i;
    return -1;
  }

  update(dt) {
    const p = this.params;
    const forces = this.ctx.forces;
    const opacity = p.get('rays.opacity') * p.get('layer3d.opacity');
    const length = p.get('rays.length');
    const width = p.get('rays.width');
    const speed = p.get('rays.fallSpeed');
    const floorY = length / 2;

    this.uOpacity.value = opacity;

    const color = p.get('rays.color');
    if (color !== this._color) { this.uColor.value.set(color); this._color = color; }

    const bloomOn = p.get('rays.bloom') > 0.001;
    if (bloomOn !== this._bloomOn) {
      this._bloomOn = bloomOn;
      this.material.mrtNode = bloomOn ? mrt({ bloomIntensity: this.uBloom }) : null;
      this.material.needsUpdate = true;
    }
    this.uBloom.value = p.get('rays.bloom');

    for (const bar of this.bars) bar.visible = false;
    for (let i = 0; i < POOL; i++) forces.clearRepulsor(i);

    const survivors = [];
    for (const r of this.rays) {
      if (r.shock >= 0) {
        // Onda expansiva: el radio crece y la fuerza decae hasta apagarse.
        r.shock += dt;
        if (r.shock >= SHOCK_TIME) continue;
        const u = r.shock / SHOCK_TIME;
        forces.setRepulsor(r.slot, r.x, 0, r.z, 0.2, p.get('rays.impactStrength') * (1 - u), p.get('rays.impactRadius') * u);
        survivors.push(r);
        continue;
      }

      r.y -= speed * dt;
      if (r.y <= floorY) {
        r.y = floorY;
        r.shock = 0;
        this.ctx.debris?.burst(r.x, r.z);
        survivors.push(r);
        continue;
      }

      forces.setRepulsor(r.slot, r.x, r.y - length / 2, r.z, r.y + length / 2, p.get('rays.repelStrength'), p.get('rays.repelRadius'));

      if (opacity > 0.001) {
        const bar = this.bars[r.slot];
        bar.visible = true;
        bar.position.set(r.x, r.y, r.z);
        bar.scale.set(width, length, width);
      }
      survivors.push(r);
    }
    this.rays = survivors;
  }

  dispose() {
    for (const bar of this.bars) bar.geometry.dispose();
    this.material.dispose();
  }
}
