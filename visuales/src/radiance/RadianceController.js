import { ShowSession } from './ShowSession.js';
import { PreviewCapture } from './PreviewCapture.js';

const FLUID_SCENES = new Set(['24', '25']);
const LIVE = {
  emission: [0, 1, 0, 'Emisión'], x: [0, 1, .5, 'Emisor X'], y: [0, 1, .5, 'Emisor Y'],
  hue: [0, 1, 0, 'Color del emisor'], gravity: [-1, 1, 0, 'Gravedad'],
  viscosity: [0, 1, .5, 'Viscosidad'], cohesion: [0, 1, .5, 'Cohesión'],
  light: [0, 3, 1, 'Luz'], forceX: [-1, 1, 0, 'Fuerza X'], forceY: [-1, 1, 0, 'Fuerza Y'],
};

// Un único propietario de render, transporte y documento. El editor sólo envía órdenes.
export class RadianceController {
  static defineParams(params) {
    // Se conserva el ID para configuraciones anteriores, pero ya no existe salida de audio web.
    params.define({ id: 'fluids.audioMode', type: 'enum', options: ['external'], default: 'external',
      label: 'Audio externo · Ableton', group: 'fluids', sceneReset: false });
    for (const [key, [min, max, value, label]] of Object.entries(LIVE)) {
      params.define({ id: `fluids.live.${key}`, type: 'float', min, max, default: value,
        label: `${label} · motor libre (sin escena asignada)`, group: 'fluids.live', sceneReset: false });
    }
    for (const [id, label, argHint] of [
      ['arm', 'Preparar motor Fluids'], ['standby', 'Previa · escena 24'],
      ['play', 'Play · escena 25'], ['pause', 'Pausa · escena 25'],
      ['restart', 'Reiniciar · escena 25'], ['seek', 'Buscar · escena 25', 'segundos'],
      ['live.burst', 'Ráfaga · motor libre', 'cantidad de partículas'],
      ['live.attractor', 'Atractor · motor libre'], ['live.reset', 'Reiniciar fluido · motor libre'],
    ]) params.defineAction({ id: `fluids.${id}`, label, argHint, group: id.startsWith('live') ? 'fluids.live' : 'fluids' });
  }

  constructor(ctx, view) {
    this.ctx = ctx;
    this.ownerId = crypto.randomUUID();
    this.params = ctx.params;
    this.session = new ShowSession();
    this.runtime = null;
    this.active = false;
    this.mode = null;
    this.pending = null;
    this.status = 'preparing';
    this.error = null;
    this._generation = 0;
    this._queue = Promise.resolve();
    this._lastState = 0;
    this._lastPreview = 0;
    this._previewRequested = false;
    this._preview = new PreviewCapture({
      onFrame: blob => {
        if (this._previewReadyResolve) { this._previewReadyResolve(); this._previewReadyResolve = null; return; }
        const reader = new FileReader();
        reader.onloadend = () => this.post({ t: 'fluids:preview', url: reader.result });
        reader.readAsDataURL(blob);
      },
      onError: error => {
        this._previewReadyResolve?.(); this._previewReadyResolve = null;
        this.post({ t: 'fluids:error', error: `Vista previa: ${error.message}` });
      },
    });
    this._live = {};
    this.host = document.createElement('div');
    this.host.id = 'radiance-stage';
    Object.assign(this.host.style, { position: 'absolute', left: '0', top: '0', width: '2688px',
      height: '1008px', transformOrigin: 'top left', background: '#000', visibility: 'hidden', pointerEvents: 'none' });
    document.getElementById('stage').appendChild(this.host);
    this._fit = () => {
      const canvas = ctx.renderer.domElement;
      const width = parseFloat(canvas.style.width) || 2688;
      this.host.style.transform = `scale(${width / 2688})`;
    };
    this._fit();
    window.addEventListener('resize', this._fit);
    const toggle = view.toggleNative;
    view.toggleNative = () => { const mode = toggle(); this._fit(); return mode; };
    this._sizeObserver = new MutationObserver(this._fit);
    this._sizeObserver.observe(ctx.renderer.domElement, { attributes: true, attributeFilter: ['style'] });
    this._makeStatusPanel();
    for (const name of ['arm', 'standby', 'play', 'pause', 'restart', 'seek']) {
      this.params.onAction(`fluids.${name}`, value => { void this.command(name, value); });
    }
    for (const name of ['burst', 'attractor', 'reset']) {
      this.params.onAction(`fluids.live.${name}`, value => {
        if (!this.active || this.mode !== 'live') return;
        const payload = typeof value === 'object' && value ? value :
          name === 'burst' ? { count: Number.isFinite(Number(value)) ? Number(value) : 180 } : {};
        this.runtime.liveAction(name, { x: this.params.get('fluids.live.x'), y: this.params.get('fluids.live.y'), ...payload });
      });
    }
  }

