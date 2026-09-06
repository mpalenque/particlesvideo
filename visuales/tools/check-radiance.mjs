import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { browser, metrics, root, sleep } from './radiance-browser.mjs';

const full = process.argv.includes('--full');
const production = process.argv.includes('--production');
const out = join(root, 'radiance-check', production ? 'production' : full ? 'full' : 'smoke');
mkdirSync(out, { recursive: true });
const page = await browser({ production, base: '/?clean' });
const deadline = setTimeout(() => { void page.close(); process.exit(2); }, full ? 660000 : 180000);
const report = { production, tests: [], performance: [], errors: page.errors };
const ev = page.ev;
const goto = async id => {
  await ev(`vis.scenes.goto('${id}',{transition:0})`);
  await page.waitFor(`vis.scenes.current==='${id}' && !vis.radiance.pending && !vis.radiance._switching`);
};
try {
  await page.waitFor('!!window.vis', 90000);
  assert.ok(await ev('!!vis.radiance.runtime'), JSON.stringify(await ev('vis.radiance.state()')));
  await ev('vis.radiance.command("arm")');
  assert.equal(await ev('vis.radiance.session.audioReady'), true);
  report.boot = await ev('vis.radiance.state()');
  assert.equal(await ev('vis.radiance.session.doc.events.length'), 256);
  assert.equal(await ev('Object.values(vis.radiance.session.doc.curves).reduce((n,c)=>n+c.keys.length,0)'), 400);
  await ev(`window.__docBefore=JSON.stringify(vis.radiance.session.doc);
    window.__legacyFrames=0; const update=vis.layer3d.update.bind(vis.layer3d);
    vis.layer3d.update=(...a)=>{window.__legacyFrames++;return update(...a)};
    window.__samples=[];window.__record=false;
    const fps=vis.engine._updateFps.bind(vis.engine);vis.engine._updateFps=function(dt){
      if(window.__record){const s=vis.radiance.runtime.telemetry();window.__samples.push({dt:dt*1000,render:this.renderMs,
        time:vis.radiance.session.time,solverFrame:s.solverFrame,solverMs:s.solverMs,age:s.snapshotAgeMs,particles:s.particles});}
      fps(dt);};`);

  // Requests made while async preparation is pending cannot resurrect an old cue.
  await ev(`vis.scenes.goto('24');vis.scenes.goto('1');`);
  await sleep(250);
  assert.equal(await ev('vis.scenes.current'), '1');
  assert.equal(await ev('vis.radiance.active'), false);
  report.tests.push('cancelar 24 pendiente conserva escena 1');

  await goto('24');
  const before = await ev('({time:vis.radiance.session.time,legacy:window.__legacyFrames})');
  await sleep(1400);
  await ev(`vis.scenes.goto('24');vis.params.trigger('fluids.live.burst',3000)`);
  assert.ok(await ev('vis.radiance.session.time') > before.time + 1);
  assert.equal(await ev('window.__legacyFrames'), before.legacy);
  report.tests.push('24 da play, nota repetida no reinicia, motor anterior suspendido');
  await page.shot(join(out, '24-entry.png'));

  const count = await ev('vis.radiance.runtime.telemetry().particles');
  await goto('25');
  const live = await ev('vis.radiance.state()');
  assert.equal(live.playing, false);
  assert.equal(live.stats.activeEvents, 0);
  assert.equal(live.stats.activeGestures, 0);
  assert.ok(live.stats.particles >= count * .9);
  await ev(`vis.params.trigger('fluids.live.burst',180);vis.params.set('fluids.live.forceX',.5);`);
  await sleep(250);
  assert.ok(await ev('vis.radiance.runtime.telemetry().particles') >= live.stats.particles);
  assert.equal(await ev('JSON.stringify(vis.radiance.session.doc)===window.__docBefore'), true);
  report.tests.push('24→25 conserva población, desconecta eventos y responde a ráfaga sin editar documento');
  await goto('20');
  const solverFrame = await ev('vis.radiance.runtime.telemetry().solverFrame');
  await sleep(250);
  assert.ok(await ev('vis.radiance.runtime.telemetry().solverFrame') <= solverFrame + 1);
  await goto('25');
  assert.equal(await ev('vis.radiance.runtime.telemetry().particles'), 0);
  await ev(`vis.params.trigger('fluids.live.burst',900)`);
  await sleep(300);
  assert.ok(await ev('vis.radiance.runtime.telemetry().particles') > 0);
  await page.shot(join(out, '25-midi.png'));
  report.tests.push('volver a Parte 1 suspende Worker; entrada directa 25 y ráfaga funcionan');
  await goto('24');
  assert.ok(await ev('vis.radiance.session.time') < .5);
  await ev('vis.radiance.command("seek",152.6)');
  await sleep(350);
  const ended = await ev('vis.radiance.state()');
  assert.equal(ended.playing, false);
  assert.equal(ended.scene, '24');
  assert.equal(ended.time, ended.duration);
  const endedFrames = ended.stats.renderedFrames;
  await sleep(150);
  assert.equal(await ev('vis.radiance.runtime.telemetry().renderedFrames'), endedFrames);
  report.tests.push('25→24 reinicia; final mantiene cuadro y escena');

  if (full) {
    for (let pass = 1; pass <= 3; pass++) {
      await ev('vis.radiance.command("restart")');
      await page.waitFor('vis.radiance.session.playing && vis.radiance.session.time<2');
      await ev('window.__samples=[];window.__record=true');
      const start = Date.now();
      while (Date.now() - start < 157000) {
        await sleep(15000);
        console.log('Track', pass, await ev('({time:vis.radiance.session.time,...vis.radiance.runtime.telemetry()})'));
        if (!await ev('vis.radiance.session.playing')) break;
      }
      const samples = await ev('window.__record=false;window.__samples');
      const activeSamples = samples.filter(s => s.time < 152.694);
      const summary = { pass, ...metrics(activeSamples), maxWorkerMs: Math.max(...activeSamples.map(s => s.solverMs)),
        maxSnapshotAge: Math.max(...activeSamples.map(s => s.age)),
        outliers: activeSamples.filter(s => s.dt > 20), lastTime: samples.at(-1)?.time };
      report.performance.push(summary);
      writeFileSync(join(out, `pass-${pass}.json`), JSON.stringify({ summary, samples }, null, 2));
      console.log('Pasada completa', JSON.stringify(summary));
    }
  } else {
    await ev('vis.radiance.command("restart")');
    await page.waitFor('vis.radiance.session.playing && vis.radiance.session.time<2');
    await ev('window.__samples=[];window.__record=true');
    await sleep(8000);
    const samples = await ev('window.__record=false;window.__samples');
    report.performance.push({ ...metrics(samples), maxWorkerMs: Math.max(...samples.map(s => s.solverMs)),
      maxSnapshotAge: Math.max(...samples.map(s => s.age)), outliers: samples.filter(s => s.dt > 20) });
  }
  // MIDI/OSC registrations preserve scene mappings and the most recent ray width.
  assert.equal(await ev('vis.params.def("rays.width").default'), .014);
  assert.equal(await ev('JSON.stringify(vis.radiance.session.doc)===window.__docBefore'), true);
  const refs = production ? null : await ev(`(async()=>{const r=await import('/src/editor/reference.js');return {
    md:r.buildReferenceMarkdown(vis.params.list(),vis.mapper.mappings,vis.scenes.list()),
    csv:r.buildReferenceCsv(vis.params.list(),vis.mapper.mappings)}})()`).catch(() => null);
  if (refs && !production) {
    writeFileSync(join(root, 'REFERENCIA-MIDI-OSC.md'), refs.md);
    writeFileSync(join(root, 'REFERENCIA-MIDI-OSC.csv'), refs.csv);
  }
  report.state = await ev('vis.radiance.state()');
  writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  assert.equal(page.errors.length, 0, JSON.stringify(page.errors));
} catch (error) {
  report.failure = error.stack;
  report.logs = page.logs.slice(-60);
  writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 2));
  await page.shot(join(out, 'failure.png')).catch(() => {});
  throw error;
} finally { clearTimeout(deadline); await page.close(); }
