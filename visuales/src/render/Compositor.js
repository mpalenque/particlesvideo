import * as THREE from 'three/webgpu';
import { pass, mrt, output, float, vec3, vec4, uniform, Fn, mix } from 'three/tsl';
import { bloom } from 'three/examples/jsm/tsl/display/BloomNode.js';

// Un solo grafo de PostProcessing: pase 3D (+bloom por MRT) y pase 2D compuesto encima con alpha.
export class Compositor {
  static defineParams(params) {
    params.define({ id: 'master.brightness', type: 'float', min: 0, max: 1, default: 1, label: 'Brillo master', group: 'master', sceneReset: false });
    params.define({ id: 'master.blackout', type: 'bool', default: false, label: 'Blackout', group: 'master', sceneReset: false });
    params.define({ id: 'master.bloomEnabled', type: 'bool', default: true, label: 'Bloom on', group: 'master', sceneReset: false });
    params.define({ id: 'bloom.strength', type: 'float', min: 0, max: 2, default: 0.9, label: 'Bloom fuerza', group: 'bloom', sceneReset: false });
    params.define({ id: 'bloom.radius', type: 'float', min: 0, max: 1, default: 0.8, label: 'Bloom radio', group: 'bloom', sceneReset: false });
    params.define({ id: 'bloom.threshold', type: 'float', min: 0, max: 1, default: 0, label: 'Bloom umbral', group: 'bloom', sceneReset: false });
  }

  constructor(ctx, layer2d, layer3d) {
    this.params = ctx.params;
    this.renderer = ctx.renderer;
    this.layer2d = layer2d;
    this.layer3d = layer3d;
  }

  init() {
    const scene3DPass = pass(this.layer3d.scene, this.layer3d.camera);
    scene3DPass.setMRT(mrt({ output, bloomIntensity: float(0) }));
    const color3D = scene3DPass.getTextureNode();
    const bloomMask = scene3DPass.getTextureNode('bloomIntensity');
    this.bloomPass = bloom(color3D.mul(bloomMask));

    const scene2DPass = pass(this.layer2d.scene, this.layer2d.camera);
    const color2D = scene2DPass.getTextureNode();

    this.uBrightness = uniform(1);
    this.uBlackout = uniform(0);
    this.uBloomOn = uniform(1);

    this.post = new THREE.PostProcessing(this.renderer);
    this.post.outputColorTransform = false;
    this.post.outputNode = Fn(() => {
      const a = color3D.rgb.clamp(0, 1).toVar();
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
  }

  async render() {
    await this.post.renderAsync();
  }
}
