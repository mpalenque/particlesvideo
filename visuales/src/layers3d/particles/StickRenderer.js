import * as THREE from 'three/webgpu';
import {
  Fn, attribute, vec3, uint, varying, instanceIndex, mix, normalize, cross, mat3,
  normalLocal, transformNormalToView, mrt, uniform, smoothstep, float,
} from 'three/tsl';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { STAGE } from '../../config/stage.js';

// Portado de particlesvideo/src/mls-mpm/particleRenderer.js.
// Se mantiene la geometría fusionada y el positionNode (look-at por dirección);
// cambia el color (base por escena mezclado a blanco según velocidad) y no hay lifetime.
export const calcLookAtMatrix = /*#__PURE__*/ Fn(([target_immutable]) => {
  const target = vec3(target_immutable).toVar();
  const rr = vec3(0, 0, 1.0).toVar();
  const ww = vec3(normalize(target)).toVar();
  const uu = vec3(normalize(cross(ww, rr)).negate()).toVar();
  const vv = vec3(normalize(cross(uu, ww)).negate()).toVar();
  return mat3(uu, vv, ww);
}).setLayout({
  name: 'calcLookAtMatrix',
  type: 'mat3',
  inputs: [{ name: 'direction', type: 'vec3' }],
});

const createRoundedBox = (width, height, depth, radius) => {
  const box = new THREE.BoxGeometry(width - radius * 2, height - radius * 2, depth - radius * 2);
  const epsilon = Math.min(width, height, depth) * 0.01;
  const positionArray = box.attributes.position.array;
  const normalArray = box.attributes.normal.array;
  const indices = [...(box.getIndex().array)];
  const vertices = [];
  const posMap = {};
  const edgeMap = {};
  for (let i = 0; i < positionArray.length / 3; i++) {
    const oldPosition = new THREE.Vector3(positionArray[i * 3], positionArray[i * 3 + 1], positionArray[i * 3 + 2]);
    positionArray[i * 3 + 0] += normalArray[i * 3 + 0] * radius;
    positionArray[i * 3 + 1] += normalArray[i * 3 + 1] * radius;
    positionArray[i * 3 + 2] += normalArray[i * 3 + 2] * radius;
    const vertex = new THREE.Vector3(positionArray[i * 3], positionArray[i * 3 + 1], positionArray[i * 3 + 2]);
    vertex.normal = new THREE.Vector3(normalArray[i * 3], normalArray[i * 3 + 1], normalArray[i * 3 + 2]);
    vertex.id = i;
    vertex.faces = [];
    vertex.posHash = oldPosition.toArray().map((v) => Math.round(v / epsilon)).join('_');
    posMap[vertex.posHash] = [...(posMap[vertex.posHash] || []), vertex];
    vertices.push(vertex);
  }
  vertices.forEach((vertex) => {
    const face = vertex.normal.toArray().map((v) => Math.round(v)).join('_');
    vertex.face = face;
    posMap[vertex.posHash].forEach((v) => { v.faces.push(face); });
  });
  vertices.forEach((vertex) => {
    const addVertexToEdgeMap = (v, entry) => { edgeMap[entry] = [...(edgeMap[entry] || []), v]; };
    vertex.faces.sort();
    const [f0, f1, f2] = vertex.faces;
    const face = vertex.face;
    if (f0 === face || f1 === face) addVertexToEdgeMap(vertex, f0 + '_' + f1);
    if (f0 === face || f2 === face) addVertexToEdgeMap(vertex, f0 + '_' + f2);
    if (f1 === face || f2 === face) addVertexToEdgeMap(vertex, f1 + '_' + f2);
  });

  const addFace = (v0, v1, v2) => {
    const a = v1.clone().sub(v0);
    const b = v2.clone().sub(v0);
    if (a.cross(b).dot(v0) > 0) indices.push(v0.id, v1.id, v2.id);
    else indices.push(v0.id, v2.id, v1.id);
  };

  Object.keys(posMap).forEach((key) => addFace(...posMap[key]));
  Object.keys(edgeMap).forEach((key) => {
    const edgeVertices = edgeMap[key];
    const v0 = edgeVertices[0];
    edgeVertices.sort((v1, v2) => v1.distanceTo(v0) - v2.distanceTo(v0));
    addFace(...edgeVertices.slice(0, 3));
    addFace(...edgeVertices.slice(1, 4));
  });

  box.setIndex(indices);
  return box;
};

