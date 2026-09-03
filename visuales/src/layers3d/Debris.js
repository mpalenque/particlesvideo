import * as THREE from 'three/webgpu';
import { uniform, mrt, vec3 } from 'three/tsl';

const MAX = 4000;

// Esquirlas blancas en el piso (escenas 17+). Simuladas en CPU: son pocas y baratas,
// y así rebotan y se deslizan con control fino. Todo preasignado: nada se crea por frame.
export class Debris {
  static defineParams(params) {
    params.define({ id: 'debris.opacity', type: 'float', min: 0, max: 1, default: 0, label: 'Esquirlas', group: 'debris' });
    params.define({ id: 'debris.count', type: 'int', min: 0, max: 300, default: 60, label: 'Por impacto', group: 'debris' });
    params.define({ id: 'debris.size', type: 'float', min: 0.01, max: 0.3, default: 0.06, label: 'Tamaño (m)', group: 'debris' });
    params.define({ id: 'debris.speed', type: 'float', min: 0, max: 8, default: 2, label: 'Velocidad (m/s)', group: 'debris' });
    params.define({ id: 'debris.lifetime', type: 'float', min: 0.2, max: 10, default: 3, label: 'Duración (s)', group: 'debris' });
    params.define({ id: 'debris.gravity', type: 'float', min: 0, max: 20, default: 6, label: 'Gravedad', group: 'debris' });
    params.define({ id: 'debris.bounce', type: 'float', min: 0, max: 1, default: 0.4, label: 'Rebote', group: 'debris' });
    params.define({ id: 'debris.friction', type: 'float', min: 0, max: 1, default: 0.9, label: 'Fricción', group: 'debris' });
  }

  constructor(ctx) {
    this.params = ctx.params;
    ctx.debris = this;                      // los rayos llaman a burst() al impactar
    this.uOpacity = uniform(0);
    this.uBloom = uniform(1);
    this._bloomOn = null;
    this.cursor = 0;

    this.pos = new Float32Array(MAX * 3);
    this.vel = new Float32Array(MAX * 3);
    this.yaw = new Float32Array(MAX);
    this.life = new Float32Array(MAX);      // 0 = muerta
    this.grounded = new Uint8Array(MAX);

    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._zero = new THREE.Vector3(0, 0, 0);
  }

  async init(scene) {
    this.material = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.material.colorNode = vec3(1, 1, 1);
    this.material.opacityNode = this.uOpacity;

    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), this.material, MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = MAX;
    for (let i = 0; i < MAX; i++) this.mesh.setMatrixAt(i, this._m.identity().scale(this._zero));
    scene.add(this.mesh);
  }

  burst(x, z) {
    const count = this.params.get('debris.count');
    const speed = this.params.get('debris.speed');
    const lifetime = this.params.get('debris.lifetime');

    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % MAX;

      const angle = Math.random() * Math.PI * 2;
      const radial = speed * (0.3 + Math.random() * 0.7);
      this.pos[i * 3] = x;
      this.pos[i * 3 + 1] = 0.05;
      this.pos[i * 3 + 2] = z;
      this.vel[i * 3] = Math.cos(angle) * radial;
      this.vel[i * 3 + 1] = (0.5 + Math.random()) * speed;
      this.vel[i * 3 + 2] = Math.sin(angle) * radial;
      this.yaw[i] = Math.random() * Math.PI * 2;
      this.life[i] = lifetime;
      this.grounded[i] = 0;
    }
  }

  update(dt) {
    const p = this.params;
    const opacity = p.get('debris.opacity') * p.get('layer3d.opacity');
    this.uOpacity.value = opacity;
    this.mesh.visible = opacity > 0.001;

    const gravity = p.get('debris.gravity');
    const bounce = p.get('debris.bounce');
    const friction = p.get('debris.friction');
    const size = p.get('debris.size');
    const lifetime = Math.max(p.get('debris.lifetime'), 0.001);

    let anyAlive = false;
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) continue;
      anyAlive = true;

      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.mesh.setMatrixAt(i, this._m.identity().scale(this._zero));
        continue;
      }

      const ix = i * 3;
      this.vel[ix + 1] -= gravity * dt;
      this.pos[ix] += this.vel[ix] * dt;
      this.pos[ix + 1] += this.vel[ix + 1] * dt;
      this.pos[ix + 2] += this.vel[ix + 2] * dt;

      if (this.pos[ix + 1] <= 0.01) {
        this.pos[ix + 1] = 0.01;
        this.vel[ix + 1] *= -bounce;
        this.vel[ix] *= friction;
        this.vel[ix + 2] *= friction;
        if (Math.abs(this.vel[ix + 1]) < 0.2) { this.vel[ix + 1] = 0; this.grounded[i] = 1; }
      }

      // Apoyadas quedan planas sobre el piso; en el aire giran sobre su eje vertical.
      this._e.set(this.grounded[i] ? -Math.PI / 2 : 0, this.yaw[i], 0);
      this._q.setFromEuler(this._e);
      this._p.set(this.pos[ix], this.pos[ix + 1], this.pos[ix + 2]);
      const fade = Math.min(this.life[i] / (lifetime * 0.3), 1);
      this._s.setScalar(size * fade);
      this.mesh.setMatrixAt(i, this._m.compose(this._p, this._q, this._s));
    }

    if (anyAlive) this.mesh.instanceMatrix.needsUpdate = true;

    const bloomOn = p.get('rays.bloom') > 0.001;
    if (bloomOn !== this._bloomOn) {
      this._bloomOn = bloomOn;
      this.material.mrtNode = bloomOn ? mrt({ bloomIntensity: this.uBloom }) : null;
      this.material.needsUpdate = true;
    }
    this.uBloom.value = p.get('rays.bloom');
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
