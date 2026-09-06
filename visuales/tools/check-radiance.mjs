import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { browser, metrics, root, sleep } from './radiance-browser.mjs';

const full = process.argv.includes('--full');
const production = process.argv.includes('--production');
const out = join(root, 'radiance-check', 'cues-24-25', production ? 'production' : full ? 'full' : 'smoke');
mkdirSync(out, { recursive: true });
const page = await browser({ production, base: '/?clean', initScript: `
  window.__webAudioCalls=0;
  for (const key of ['AudioContext','webkitAudioContext']) if(window[key]) {
    window[key]=new Proxy(window[key],{construct(Target,args){window.__webAudioCalls++;return Reflect.construct(Target,args)}});
  }
  const mediaPlay=HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play=function(...a){window.__webAudioCalls++;return mediaPlay.apply(this,a)};
  localStorage.setItem('vis.settings',JSON.stringify({'fluids.audioMode':'local'}));
` });
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
  assert.equal(await ev('vis.radiance.session.audioMode'), 'external');
  assert.equal(await ev('vis.params.get("fluids.audioMode")'), 'external');
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

  await ev(`vis.radiance.command('loop',{from:2,to:5})`);
  await goto('24');
  assert.equal(await ev('vis.radiance.session.state().loop.on'), false);
  const before = await ev('({legacy:window.__legacyFrames,frame:vis.radiance.runtime.telemetry().solverFrame})');
  await sleep(1400);
  await ev(`vis.mapper.dispatch({kind:'note',channel:10,note:24,on:true,velocity:100});vis.params.trigger('fluids.live.burst',3000)`);
  assert.equal(await ev('vis.radiance.session.time'), 0);
  assert.equal(await ev('vis.radiance.session.playing'), false);
  assert.equal(await ev('vis.radiance.runtime.telemetry().particles'), 0);
  assert.equal(await ev('vis.radiance.runtime.telemetry().solverFrame'), before.frame);
  assert.equal(await ev('window.__legacyFrames'), before.legacy);
  report.standbyPixels = await ev(`(()=>{
    const r=vis.radiance.runtime,c=r.canvas,gl=c.getContext('webgl2');
    r.frame({now:performance.now()/1000,dt:1/60,time:0,playing:false});
    const p=new Uint8Array(c.width*c.height*4);gl.readPixels(0,0,c.width,c.height,gl.RGBA,gl.UNSIGNED_BYTE,p);
    let minX=c.width,minY=c.height,maxX=-1,maxY=-1,lit=0,colored=0;
    for(let i=0;i<p.length;i+=4)if(Math.max(p[i],p[i+1],p[i+2])>4){
      const k=i/4,x=k%c.width,y=Math.floor(k/c.width);lit++;
      minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
      if(Math.max(p[i],p[i+1],p[i+2])-Math.min(p[i],p[i+1],p[i+2])>2)colored++;
    }
    return{lit,colored,width:maxX-minX+1,height:maxY-minY+1,minX,minY};
  })()`);
  assert.ok(report.standbyPixels.lit > 500 && report.standbyPixels.lit < 6000, JSON.stringify(report.standbyPixels));
  assert.ok(report.standbyPixels.height > 2 && report.standbyPixels.height < 20, 'La previa debe ser sólo una línea, sin cono de luz');
  assert.equal(report.standbyPixels.colored, 0);
  report.tests.push('24 espera en cero con física vacía detenida y motor anterior suspendido');
  await page.shot(join(out, '24-entry.png'));

  await ev(`window.__cue=performance.now()/1000;
    vis.mapper.dispatch({kind:'note',channel:10,note:25,on:true,velocity:100});`);
  await page.waitFor(`vis.scenes.current==='25' && vis.radiance.session.playing`);
  assert.ok(Math.abs(await ev('(performance.now()/1000-window.__cue)-vis.radiance.session.time')) < .02);
  await sleep(1400);
  const started = await ev('vis.radiance.session.time');
  await ev(`vis.mapper.dispatch({kind:'note',channel:10,note:25,on:true,velocity:100});
    vis.radiance.command('audio-mode','local');vis.radiance.command('arm');`);
  assert.ok(await ev('vis.radiance.session.time') >= started);
  assert.ok(await ev('vis.radiance.runtime.telemetry().particles') > 0);
  assert.equal(await ev('vis.radiance.session.audioMode'), 'external');
  assert.equal(await ev('JSON.stringify(vis.radiance.session.doc)===window.__docBefore'), true);
  report.tests.push('nota MIDI 25 inicia timeline alineado al cue y notas repetidas no reinician; comandos viejos no habilitan audio');
  await page.shot(join(out, '25-sequence.png'));
  await goto('24');
  assert.equal(await ev('vis.radiance.session.time'), 0);
  assert.equal(await ev('vis.radiance.runtime.telemetry().particles'), 0);
  report.tests.push('25→24 limpia partículas y vuelve a la previa sin reproducir');
  await goto('20');
  const solverFrame = await ev('vis.radiance.runtime.telemetry().solverFrame');
  await sleep(250);
  assert.ok(await ev('vis.radiance.runtime.telemetry().solverFrame') <= solverFrame + 1);
  await ev(`vis.radiance.command('loop',{from:2,to:5})`);
  await goto('25');
  assert.equal(await ev('vis.radiance.session.state().loop.on'), false);
  assert.ok(await ev('vis.radiance.session.time') < .5);
  await sleep(1200);
  assert.ok(await ev('vis.radiance.runtime.telemetry().particles') > 0);
  report.tests.push('volver a Parte 1 suspende Worker; entrada directa 25 inicia secuencia');
  await ev('vis.radiance.command("seek",152.6)');
  await sleep(350);
  const ended = await ev('vis.radiance.state()');
  assert.equal(ended.playing, false);
  assert.equal(ended.scene, '25');
  assert.equal(ended.time, ended.duration);
  const endedFrames = ended.stats.renderedFrames;
  await sleep(150);
  assert.equal(await ev('vis.radiance.runtime.telemetry().renderedFrames'), endedFrames);
  report.tests.push('final mantiene cuadro y escena 25');

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
  assert.equal(await ev('window.__webAudioCalls'), 0, 'La web no debe crear AudioContext ni reproducir HTML media');
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
