import * as THREE from 'three/webgpu';
import {
  array, Fn, If, instanceIndex, instancedArray, Return, uniform, int, float, Loop, vec3, vec4,
  atomicAdd, uint, max, pow, mat3, clamp, time, mix, ivec3, hash, cos, sin, select, normalize,
} from 'three/tsl';
import { triNoise3Dvec } from './noise.js';
import { StructuredArray } from './StructuredArray.js';
import { Forces } from './Forces.js';
import { STAGE } from '../../config/stage.js';

const FIXED_POINT = 1e7;

// El volumen natural del fluido es count/restDensity celdas, y con la fórmula del original
// (restDensity = 0.25·level·density) queda fijo en ~82 m³ con nuestras celdas de 0.1 m —
// cuatro veces la caja de 2.6 × 3 × 2.6 m, así que el fluido quedaba aplastado contra las
// paredes y se veía como un bloque blanco sólido. La celda del repo original era 3.6× más
// chica en volumen (era anisotrópica); esta constante compensa esa diferencia para que con
// `particles.density` en su default (0.4) el fluido ocupe ~9 m³ y quede como blob dentro de la caja.
const DENSITY_CALIBRATION = 9;

// MLS-MPM portado de particlesvideo/src/mls-mpm/mlsMpmSimulator.js.
// Diferencias con el original: dominio no cúbico (todo el escenario), sin imagen/video ni
// lifetimes en CPU, sin color HSV, y la caja es una restricción sub-AABB rotable dentro
// del dominio en vez del `containParticles` global.
export class MlsMpmSimulator {
  constructor(ctx) {
    this.renderer = ctx.renderer;
    this.params = ctx.params;
    this.numParticles = 0;
    this.uniforms = {};
    this.kernels = {};
    this.gridSize = new THREE.Vector3();
    this.forces = new Forces(ctx.params);
    this._boxCenter = new THREE.Vector3();
    this._boxHalf = new THREE.Vector3();
  }

  static defineParams(params) {
    params.define({ id: 'particles.opacity', type: 'float', min: 0, max: 1, default: 0, label: 'Partículas', group: 'particles' });
    params.define({ id: 'particles.count', type: 'int', min: 4096, max: STAGE.sim.maxParticles, step: 4096, default: 131072, label: 'Cantidad', group: 'particles', sceneReset: false });
    params.define({ id: 'particles.baseColor', type: 'color', default: '#FF0000', label: 'Color base', group: 'particles' });
    params.define({ id: 'particles.whiteSpeedMin', type: 'float', min: 0, max: 20, default: 2, label: 'Blanco desde', group: 'particles' });
    params.define({ id: 'particles.whiteSpeedMax', type: 'float', min: 0, max: 40, default: 7, label: 'Blanco hasta', group: 'particles' });
    params.define({ id: 'particles.size', type: 'float', min: 0.5, max: 6, default: 2, label: 'Tamaño', group: 'particles' });
    params.define({ id: 'particles.length', type: 'float', min: 0.02, max: 4, default: 1.0, label: 'Largo', group: 'particles' });
    params.define({ id: 'particles.speed', type: 'float', min: 0, max: 2, default: 0.8, label: 'Velocidad sim', group: 'particles' });
    params.define({ id: 'particles.turbulence', type: 'float', min: 0, max: 2, default: 0.6, label: 'Turbulencia', group: 'particles' });
    params.define({ id: 'particles.turbulenceScale', type: 'float', min: 0.005, max: 0.05, default: 0.015, label: 'Escala turbulencia', group: 'particles' });
    params.define({ id: 'particles.turbulenceSpeed', type: 'float', min: 0, max: 2, default: 0.5, label: 'Vel. turbulencia', group: 'particles' });
    params.define({ id: 'particles.density', type: 'float', min: 0.4, max: 2, default: 0.4, label: 'Densidad', group: 'particles' });
    params.define({ id: 'particles.stiffness', type: 'float', min: 0.5, max: 10, default: 3, label: 'Rigidez', group: 'particles', sceneReset: false });
    params.define({ id: 'particles.viscosity', type: 'float', min: 0.01, max: 0.4, default: 0.1, label: 'Viscosidad', group: 'particles', sceneReset: false });
    params.define({ id: 'particles.gravityY', type: 'float', min: -1, max: 1, default: 0, label: 'Gravedad Y', group: 'particles' });
    params.define({ id: 'particles.bloom', type: 'float', min: 0, max: 1, default: 1, label: 'Bloom', group: 'particles' });
    params.define({ id: 'particles.ageGrow', type: 'float', min: 0.05, max: 6, default: 1.2, label: 'Crecer con la edad (s)', group: 'particles' });
    params.define({ id: 'particles.sizeJitter', type: 'float', min: 0, max: 1, default: 0.45, label: 'Variación de tamaño', group: 'particles' });
    params.define({ id: 'particles.taper', type: 'float', min: 0, max: 0.95, default: 0.55, label: 'Punta (cola más fina)', group: 'particles' });
    params.define({ id: 'particles.headTail', type: 'float', min: 0, max: 1, default: 0.5, label: 'Degradado cabeza/cola', group: 'particles' });
    params.define({ id: 'particles.whiteJitter', type: 'float', min: 0, max: 2, default: 0.7, label: 'Dispersión del blanco', group: 'particles' });
    params.define({ id: 'particles.roughness', type: 'float', min: 0, max: 1, default: 0.55, label: 'Rugosidad', group: 'particles', sceneReset: false });
    params.define({ id: 'particles.metalness', type: 'float', min: 0, max: 1, default: 0, label: 'Metalicidad', group: 'particles', sceneReset: false });
    params.define({ id: 'particles.emissive', type: 'float', min: 0, max: 2, default: 0.08, label: 'Emisión propia', group: 'particles' });
    params.define({ id: 'particles.speedSmooth', type: 'float', min: 0.5, max: 40, default: 6, label: 'Suavizado de velocidad (1/s)', group: 'particles', sceneReset: false });
    params.define({ id: 'particles.turnRate', type: 'float', min: 0.5, max: 40, default: 8, label: 'Giro del palito (1/s)', group: 'particles', sceneReset: false });
    params.define({ id: 'particles.flicker', type: 'float', min: 0, max: 1, default: 0, label: 'Titileo', group: 'particles' });
    params.define({ id: 'particles.flickerRate', type: 'float', min: 0.1, max: 40, default: 9, label: 'Titileo (Hz)', group: 'particles' });
    params.defineAction({ id: 'particles.resetInBox', label: 'Reubicar en la caja', group: 'particles' });
    params.defineAction({ id: 'particles.fillColumn', label: 'Llenar la columna de flujo', group: 'particles' });
    Forces.defineParams(params);
  }

