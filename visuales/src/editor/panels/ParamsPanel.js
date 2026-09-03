import { Pane } from 'tweakpane';
import { oscAddress, describeSource, sourcesFor } from '../reference.js';

const ECHO_MS = 200;   // ignorar valores entrantes de un id que tocamos recién (evita el eco)

export class ParamsPanel {
  constructor(state, bus) {
    this.state = state;
    this.bus = bus;
    this.container = document.getElementById('pane');
    this.refList = document.getElementById('ref-list');
    this.filterEl = document.getElementById('ref-filter');
    this.pane = null;
    this.mirror = {};        // objeto espejo que Tweakpane bindea
    this.bindings = new Map();
    this.touched = new Map();
  }

  init() {
    this.filterEl.addEventListener('input', () => this.renderReference());
  }

  rebuild() {
    this.pane?.dispose();
    this.pane = new Pane({ container: this.container });
    this.bindings.clear();
    this.mirror = {};

    const groups = new Map();
    for (const def of this.state.registry) {
      if (!groups.has(def.group)) groups.set(def.group, []);
      groups.get(def.group).push(def);
    }

    for (const [group, defs] of groups) {
      const folder = this.pane.addFolder({ title: group, expanded: false });
      for (const def of defs) {
        if (def.isAction) {
          folder.addButton({ title: def.label, label: def.id })
            .on('click', () => this.bus.trigger(def.id, undefined));
          continue;
        }
        this.mirror[def.id] = this.state.values[def.id] ?? def.default;
        const opts = { label: def.label };
        if (def.type === 'float') { opts.min = def.min; opts.max = def.max; }
        else if (def.type === 'int') { opts.min = def.min; opts.max = def.max; opts.step = def.step ?? 1; }
        else if (def.type === 'enum') { opts.options = Object.fromEntries(def.options.map((o) => [o, o])); }
        else if (def.type === 'color') { opts.view = 'color'; }

        const binding = folder.addBinding(this.mirror, def.id, opts);
        binding.on('change', (ev) => {
          this.touched.set(def.id, performance.now());
          this.bus.set(def.id, ev.value);
        });
        this.bindings.set(def.id, binding);
      }
    }
    this.renderReference();
  }

  refreshValues(values) {
    const now = performance.now();
    let dirty = false;
    for (const [id, value] of Object.entries(values)) {
      if (!(id in this.mirror)) continue;
      if (now - (this.touched.get(id) ?? -Infinity) < ECHO_MS) continue;
      if (this.mirror[id] !== value) { this.mirror[id] = value; dirty = true; }
    }
    if (dirty) this.pane?.refresh();
  }

  // Lista de referencia: id, etiqueta, tipo, rango, dirección OSC y fuentes MIDI/OSC mapeadas.
  renderReference() {
    const filter = this.filterEl.value.trim().toLowerCase();
    this.refList.innerHTML = '';
    for (const def of this.state.registry) {
      const hay = `${def.id} ${def.label} ${def.group}`.toLowerCase();
      if (filter && !hay.includes(filter)) continue;

      const row = document.createElement('div');
      row.className = 'ref-row';

      const id = document.createElement('span');
      id.textContent = def.id;
      id.title = def.label;

      const osc = document.createElement('span');
      osc.className = 'osc';
      osc.textContent = oscAddress(def);
      osc.title = 'copiar dirección OSC';
      osc.onclick = () => navigator.clipboard?.writeText(oscAddress(def));

      const rng = document.createElement('span');
      rng.className = 'rng';
      rng.textContent = def.isAction ? (def.argHint || 'acción')
        : def.type === 'enum' ? def.options.join('|')
        : def.type === 'bool' ? 'bool'
        : `${def.min}..${def.max}`;

      const src = document.createElement('span');
      src.className = 'src';
      src.textContent = sourcesFor(def.id, this.state.mappings).map(describeSource).join(', ');

      row.append(id, osc, rng, src);
      this.refList.appendChild(row);
    }
  }
}
