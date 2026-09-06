import {
  CURVE_IDS, EVENT_SPECS, parseShowDoc,
} from '../../vendor/radiance/src/fluids-show/show-doc.ts';

export const SHOW_STORAGE_KEY = 'vis.radiance.show.v1';
const PEAK_RATE = 400;
const EVENT_TYPES = new Set(EVENT_SPECS.map(({ type }) => type));
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function validateDocument(raw) {
  let source;
  try { source = typeof raw === 'string' ? JSON.parse(raw) : raw; }
  catch { throw new Error('El documento Fluids no contiene JSON válido.'); }
  // parseShowDoc deliberately repairs malformed input to an empty show. At the
  // integration boundary an invalid snapshot must instead remain an error.
  if (!source || source.version !== 1 || !finite(source.duration) || source.duration <= 1
    || !source.curves || !Array.isArray(source.events) || !Array.isArray(source.gestures)) {
    throw new Error('Documento Fluids inválido: se requiere ShowDoc v1 con duración, curvas, eventos y gestos.');
  }
  for (const id of CURVE_IDS) {
    const keys = source.curves[id]?.keys;
    if (!Array.isArray(keys) || keys.some((key) => !key || !finite(key.t) || key.t < 0 || !finite(key.v))) {
      throw new Error(`La curva Fluids «${id}» contiene datos inválidos.`);
    }
  }
  for (const event of source.events) {
    if (!event || !EVENT_TYPES.has(event.type) || !finite(event.t) || event.t < 0
      || !finite(event.dur) || event.dur <= 0 || !finite(event.intensity)
      || (event.params && Object.values(event.params).some((value) => !finite(value)))) {
      throw new Error('El documento Fluids contiene un evento inválido.');
    }
  }
  for (const gesture of source.gestures) {
    if (!gesture || !finite(gesture.t0) || !finite(gesture.t1) || gesture.t1 < gesture.t0
      || !Array.isArray(gesture.samples) || gesture.samples.length === 0
      || gesture.samples.some((sample) => !sample || !finite(sample.t) || !finite(sample.x) || !finite(sample.y))) {
      throw new Error('El documento Fluids contiene un gesto inválido.');
    }
  }
  return parseShowDoc(source, source.duration);
}

function freezeDocument(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freezeDocument(child);
  }
  return value;
}

/** Output owns the visual timeline clock. Ableton owns all audible playback. */
export class ShowSession {
  constructor(options = {}) {
    this._fetch = options.fetch ?? globalThis.fetch?.bind(globalThis);
    this._storage = options.storage;
    if (this._storage === undefined) {
      try { this._storage = globalThis.localStorage; } catch { this._storage = null; }
    }
    this._now = options.now ?? (() => performance.now());
    this._yield = options.yieldTask ?? (() => new Promise((resolve) => setTimeout(resolve, 0)));
    this._createOfflineAudioContext = options.createOfflineAudioContext ?? (() => {
      const Constructor = globalThis.OfflineAudioContext ?? globalThis.webkitOfflineAudioContext;
      if (!Constructor) throw new Error('No se pudo decodificar la onda de referencia. El show visual sigue disponible.');
      // This context only decodes the reference file. It has no hardware output
      // and is never rendered, resumed or connected to an audio node.
      return new Constructor(2, 1, 44100);
    });
    const base = options.baseUrl ?? import.meta.env?.BASE_URL ?? '/';
    this._assetBase = `${base.endsWith('/') ? base : `${base}/`}radiance/`;
    this._doc = null;
    this._revision = 0;
    this._offset = 0;
    this._startedAt = 0;
    this._playing = false;
    this._loop = { from: 0, to: 0, on: false };
    this._referenceContext = null;
    this._referenceAttempted = false;
    this._waveformDecoded = false;
    this._peaks = null;
    this._loading = null;
    this._disposed = false;
    this._error = null;
    this._audioError = null;
    this._storageError = null;
  }

  get doc() { return this._doc; }
  get revision() { return this._revision; }
  get duration() { return this._doc?.duration ?? 0; }
  get time() { return clamp(this._rawTime(), 0, this.duration); }
  get playing() { return this._playing; }
  get audioMode() { return 'external'; }
  // Retained for old clients: the web page never prepares audible playback.
  get audioReady() { return false; }

