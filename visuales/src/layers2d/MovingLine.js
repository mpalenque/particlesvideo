import * as THREE from 'three/webgpu';
import { uniform, vec4 } from 'three/tsl';
import { STAGE } from '../config/stage.js';
import { placeQuad } from './Layer2D.js';

// Línea blanca "trueno" (escena 2/2b+). Manuel: "es como un trueno que cae, desaparece".
// Modo strike: cae de arriba a abajo, avanza lento en horizontal y se apaga al salir por el borde.
export class MovingLine {
  static defineParams(params) {
    params.define({ id: 'line.opacity', type: 'float', min: 0, max: 1, default: 0, label: 'Línea', group: 'line' });
    params.define({ id: 'line.mode', type: 'enum', options: ['strike', 'loop'], default: 'strike', label: 'Modo', group: 'line' });
    params.define({ id: 'line.width', type: 'int', min: 1, max: 20, default: 3, label: 'Ancho (px)', group: 'line' });
    params.define({ id: 'line.speed', type: 'float', min: 0, max: 600, default: 30, label: 'Velocidad (px/s)', group: 'line' });
    params.define({ id: 'line.direction', type: 'int', min: -1, max: 1, default: 1, label: 'Sentido', group: 'line' });
    params.define({ id: 'line.orientation', type: 'enum', options: ['vertical', 'horizontal'], default: 'vertical', label: 'Orientación', group: 'line' });
    params.define({ id: 'line.strikeTime', type: 'float', min: 0.02, max: 1, default: 0.12, label: 'Caída (s)', group: 'line' });
    params.define({ id: 'line.fadeOut', type: 'float', min: 0, max: 2, default: 0.3, label: 'Apagado (s)', group: 'line' });
    params.define({ id: 'line.maxLines', type: 'int', min: 1, max: 8, default: 1, label: 'Líneas simultáneas', group: 'line' });
    params.define({ id: 'line.wrap', type: 'bool', default: true, label: 'Wrap (modo loop)', group: 'line' });
    params.define({ id: 'line.x', type: 'float', min: 0, max: 2688, default: 0, label: 'Posición', group: 'line', sceneReset: false });
    params.defineAction({ id: 'line.strike', label: 'Disparar línea', group: 'line', argHint: 'edge | center | random | px' });
    params.defineAction({ id: 'line.flip', label: 'Invertir sentido (2b)', group: 'line' });
    params.defineAction({ id: 'line.rotate', label: 'Girar 90°', group: 'line' });
    params.defineAction({ id: 'line.hide', label: 'Apagar línea', group: 'line' });
  }

  constructor(ctx) {
    this.params = ctx.params;
    this.lines = [];        // { pos, born, fading, fadeT, grow }
    this.quads = [];
    this.uniforms = [];
  }

  async init(scene) {
    for (let i = 0; i < 8; i++) {
      const uOpacity = uniform(0);
      const material = new THREE.MeshBasicNodeMaterial({ transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
      material.colorNode = vec4(1, 1, 1, uOpacity);
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
      mesh.renderOrder = 6;   // detrás del marco rojo (renderOrder 10)
      mesh.visible = false;
      scene.add(mesh);
      this.quads.push(mesh);
      this.uniforms.push(uOpacity);
    }

    this.params.onAction('line.strike', (arg) => this.strike(arg));
    this.params.onAction('line.flip', () => this.params.set('line.direction', -this.params.target('line.direction')));
    this.params.onAction('line.rotate', () => {
      const next = this.params.target('line.orientation') === 'vertical' ? 'horizontal' : 'vertical';
      this.params.set('line.orientation', next);
    });
    this.params.onAction('line.hide', () => { for (const l of this.lines) l.fading = true; });
  }

  strike(arg) {
    const vertical = this.params.get('line.orientation') === 'vertical';
    const span = vertical ? STAGE.width : STAGE.height;
    const dir = this.params.get('line.direction');

    let pos;
    if (arg === undefined || arg === 'edge') pos = dir > 0 ? 0 : span;   // entra por el borde opuesto al avance
    else if (arg === 'center') pos = span / 2;
    else if (arg === 'random') pos = Math.random() * span;
    else pos = Number(arg);
    if (!Number.isFinite(pos)) pos = 0;

    this.lines.push({ pos, grow: 0, fading: false, fadeT: 0 });
    const max = this.params.get('line.maxLines');
    while (this.lines.length > max) this.lines.shift();
  }

  update(dt) {
    const opacity = this.params.get('line.opacity');
    const mode = this.params.get('line.mode');
    const vertical = this.params.get('line.orientation') === 'vertical';
    const width = this.params.get('line.width');
    const speed = this.params.get('line.speed');
    const dir = this.params.get('line.direction');
    const strikeTime = this.params.get('line.strikeTime');
    const fadeOut = this.params.get('line.fadeOut');
    const span = vertical ? STAGE.width : STAGE.height;
    const length = vertical ? STAGE.height : STAGE.width;

    if (mode === 'loop' && this.lines.length === 0 && opacity > 0.001) {
      this.lines.push({ pos: span / 2, grow: 1, fading: false, fadeT: 0 });
    }

    for (const l of this.lines) {
      l.grow = Math.min(l.grow + dt / Math.max(strikeTime, 0.001), 1);
      l.pos += dir * speed * dt;

      const out = l.pos < -width || l.pos > span + width;
      if (out) {
        if (mode === 'loop') {
          if (this.params.get('line.wrap')) l.pos = dir > 0 ? -width : span + width;
          else this.params.set('line.direction', -dir);
        } else l.fading = true;
      }
      if (l.fading) l.fadeT += dt;
    }
    this.lines = this.lines.filter((l) => !(l.fading && l.fadeT >= Math.max(fadeOut, 0.001)));

    if (this.lines.length) this.params.set('line.x', this.lines[this.lines.length - 1].pos, { immediate: true });

    for (let i = 0; i < this.quads.length; i++) {
      const l = this.lines[i];
      const quad = this.quads[i];
      if (!l || opacity <= 0.001) { quad.visible = false; continue; }

      // El "trueno" cae: al aparecer crece de arriba hacia abajo con un flash que decae.
      const grown = l.grow * length;
      const flash = 1 + (1 - l.grow) * 0.5;
      const fade = l.fading ? Math.max(0, 1 - l.fadeT / Math.max(fadeOut, 0.001)) : 1;

      quad.visible = true;
      this.uniforms[i].value = Math.min(opacity * flash * fade, 1);
      const p = Math.round(l.pos);
      if (vertical) placeQuad(quad, p, 0, width, grown);
      else placeQuad(quad, 0, p, grown, width);
    }
  }

  dispose() {
    for (const q of this.quads) { q.geometry.dispose(); q.material.dispose(); }
  }
}
