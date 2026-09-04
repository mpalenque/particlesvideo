import * as THREE from 'three/webgpu';
import { uniform, uniformArray, vec2, vec3, float, Loop, If, uint, max, length, clamp, time, dot, abs, select, mix, normalize } from 'three/tsl';
import { triNoise3Dvec } from './noise.js';
import { STAGE } from '../../config/stage.js';

export const MAX_ATTRACTORS = 4;
export const MAX_REPULSORS = 8;

// Fuerzas que se suman a la velocidad dentro del kernel g2p, en unidades de grilla por paso
// (misma escala que el original: gravedad 0.2, ruido 0.28). Los elementos 3D publican
// atractores y repulsores por su API de CPU; el resto sale de params.
export class Forces {
  static defineParams(params) {
    params.define({ id: 'particles.flowX', type: 'float', min: -3, max: 3, default: 0, label: 'Flujo X', group: 'particles' });
    params.define({ id: 'particles.flowY', type: 'float', min: -3, max: 3, default: 0, label: 'Flujo Y', group: 'particles' });
    params.define({ id: 'particles.flowZ', type: 'float', min: -3, max: 3, default: 0, label: 'Flujo Z', group: 'particles' });
    params.define({ id: 'particles.drag', type: 'float', min: 0, max: 1, default: 0, label: 'Rozamiento', group: 'particles' });
    params.define({ id: 'particles.wrapMode', type: 'enum', options: ['off', 'vertical'], default: 'off', label: 'Emisión continua', group: 'particles' });
    // Ya no es un techo absoluto: es cuántos metros por ENCIMA del borde superior del encuadre
    // se recicla la partícula. El simulador lo suma a la recta del borde (que sube con la
    // profundidad), así que el chorro siempre se sale de cuadro antes de reaparecer abajo.
    params.define({ id: 'particles.wrapTop', type: 'float', min: 0, max: 4, default: 0.5, label: 'Margen fuera de cuadro (m)', group: 'particles' });
    params.define({ id: 'particles.emitSpread', type: 'float', min: 0, max: 2, default: 0.4, label: 'Alto del emisor (m)', group: 'particles' });
    params.define({ id: 'particles.kickAmount', type: 'float', min: 0, max: 3, default: 1, label: 'Golpe', group: 'particles' });
    params.define({ id: 'particles.kickDecay', type: 'float', min: 0.05, max: 3, default: 0.4, label: 'Caída del golpe (s)', group: 'particles' });
    params.defineAction({ id: 'particles.kick', label: 'Golpe de turbulencia', group: 'particles' });

    params.define({ id: 'vortex.swirl', type: 'float', min: 0, max: 4, default: 0, label: 'Torbellino giro', group: 'vortex' });
    params.define({ id: 'vortex.pull', type: 'float', min: 0, max: 4, default: 0, label: 'Torbellino atracción', group: 'vortex' });
    params.define({ id: 'vortex.lift', type: 'float', min: -2, max: 2, default: 0, label: 'Torbellino ascenso', group: 'vortex' });
    params.define({ id: 'vortex.radius', type: 'float', min: 0.2, max: 6, default: 2, label: 'Torbellino radio (m)', group: 'vortex' });
    params.define({ id: 'vortex.x', type: 'float', min: -4, max: 4, default: 0, label: 'Torbellino X (m)', group: 'vortex' });
    params.define({ id: 'vortex.z', type: 'float', min: -5, max: 0, default: STAGE.box.z, label: 'Torbellino Z (m)', group: 'vortex' });
  }

