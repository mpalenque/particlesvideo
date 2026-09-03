import * as THREE from 'three/webgpu';

// Iluminación de la capa 3D. Existe para que los palitos tengan volumen (antes eran
// MeshBasicNodeMaterial, planos). Todo es param para poder animarlo en vivo desde
// MIDI/OSC más adelante: posición, color e intensidad de la luz principal.
export class Lights {
  static defineParams(params) {
    params.define({ id: 'light.ambient', type: 'float', min: 0, max: 3, default: 0.55, label: 'Ambiente', group: 'light', sceneReset: false });
    params.define({ id: 'light.ambientColor', type: 'color', default: '#8899BB', label: 'Color ambiente', group: 'light', sceneReset: false });
    params.define({ id: 'light.key', type: 'float', min: 0, max: 10, default: 3.2, label: 'Luz principal', group: 'light', sceneReset: false });
    params.define({ id: 'light.keyColor', type: 'color', default: '#FFFFFF', label: 'Color principal', group: 'light', sceneReset: false });
    params.define({ id: 'light.keyX', type: 'float', min: -8, max: 8, default: -2.5, label: 'Principal X (m)', group: 'light', sceneReset: false });
    params.define({ id: 'light.keyY', type: 'float', min: 0, max: 8, default: 4.0, label: 'Principal Y (m)', group: 'light', sceneReset: false });
    params.define({ id: 'light.keyZ', type: 'float', min: -8, max: 8, default: 2.5, label: 'Principal Z (m)', group: 'light', sceneReset: false });
    params.define({ id: 'light.fill', type: 'float', min: 0, max: 10, default: 1.1, label: 'Relleno', group: 'light', sceneReset: false });
    params.define({ id: 'light.fillColor', type: 'color', default: '#4466AA', label: 'Color relleno', group: 'light', sceneReset: false });
  }

  constructor(ctx) {
    this.params = ctx.params;
    this._keyColor = '';
    this._fillColor = '';
    this._ambientColor = '';
  }

  async init(scene) {
    this.ambient = new THREE.AmbientLight(0x8899bb, 0.55);
    this.key = new THREE.DirectionalLight(0xffffff, 3.2);
    this.fill = new THREE.DirectionalLight(0x4466aa, 1.1);
    this.fill.position.set(3.5, 2.0, -3.0);
    scene.add(this.ambient, this.key, this.fill);
  }

  update() {
    const p = this.params;

    this.ambient.intensity = p.get('light.ambient');
    const ac = p.get('light.ambientColor');
    if (ac !== this._ambientColor) { this.ambient.color.set(ac); this._ambientColor = ac; }

    this.key.intensity = p.get('light.key');
    this.key.position.set(p.get('light.keyX'), p.get('light.keyY'), p.get('light.keyZ'));
    const kc = p.get('light.keyColor');
    if (kc !== this._keyColor) { this.key.color.set(kc); this._keyColor = kc; }

    this.fill.intensity = p.get('light.fill');
    const fc = p.get('light.fillColor');
    if (fc !== this._fillColor) { this.fill.color.set(fc); this._fillColor = fc; }
  }

  dispose() {}
}
