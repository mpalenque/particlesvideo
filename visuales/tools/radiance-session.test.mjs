import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import test from 'node:test';

// The production TS graph uses Vite's extensionless relative imports. Resolve
// those identically here while Node strips types; no browser or GPU is needed.
registerHooks({ resolve(specifier, context, nextResolve) {
  try { return nextResolve(specifier, context); }
  catch (error) {
    if (error.code !== 'ERR_MODULE_NOT_FOUND' || !specifier.startsWith('.') || /\.[a-z]+$/i.test(specifier)) throw error;
    return nextResolve(`${specifier}.ts`, context);
  }
} });
const { default: ShowSession, SHOW_STORAGE_KEY } = await import('../src/radiance/ShowSession.js');
const { emptyDoc } = await import('../vendor/radiance/src/fluids-show/show-doc.ts');

function harness({ document = emptyDoc(10), failAudio = false, stored = null } = {}) {
  let wallTime = 0;
  const writes = [];
  const fetched = [];
  const sources = [];
  const buffer = {
    duration: 10, sampleRate: 400, length: 4000, numberOfChannels: 1,
    getChannelData: () => Float32Array.from({ length: 4000 }, (_, i) => i % 2 ? 0.75 : -0.5),
  };
  const context = {
    currentTime: 0, state: 'suspended', resumeCalls: 0, destination: {},
    async resume() { this.resumeCalls += 1; this.state = 'running'; },
    async decodeAudioData() { return buffer; },
    createGain: () => ({ connect() {}, disconnect() {} }),
    createBufferSource() {
      const source = {
        started: null, stopped: 0, disconnected: 0,
        connect() {},
        start(when, offset) { this.started = { when, offset }; },
        stop() { this.stopped += 1; },
        disconnect() { this.disconnected += 1; },
      };
      sources.push(source);
      return source;
    },
    async close() { this.state = 'closed'; },
  };
  const session = new ShowSession({
    baseUrl: '/show-base/',
    now: () => wallTime,
    createAudioContext: () => context,
    yieldTask: async () => {},
    storage: {
      getItem(key) { assert.equal(key, SHOW_STORAGE_KEY); return stored; },
      setItem(key, value) { writes.push({ key, value }); },
    },
    async fetch(url) {
      fetched.push(url);
      if (url.endsWith('.json')) return { ok: true, json: async () => structuredClone(document) };
      return { ok: !failAudio, status: failAudio ? 404 : 200, arrayBuffer: async () => new ArrayBuffer(4) };
    },
  });
  return { session, context, sources, writes, fetched, setWall: (time) => { wallTime = time; } };
}

test('preload finishes with suspended audio and cached waveform; local playback requires the gesture', async () => {
  const h = harness();
  await h.session.load();
  assert.equal(h.context.resumeCalls, 0);
  assert.equal(h.session.audioReady, false);
  assert.equal(h.session.state().audioDecoded, true);
  assert.deepEqual(h.fetched, [
    '/show-base/radiance/show/fluids.show.json', '/show-base/radiance/audio/fluids.wav',
  ]);
  assert.equal(h.session.peaks().count, 4000);
  assert.equal(h.session.peaks().data[0], -0.5);
  assert.equal(h.session.peaks().data[3], 0.75);
  assert.throws(() => h.session.restart(), /Armá el audio/);
  assert.equal(h.sources.length, 0);
  await h.session.arm();
  h.session.restart();
  assert.equal(h.context.resumeCalls, 1);
  assert.equal(h.session.playing, true);
  assert.equal(h.sources[0].started.offset, 0);
});

test('local playback follows AudioContext after a delayed frame, pauses, seeks and holds its final frame', async () => {
  const h = harness();
  await h.session.arm();
  h.session.restart();
  h.context.currentTime = 5.75;
  h.setWall(99000);
  assert.equal(h.session.tick(), 5.75);
  h.session.pause();
  h.context.currentTime = 50;
  assert.equal(h.session.time, 5.75);
  h.session.play();
  h.context.currentTime = 52;
  assert.equal(h.session.tick(), 7.75);
  h.session.seek(3);
  assert.equal(h.sources.at(-1).started.offset, 3);
  h.context.currentTime = 70;
  assert.equal(h.session.tick(), 10);
  assert.equal(h.session.playing, false);
  h.session.restart();
  h.session.seek(10);
  assert.equal(h.session.time, 10);
  assert.equal(h.session.playing, false);
});

