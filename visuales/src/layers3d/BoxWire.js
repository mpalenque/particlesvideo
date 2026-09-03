import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';
import { STAGE } from '../config/stage.js';

// Aristas de la caja. Comparte los params box.* con el simulador: las dos cosas leen
// el mismo registro, así que girar o mover la caja mueve el límite físico y las aristas juntas.
export class BoxWire {
  static defineParams(params) {
    const b = STAGE.box;
    params.define({ id: 'box.visible', type: 'float', min: 0, max: 1, default: 0, label: 'Aristas', group: 'box' });
    params.define({ id: 'box.enabled', type: 'bool', default: true, label: 'Límite activo', group: 'box' });
    params.define({ id: 'box.preset', type: 'enum', options: ['left', 'center', 'right'], default: 'center', label: 'Posición', group: 'box' });
    params.define({ id: 'box.x', type: 'float', min: -4, max: 4, default: 0, label: 'X (m)', group: 'box' });
    params.define({ id: 'box.y', type: 'float', min: 0, max: 4, default: b.y, label: 'Y (m)', group: 'box' });
    params.define({ id: 'box.z', type: 'float', min: -5, max: 0, default: b.z, label: 'Z (m)', group: 'box' });
    params.define({ id: 'box.width', type: 'float', min: 0.5, max: 8, default: b.width, label: 'Ancho (m)', group: 'box' });
    params.define({ id: 'box.height', type: 'float', min: 0.5, max: 8, default: b.height, label: 'Alto (m)', group: 'box' });
    params.define({ id: 'box.depth', type: 'float', min: 0.5, max: 8, default: b.depth, label: 'Profundidad (m)', group: 'box' });
    params.define({ id: 'box.yaw', type: 'float', min: -180, max: 180, default: b.yawDeg, label: 'Giro Y (°)', group: 'box' });
    params.define({ id: 'box.yawSpeed', type: 'float', min: -90, max: 90, default: 0, label: 'Giro continuo (°/s)', group: 'box' });
    params.define({ id: 'box.wallStiffness', type: 'float', min: 0, max: 2, default: 0.3, label: 'Rigidez pared', group: 'box' });
    params.define({ id: 'box.wallMaxPush', type: 'float', min: 0, max: 5, default: 1.0, label: 'Empuje máximo', group: 'box', sceneReset: false });
    params.define({ id: 'box.hardClamp', type: 'bool', default: false, label: 'Clamp duro', group: 'box', sceneReset: false });
    params.define({ id: 'box.wallBounce', type: 'float', min: 0, max: 1, default: 0.2, label: 'Rebote en la pared', group: 'box', sceneReset: false });
    params.define({ id: 'box.flicker', type: 'bool', default: false, label: 'Titileo', group: 'box' });
    params.define({ id: 'box.flickerRate', type: 'float', min: 0.5, max: 30, default: 8, label: 'Titileo (Hz)', group: 'box' });
    params.define({ id: 'box.flickerDuty', type: 'float', min: 0, max: 1, default: 0.5, label: 'Titileo duty', group: 'box' });
    params.define({ id: 'box.color', type: 'color', default: '#FFFFFF', label: 'Color', group: 'box' });
  }

  constructor(ctx) {
    this.params = ctx.params;
    this.uColor = uniform(new THREE.Color('#ffffff'));
    this.uOpacity = uniform(0);
    this._color = '';
    this._preset = null;
  }

  async init(scene) {
    const material = new THREE.LineBasicNodeMaterial({ transparent: true, depthWrite: false });
    material.colorNode = this.uColor;
    material.opacityNode = this.uOpacity;
    this.lines = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), material);
    this.lines.frustumCulled = false;
    scene.add(this.lines);
  }

  update(dt, t) {
    const p = this.params;

    // El preset tweenea box.x; el simulador lee el mismo param.
    const preset = p.get('box.preset');
    if (preset !== this._preset) {
      this._preset = preset;
      p.tween('box.x', STAGE.box.presets[preset], 1.0);
    }

    const yawSpeed = p.get('box.yawSpeed');
    if (yawSpeed !== 0) {
      const yaw = p.get('box.yaw') + yawSpeed * dt;
      p.set('box.yaw', ((yaw + 180) % 360 + 360) % 360 - 180, { immediate: true });
    }

    let opacity = p.get('box.visible') * p.get('layer3d.opacity');
    if (p.get('box.flicker')) {
      const phase = (t * p.get('box.flickerRate')) % 1;
      if (phase >= p.get('box.flickerDuty')) opacity = 0;
    }
    this.uOpacity.value = opacity;
    this.lines.visible = opacity > 0.001;
    if (!this.lines.visible) return;

    const color = p.get('box.color');
    if (color !== this._color) { this.uColor.value.set(color); this._color = color; }

    this.lines.position.set(p.get('box.x'), p.get('box.y'), p.get('box.z'));
    this.lines.scale.set(p.get('box.width'), p.get('box.height'), p.get('box.depth'));
    this.lines.rotation.y = THREE.MathUtils.degToRad(p.get('box.yaw'));
  }

  dispose() {
    this.lines.geometry.dispose();
    this.lines.material.dispose();
  }
}
