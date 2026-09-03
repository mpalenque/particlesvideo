import * as THREE from 'three/webgpu';
import { uniform, vec4 } from 'three/tsl';
import { placeQuad } from './Layer2D.js';

// Elemento de prueba de la Fase 1: cuadrado blanco 100 × 100 en (0,0) para verificar
// que las coordenadas 2D son píxeles con origen arriba-izquierda. Se borra en la Fase 3.
export class TestRect {
  static defineParams(params) {
    params.define({ id: 'test.opacity', type: 'float', min: 0, max: 1, default: 0, label: 'Prueba 2D', group: 'test' });
  }

  constructor(ctx) {
    this.params = ctx.params;
    this.uOpacity = uniform(0);
  }

  async init(scene) {
    // DoubleSide: la ortográfica en píxeles invierte la Y y con eso el winding de las caras.
    const material = new THREE.MeshBasicNodeMaterial({ transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
    material.colorNode = vec4(1, 1, 1, this.uOpacity);
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    this.mesh.renderOrder = this.renderOrder ?? 0;
    placeQuad(this.mesh, 0, 0, 100, 100);
    scene.add(this.mesh);
  }

  update() {
    this.uOpacity.value = this.params.get('test.opacity');
    this.mesh.visible = this.uOpacity.value > 0.001;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
