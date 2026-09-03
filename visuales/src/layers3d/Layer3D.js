import * as THREE from 'three/webgpu';
import { uniform, vec4 } from 'three/tsl';
import { STAGE } from '../config/stage.js';
import { OffAxisCamera } from '../render/OffAxisCamera.js';

export class Layer3D {
  static ELEMENTS = [];

  static defineParams(params) {
    params.define({ id: 'layer3d.opacity', type: 'float', min: 0, max: 1, default: 0, label: 'Capa 3D', group: 'layer3d' });
    params.define({ id: 'camera.eyeX', type: 'float', min: -4, max: 4, default: STAGE.camera.eyeX, label: 'Ojo X (m)', group: 'camera', sceneReset: false });
    params.define({ id: 'camera.eyeY', type: 'float', min: 0, max: 3, default: STAGE.camera.eyeY, label: 'Ojo Y (m)', group: 'camera', sceneReset: false });
    params.define({ id: 'camera.eyeZ', type: 'float', min: 1, max: 10, default: STAGE.camera.eyeZ, label: 'Ojo Z (m)', group: 'camera', sceneReset: false });
    for (const El of Layer3D.ELEMENTS) El.defineParams(params);
  }

  constructor(ctx) {
    this.ctx = ctx;
    this.params = ctx.params;
    this.scene = new THREE.Scene();
    this.camera = new OffAxisCamera({
      widthM: STAGE.physical.widthM, heightM: STAGE.physical.heightM, bottomM: STAGE.physical.bottomM,
      near: STAGE.camera.near, far: STAGE.camera.far,
    });
    this.camera.setEye(STAGE.camera.eyeX, STAGE.camera.eyeY, STAGE.camera.eyeZ);
    this.elements = [];
    this._eye = { x: NaN, y: NaN, z: NaN };
    this.uOpacity = uniform(1);
  }

  async init() {
    for (const El of Layer3D.ELEMENTS) {
      const el = new El(this.ctx);
      await el.init(this.scene);
      this.elements.push(el);
    }
    this._addTestCube();
  }

  // Cubo de prueba de la Fase 1 (1 m en (0, 0.5, −2)): se quita en la Fase 4.
  _addTestCube() {
    const material = new THREE.MeshBasicNodeMaterial({ transparent: true });
    material.colorNode = vec4(0.2, 0.6, 1.0, this.uOpacity);
    this.testCube = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
    this.testCube.position.set(0, 0.5, -2);
    this.scene.add(this.testCube);
  }

  update(dt, t) {
    const x = this.params.get('camera.eyeX');
    const y = this.params.get('camera.eyeY');
    const z = this.params.get('camera.eyeZ');
    if (x !== this._eye.x || y !== this._eye.y || z !== this._eye.z) {
      this.camera.setEye(x, y, z);
      this._eye.x = x; this._eye.y = y; this._eye.z = z;
    }
    this.uOpacity.value = this.params.get('layer3d.opacity');
    for (const el of this.elements) el.update(dt, t);
  }

  dispose() {
    for (const el of this.elements) el.dispose?.();
  }
}
