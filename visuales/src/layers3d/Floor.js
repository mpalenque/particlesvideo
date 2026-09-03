import * as THREE from 'three/webgpu';
import { uniform, positionWorld, fract, abs, smoothstep, fwidth, float, vec3, Fn, max } from 'three/tsl';

// Piso de carriles punteados con fuga (escena 7+). Los dashes de todos los carriles
// quedan alineados en filas, como en la imagen 7 del storyboard.
export class Floor {
  static defineParams(params) {
    params.define({ id: 'floor.opacity', type: 'float', min: 0, max: 1, default: 0, label: 'Piso', group: 'floor' });
    params.define({ id: 'floor.brightness', type: 'float', min: 0, max: 1, default: 1, label: 'Brillo', group: 'floor' });
    params.define({ id: 'floor.laneSpacing', type: 'float', min: 0.1, max: 3, default: 0.5, label: 'Separación carriles (m)', group: 'floor' });
    params.define({ id: 'floor.dashLength', type: 'float', min: 0.05, max: 3, default: 0.4, label: 'Largo dash (m)', group: 'floor' });
    params.define({ id: 'floor.dashPeriod', type: 'float', min: 0.1, max: 6, default: 1.0, label: 'Período dash (m)', group: 'floor' });
    params.define({ id: 'floor.dashWidth', type: 'float', min: 0.01, max: 0.5, default: 0.08, label: 'Ancho dash (m)', group: 'floor' });
    params.define({ id: 'floor.scrollSpeed', type: 'float', min: -5, max: 5, default: 0.6, label: 'Avance (m/s)', group: 'floor' });
    params.define({ id: 'floor.revealDuration', type: 'float', min: 0.1, max: 20, default: 4, label: 'Duración aparición (s)', group: 'floor' });
    params.define({ id: 'floor.fadeFar', type: 'float', min: 5, max: 60, default: 30, label: 'Fade lejano (m)', group: 'floor' });
    params.define({ id: 'floor.revealDist', type: 'float', min: 0, max: 60, default: 0, label: 'Alcance actual (m)', group: 'floor', sceneReset: false });
    params.defineAction({ id: 'floor.reveal', label: 'Extender piso', group: 'floor' });
    params.defineAction({ id: 'floor.hide', label: 'Retraer piso', group: 'floor' });
  }

  constructor(ctx) {
    this.params = ctx.params;
    this.u = {
      laneSpacing: uniform(0.5), dashLength: uniform(0.4), dashPeriod: uniform(1.0), dashWidth: uniform(0.08),
      scroll: uniform(0), revealDist: uniform(0), fadeFar: uniform(30), opacity: uniform(0),
    };
    this.scroll = 0;
  }

  async init(scene) {
    const u = this.u;
    const material = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
    material.colorNode = vec3(1, 1, 1);
    material.opacityNode = Fn(() => {
      const p = positionWorld;
      const aaX = max(fwidth(p.x), float(0.0005));
      const aaZ = max(fwidth(p.z), float(0.0005));

      // Distancia al centro del carril más cercano.
      const lane = abs(fract(p.x.div(u.laneSpacing).add(0.5)).sub(0.5)).mul(u.laneSpacing);
      const onLane = float(1).sub(smoothstep(u.dashWidth.mul(0.5).sub(aaX), u.dashWidth.mul(0.5).add(aaX), lane));

      const zz = p.z.negate().add(u.scroll);
      const dash = abs(fract(zz.div(u.dashPeriod).add(0.5)).sub(0.5)).mul(u.dashPeriod);
      const onDash = float(1).sub(smoothstep(u.dashLength.mul(0.5).sub(aaZ), u.dashLength.mul(0.5).add(aaZ), dash));

      const depth = p.z.negate();
      const reveal = float(1).sub(smoothstep(u.revealDist.sub(0.5), u.revealDist, depth));  // crece desde la pantalla al fondo
      const farFade = float(1).sub(smoothstep(u.fadeFar.mul(0.6), u.fadeFar, depth));       // evita moiré en el horizonte

      return onLane.mul(onDash).mul(reveal).mul(farFade).mul(u.opacity);
    })();

    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), material);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.set(0, 0, -25);      // cubre z ∈ [−55, 5]
    scene.add(this.mesh);

    this.params.onAction('floor.reveal', () => {
      this.params.set('floor.revealDist', 0, { immediate: true });
      this.params.tween('floor.revealDist', 60, this.params.get('floor.revealDuration'));
    });
    this.params.onAction('floor.hide', () => this.params.tween('floor.revealDist', 0, 1.5));
  }

  update(dt) {
    const opacity = this.params.get('floor.opacity') * this.params.get('floor.brightness') * this.params.get('layer3d.opacity');
    this.u.opacity.value = opacity;
    this.mesh.visible = opacity > 0.001;
    if (!this.mesh.visible) return;

    this.scroll += this.params.get('floor.scrollSpeed') * dt;
    this.u.scroll.value = this.scroll;
    this.u.laneSpacing.value = this.params.get('floor.laneSpacing');
    this.u.dashLength.value = this.params.get('floor.dashLength');
    this.u.dashPeriod.value = this.params.get('floor.dashPeriod');
    this.u.dashWidth.value = this.params.get('floor.dashWidth');
    this.u.revealDist.value = this.params.get('floor.revealDist');
    this.u.fadeFar.value = this.params.get('floor.fadeFar');
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
