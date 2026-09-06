import assert from 'node:assert/strict';
import { browser, sleep } from './radiance-browser.mjs';

const page = await browser({ production: true, mount: '/show/', base: '/show/?clean' });
const deadline = setTimeout(() => { void page.close(); process.exit(2); }, 120000);
try {
  await page.waitFor('!!window.vis', 90000);
  assert.ok(await page.ev('!!vis.radiance.runtime'), JSON.stringify(await page.ev('vis.radiance.state()')));
  await page.ev(`vis.params.set('fluids.audioMode','silent');vis.scenes.goto('24')`);
  await page.waitFor(`vis.scenes.current==='24'&&vis.radiance.session.playing`);
  await sleep(1200);
  assert.ok(await page.ev('vis.radiance.runtime.telemetry().particles') > 0);
  assert.equal(await page.ev(`vis.mapper.mappings.find(m=>m.id==='sc24').arg`), '24');
  assert.ok(await page.ev(`vis.radiance._preview.stats().completed`) > 0);
  assert.equal(page.errors.length, 0, JSON.stringify(page.errors));
  console.log('Producción /show/: documento, WAV, WASM, Worker, preview y escena MIDI 24 resueltos sin servidor original.');
} finally { clearTimeout(deadline); await page.close(); }