  prepare() {
    if (this._preparing) return this._preparing;
    this.status = 'preparing';
    this._preparing = (async () => {
      const { FluidRuntime } = await import('../../vendor/radiance/src/integration/FluidRuntime.ts');
      await this.session.load().catch(error => { if (!this.session.doc) throw error; });
      if (!this.runtime) {
        this.runtime = new FluidRuntime();
        try { await this.runtime.init(this.host); }
        catch (error) { this.runtime.dispose(); this.runtime = null; throw error; }
      }
      this.runtime.setDocument(this.session.doc);
      this.runtime.suspend(true);
      // El primer bitmap/encoder también se prepara antes del show.
      const previewReady = new Promise(resolve => { this._previewReadyResolve = resolve; });
      if (this._preview.capture(this.runtime.canvas)) await previewReady;
      else this._previewReadyResolve = null;
      this.status = 'ready';
      this.error = null;
      this._refreshPanel();
      this.publishDocument();
      return this.runtime;
    })().catch(error => { this._preparing = null; this._fail(error); throw error; });
    return this._preparing;
  }

  // Intercepta goto antes de cambiar presets. Una preparación tardía nunca cambia la escena.
  requestScene(id, options = {}) {
    if (options.radianceReady) return false;
    if (!FLUID_SCENES.has(id)) {
      this._generation++;
      this.pending = null;
      this._switching = false;
      this.session.pause();
      this.runtime?.suspend(true);
      this.active = false;
      this.mode = null;
      this.host.style.visibility = 'hidden';
      this.ctx.renderer.domElement.style.visibility = 'visible';
      if (this.runtime) this.status = 'suspended';
      this._refreshPanel();
      return false;
    }
    if (!options.force && (this.pending?.id === id || (this.active && this.ctx.scenes.current === id))) return true;
    const token = ++this._generation;
    this.pending = { id, options, token, cueTime: performance.now() / 1000 };
    // Cortar la escena anterior al recibir el cue, incluso si aún se está cargando Fluids.
    this.session.pause();
    this._switching = true;
    this._showOnFrame = false;
    this.host.style.visibility = 'hidden';
    this.ctx.renderer.domElement.style.visibility = 'hidden';
    this._resumePending();
    return true;
  }

  _resumePending() {
    const request = this.pending;
    if (!request || request.scheduled) return;
    request.scheduled = true;
    this._queue = this._queue.catch(() => {}).then(async () => {
      const { id, token, options, cueTime } = request;
      await this.prepare();
      if (token !== this._generation) return;
      // Dejar cerrar el frame anterior antes de entregar el canvas al otro renderer.
      this._switching = true;
      await this.ctx.engine?.whenIdle();
      if (token !== this._generation) return;
      this.session.pause();
      this.host.style.visibility = 'hidden';
      this.ctx.renderer.domElement.style.visibility = 'hidden';
      if (id === '24') await this.runtime.enterStandby(this.session.doc);
      else if (!this.runtime.startTimeline()) await this.runtime.enterTimeline(this.session.doc);
      if (token !== this._generation) { this.runtime.suspend(true); return; }
      this.active = true;
      this.mode = id === '24' ? 'standby' : 'timeline';
      this.pending = null;
      this.status = 'active';
      this.error = null;
      this.ctx.scenes.goto(id, { ...options, radianceReady: true, transition: 0 });
      this.runtime.suspend(false);
      // Un loop usado para editar no debe repetirse contra la música completa de Ableton.
      this.session.setLoop(null);
      if (id === '24') this.session.seek(0);
      else this.session.restart(cueTime);
      this._switching = false;
      this._showOnFrame = true;
      this._refreshPanel();
    }).catch(error => {
      this._switching = false;
      if (request.token === this._generation) {
        this.pending = null;
        this.active = false;
        this.runtime?.suspend(true);
        this.host.style.visibility = 'hidden';
        this.ctx.renderer.domElement.style.visibility = 'visible';
        this._fail(error);
      }
    });
  }

  get ownsFrame() { return this.active || this._switching; }