  constructor(params) {
    this.params = params;
    this.kick = 0;

    // [x, y, z, fuerza] y [radio, 0, 0, 0] en unidades de grilla.
    this.attractors = Array.from({ length: MAX_ATTRACTORS }, () => new THREE.Vector4());
    this.attractorRadii = Array.from({ length: MAX_ATTRACTORS }, () => new THREE.Vector4(1, 0, 0, 0));
    // [nx, ny, nz, mezcla]: normal del plano del atractor y cuánto pesa el modo plano (0 = punto).
    this.attractorDirs = Array.from({ length: MAX_ATTRACTORS }, () => new THREE.Vector4(0, 0, 1, 0));
    // [x, yBottom, z, yTop] y [fuerza, radio, 0, 0].
    this.repulsors = Array.from({ length: MAX_REPULSORS }, () => new THREE.Vector4());
    this.repulsorParams = Array.from({ length: MAX_REPULSORS }, () => new THREE.Vector4());

    this.u = {
      flow: uniform(new THREE.Vector3()),
      drag: uniform(0),
      kick: uniform(0),
      attractorCount: uniform(0, 'uint'),
      attractorPos: uniformArray(this.attractors, 'vec4'),
      attractorRadius: uniformArray(this.attractorRadii, 'vec4'),
      attractorDir: uniformArray(this.attractorDirs, 'vec4'),
      repulsorCount: uniform(0, 'uint'),
      repulsorSeg: uniformArray(this.repulsors, 'vec4'),
      repulsorParams: uniformArray(this.repulsorParams, 'vec4'),
      vortexSwirl: uniform(0), vortexPull: uniform(0), vortexLift: uniform(0),
      vortexRadius: uniform(1), vortexCenter: uniform(new THREE.Vector2()),
      wrapMode: uniform(0, 'uint'),
      noiseScale: uniform(0.015),
      noiseSpeed: uniform(0.5),
    };
  }

  // Bloque TSL que se inserta en g2p después de la gravedad y la turbulencia.
  apply(vel, pos, dt) {
    const u = this.u;

    vel.addAssign(u.flow.mul(dt));

    // Atractor de PLANO, no de punto. Con la atracción puntual toda la masa convergía a un
    // mismo sitio y se veía como un embudo; lo que se quiere es que empuje en una DIRECCIÓN
    // para que los palitos golpeen la pared del bound a lo ancho. La mezcla (`.w` de
    // attractorDir) va de 0 (punto, como antes) a 1 (plano puro: todos empujados igual,
    // perpendicular al bloque, con la caída dependiendo solo de la distancia al plano).
    Loop({ start: uint(0), end: u.attractorCount, type: 'uint', condition: '<' }, ({ i }) => {
      const a = u.attractorPos.element(i);
      const radius = u.attractorRadius.element(i).x;
      const nd = u.attractorDir.element(i);
      const d = a.xyz.sub(pos);

      // División protegida en vez de normalize(): un slot vacío tiene d = 0 y daría NaN.
      const dist = max(length(d), float(0.001));
      const dirPunto = d.div(dist);

      // Distancia con signo al plano que pasa por el atractor: positiva del lado del que hay
      // que empujar, así el empuje siempre apunta hacia el bloque desde donde esté la partícula.
      const perp = dot(d, nd.xyz);
      const distPlano = max(abs(perp), float(0.001));
      // `sign()` devuelve 0 justo sobre el plano y ahí la dirección se anularía; esto nunca da 0.
      const lado = select(perp.lessThan(0), float(-1), float(1));
      const dirPlano = nd.xyz.mul(lado);

      // La mezcla nunca puede dar el vector nulo: dot(dirPunto, dirPlano) = |perp|/dist ≥ 0,
      // o sea que los dos apuntan al mismo semiespacio y no se cancelan.
      const dir = normalize(mix(dirPunto, dirPlano, nd.w));
      const distUsada = mix(dist, distPlano, nd.w);
      const falloff = float(1).div(float(1).add(distUsada.div(radius).mul(distUsada.div(radius))));
      vel.addAssign(dir.mul(a.w).mul(falloff).mul(dt));
    });

    If(u.vortexSwirl.greaterThan(0).or(u.vortexPull.greaterThan(0)), () => {
      const r = vec2(pos.x.sub(u.vortexCenter.x), pos.z.sub(u.vortexCenter.y)).toConst();
      const dist = length(r);
      const falloff = float(1).div(float(1).add(dist.div(u.vortexRadius).mul(dist.div(u.vortexRadius))));
      const safe = max(dist, float(0.01));
      const tangent = vec2(r.y.negate(), r.x).div(safe);
      const push = tangent.mul(u.vortexSwirl).sub(r.div(safe).mul(u.vortexPull)).mul(falloff).mul(dt);
      vel.x.addAssign(push.x);
      vel.z.addAssign(push.y);
      vel.y.addAssign(u.vortexLift.mul(falloff).mul(dt));
    });

    Loop({ start: uint(0), end: u.repulsorCount, type: 'uint', condition: '<' }, ({ i }) => {
      const seg = u.repulsorSeg.element(i);
      const prm = u.repulsorParams.element(i);
      // Punto más cercano del segmento vertical (x, [yBottom..yTop], z).
      const q = vec3(seg.x, clamp(pos.y, seg.y, seg.w), seg.z);
      const d = pos.sub(q);
      const dist = max(length(d), float(0.001));
      const falloff = clamp(float(1).sub(dist.div(prm.y)), 0, 1);
      vel.addAssign(d.div(dist).mul(prm.x).mul(falloff).mul(dt));
    });

    vel.mulAssign(float(1).sub(u.drag.mul(dt)));

    If(u.kick.greaterThan(0), () => {
      const n = triNoise3Dvec(pos.mul(u.noiseScale), time, u.noiseSpeed).sub(0.285).normalize();
      vel.addAssign(n.mul(u.kick).mul(dt));
    });
  }

