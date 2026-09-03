import * as THREE from 'three/webgpu';
import { pass, mrt, output, float, vec3, vec4, uniform, Fn, mix, transformedNormalView } from 'three/tsl';
import { ao } from 'three/examples/jsm/tsl/display/GTAONode.js';
import { denoise } from 'three/examples/jsm/tsl/display/DenoiseNode.js';
import { bloom } from 'three/examples/jsm/tsl/display/BloomNode.js';

// Un solo grafo de PostProcessing: pase 3D (+bloom por MRT) y pase 2D compuesto encima con alpha.
export class Compositor {
  static defineParams(params) {
    params.define({ id: 'master.brightness', type: 'float', min: 0, max: 1, default: 1, label: 'Brillo master', group: 'master', sceneReset: false });
    params.define({ id: 'master.blackout', type: 'bool', default: false, label: 'Blackout', group: 'master', sceneReset: false });
    params.define({ id: 'master.bloomEnabled', type: 'bool', default: true, label: 'Bloom on', group: 'master', sceneReset: false });
    params.define({ id: 'master.quality', type: 'enum', options: ['ultra', 'high', 'medium', 'low'], default: 'high', label: 'Calidad', group: 'master', sceneReset: false });
    params.define({ id: 'bloom.strength', type: 'float', min: 0, max: 2, default: 0.9, label: 'Bloom fuerza', group: 'bloom', sceneReset: false });
    params.define({ id: 'bloom.radius', type: 'float', min: 0, max: 1, default: 0.8, label: 'Bloom radio', group: 'bloom', sceneReset: false });
    params.define({ id: 'bloom.threshold', type: 'float', min: 0, max: 1, default: 0, label: 'Bloom umbral', group: 'bloom', sceneReset: false });
    params.define({ id: 'ao.enabled', type: 'bool', default: true, label: 'Ambient occlusion', group: 'ao', sceneReset: false });
    params.define({ id: 'ao.amount', type: 'float', min: 0, max: 1, default: 1.0, label: 'Intensidad AO', group: 'ao', sceneReset: false });
    // El radio es en METROS y tiene que estar en la escala de lo que se quiere ocluir: los
    // palitos miden ~9 mm × 8 cm y se tocan entre sí a pocos centímetros. Con el 0.35 m de
    // antes el GTAO medía la silueta de toda la nube (una sombra global suave) y no veía
    // NADA del hueco entre palito y palito, que es justo el detalle que se pedía.
    params.define({ id: 'ao.distance', type: 'float', min: 0.01, max: 1, default: 0.10, label: 'Radio AO (m)', group: 'ao', sceneReset: false });
    params.define({ id: 'ao.thickness', type: 'float', min: 0.05, max: 4, default: 0.6, label: 'Grosor AO', group: 'ao', sceneReset: false });
    params.define({ id: 'ao.contrast', type: 'float', min: 0.25, max: 4, default: 1.6, label: 'Contraste AO', group: 'ao', sceneReset: false });
    params.define({ id: 'ao.samples', type: 'int', min: 4, max: 32, step: 1, default: 16, label: 'Muestras AO', group: 'ao', sceneReset: false });
    // Un radio de AO chico sobre una nube de palitos da una oclusión MUY ruidosa (el GTAO rota
    // sus muestras con una textura de ruido). El denoise bilateral guiado por profundidad y
    // normal es lo que convierte ese granulado en sombra limpia: sin él, subir la calidad del
    // AO se ve como suciedad y no como detalle.
    params.define({ id: 'ao.denoise', type: 'float', min: 0, max: 12, default: 5, label: 'Suavizado AO', group: 'ao', sceneReset: false });
    // MSAA de hardware (WebGPU), no un truco de shader: suaviza los bordes de la GEOMETRÍA 3D
    // (aristas de la caja, cubitos del piso, palitos) sin tocar la capa 2D, que necesita líneas
    // a pixel exacto. WebGPU soporta 1 o 4 muestras por pixel (no valores intermedios).
    params.define({ id: 'render.msaa', type: 'bool', default: true, label: 'Antialiasing 3D (MSAA)', group: 'render', sceneReset: false });
  }