  frame(now, dt) {
    if (!this.active || this._switching) return;
    this.session.tick();
    for (const key of Object.keys(LIVE)) this._live[key] = this.params.get(`fluids.live.${key}`);
    this.runtime.frame({ now: now / 1000, dt, time: this.session.time,
      playing: this.mode === 'timeline' && this.session.playing, live: this._live,
      frozen: this.mode === 'timeline' && !this.session.playing && this.session.time >= this.session.duration });
    const brightness = this.params.get('master.blackout') ? 0 : this.params.get('master.brightness');
    this.host.style.opacity = String(brightness);
    if (this._showOnFrame) { this.host.style.visibility = 'visible'; this._showOnFrame = false; }
    if (this._previewRequested && now - this._lastPreview >= 500) this._capturePreview(now);
  }

  async command(command, value) {
    try {
      if (command === 'arm') {
        await this.prepare();
        this.error = null;
        this._refreshPanel();
        this._resumePending();
      } else if (command === 'scene') this.ctx.scenes.goto(String(value));
      else if (command === 'standby') this.ctx.scenes.goto('24');
      else if (command === 'play' && (!this.active || this.mode !== 'timeline')) this.ctx.scenes.goto('25');
      else if (command === 'restart' || command === 'reset') this.requestScene('25', { force: true });
      else if (command === 'audio-mode') {
        // Mensajes de un editor antiguo tampoco pueden habilitar audio.
        this.session.setAudioMode('external');
        this.params.set('fluids.audioMode', 'external');
      } else if (command === 'master') this.params.set('master.brightness', value);
      else if (command === 'blackout') this.params.set('master.blackout', value);
      else if (command === 'loop') this.session.setLoop(value ? { ...value, on: true } : null);
      else if (this.active && this.mode === 'timeline') {
        if (command === 'play') this.session.play();
        else if (command === 'pause') this.session.pause();
        else if (command === 'seek') this.session.seek(Number(value));
        else if (command === 'gesture') this.runtime.setGesture(value);
      }
      this.publishState();
    } catch (error) { this._fail(error); }
  }

  async receive(message) {
    try {
      if (message.t === 'fluids:hello') {
        await this.prepare();
        this.publishDocument();
        this.publishState();
        const peaks = this.session.peaks();
        if (peaks) this.post({ t: 'fluids:peaks', peaks });
      } else if (message.t === 'fluids:command') await this.command(message.command, message.value);
      else if (message.t === 'fluids:preview-request') this._previewRequested = true;
      else if (message.t === 'fluids:document') {
        try {
          if (message.ownerId && message.ownerId !== this.ownerId) throw new Error('La salida se reinició. Recargá su documento antes de guardar.');
          this.session.setDocument(message.doc, message.baseRevision);
          this.runtime?.setDocument(this.session.doc);
          this.publishDocument({ clientId: message.clientId, editId: message.editId });
        } catch (error) {
          this.publishDocument({ clientId: message.clientId, editId: message.editId, rejected: true, error: String(error.message ?? error) });
        }
      }
    } catch (error) { this._fail(error); }
  }

  state() {
    return { ...this.session.state(), ownerId: this.ownerId, status: this.status, error: this.error,
      scene: this.ctx.scenes.current, pendingScene: this.pending?.id ?? null, mode: this.mode,
      master: this.params.get('master.brightness'), blackout: this.params.get('master.blackout'),
      stats: this.runtime ? { ...this.runtime.telemetry(), fps: this.ctx.engine?.fps ?? 0 } : null,
      preview: this._preview.stats() };
  }
  post(message) { this.ctx.bridge?.post(message); }
  publishState() { this.post({ t: 'fluids:state', state: this.state() }); }
  publishDocument(extra = {}) {
    if (this.session.doc) this.post({ t: 'fluids:document', ownerId: this.ownerId, doc: this.session.doc, revision: this.session.revision, ...extra });
  }
  tick(now) {
    if (now - this._lastState < 100) return;
    this._lastState = now;
    this.publishState();
  }

  _capturePreview(now) {
    this._lastPreview = now;
    this._previewRequested = false;
    const source = this.host.querySelector('canvas');
    if (source) this._preview.capture(source);
  }

  _makeStatusPanel() {
    this.panel = document.createElement('div');
    this.panel.id = 'fluids-status';
    Object.assign(this.panel.style, { position: 'fixed', right: '12px', top: '12px', zIndex: '30',
      background: '#15191feF', color: '#eee', padding: '12px', font: '13px system-ui', borderRadius: '5px', maxWidth: '330px' });
    this.panelText = document.createElement('div');
    this.panel.append(this.panelText);
    document.body.appendChild(this.panel);
    this._refreshPanel();
  }

  _refreshPanel() {
    this.panel.hidden = !this.error;
    this.panelText.textContent = this.error || '';
  }
  _fail(error) {
    this.error = error?.message ?? String(error);
    this.status = 'error';
    console.error('[vis] Fluids:', error);
    this._refreshPanel();
    this.publishState();
  }
}