  async init() {
    const { min: simMin, max: simMax, cellSize, maxParticles } = STAGE.sim;
    this.gridSize.set(
      Math.round((simMax[0] - simMin[0]) / cellSize),
      Math.round((simMax[1] - simMin[1]) / cellSize),
      Math.round((simMax[2] - simMin[2]) / cellSize),
    );
    const cellCount = this.gridSize.x * this.gridSize.y * this.gridSize.z;
    console.info(`[vis] sim ${this.gridSize.x}×${this.gridSize.y}×${this.gridSize.z} = ${cellCount} celdas · hasta ${maxParticles} partículas`);

    const particleStruct = {
      position: { type: 'vec3' },
      density: { type: 'float' },
      velocity: { type: 'vec3' },
      mass: { type: 'float' },
      C: { type: 'mat3' },
      direction: { type: 'vec3' },
      age: { type: 'float' },
      // Rapidez suavizada en el tiempo. El renderer la usa para la mezcla a blanco: la
      // velocidad cruda sale de interpolar la grilla, así que todas las partículas de una
      // celda comparten valor y la transición se veía en bloques del tamaño de la celda.
      speedSmooth: { type: 'float' },
      alive: { type: 'uint' },
    };
    this.particleBuffer = new StructuredArray(particleStruct, maxParticles, 'particleData');
    this._seedParticles(maxParticles);
    this.particleBuffer.updateAll();

    const cellStruct = {
      x: { type: 'int', atomic: true },
      y: { type: 'int', atomic: true },
      z: { type: 'int', atomic: true },
      mass: { type: 'int', atomic: true },
    };
    this.cellBuffer = new StructuredArray(cellStruct, cellCount, 'cellData');
    this.cellBufferF = instancedArray(cellCount, 'vec4').label('cellDataF');

    const u = this.uniforms;
    u.gravity = uniform(new THREE.Vector3());
    u.stiffness = uniform(3);
    u.restDensity = uniform(1);
    u.dynamicViscosity = uniform(0.1);
    u.noise = uniform(0);
    u.noiseScale = uniform(0.015);
    u.noiseSpeed = uniform(0.5);
    u.gridSize = uniform(this.gridSize, 'ivec3');
    u.dt = uniform(0.1);
    u.frameTime = uniform(0);   // dt real en segundos, para la edad
    u.speedSmooth = uniform(6);
    u.turnRate = uniform(8);
    u.wrapA = uniform(0);         // techo del encuadre en grilla: y = wrapA + wrapB·z
    u.wrapB = uniform(0);
    u.emitSpread = uniform(4);    // alto de la banda de emisión, en celdas
    u.numParticles = uniform(0, 'uint');

    u.boxEnabled = uniform(0, 'uint');
    u.boxCenter = uniform(new THREE.Vector3());
    u.boxHalf = uniform(new THREE.Vector3(1, 1, 1));
    u.boxYaw = uniform(0);
    u.wallStiffness = uniform(0.3);
    u.wallMaxPush = uniform(1.0);
    u.hardClamp = uniform(0, 'uint');
    u.wallBounce = uniform(0.2);
    u.resetSeed = uniform(0, 'uint');

    const encode = (f32) => int(f32.mul(FIXED_POINT));
    const decode = (i32) => float(i32).div(FIXED_POINT);
    const cellPtr = (ipos) => int(ipos.x).mul(u.gridSize.y).mul(u.gridSize.z).add(int(ipos.y).mul(u.gridSize.z)).add(int(ipos.z)).toConst();
    const getCell = (ipos) => this.cellBuffer.element(cellPtr(ipos));
    const outOfBounds = (p) => p.x.lessThan(2).or(p.x.greaterThan(u.gridSize.x.sub(2)))
      .or(p.y.lessThan(2)).or(p.y.greaterThan(u.gridSize.y.sub(2)))
      .or(p.z.lessThan(2)).or(p.z.greaterThan(u.gridSize.z.sub(2)));
    const quadraticWeights = (cellDiff) => {
      const w0 = float(0.5).mul(float(0.5).sub(cellDiff)).mul(float(0.5).sub(cellDiff));
      const w1 = float(0.75).sub(cellDiff.mul(cellDiff));
      const w2 = float(0.5).mul(float(0.5).add(cellDiff)).mul(float(0.5).add(cellDiff));
      return array([w0, w1, w2]).toConst('weights');
    };

    this.kernels.clearGrid = Fn(() => {
      this.cellBuffer.setAtomic('x', false);
      this.cellBuffer.setAtomic('y', false);
      this.cellBuffer.setAtomic('z', false);
      this.cellBuffer.setAtomic('mass', false);
      If(instanceIndex.greaterThanEqual(uint(cellCount)), () => { Return(); });
      this.cellBuffer.element(instanceIndex).get('x').assign(0);
      this.cellBuffer.element(instanceIndex).get('y').assign(0);
      this.cellBuffer.element(instanceIndex).get('z').assign(0);
      this.cellBuffer.element(instanceIndex).get('mass').assign(0);
      this.cellBufferF.element(instanceIndex).assign(0);
    })().compute(cellCount);

    this.kernels.p2g1 = Fn(() => {
      this.cellBuffer.setAtomic('x', true);
      this.cellBuffer.setAtomic('y', true);
      this.cellBuffer.setAtomic('z', true);
      this.cellBuffer.setAtomic('mass', true);
      If(instanceIndex.greaterThanEqual(uint(u.numParticles)), () => { Return(); });
      If(this.particleBuffer.element(instanceIndex).get('alive').equal(uint(0)), () => { Return(); });

      const p = this.particleBuffer.element(instanceIndex).get('position').xyz.toConst('particlePosition');
      const v = this.particleBuffer.element(instanceIndex).get('velocity').xyz.toConst('particleVelocity');
      If(outOfBounds(p), () => { Return(); });

      const cellIndex = ivec3(p).sub(1).toConst('cellIndex');
      const weights = quadraticWeights(p.fract().sub(0.5).toConst('cellDiff'));
      const C = this.particleBuffer.element(instanceIndex).get('C').toConst();

      Loop({ start: 0, end: 3, type: 'int', name: 'gx', condition: '<' }, ({ gx }) => {
        Loop({ start: 0, end: 3, type: 'int', name: 'gy', condition: '<' }, ({ gy }) => {
          Loop({ start: 0, end: 3, type: 'int', name: 'gz', condition: '<' }, ({ gz }) => {
            const weight = weights.element(gx).x.mul(weights.element(gy).y).mul(weights.element(gz).z);
            const cellX = cellIndex.add(ivec3(gx, gy, gz)).toConst();
            const cellDist = vec3(cellX).add(0.5).sub(p).toConst('cellDist');
            const Q = C.mul(cellDist);
            const velContrib = weight.mul(v.add(Q)).toConst('velContrib');
            const cell = getCell(cellX);
            atomicAdd(cell.get('x'), encode(velContrib.x));
            atomicAdd(cell.get('y'), encode(velContrib.y));
            atomicAdd(cell.get('z'), encode(velContrib.z));
            atomicAdd(cell.get('mass'), encode(weight));
          });
        });
      });
    })().compute(1);

    this.kernels.p2g2 = Fn(() => {
      this.cellBuffer.setAtomic('x', true);
      this.cellBuffer.setAtomic('y', true);
      this.cellBuffer.setAtomic('z', true);
      this.cellBuffer.setAtomic('mass', false);
      If(instanceIndex.greaterThanEqual(uint(u.numParticles)), () => { Return(); });
      If(this.particleBuffer.element(instanceIndex).get('alive').equal(uint(0)), () => { Return(); });

      const p = this.particleBuffer.element(instanceIndex).get('position').xyz.toConst('particlePosition');
      If(outOfBounds(p), () => { Return(); });

      const cellIndex = ivec3(p).sub(1).toConst('cellIndex');
      const weights = quadraticWeights(p.fract().sub(0.5).toConst('cellDiff'));

      const density = float(0).toVar('density');
      Loop({ start: 0, end: 3, type: 'int', name: 'gx', condition: '<' }, ({ gx }) => {
        Loop({ start: 0, end: 3, type: 'int', name: 'gy', condition: '<' }, ({ gy }) => {
          Loop({ start: 0, end: 3, type: 'int', name: 'gz', condition: '<' }, ({ gz }) => {
            const weight = weights.element(gx).x.mul(weights.element(gy).y).mul(weights.element(gz).z);
            const cell = getCell(cellIndex.add(ivec3(gx, gy, gz)).toConst());
            density.addAssign(decode(cell.get('mass')).mul(weight));
          });
        });
      });
      const densityStore = this.particleBuffer.element(instanceIndex).get('density');
      densityStore.assign(mix(densityStore, density, 0.05));

      const volume = float(1).div(density);
      const pressure = max(0.0, pow(density.div(u.restDensity), 5.0).sub(1).mul(u.stiffness)).toConst('pressure');
      const stress = mat3(pressure.negate(), 0, 0, 0, pressure.negate(), 0, 0, 0, pressure.negate()).toVar('stress');
      const dudv = this.particleBuffer.element(instanceIndex).get('C').toConst('C');
      stress.addAssign(dudv.add(dudv.transpose()).mul(u.dynamicViscosity));
      const eq16Term0 = volume.mul(-4).mul(stress).mul(u.dt);

      Loop({ start: 0, end: 3, type: 'int', name: 'gx', condition: '<' }, ({ gx }) => {
        Loop({ start: 0, end: 3, type: 'int', name: 'gy', condition: '<' }, ({ gy }) => {
          Loop({ start: 0, end: 3, type: 'int', name: 'gz', condition: '<' }, ({ gz }) => {
            const weight = weights.element(gx).x.mul(weights.element(gy).y).mul(weights.element(gz).z);
            const cellX = cellIndex.add(ivec3(gx, gy, gz)).toConst();
            const cellDist = vec3(cellX).add(0.5).sub(p).toConst('cellDist');
            const cell = getCell(cellX);
            const momentum = eq16Term0.mul(weight).mul(cellDist).toConst('momentum');
            atomicAdd(cell.get('x'), encode(momentum.x));
            atomicAdd(cell.get('y'), encode(momentum.y));
            atomicAdd(cell.get('z'), encode(momentum.z));
          });
        });
      });
    })().compute(1);

    this.kernels.updateGrid = Fn(() => {
      this.cellBuffer.setAtomic('x', false);
      this.cellBuffer.setAtomic('y', false);
      this.cellBuffer.setAtomic('z', false);
      this.cellBuffer.setAtomic('mass', false);
      If(instanceIndex.greaterThanEqual(uint(cellCount)), () => { Return(); });

      const cell = this.cellBuffer.element(instanceIndex).toConst('cell');
      const mass = decode(cell.get('mass')).toConst();
      If(mass.lessThanEqual(0), () => { Return(); });

      const vx = decode(cell.get('x')).div(mass).toVar();
      const vy = decode(cell.get('y')).div(mass).toVar();
      const vz = decode(cell.get('z')).div(mass).toVar();

      const x = int(instanceIndex).div(u.gridSize.z).div(u.gridSize.y);
      const y = int(instanceIndex).div(u.gridSize.z).mod(u.gridSize.y);
      const z = int(instanceIndex).mod(u.gridSize.z);

      // Pared exterior del escenario: dos celdas de margen en cada eje.
      If(x.lessThan(int(2)).or(x.greaterThan(u.gridSize.x.sub(int(2)))), () => { vx.assign(0); });
      If(y.lessThan(int(2)).or(y.greaterThan(u.gridSize.y.sub(int(2)))), () => { vy.assign(0); });
      If(z.lessThan(int(2)).or(z.greaterThan(u.gridSize.z.sub(int(2)))), () => { vz.assign(0); });

      this.cellBufferF.element(instanceIndex).assign(vec4(vx, vy, vz, mass));
    })().compute(cellCount);

    this.kernels.g2p = Fn(() => {
      If(instanceIndex.greaterThanEqual(uint(u.numParticles)), () => { Return(); });
      If(this.particleBuffer.element(instanceIndex).get('alive').equal(uint(0)), () => { Return(); });

      const particleMass = this.particleBuffer.element(instanceIndex).get('mass').toConst('particleMass');
      const pos = this.particleBuffer.element(instanceIndex).get('position').xyz.toVar('particlePosition');
      const vel = vec3(0).toVar('particleVelocity');

      vel.addAssign(u.gravity.mul(u.dt));

      const noise = triNoise3Dvec(pos.mul(u.noiseScale), time, u.noiseSpeed).sub(0.285).normalize().mul(0.28).toVar();
      vel.subAssign(noise.mul(u.noise).mul(u.dt));

      this.forces.apply(vel, pos, u.dt);

      const cellIndex = ivec3(pos).sub(1).toConst('cellIndex');
      const weights = quadraticWeights(pos.fract().sub(0.5).toConst('cellDiff'));

      const B = mat3(0).toVar('B');
      Loop({ start: 0, end: 3, type: 'int', name: 'gx', condition: '<' }, ({ gx }) => {
        Loop({ start: 0, end: 3, type: 'int', name: 'gy', condition: '<' }, ({ gy }) => {
          Loop({ start: 0, end: 3, type: 'int', name: 'gz', condition: '<' }, ({ gz }) => {
            const weight = weights.element(gx).x.mul(weights.element(gy).y).mul(weights.element(gz).z);
            const cellX = cellIndex.add(ivec3(gx, gy, gz)).toConst();
            const cellDist = vec3(cellX).add(0.5).sub(pos).toConst('cellDist');
            const wv = this.cellBufferF.element(cellPtr(cellX)).xyz.mul(weight).toConst('weightedVelocity');
            B.addAssign(mat3(wv.mul(cellDist.x), wv.mul(cellDist.y), wv.mul(cellDist.z)));
            vel.addAssign(wv);
          });
        });
      });

      vel.mulAssign(particleMass);     // pequeña variación entre partículas, como el original
      this.particleBuffer.element(instanceIndex).get('C').assign(B.mul(4));
      pos.addAssign(vel.mul(u.dt));

      // Pared exterior del dominio (siempre activa): es el borde del escenario.
      pos.assign(clamp(pos, vec3(2), vec3(u.gridSize).sub(2)));
      const xNw = pos.add(vel.mul(u.dt).mul(3.0)).toConst('xNw');
      const wallMin = vec3(3).toConst('wallMin');
      const wallMax = vec3(u.gridSize).sub(3).toConst('wallMax');
      If(xNw.x.lessThan(wallMin.x), () => { vel.x.addAssign(wallMin.x.sub(xNw.x).mul(0.3)); });
      If(xNw.x.greaterThan(wallMax.x), () => { vel.x.addAssign(wallMax.x.sub(xNw.x).mul(0.3)); });
      If(xNw.y.lessThan(wallMin.y), () => { vel.y.addAssign(wallMin.y.sub(xNw.y).mul(0.3)); });
      If(xNw.y.greaterThan(wallMax.y), () => { vel.y.addAssign(wallMax.y.sub(xNw.y).mul(0.3)); });
      If(xNw.z.lessThan(wallMin.z), () => { vel.z.addAssign(wallMin.z.sub(xNw.z).mul(0.3)); });
      If(xNw.z.greaterThan(wallMax.z), () => { vel.z.addAssign(wallMax.z.sub(xNw.z).mul(0.3)); });

      // Caja: sub-AABB rotable en Y. Se resuelve en el espacio local de la caja,
      // así girarla en vivo no deja escapar partículas.
      If(u.boxEnabled.equal(uint(1)), () => {
        const c = cos(u.boxYaw).toConst();
        const s = sin(u.boxYaw).toConst();
        const rel = pos.sub(u.boxCenter).toConst();
        const local = vec3(c.mul(rel.x).sub(s.mul(rel.z)), rel.y, s.mul(rel.x).add(c.mul(rel.z))).toVar('local');
        const lv = vec3(c.mul(vel.x).sub(s.mul(vel.z)), vel.y, s.mul(vel.x).add(c.mul(vel.z))).toVar('lv');

        If(u.hardClamp.equal(uint(1)), () => {
          local.assign(clamp(local, u.boxHalf.negate(), u.boxHalf));
        });

        const xN = local.add(lv.mul(u.dt).mul(3.0)).toConst('xN');
        const pen = max(vec3(0), u.boxHalf.negate().sub(xN)).sub(max(vec3(0), xN.sub(u.boxHalf))).toConst('pen');
        lv.addAssign(clamp(pen.mul(u.wallStiffness), vec3(u.wallMaxPush).negate(), vec3(u.wallMaxPush)));

        // El resorte de arriba es preventivo pero no garantiza nada: con la caja moviéndose o
        // girando, los palitos igual se pasaban del límite. Este clamp final los deja SIEMPRE
        // adentro y mata la velocidad que apunta hacia afuera (pared sólida, no elástica).
        const clamped = clamp(local, u.boxHalf.negate(), u.boxHalf).toConst('clamped');
        lv.assign(vec3(
          select(clamped.x.notEqual(local.x), lv.x.mul(u.wallBounce).negate(), lv.x),
          select(clamped.y.notEqual(local.y), lv.y.mul(u.wallBounce).negate(), lv.y),
          select(clamped.z.notEqual(local.z), lv.z.mul(u.wallBounce).negate(), lv.z),
        ));
        local.assign(clamped);

        pos.assign(u.boxCenter.add(vec3(c.mul(local.x).add(s.mul(local.z)), local.y, s.negate().mul(local.x).add(c.mul(local.z)))));
        vel.assign(vec3(c.mul(lv.x).add(s.mul(lv.z)), lv.y, s.negate().mul(lv.x).add(c.mul(lv.z))));
      });

      // Emisión continua (escena 12): al salir por arriba reaparece abajo con x/z al azar.
      // Todo en GPU: sin loops de CPU ni subir 25 MB de buffers por frame.
      //
      // El techo NO es un plano horizontal fijo: es el borde superior del encuadre, que en
      // perspectiva sube con la profundidad (una partícula a 2 m de fondo tiene que llegar más
      // alto que una al frente para salirse del cuadro). La CPU manda la recta y = A + B·z en
      // unidades de grilla; acá se evalúa por partícula. Así el flujo se va de pantalla de
      // verdad en vez de amontonarse contra un límite visible.
      const f = this.forces.u;
      If(f.wrapMode.equal(uint(1)), () => {
        const screenTop = u.wrapA.add(u.wrapB.mul(pos.z)).toConst('screenTop');
        const top = select(u.boxEnabled.equal(uint(1)), u.boxCenter.y.add(u.boxHalf.y), screenTop);
        const bottom = select(u.boxEnabled.equal(uint(1)), u.boxCenter.y.sub(u.boxHalf.y), float(2));
        If(pos.y.greaterThan(top), () => {
          const seed = instanceIndex.add(u.resetSeed);
          const rx = hash(seed.mul(uint(3))).sub(0.5).mul(2);
          const rz = hash(seed.mul(uint(3)).add(uint(1))).sub(0.5).mul(2);
          const ry = hash(seed.mul(uint(3)).add(uint(2)));
          // La huella del emisor es la de la caja aunque el límite esté apagado: así se
          // encuadra el chorro con box.width / box.depth sin volver a encerrar las partículas.
          pos.assign(vec3(
            u.boxCenter.x.add(rx.mul(u.boxHalf.x)),
            bottom.add(0.5).add(ry.mul(u.emitSpread)),
            u.boxCenter.z.add(rz.mul(u.boxHalf.z)),
          ));
          pos.assign(clamp(pos, vec3(2), vec3(u.gridSize).sub(2)));
          vel.assign(f.flow);
          const el = this.particleBuffer.element(instanceIndex);
          el.get('C').assign(mat3(0));
          el.get('age').assign(float(0));
          el.get('speedSmooth').assign(f.flow.length());
          // Nace ya apuntando hacia donde va: si heredara la dirección del que murió arriba,
          // el palito recién emitido aparecería cruzado un par de décimas.
          el.get('direction').assign(normalize(f.flow.add(vec3(0, 0.001, 0))));
        });
      });

      this.particleBuffer.element(instanceIndex).get('position').assign(pos);
      this.particleBuffer.element(instanceIndex).get('velocity').assign(vel);

      // Heading: se guarda SIEMPRE unitario. Antes era `mix(direction, vel, 0.1)`, o sea un
      // vector cuyo módulo era la velocidad: con la partícula casi quieta quedaba en ~0 y
      // `normalize()` en el renderer devolvía basura (el palito temblaba sin orientación).
      // Ahora el suavizado es por segundo real (no por frame) y ante velocidad ~0 conserva
      // el último rumbo en vez de perderlo.
      const speed = vel.length().toConst('speed');
      const direction = this.particleBuffer.element(instanceIndex).get('direction');
      const target = select(speed.greaterThan(float(1e-4)), vel.div(max(speed, float(1e-4))), direction);
      const turned = mix(direction, target, clamp(u.frameTime.mul(u.turnRate), 0, 1)).toVar('turned');
      const turnedLen = turned.length().toConst('turnedLen');
      direction.assign(select(turnedLen.greaterThan(float(1e-5)), turned.div(turnedLen), vec3(0, 0, 1)));

      // Rapidez suavizada: es la que colorea. Un promedio exponencial de ~1/speedSmooth
      // segundos rompe la correlación temporal que hacía saltar bloques enteros a blanco.
      const sp = this.particleBuffer.element(instanceIndex).get('speedSmooth');
      sp.assign(mix(sp, speed, clamp(u.frameTime.mul(u.speedSmooth), 0, 1)));

      const age = this.particleBuffer.element(instanceIndex).get('age');
      age.assign(age.add(u.frameTime));
    })().compute(1);

    // Reubica todas las partículas dentro de la caja actual, en GPU:
    // cambiar de escena no puede trabar el frame subiendo 25 MB de buffers.
    this.kernels.resetInBox = Fn(() => {
      If(instanceIndex.greaterThanEqual(uint(maxParticles)), () => { Return(); });
      const seed = instanceIndex.add(u.resetSeed);
      const r = vec3(
        hash(seed.mul(uint(3))).sub(0.5).mul(2),
        hash(seed.mul(uint(3)).add(uint(1))).sub(0.5).mul(2),
        hash(seed.mul(uint(3)).add(uint(2))).sub(0.5).mul(2),
      ).toConst();
      const local = r.mul(u.boxHalf).toConst();
      const c = cos(u.boxYaw).toConst();
      const s = sin(u.boxYaw).toConst();
      const world = u.boxCenter.add(vec3(c.mul(local.x).add(s.mul(local.z)), local.y, s.negate().mul(local.x).add(c.mul(local.z))));

      const el = this.particleBuffer.element(instanceIndex);
      el.get('position').assign(clamp(world, vec3(2), vec3(u.gridSize).sub(2)));
      el.get('velocity').assign(vec3(0));
      el.get('C').assign(mat3(0));
      el.get('density').assign(float(1));
      el.get('mass').assign(float(1).sub(hash(seed).mul(0.002)));
      el.get('direction').assign(vec3(0, 0, 1));
      el.get('speedSmooth').assign(float(0));
      // Edades repartidas al azar: si nacieran todas en 0 crecerían todas juntas y se notaría.
      el.get('age').assign(hash(seed.add(uint(31))).mul(4));
      el.get('alive').assign(uint(1));
    })().compute(maxParticles);

    // Arranca el flujo vertical YA en régimen: reparte las partículas por toda la columna, del
    // piso hasta el techo del reciclado, con la velocidad del flujo puesta. Sin esto, al entrar
    // en la escena 12 las partículas venían de donde estuvieran (encerradas en la caja de la
    // escena anterior) y se veían "soltarse" y desordenarse unos segundos antes de organizarse
    // en chorro. Con esto el chorro ya está lleno y subiendo desde el primer frame.
    this.kernels.fillColumn = Fn(() => {
      If(instanceIndex.greaterThanEqual(uint(maxParticles)), () => { Return(); });
      const seed = instanceIndex.add(u.resetSeed);
      const rx = hash(seed.mul(uint(5))).sub(0.5).mul(2);
      const rz = hash(seed.mul(uint(5)).add(uint(1))).sub(0.5).mul(2);
      const ry = hash(seed.mul(uint(5)).add(uint(2)));

      const x = u.boxCenter.x.add(rx.mul(u.boxHalf.x)).toConst();
      const z = u.boxCenter.z.add(rz.mul(u.boxHalf.z)).toConst();
      // Mismo techo que usa el reciclado: la recta del borde del encuadre a esa profundidad.
      const bottom = float(2.5);
      const top = u.wrapA.add(u.wrapB.mul(z));
      const y = mix(bottom, max(top, bottom.add(1)), ry);

      const flow = this.forces.u.flow;
      const el = this.particleBuffer.element(instanceIndex);
      el.get('position').assign(clamp(vec3(x, y, z), vec3(2), vec3(u.gridSize).sub(2)));
      el.get('velocity').assign(flow);
      el.get('C').assign(mat3(0));
      el.get('density').assign(float(1));
      el.get('mass').assign(float(1).sub(hash(seed).mul(0.002)));
      el.get('direction').assign(normalize(flow.add(vec3(0, 0.001, 0))));
      el.get('speedSmooth').assign(flow.length());
      // Edades repartidas: si nacieran todas en 0 crecerían todas juntas y se vería el pulso.
      el.get('age').assign(hash(seed.add(uint(31))).mul(4));
      el.get('alive').assign(uint(1));
    })().compute(maxParticles);

    this.params.onAction('particles.resetInBox', () => this.resetInBox());
    this.params.onAction('particles.fillColumn', () => {
      this.uniforms.resetSeed.value = (this.uniforms.resetSeed.value + 4409) >>> 0;
      this._pendingFill = true;
    });
    this.params.onAction('particles.kick', () => this.forces.triggerKick());
  }