  constructor(ctx, layer2d, layer3d) {
    this.params = ctx.params;
    this.renderer = ctx.renderer;
    this.layer2d = layer2d;
    this.layer3d = layer3d;
  }

  init() {
    // samples: 4 = MSAA 4x del hardware sobre el pase 3D. Solo WebGL lo tiene deshabilitado
    // en three (comentario "TODO" en PassNode); en WebGPU corre en el backend real.
    const scene3DPass = pass(this.layer3d.scene, this.layer3d.camera, { samples: 4 });
    this.scene3DPass = scene3DPass;
    // El MRT saca además la normal de vista, que es lo que necesita el GTAO junto con la
    // profundidad para calcular la oclusión.
    scene3DPass.setMRT(mrt({ output, normal: transformedNormalView, bloomIntensity: float(0) }));
    const color3D = scene3DPass.getTextureNode();
    const bloomMask = scene3DPass.getTextureNode('bloomIntensity');
    this.bloomPass = bloom(color3D.mul(bloomMask));

    this.uAoAmount = uniform(1.0);
    this.uAoContrast = uniform(1.6);
    const depth3D = scene3DPass.getTextureNode('depth');
    const normal3D = scene3DPass.getTextureNode('normal');
    this.aoPass = ao(depth3D, normal3D, this.layer3d.camera);
    this.aoPass.distanceExponent.value = 1;
    this.aoDenoise = denoise(this.aoPass.getTextureNode(), depth3D, normal3D, this.layer3d.camera);

    const scene2DPass = pass(this.layer2d.scene, this.layer2d.camera);
    const color2D = scene2DPass.getTextureNode();

    this.uBrightness = uniform(1);
    this.uBlackout = uniform(0);
    this.uBloomOn = uniform(1);

    this.post = new THREE.PostProcessing(this.renderer);
    this.post.outputColorTransform = false;
    this.post.outputNode = Fn(() => {
      // AO multiplicando el color antes del bloom: oscurece los huecos entre palitos.
      // `pow` sube el contraste de la oclusión sin llevarla nunca a negro (queda en 0..1).
      const oclusion = mix(float(1), this.aoDenoise.x.clamp(0, 1).pow(this.uAoContrast), this.uAoAmount);
      const a = color3D.rgb.mul(oclusion).clamp(0, 1).toVar();
      const b = this.bloomPass.rgb.clamp(0, 1).mul(this.uBloomOn).toVar();
      // screen-blend como en el repo original: (1-2b)·a² + 2·b·a
      const c3 = vec3(1).sub(b).sub(b).mul(a).mul(a).add(b.mul(a).mul(2)).clamp(0, 1);
      const c = mix(c3, color2D.rgb, color2D.a);            // 2D encima
      return vec4(c.mul(this.uBrightness).mul(this.uBlackout.oneMinus()), 1);
    })().renderOutput();
  }

  update() {
    this.uBrightness.value = this.params.get('master.brightness');
    this.uBlackout.value = this.params.get('master.blackout') ? 1 : 0;
    this.uBloomOn.value = this.params.get('master.bloomEnabled') ? 1 : 0;
    this.bloomPass.strength.value = this.params.get('bloom.strength');
    this.bloomPass.radius.value = this.params.get('bloom.radius');
    this.bloomPass.threshold.value = this.params.get('bloom.threshold');
    this.uAoAmount.value = this.params.get('ao.enabled') ? this.params.get('ao.amount') : 0;
    this.uAoContrast.value = this.params.get('ao.contrast');
    this.aoPass.radius.value = this.params.get('ao.distance');
    this.aoPass.thickness.value = this.params.get('ao.thickness');
    this.aoPass.samples.value = this.params.get('ao.samples');
    this.aoDenoise.radius.value = this.params.get('ao.denoise');
    // El backend recrea el render target solo cuando el valor cambia (lo compara él mismo),
    // así que reasignar cada frame no tiene costo cuando no cambió.
    this.scene3DPass.renderTarget.samples = this.params.get('render.msaa') ? 4 : 0;
  }

  async render() {
    await this.post.renderAsync();
  }
}
