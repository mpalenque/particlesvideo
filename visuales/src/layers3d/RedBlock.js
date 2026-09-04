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
    // Radio grande a propósito: es la distancia a la que la fuerza cae a la mitad, y en modo
    // plano se mide perpendicular al bloque. Con 2 m la mitad de la caja quedaba fuera de
    // alcance y solo se movían los palitos más cercanos.
    params.define({ id: 'redBlock.attractRadius', type: 'float', min: 0.2, max: 12, default: 5.0, label: 'Radio atracción (m)', group: 'redBlock' });
    // 0 = atrae a un punto (todo converge en un embudo), 1 = empuja en la dirección del bloque
    // (la masa entera se corre para ese lado y golpea la pared del bound a lo ancho).
    params.define({ id: 'redBlock.attractDir', type: 'float', min: 0, max: 1, default: 1, label: 'Dirección vs. punto', group: 'redBlock' });
    params.define({ id: 'redBlock.vibrate', type: 'float', min: 0, max: 0.3, default: 0.035, label: 'Vibración (m)', group: 'redBlock' });
    params.define({ id: 'redBlock.vibrateRate', type: 'float', min: 0.5, max: 40, default: 17, label: 'Vibración (Hz)', group: 'redBlock' });
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
    // `depthWrite: true`: el bloque es rojo PLENO, no un vidrio. Con la escritura de
    // profundidad apagada el piso —que también es transparente— se colaba por encima según el
    // orden de dibujado y se le veían los dashes a través. Sigue siendo `transparent` porque
    // `redBlock.opacity` tiene que poder fundirlo en las transiciones de escena, pero con
    // alpha 1 se comporta como un opaco y tapa lo que tiene detrás.
    const material = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: true, side: THREE.DoubleSide });
    material.colorNode = this.uColor;
    material.opacityNode = this.uOpacity;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    // Se dibuja antes que el resto de los transparentes para que su profundidad ya esté puesta
    // cuando le toque al piso.
    this.mesh.renderOrder = -1;
    scene.add(this.mesh);
  }

  update(dt) {
    const p = this.params;
    const forces = this.ctx.forces;

    const opacity = p.get('redBlock.opacity') * p.get('layer3d.opacity');
    this.uOpacity.value = opacity;
    this.mesh.visible = opacity > 0.001;

    const sign = p.get('redBlock.side') === 'left' ? -1 : 1;
    const x = sign * p.get('redBlock.x');
    const z = p.get('redBlock.z');
    const height = p.get('redBlock.height');
    const yaw = THREE.MathUtils.degToRad(-sign * p.get('redBlock.yaw'));   // mira hacia el centro
    this._center.set(x, p.get('redBlock.y'), z);

    // Vibración: dos senos de frecuencias que no son múltiplos entre sí, así no se ve el ciclo.
    // Es un temblor de la PLACA, no un parpadeo: el bloque nunca deja de ser rojo pleno.
    this._fase = (this._fase ?? 0) + (dt ?? 0) * p.get('redBlock.vibrateRate') * Math.PI * 2;
    const amp = p.get('redBlock.vibrate');
    const tembX = Math.sin(this._fase) * 0.6 + Math.sin(this._fase * 1.73 + 1.1) * 0.4;
    const tembY = Math.sin(this._fase * 1.31 + 2.4) * 0.5 + Math.sin(this._fase * 2.11) * 0.5;

    if (this.mesh.visible) {
      const color = p.get('redBlock.color');
      if (color !== this._color) { this.uColor.value.set(color); this._color = color; }
      // El temblor va perpendicular al bloque (por su normal) más un poco en vertical.
      this.mesh.position.set(
        this._center.x + Math.sin(yaw) * amp * tembX,
        this._center.y + amp * tembY * 0.5,
        this._center.z + Math.cos(yaw) * amp * tembX,
      );
      this.mesh.scale.set(p.get('redBlock.width'), height, 1);
      this.mesh.rotation.y = yaw;
    }

    // El atractor vive aunque el plano esté oculto: en 14/15 el bloque se ve, pero
    // la fuerza es un param aparte y puede quedar sola.
    const strength = p.get('redBlock.attract');
    if (strength > 0.001) {
      // Normal del plano del bloque (la cara mira al centro del escenario). Con ella el
      // simulador puede empujar en esa DIRECCIÓN en vez de chupar hacia el centro del bloque.
      this._normal ??= new THREE.Vector3();
      this._normal.set(Math.sin(yaw), 0, Math.cos(yaw));
      forces.setAttractor(0, this._center, strength, p.get('redBlock.attractRadius'), this._normal, p.get('redBlock.attractDir'));
    } else {
      forces.clearAttractor(0);
    }
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
