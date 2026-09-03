import * as THREE from 'three/webgpu';
import { uniform, uv, float, vec4, Fn, floor, mod } from 'three/tsl';
import { STAGE } from '../config/stage.js';
import { placeQuad } from './Layer2D.js';

// Una grilla por bloque (5 columnas). Las coordenadas de píxel salen de uv() × tamaño del quad,
// no de screenCoordinate: el quad mapea 1:1 a píxeles, así que es exacto y no depende
// de la orientación de la pantalla.
export class GridBlocks {
  static defineParams(params) {
    params.define({ id: 'grid.opacity', type: 'float', min: 0, max: 1, default: 0, label: 'Grillas', group: 'grid' });
    params.define({ id: 'grid.lineWidth', type: 'int', min: 1, max: 8, default: 1, label: 'Grosor línea (px)', group: 'grid' });
    params.define({ id: 'grid.brightness', type: 'float', min: 0, max: 1, default: 0.6, label: 'Brillo', group: 'grid' });
    params.define({ id: 'grid.cellW', type: 'int', min: 8, max: 1008, default: 96, label: 'Celda ancho (px)', group: 'grid' });
    params.define({ id: 'grid.cellH', type: 'int', min: 8, max: 1008, default: 96, label: 'Celda alto (px)', group: 'grid' });
    params.define({ id: 'grid.coarse', type: 'bool', default: false, label: 'Celdas gruesas', group: 'grid' });
    params.define({ id: 'grid.scrollSpeed', type: 'float', min: 0, max: 400, default: 12, label: 'Scroll (px/s)', group: 'grid' });
    params.define({ id: 'grid.pixelSnap', type: 'bool', default: true, label: 'Ajuste a píxel', group: 'grid', sceneReset: false });
    params.define({ id: 'grid.fadeTime', type: 'float', min: 0, max: 2, default: 0.15, label: 'Fade on/off (s)', group: 'grid', sceneReset: false });

    for (let n = 1; n <= STAGE.blocks; n++) {
      params.define({ id: `grid.b${n}.enabled`, type: 'bool', default: false, label: `Bloque ${n}`, group: 'grid' });
      params.define({ id: `grid.b${n}.dir`, type: 'int', min: -1, max: 1, default: 1, label: `Bloque ${n} sentido`, group: 'grid' });
      params.define({ id: `grid.b${n}.speedMul`, type: 'float', min: 0, max: 3, default: 1, label: `Bloque ${n} vel.`, group: 'grid' });
      params.define({ id: `grid.b${n}.offsetY`, type: 'float', min: 0, max: 1008, default: 0, label: `Bloque ${n} offset Y`, group: 'grid' });
      params.defineAction({ id: `grid.b${n}.toggle`, label: `Bloque ${n} on/off`, group: 'grid' });
      params.defineAction({ id: `grid.b${n}.flip`, label: `Bloque ${n} invertir`, group: 'grid' });
    }
    params.defineAction({ id: 'grid.toggleAll', label: 'Todas on/off', group: 'grid' });
    params.defineAction({ id: 'grid.randomize', label: 'Offsets al azar', group: 'grid' });
  }

  constructor(ctx) {
    this.params = ctx.params;
    this.blocks = [];
  }

  async init(scene) {
    for (let n = 1; n <= STAGE.blocks; n++) {
      const x0 = STAGE.blockBounds[n - 1];
      const x1 = STAGE.blockBounds[n];
      const w = x1 - x0;

      const u = {
        cellW: uniform(96), cellH: uniform(96), lineWidth: uniform(1),
        offsetX: uniform(0), offsetY: uniform(0), alpha: uniform(0),
        size: uniform(new THREE.Vector2(w, STAGE.height)),
      };

      const material = new THREE.MeshBasicNodeMaterial({ transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
      material.colorNode = Fn(() => {
        const px = uv().x.mul(u.size.x);
        const py = uv().y.mul(u.size.y);
        const onX = floor(mod(px.sub(u.offsetX), u.cellW)).lessThan(u.lineWidth);
        const onY = floor(mod(py.sub(u.offsetY), u.cellH)).lessThan(u.lineWidth);
        const on = float(onX.or(onY));
        return vec4(1, 1, 1, on.mul(u.alpha));
      })();

      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
      mesh.renderOrder = 5;
      placeQuad(mesh, x0, 0, w, STAGE.height);
      scene.add(mesh);

      this.blocks.push({ n, mesh, u, w, scrollX: 0, fade: 0 });

      this.params.onAction(`grid.b${n}.toggle`, () => this.params.set(`grid.b${n}.enabled`, !this.params.target(`grid.b${n}.enabled`)));
      this.params.onAction(`grid.b${n}.flip`, () => this.params.set(`grid.b${n}.dir`, -this.params.target(`grid.b${n}.dir`)));
    }

    this.params.onAction('grid.toggleAll', () => {
      const anyOn = this.blocks.some((b) => this.params.target(`grid.b${b.n}.enabled`));
      for (const b of this.blocks) this.params.set(`grid.b${b.n}.enabled`, !anyOn);
    });
    this.params.onAction('grid.randomize', () => {
      for (const b of this.blocks) this.params.set(`grid.b${b.n}.offsetY`, Math.random() * STAGE.height);
    });
  }

  update(dt) {
    const opacity = this.params.get('grid.opacity');
    const coarse = this.params.get('grid.coarse');
    const lineWidth = this.params.get('grid.lineWidth');
    const brightness = this.params.get('grid.brightness');
    const cellW = this.params.get('grid.cellW');
    const cellH = this.params.get('grid.cellH');
    const speed = this.params.get('grid.scrollSpeed');
    const snap = this.params.get('grid.pixelSnap');
    const fadeTime = Math.max(this.params.get('grid.fadeTime'), 0.001);

    for (const b of this.blocks) {
      const enabled = this.params.get(`grid.b${b.n}.enabled`);
      const target = enabled ? 1 : 0;
      b.fade += (target - b.fade) * (1 - Math.exp(-dt / fadeTime));

      const alpha = b.fade * brightness * opacity;
      b.u.alpha.value = alpha;
      b.mesh.visible = alpha > 0.002;
      if (!b.mesh.visible) continue;

      b.scrollX += this.params.get(`grid.b${b.n}.dir`) * speed * this.params.get(`grid.b${b.n}.speedMul`) * dt;

      // En modo grueso la celda es un cuadrado del ancho del bloque → escena 3.
      b.u.cellW.value = coarse ? b.w : cellW;
      b.u.cellH.value = coarse ? b.w : cellH;
      b.u.lineWidth.value = lineWidth;
      b.u.offsetX.value = snap ? Math.round(b.scrollX) : b.scrollX;
      b.u.offsetY.value = this.params.get(`grid.b${b.n}.offsetY`);
    }
  }

  dispose() {
    for (const b of this.blocks) { b.mesh.geometry.dispose(); b.mesh.material.dispose(); }
  }
}