// Tamaño del palito EN METROS. El original metía la relación de aspecto de sus celdas
// (no cúbicas) en la escala del objeto; acá la grilla es isotrópica (0.1 m), así que el
// tamaño se expresa directo en metros y se calibra contra la caja de 2.6 × 3 × 2.6 m.
// Con los defaults del plan (262144 partículas, size 2, length 1) da palitos de
// ~3.3 mm × 2.5 cm, que es lo que se parece a STORYBOARD/10.png: masa densa pero con
// estructura visible, no un bloque blanco.
const BASE_THICKNESS_M = 0.00825;
const BASE_LENGTH_M = 0.0625;
const GEO = { thickness: 0.7, length: 3 };   // extents del rounded box de la geometría

export class StickRenderer {
  constructor(ctx, sim) {
    this.params = ctx.params;
    this.sim = sim;
    this.u = {
      scale: uniform(new THREE.Vector3(1, 1, 1)), opacity: uniform(0), bloom: uniform(1),
      baseColor: uniform(new THREE.Color('#ff0000')),
      whiteMin: uniform(0.6), whiteMax: uniform(3.0),
    };
    this._color = '';
    this._bloomOn = null;
  }

  async init(scene) {
    const roundedBoxGeometry = createRoundedBox(0.7, 0.7, 3, 0.1);
    this.geometry = new THREE.InstancedBufferGeometry().copy(BufferGeometryUtils.mergeVertices(roundedBoxGeometry));
    this.geometry.instanceCount = 0;

    const u = this.u;
    const particle = this.sim.particleBuffer.element(instanceIndex);

    this.material = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
    const vNormal = varying(vec3(0), 'v_normalView');

    this.material.positionNode = Fn(() => {
      const particlePosition = particle.get('position');
      const particleDensity = particle.get('density');
      const particleDirection = particle.get('direction');
      const alive = float(particle.get('alive').equal(uint(1)));
      const mat = calcLookAtMatrix(particleDirection.xyz);
      vNormal.assign(transformNormalToView(mat.mul(normalLocal)));
      return mat
        .mul(attribute('position').xyz.mul(u.scale))
        .mul(particleDensity.mul(0.4).add(0.5).clamp(0, 1))
        .mul(alive)
        .add(particlePosition);
    })();

    // Color base de la escena, mezclado a blanco según la velocidad (pedido del storyboard).
    this.material.colorNode = Fn(() => {
      const speed = particle.get('velocity').xyz.length();
      const white = smoothstep(u.whiteMin, u.whiteMax, speed);
      return mix(u.baseColor, vec3(1, 1, 1), white);
    })();
    this.material.opacityNode = Fn(() => u.opacity.mul(float(particle.get('alive').equal(uint(1)))))();

    this.object = new THREE.Mesh(this.geometry, this.material);
    this.object.frustumCulled = false;
    // El objeto lleva la grilla de simulación a metros del escenario.
    this.object.position.set(...STAGE.sim.min);
    this.object.scale.setScalar(STAGE.sim.cellSize);
    scene.add(this.object);
  }

  update() {
    const p = this.params;
    const count = p.get('particles.count');
    const opacity = p.get('particles.opacity') * p.get('layer3d.opacity');

    this.u.opacity.value = opacity;
    this.object.visible = opacity > 0.001;
    this.geometry.instanceCount = count;

    // Misma compensación por cantidad que conf.updateParams del original: más partículas → más finas.
    const level = Math.max(count / 8192, 1);
    const comp = (1.6 / Math.cbrt(level)) * (p.get('particles.size') / 2);
    const thicknessM = BASE_THICKNESS_M * comp;
    const lengthM = BASE_LENGTH_M * comp * p.get('particles.length');
    const cell = STAGE.sim.cellSize;   // el objeto ya escala la grilla a metros
    this.u.scale.value.set(
      thicknessM / GEO.thickness / cell,
      thicknessM / GEO.thickness / cell,
      lengthM / GEO.length / cell,
    );
    this.u.whiteMin.value = p.get('particles.whiteSpeedMin');
    this.u.whiteMax.value = p.get('particles.whiteSpeedMax');

    const color = p.get('particles.baseColor');
    if (color !== this._color) { this.u.baseColor.value.set(color); this._color = color; }

    const bloom = p.get('particles.bloom') > 0.001;
    if (bloom !== this._bloomOn) {
      this._bloomOn = bloom;
      this.material.mrtNode = bloom ? mrt({ bloomIntensity: this.u.bloom }) : null;
      this.material.needsUpdate = true;
    }
    this.u.bloom.value = p.get('particles.bloom');
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
