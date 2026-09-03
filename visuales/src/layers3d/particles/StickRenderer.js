import * as THREE from 'three/webgpu';
import {
  Fn, attribute, vec3, uint, varying, instanceIndex, mix, normalize, cross, mat3,
  normalLocal, transformNormalToView, mrt, uniform, smoothstep, float, hash, clamp,
  abs, select, length,
} from 'three/tsl';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { STAGE } from '../../config/stage.js';

// Portado de particlesvideo/src/mls-mpm/particleRenderer.js.
// Se mantiene la geometría fusionada y el positionNode (look-at por dirección);
// cambia el color (base por escena mezclado a blanco según velocidad) y no hay lifetime.
// Base ortonormal con el eje Z local apuntando a `direction`.
// Dos arreglos respecto del original:
//  · si `direction` viene en cero (partícula frenada) `normalize` daba NaN y el palito
//    desaparecía o quedaba con una orientación cualquiera;
//  · el eje de referencia era fijo (0,0,1), así que para una partícula que viaja HACIA la
//    cámara el `cross` daba el vector nulo y la orientación se volvía basura. Se elige el
//    eje de referencia menos alineado con la dirección.
export const calcLookAtMatrix = /*#__PURE__*/ Fn(([target_immutable]) => {
  const target = vec3(target_immutable).toVar();
  const len = length(target).toConst();
  const ww = select(len.greaterThan(float(1e-5)), target.div(len), vec3(0, 0, 1)).toVar();
  const rr = select(abs(ww.z).greaterThan(float(0.9)), vec3(0, 1, 0), vec3(0, 0, 1)).toVar();
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
//
// Subidos respecto de la primera versión: con 262144 palitos de 3.3 mm × 2.5 cm cada uno
// medía ~1.4 px de ancho en la LED (336 px/m), o sea menos de un pixel de sombreado útil —
// no se veía ni el volumen, ni la oclusión, ni para dónde apuntaba. Ahora con la mitad de
// partículas cada palito mide ~9 mm × 8 cm ≈ 3 × 27 px: entra el degradado de la luz, el
// GTAO tiene algo que ocluir y la dirección se lee.
const BASE_THICKNESS_M = 0.0140;
const BASE_LENGTH_M = 0.125;
const GEO = { thickness: 0.7, length: 3 };   // extents del rounded box de la geometría

export class StickRenderer {
  constructor(ctx, sim) {
    this.params = ctx.params;
    this.sim = sim;
    this.u = {
      scale: uniform(new THREE.Vector3(1, 1, 1)), opacity: uniform(0), bloom: uniform(1),
      baseColor: uniform(new THREE.Color('#ff0000')),
      whiteMin: uniform(0.6), whiteMax: uniform(3.0), whiteJitter: uniform(0.6),
      ageGrow: uniform(1.2), sizeJitter: uniform(0.45), flicker: uniform(0), flickerPhase: uniform(0),
      roughness: uniform(0.55), metalness: uniform(0.0), emissive: uniform(0.15),
      taper: uniform(0.55), headTail: uniform(0.5),
    };
    this._color = '';
    this._bloomOn = null;
  }

  async init(scene) {
    const roundedBoxGeometry = createRoundedBox(0.7, 0.7, 3, 0.1);
    const merged = BufferGeometryUtils.mergeVertices(roundedBoxGeometry);
    // createRoundedBox reescribe posiciones e índices, así que las normales que traía la
    // BoxGeometry quedan mal. Sin recalcularlas el material iluminado no tiene con qué trabajar.
    merged.computeVertexNormals();
    this.geometry = new THREE.InstancedBufferGeometry().copy(merged);
    this.geometry.instanceCount = 0;

    const u = this.u;
    const particle = this.sim.particleBuffer.element(instanceIndex);

    // 0 en la cola (−Z local), 1 en la cabeza (+Z local, que es la dirección de marcha).
    const alongStick = (z) => z.div(GEO.length * 0.5).mul(0.5).add(0.5);

    // Mezcla a blanco. Dos cosas la hacen suave, y las dos hacen falta:
    //  · usa `speedSmooth` (promedio exponencial del simulador) en vez de la velocidad cruda,
    //    que sale de interpolar la grilla y por eso salta de golpe celda por celda;
    //  · corre el umbral de cada partícula un poco al azar (`whiteJitter`), así una zona de
    //    velocidad parecida se DISUELVE a blanco partícula por partícula en vez de darse
    //    vuelta entera de un frame para el otro. Sin esto se veían parches macizos.
    const whiteAmount = () => {
      const speed = particle.get('speedSmooth');
      const span = u.whiteMax.sub(u.whiteMin);
      const j = hash(instanceIndex.add(uint(613))).sub(0.5).mul(u.whiteJitter).mul(span);
      return smoothstep(u.whiteMin.add(j), u.whiteMax.add(j), speed);
    };

    // Escribe profundidad (los palitos se tapan entre sí de verdad y el GTAO tiene con qué
    // trabajar), pero sigue siendo `transparent` para que `particles.opacity` pueda fundirlos
    // en las transiciones de escena. Con alpha 1 se comporta igual que un opaco.
    this.material = new THREE.MeshStandardNodeMaterial({ transparent: true, depthWrite: true });

    this.material.positionNode = Fn(() => {
      const particlePosition = particle.get('position');
      const particleDensity = particle.get('density');
      const particleDirection = particle.get('direction');
      const alive = float(particle.get('alive').equal(uint(1)));
      const mat = calcLookAtMatrix(particleDirection.xyz);

      // Tamaño: densidad (como el original) × edad × variación fija por partícula.
      // Sin la variación por partícula todos los palitos miden exactamente lo mismo y se nota.
      const age = particle.get('age');
      const grow = clamp(age.div(u.ageGrow), 0, 1);
      const jitter = float(1).sub(u.sizeJitter.mul(0.5)).add(hash(instanceIndex).mul(u.sizeJitter));
      const size = particleDensity.mul(0.4).add(0.5).clamp(0, 1).mul(grow).mul(jitter);

      // Adelgazado hacia la cola. El eje Z local es la dirección de marcha (la última columna
      // de la matriz), así que afinar el extremo −Z convierte cada palito en una gota con punta
      // adelante: es lo que hace que a 3 px de ancho se lea para dónde va y no como un guioncito.
      const local = attribute('position').xyz.toVar();
      const t = alongStick(local.z);
      local.xy.mulAssign(mix(float(1).sub(u.taper), float(1), t));

      return mat
        .mul(local.mul(u.scale))
        .mul(size)
        .mul(alive)
        .add(particlePosition);
    })();

    this.material.normalNode = Fn(() => {
      const mat = calcLookAtMatrix(particle.get('direction').xyz);
      return transformNormalToView(mat.mul(normalLocal));
    })();

    // Color base de la escena, mezclado a blanco según la velocidad (pedido del storyboard).
    // El titileo (escena 23) modula el brillo por partícula con fase propia: da la sensación
    // de que la masa está por explotar en vez de parpadear toda junta.
    this.material.colorNode = Fn(() => {
      const base = mix(u.baseColor, vec3(1, 1, 1), whiteAmount());
      const fase = hash(instanceIndex.add(uint(977))).mul(6.2831);
      const parpadeo = float(1).sub(u.flicker).add(u.flicker.mul(u.flickerPhase.add(fase).sin().mul(0.5).add(0.5)));
      // Degradado a lo largo del palito: la cola apagada, la cabeza a pleno. Segundo indicio
      // de dirección, y encima le da a cada palito una variación interna que antes no tenía
      // (a un solo color plano no se le ve ni la forma).
      const t = varying(alongStick(attribute('position').z), 'v_along');
      const cometa = mix(float(1).sub(u.headTail), float(1), t);
      return base.mul(parpadeo).mul(cometa);
    })();
    this.material.opacityNode = Fn(() => u.opacity.mul(float(particle.get('alive').equal(uint(1)))))();
    this.material.roughnessNode = u.roughness;
    this.material.metalnessNode = u.metalness;
    this.material.emissiveNode = Fn(() => mix(u.baseColor, vec3(1, 1, 1), whiteAmount()).mul(u.emissive))();

    this.object = new THREE.Mesh(this.geometry, this.material);
    this.object.frustumCulled = false;
    // El objeto lleva la grilla de simulación a metros del escenario.
    this.object.position.set(...STAGE.sim.min);
    this.object.scale.setScalar(STAGE.sim.cellSize);
    scene.add(this.object);
  }

  update(dt) {
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
    this.u.ageGrow.value = Math.max(p.get('particles.ageGrow'), 0.001);
    this.u.sizeJitter.value = p.get('particles.sizeJitter');
    this.u.taper.value = p.get('particles.taper');
    this.u.headTail.value = p.get('particles.headTail');
    this.u.whiteJitter.value = p.get('particles.whiteJitter');
    this.u.roughness.value = p.get('particles.roughness');
    this.u.metalness.value = p.get('particles.metalness');
    this.u.emissive.value = p.get('particles.emissive');
    this.u.flicker.value = p.get('particles.flicker');
    this.phase = (this.phase ?? 0) + dt * p.get('particles.flickerRate') * Math.PI * 2;
    this.u.flickerPhase.value = this.phase;

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