  async load() {
    this._assertLive();
    if (this._loading) return this._loading;
    if (this._doc && this._referenceAttempted) return this.state();
    this._loading = this._load();
    try { return await this._loading; }
    finally { this._loading = null; }
  }

  async _load() {
    this._error = null;
    try {
      if (!this._doc) {
        let stored = null;
        try { stored = this._storage?.getItem(SHOW_STORAGE_KEY); }
        catch { this._storageError = 'No se pudo leer el guardado local de Fluids.'; }
        if (stored) {
          const snapshot = JSON.parse(stored);
          if (snapshot.version !== 1 || !Number.isSafeInteger(snapshot.revision) || snapshot.revision < 1) {
            throw new Error('El guardado local de Fluids está dañado. Exportalo antes de reemplazarlo.');
          }
          this._doc = freezeDocument(validateDocument(snapshot.doc));
          this._revision = snapshot.revision;
        } else {
          const response = await this._fetch(`${this._assetBase}show/fluids.show.json`);
          if (!response.ok) throw new Error(`No se pudo cargar fluids.show.json (${response.status}).`);
          this._assertLive();
          this._doc = freezeDocument(validateDocument(await response.json()));
          this._revision = 1;
        }
        this._loop.to = this.duration;
      }
      if (!this._referenceAttempted) await this._loadWaveform();
      this._assertLive();
      return this.state();
    } catch (error) {
      this._error = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  async _loadWaveform() {
    this._referenceAttempted = true;
    try {
      this._referenceContext = this._createOfflineAudioContext();
      const response = await this._fetch(`${this._assetBase}audio/fluids.wav`);
      if (!response.ok) throw new Error(`No se pudo cargar fluids.wav (${response.status}).`);
      const buffer = await this._referenceContext.decodeAudioData(await response.arrayBuffer());
      this._assertLive();
      const peaks = await this._buildPeaks(buffer);
      this._assertLive();
      this._waveformDecoded = true;
      this._peaks = peaks;
      this._audioError = null;
    } catch (error) {
      this._audioError = error instanceof Error ? error.message : String(error);
      // A missing/unsupported reference waveform must not prevent scene 25.
    } finally {
      this._referenceContext = null;
    }
  }

  async arm() {
    // Compatibility with older editors: preparation only, never audio output.
    return this.load();
  }

  restart(cueTimeSeconds = this._clock()) {
    this._assertPlayable();
    this._assertCueTime(cueTimeSeconds);
    this._playing = false;
    this._offset = 0;
    return this.play(cueTimeSeconds);
  }

  play(cueTimeSeconds = this._clock()) {
    this._assertPlayable();
    this._assertCueTime(cueTimeSeconds);
    if (this._playing) return this.state();
    if (this._offset >= this.duration) this._offset = 0;
    if (this._loop.on && this._offset >= this._loop.to) this._offset = this._loop.from;
    // The cue timestamp is performance.now()/1000 at MIDI receipt, not the
    // later instant when an asynchronous fallback finishes preparing Fluid.
    this._startedAt = cueTimeSeconds;
    this._playing = true;
    this.tick();
    return this.state();
  }

  pause() {
    if (this._playing) {
      this.tick();
      this._offset = this.time;
    }
    this._playing = false;
    return this.state();
  }

  seek(seconds) {
    this._assertDocument();
    if (!finite(seconds)) throw new Error('El tiempo de Fluids debe ser un número finito.');
    const wasPlaying = this._playing;
    this._playing = false;
    this._offset = clamp(seconds, 0, this.duration);
    // A seek to the end holds the final frame instead of implicitly replaying.
    if (wasPlaying && this._offset < this.duration) this.play();
    return this.state();
  }

  setLoop(range) {
    this._assertDocument();
    const { from, to, on } = range ?? { from: this._loop.from, to: this._loop.to, on: false };
    if (!finite(from) || !finite(to) || from < 0 || to > this.duration || to - from < 0.02) {
      throw new Error('El loop de Fluids necesita un rango válido dentro del show.');
    }
    this.tick();
    const position = this.time;
    this._loop = { from, to, on: !!on };
    // Re-anchor after changing loop boundaries so prior revolutions do not
    // reappear when looping is switched off.
    this.seek(this._loop.on && position >= to ? from : position);
    return this.state();
  }

  setAudioMode(_legacyMode) {
    // Persisted local/silent preferences and old remote commands cannot enable
    // sound or interrupt the running visual timeline. Audio is always external.
    return this.state();
  }

  tick() {
    if (!this._playing) return this.time;
    const raw = this._rawTime();
    if (this._loop.on && raw >= this._loop.to) {
      const span = this._loop.to - this._loop.from;
      this._offset = this._loop.from + ((raw - this._loop.to) % span);
      this._startedAt = this._clock();
    } else if (raw >= this.duration) {
      this._offset = this.duration;
      this._playing = false;
    }
    return this.time;
  }

  setDocument(raw, baseRevision) {
    this._assertDocument();
    if (!Number.isSafeInteger(baseRevision) || baseRevision !== this._revision) {
      throw new Error(`Edición Fluids desactualizada (base ${baseRevision}; actual ${this._revision}). Recargá el documento de Output.`);
    }
    const next = freezeDocument(validateDocument(raw));
    this.tick();
    const position = this.time;
    this._doc = next;
    this._revision += 1;
    if (this._loop.to > this.duration || this._loop.from >= this.duration) {
      this._loop = { from: 0, to: this.duration, on: false };
    }
    // Normal curve edits preserve the cue anchor and the running playhead.
    if (position >= this.duration) this.seek(this.duration);
    try {
      this._storage?.setItem(SHOW_STORAGE_KEY, JSON.stringify({ version: 1, revision: this._revision, doc: this._doc }));
      this._storageError = null;
    } catch {
      this._storageError = 'La edición está activa, pero no se pudo guardar Fluids en este navegador. Exportá el documento.';
    }
    return this.state();
  }

  state() {
    return {
      loaded: !!this._doc,
      loading: !!this._loading,
      revision: this._revision,
      time: this.time,
      playing: this.playing,
      duration: this.duration,
      audioMode: 'external',
      audioReady: this.audioReady,
      audioDecoded: this._waveformDecoded,
      waveformReady: !!this._peaks,
      transportReady: !!this._doc,
      loop: { ...this._loop },
      error: this._error,
      audioError: this._audioError,
      storageError: this._storageError,
    };
  }

  peaks() { return this._peaks; }

  dispose() {
    this.pause();
    this._disposed = true;
    this._referenceContext = null;
    this._peaks = null;
  }

  _clock() { return this._now() / 1000; }
  _rawTime() { return this._offset + (this._playing ? Math.max(0, this._clock() - this._startedAt) : 0); }
  _assertLive() { if (this._disposed) throw new Error('La sesión Fluids ya está cerrada.'); }
  _assertDocument() {
    this._assertLive();
    if (!this._doc) throw new Error('El documento Fluids todavía no está cargado.');
  }
  _assertPlayable() { this._assertDocument(); }
  _assertCueTime(seconds) { if (!finite(seconds)) throw new Error('El instante del cue de Fluids debe ser un número finito en segundos.'); }

  async _buildPeaks(buffer) {
    const count = Math.max(1, Math.ceil(buffer.duration * PEAK_RATE));
    const data = new Float32Array(count * 2);
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index));
    const step = buffer.sampleRate / PEAK_RATE;
    for (let bucket = 0; bucket < count; bucket += 1) {
      let min = 0;
      let max = 0;
      const from = Math.floor(bucket * step);
      const to = Math.min(buffer.length, Math.floor((bucket + 1) * step));
      for (const channel of channels) {
        for (let i = from; i < to; i += 1) {
          min = Math.min(min, channel[i]);
          max = Math.max(max, channel[i]);
        }
      }
      data[bucket * 2] = min;
      data[bucket * 2 + 1] = max;
      if (bucket > 0 && bucket % 1024 === 0) {
        await this._yield();
        this._assertLive();
      }
    }
    return { rate: PEAK_RATE, count, data };
  }
}

export default ShowSession;
