import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';

// Bloque rojo atractor (escenas 14, 15). Publica el atractor 0 al simulador.
export class RedBlock {
  static defineParams(params) {
    params.define({ id: 'redBlock.opacity', type: 'float', min: 0, max: 1, default: 0, label: 'Bloque rojo', group: 'redBlock' });
    params.define({ id: 'redBlock.side', type: 'enum', options: ['left', 'right'], default: 'left', label: 'Lado', group: 'redBlock' });
    params.define({ id: 'redBlock.x', type: 'float', min: 0, max: 6, default: 3.3, label: 'X (m)', group: 'redBlock' });
    params.define({ id: 'redBlock.z', type: 'float', min: -5, max: 0, default: -1.0, label: 'Z (m)', group: 'redBlock' });
    params.define({ id: 'redBlock.width', type: 'float', min: 0.2, max: 12, default: 3.2, label: 'Ancho (m)', group: 'redBlock' });
    // Alto y centro pensados para que el bloque SE PASE del cuadro por arriba y por abajo
    // (la pantalla va de y=0 a y=3): centrado en 1.5 con 7 m de alto va de -2 a 5, así que
    // nunca se le ven los bordes horizontales y lee como un bloque entero, no como un rectángulo.
    params.define({ id: 'redBlock.height', type: 'float', min: 0.2, max: 16, default: 7.0, label: 'Alto (m)', group: 'redBlock' });
    params.define({ id: 'redBlock.y', type: 'float', min: -4, max: 6, default: 1.5, label: 'Centro Y (m)', group: 'redBlock' });
    params.define({ id: 'redBlock.yaw', type: 'float', min: -90, max: 90, default: 20, label: 'Giro (°)', group: 'redBlock' });
    params.define({ id: 'redBlock.color', type: 'color', default: '#B00000', label: 'Color', group: 'redBlock' });
    params.define({ id: 'redBlock.attract', type: 'float', min: 0, max: 10, default: 0, label: 'Atracción', group: 'redBlock' });
    params.define({ id: 'redBlock.attractRadius', type: 'float', min: 0.2, max: 6, default: 2.0, label: 'Radio atracción (m)', group: 'redBlock' });
  }

  constructor(ctx) {
    this.params = ctx.params;
    this.ctx = ctx;
    this.uColor = uniform(new THREE.Color('#B00000'));
    this.uOpacity = uniform(0);
    this._color = '';
    this._center = new THREE.Vector3();
  }

  async init(scene) {
    const material = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
    material.colorNode = this.uColor;
    material.opacityNode = this.uOpacity;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    scene.add(this.mesh);
  }

  update() {
    const p = this.params;
    const forces = this.ctx.forces;

    const opacity = p.get('redBlock.opacity') * p.get('layer3d.opacity');
    this.uOpacity.value = opacity;
    this.mesh.visible = opacity > 0.001;

    const sign = p.get('redBlock.side') === 'left' ? -1 : 1;
    const x = sign * p.get('redBlock.x');
    const z = p.get('redBlock.z');
    const height = p.get('redBlock.height');
    this._center.set(x, p.get('redBlock.y'), z);

    if (this.mesh.visible) {
      const color = p.get('redBlock.color');
      if (color !== this._color) { this.uColor.value.set(color); this._color = color; }
      this.mesh.position.copy(this._center);
      this.mesh.scale.set(p.get('redBlock.width'), height, 1);
      this.mesh.rotation.y = THREE.MathUtils.degToRad(-sign * p.get('redBlock.yaw'));  // mira hacia el centro
    }

    // El atractor vive aunque el plano esté oculto: en 14/15 el bloque se ve, pero
    // la fuerza es un param aparte y puede quedar sola.
    const strength = p.get('redBlock.attract');
    if (strength > 0.001) forces.setAttractor(0, this._center, strength, p.get('redBlock.attractRadius'));
    else forces.clearAttractor(0);
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