  // `normal` es la normal del plano del atractor (en el mundo) y `planeBlend` cuánto se usa
  // el modo plano en vez del puntual. Sin normal, se comporta como antes.
  setAttractor(slot, worldPos, strength, radiusM, normal = null, planeBlend = 0) {
    const { min: m, cellSize } = STAGE.sim;
    this.attractors[slot].set((worldPos.x - m[0]) / cellSize, (worldPos.y - m[1]) / cellSize, (worldPos.z - m[2]) / cellSize, strength);
    this.attractorRadii[slot].x = Math.max(radiusM / cellSize, 0.01);
    // La normal es una dirección: no lleva el offset del origen de la grilla, y como la grilla
    // es isotrópica tampoco cambia de escala. Solo hay que normalizarla.
    if (normal) {
      const len = Math.hypot(normal.x, normal.y, normal.z) || 1;
      this.attractorDirs[slot].set(normal.x / len, normal.y / len, normal.z / len, planeBlend);
    } else {
      this.attractorDirs[slot].set(0, 0, 1, 0);
    }
  }

  clearAttractor(slot) {
    this.attractors[slot].w = 0;
  }

  setRepulsor(slot, x, yBottom, z, yTop, strength, radiusM) {
    const { min: m, cellSize } = STAGE.sim;
    this.repulsors[slot].set((x - m[0]) / cellSize, (yBottom - m[1]) / cellSize, (z - m[2]) / cellSize, (yTop - m[1]) / cellSize);
    this.repulsorParams[slot].set(strength, Math.max(radiusM / cellSize, 0.01), 0, 0);
  }

  clearRepulsor(slot) {
    this.repulsorParams[slot].x = 0;
  }

  update(dt) {
    const p = this.params;
    const u = this.u;
    const { min: m, cellSize } = STAGE.sim;

    u.flow.value.set(p.get('particles.flowX'), p.get('particles.flowY'), p.get('particles.flowZ'));
    u.drag.value = p.get('particles.drag');
    u.noiseScale.value = p.get('particles.turbulenceScale');
    u.noiseSpeed.value = p.get('particles.turbulenceSpeed');

    // El golpe decae solo; se dispara con la action particles.kick.
    if (this.kick > 0) {
      this.kick *= Math.exp(-dt / Math.max(p.get('particles.kickDecay'), 0.01));
      if (this.kick < 0.001) this.kick = 0;
    }
    u.kick.value = this.kick;

    u.vortexSwirl.value = p.get('vortex.swirl');
    u.vortexPull.value = p.get('vortex.pull');
    u.vortexLift.value = p.get('vortex.lift');
    u.vortexRadius.value = Math.max(p.get('vortex.radius') / cellSize, 0.01);
    u.vortexCenter.value.set((p.get('vortex.x') - m[0]) / cellSize, (p.get('vortex.z') - m[2]) / cellSize);

    u.wrapMode.value = p.get('particles.wrapMode') === 'vertical' ? 1 : 0;

    // Se recorren siempre todos los slots: los vacíos tienen fuerza 0 y no aportan.
    u.attractorCount.value = MAX_ATTRACTORS;
    u.repulsorCount.value = MAX_REPULSORS;
  }

  triggerKick() {
    this.kick = this.params.get('particles.kickAmount');
  }
}