test('silent mode is explicit and uses absolute elapsed time through multiple loop revolutions', async () => {
  const h = harness();
  await h.session.load();
  h.session.setAudioMode('silent');
  h.session.setLoop({ from: 2, to: 5, on: true });
  h.session.restart();
  h.setWall(14500);
  assert.equal(h.session.tick(), 2.5);
  assert.equal(h.sources.length, 0);
  h.session.setLoop({ from: 2, to: 5, on: false });
  h.setWall(16000);
  assert.equal(h.session.tick(), 4);
  h.session.setAudioMode('local');
  assert.equal(h.session.playing, false);
  assert.equal(h.session.time, 4);
  assert.throws(() => h.session.play(), /Armá el audio/);
});

test('local loop uses native audio looping without restarting sound on a late render tick', async () => {
  const h = harness();
  await h.session.arm();
  h.session.setLoop({ from: 2, to: 5, on: true });
  h.session.restart();
  assert.equal(h.sources[0].loop, true);
  assert.equal(h.sources[0].loopStart, 2);
  assert.equal(h.sources[0].loopEnd, 5);
  h.context.currentTime = 14.5;
  assert.equal(h.session.tick(), 2.5);
  assert.equal(h.sources.length, 1);
  assert.equal(h.sources[0].stopped, 0);
  h.session.setLoop({ from: 2, to: 5, on: false });
  assert.equal(h.sources.at(-1).loop, false);
  assert.equal(h.sources.at(-1).started.offset, 2.5);
  h.session.setLoop(null);
  assert.equal(h.session.state().loop.on, false);
});

test('edits reject stale revisions and preserve the running audio source and original storage keys', async () => {
  const h = harness();
  await h.session.arm();
  h.session.restart();
  h.context.currentTime = 3.25;
  const next = structuredClone(h.session.doc);
  next.curves.emission.keys = [{ t: 2, v: 0.6, shape: 'linear' }];
  h.session.setDocument(next, 1);
  assert.equal(h.session.revision, 2);
  assert.equal(h.session.time, 3.25);
  assert.equal(h.sources.length, 1);
  assert.equal(h.sources[0].stopped, 0);
  assert.throws(() => h.session.setDocument(emptyDoc(10), 1), /desactualizada/);
  assert.equal(h.session.doc.curves.emission.keys[0].v, 0.6);
  assert.equal(h.writes.length, 1);
  assert.equal(h.writes[0].key, 'vis.radiance.show.v1');
  assert.equal(JSON.parse(h.writes[0].value).revision, 2);
  assert.throws(() => { h.session.doc.duration = 99; }, TypeError);
});

test('own snapshot preserves its revision and malformed data never silently becomes an empty seeded show', async () => {
  const good = harness({ stored: JSON.stringify({ version: 1, revision: 8, doc: emptyDoc(10) }) });
  await good.session.load();
  assert.equal(good.session.revision, 8);
  assert.equal(good.fetched.some((url) => url.endsWith('.json')), false);
  for (const malformed of [null, {}, { ...emptyDoc(10), version: 2 }, { ...emptyDoc(10), events: [{}] }]) {
    const h = harness({ document: malformed });
    await assert.rejects(h.session.load(), /inválid/);
    assert.equal(h.session.doc, null);
    assert.equal(h.session.state().loaded, false);
    assert.ok(h.session.state().error);
    assert.equal(h.writes.length, 0);
  }
  const corruptStored = harness({ stored: 'not JSON' });
  await assert.rejects(corruptStored.session.load());
  assert.equal(corruptStored.fetched.length, 0);
});

test('missing audio is an explicit failure; silent transport remains an explicit usable choice', async () => {
  const h = harness({ failAudio: true });
  await assert.rejects(h.session.load(), /fluids.wav/);
  assert.ok(h.session.doc);
  assert.equal(h.session.audioReady, false);
  assert.ok(h.session.state().audioError);
  assert.throws(() => h.session.restart(), /Armá el audio/);
  h.session.setAudioMode('silent');
  h.session.restart();
  h.setWall(5500);
  assert.equal(h.session.tick(), 5.5);
});

test('the shipped authored Fluids document validates without being replaced by a seed', async () => {
  const document = JSON.parse(await readFile(new URL('../public/radiance/show/fluids.show.json', import.meta.url), 'utf8'));
  const h = harness({ document });
  await h.session.load();
  assert.equal(h.session.duration, document.duration);
  assert.equal(h.session.doc.events.length, document.events.length);
  assert.equal(h.session.doc.gestures.length, document.gestures.length);
  assert.deepEqual(h.session.doc.curves.emission, document.curves.emission);
  assert.deepEqual(h.session.doc, document);
});