  // Semilla inicial en CPU (una sola vez, antes del primer frame).
  _seedParticles(count) {
    const v = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      v.set(Math.random(), Math.random(), Math.random()).multiply(this.gridSize);
      this.particleBuffer.set(i, 'position', v);
      this.particleBuffer.set(i, 'mass', 1.0 - Math.random() * 0.002);
      this.particleBuffer.set(i, 'density', 1);
      this.particleBuffer.set(i, 'age', Math.random() * 4);
      this.particleBuffer.set(i, 'direction', { x: 0, y: 0, z: 1 });
      this.particleBuffer.set(i, 'alive', 1);
    }
  }

  resetInBox() {
    this.uniforms.resetSeed.value = (this.uniforms.resetSeed.value + 7919) >>> 0;
    this._pendingReset = true;
  }

  // Recta del borde superior del encuadre en unidades de grilla: y = wrapA + wrapB·z.
  // El ojo está en (eyeX, eyeY, eyeZ) y el borde de arriba de la LED en (y = heightM, z = 0),
  // así que en el mundo el rayo que pasa por ese borde vale
  //   yTop(z) = eyeY + (heightM − eyeY)·(eyeZ − z)/eyeZ,
  // y `particles.wrapTop` se suma como margen para que el reciclado no se vea nunca en cuadro.
  _updateWrapLine() {
    const p = this.params;
    const { min: m, cellSize } = STAGE.sim;
    const eyeY = p.get('camera.eyeY');
    const eyeZ = Math.max(p.get('camera.eyeZ'), 0.001);
    const k = (STAGE.physical.heightM - eyeY) / eyeZ;      // pendiente por metro de profundidad
    const margin = p.get('particles.wrapTop');
    // yTop(z) = eyeY + k·(eyeZ − z) + margen, con z = m[2] + gz·cellSize.
    const worldA = eyeY + k * (eyeZ - m[2]) + margin;
    this.uniforms.wrapA.value = (worldA - m[1]) / cellSize;
    this.uniforms.wrapB.value = -k;                        // en grilla la pendiente es adimensional
    this.uniforms.emitSpread.value = p.get('particles.emitSpread') / cellSize;
  }

  worldToGrid(target, x, y, z) {
    const { min: m, cellSize } = STAGE.sim;
    return target.set((x - m[0]) / cellSize, (y - m[1]) / cellSize, (z - m[2]) / cellSize);
  }

  async update(dt) {
    const p = this.params;
    const u = this.uniforms;
    const { cellSize } = STAGE.sim;

    const count = p.get('particles.count');
    if (count !== this.numParticles) {
      this.numParticles = count;
      u.numParticles.value = count;
      for (const k of ['p2g1', 'p2g2', 'g2p']) {
        this.kernels[k].count = count;
        this.kernels[k].updateDispatchCount();
      }
    }

    // Misma fórmula que conf.updateParams del repo original.
    const level = Math.max(count / 8192, 1);
    u.restDensity.value = 0.25 * level * p.get('particles.density') * DENSITY_CALIBRATION;
    u.stiffness.value = p.get('particles.stiffness');
    u.dynamicViscosity.value = p.get('particles.viscosity');
    u.noise.value = p.get('particles.turbulence');
    u.noiseScale.value = p.get('particles.turbulenceScale');
    u.noiseSpeed.value = p.get('particles.turbulenceSpeed');
    u.gravity.value.set(0, p.get('particles.gravityY'), 0);

    // Caja en unidades de grilla.
    this.worldToGrid(this._boxCenter, p.get('box.x'), p.get('box.y'), p.get('box.z'));
    u.boxCenter.value.copy(this._boxCenter);
    u.boxHalf.value.set(
      p.get('box.width') / 2 / cellSize,
      p.get('box.height') / 2 / cellSize,
      p.get('box.depth') / 2 / cellSize,
    );
    u.boxYaw.value = THREE.MathUtils.degToRad(p.get('box.yaw'));
    u.boxEnabled.value = p.get('box.enabled') ? 1 : 0;
    u.wallStiffness.value = p.get('box.wallStiffness');
    u.wallMaxPush.value = p.get('box.wallMaxPush');
    u.hardClamp.value = p.get('box.hardClamp') ? 1 : 0;
    u.wallBounce.value = p.get('box.wallBounce');

    this.forces.update(dt);
    u.dt.value = Math.min(dt, 1 / 60) * 6 * p.get('particles.speed');
    u.frameTime.value = Math.min(dt, 1 / 30);
    u.speedSmooth.value = p.get('particles.speedSmooth');
    u.turnRate.value = p.get('particles.turnRate');
    this._updateWrapLine();

    if (this._pendingReset) {
      this._pendingReset = false;
      await this.renderer.computeAsync(this.kernels.resetInBox);
    }
    // Va después de `_updateWrapLine`, que es quien deja wrapA/wrapB al día: el llenado los usa
    // para saber hasta dónde llega la columna.
    if (this._pendingFill) {
      this._pendingFill = false;
      await this.renderer.computeAsync(this.kernels.fillColumn);
    }
    await this.renderer.computeAsync([
      this.kernels.clearGrid, this.kernels.p2g1, this.kernels.p2g2, this.kernels.updateGrid, this.kernels.g2p,
    ]);
  }
}
