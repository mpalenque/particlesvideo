import * as THREE from 'three/webgpu';

// Iluminación de la capa 3D. Existe para que los palitos tengan volumen (antes eran
// MeshBasicNodeMaterial, planos). Todo es param para poder animarlo en vivo desde
// MIDI/OSC más adelante: posición, color e intensidad de la luz principal.
//
// Los niveles bajaron (principal 3.2 → 2.6, ambiente 0.55 → 0.32): con un color base saturado
// como el rojo puro, el canal R saturaba en casi toda la masa y ahí se perdían tanto el
// degradado de la luz como la oclusión. Menos luz de relleno = más rango útil para el AO.
// El brillo general se recupera con `master.brightness`, que no aplasta el contraste.
export class Lights {
  static defineParams(params) {
    params.define({ id: 'light.ambient', type: 'float', min: 0, max: 3, default: 0.32, label: 'Ambiente', group: 'light', sceneReset: false });
    params.define({ id: 'light.ambientColor', type: 'color', default: '#8899BB', label: 'Color ambiente', group: 'light', sceneReset: false });
    params.define({ id: 'light.key', type: 'float', min: 0, max: 10, default: 2.6, label: 'Luz principal', group: 'light', sceneReset: false });
    params.define({ id: 'light.keyColor', type: 'color', default: '#FFFFFF', label: 'Color principal', group: 'light', sceneReset: false });
    params.define({ id: 'light.keyX', type: 'float', min: -8, max: 8, default: -2.5, label: 'Principal X (m)', group: 'light', sceneReset: false });
    params.define({ id: 'light.keyY', type: 'float', min: 0, max: 8, default: 4.0, label: 'Principal Y (m)', group: 'light', sceneReset: false });
    params.define({ id: 'light.keyZ', type: 'float', min: -8, max: 8, default: 2.5, label: 'Principal Z (m)', group: 'light', sceneReset: false });
    params.define({ id: 'light.fill', type: 'float', min: 0, max: 10, default: 0.75, label: 'Relleno', group: 'light', sceneReset: false });
    params.define({ id: 'light.fillColor', type: 'color', default: '#4466AA', label: 'Color relleno', group: 'light', sceneReset: false });
  }

  constructor(ctx) {
    this.params = ctx.params;
    this._keyColor = '';
    this._fillColor = '';
    this._ambientColor = '';
  }

  async init(scene) {
    this.ambient = new THREE.AmbientLight(0x8899bb, 0.32);
    this.key = new THREE.DirectionalLight(0xffffff, 2.6);
    this.fill = new THREE.DirectionalLight(0x4466aa, 0.75);
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
