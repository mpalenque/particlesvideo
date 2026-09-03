// Captura una pantalla por escena (o por guion de acciones) para comparar con el storyboard.
// Uso: node tools/shoot-scenes.mjs <carpeta-salida> [url]
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';

const OUT = process.argv[2] ?? '.';
const BASE = process.argv[3] ?? 'http://localhost:5173';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });

// Ventana exactamente 8:3 para que el canvas llene el cuadro sin bandas negras.
const chrome = spawn(CHROME, [
  '--headless=new', '--remote-debugging-port=9335', `--user-data-dir=${mkdtempSync(join(tmpdir(), 'vis-shot-'))}`,
  '--enable-unsafe-webgpu', '--enable-features=Vulkan', '--window-size=1344,504',
  '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', 'about:blank',
], { stdio: 'ignore' });

let target = null;
for (let i = 0; i < 40 && !target; i++) {
  try { target = (await (await fetch('http://127.0.0.1:9335/json/list')).json()).find((t) => t.type === 'page'); } catch {}
  if (!target) await sleep(300);
}

const ws = new WebSocket(target.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
await new Promise((r) => ws.on('open', r));
let id = 0;
const pending = new Map();
const logs = [];
ws.on('message', (raw) => {
  const m = JSON.parse(raw);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Runtime.exceptionThrown') logs.push(`[EXCEPTION] ${m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text}`);
});
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, (m) => res(m.result ?? m.error)); ws.send(JSON.stringify({ id: i, method, params })); });
const evalIn = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }))?.result?.value;
// Recorta al canvas: la ventana casi nunca tiene exactamente 8:3 y si no queda con bandas negras.
const shoot = async (name) => {
  const rect = await evalIn("(()=>{const r=document.querySelector('#stage canvas').getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height};})()");
  const r = await send('Page.captureScreenshot', { format: 'png', clip: { ...rect, scale: 1 }, captureBeyondViewport: true });
  if (r?.data) writeFileSync(join(OUT, `${name}.png`), Buffer.from(r.data, 'base64'));
};

await send('Runtime.enable');
await send('Page.enable');
// Viewport de 2688 × 1008 con dpr 1: la escala CSS queda en 1 y las capturas salen
// a resolución nativa. Sin esto una línea de 1 px se pierde al reescalar.
await send('Emulation.setDeviceMetricsOverride', { width: 2688, height: 1008, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: `${BASE}/` });
await sleep(7000);

// [nombre, expresión previa, espera en ms]
const SHOTS = [
  ['1',  "vis.scenes.goto('1',{transition:0})", 900],
  ['1b', "vis.params.trigger('warning.bgOff')", 2600],
  ['2',  "vis.scenes.goto('2',{transition:0}); vis.params.trigger('line.strike','center')", 1200],
  ['2b', "vis.params.trigger('line.flip')", 900],
  ['3',  "vis.scenes.goto('3',{transition:0})", 900],
  ['4',  "vis.scenes.goto('4',{transition:0})", 900],
  ['5',  "vis.scenes.goto('5',{transition:0})", 900],
  ['6',  "vis.scenes.goto('6',{transition:0}); vis.params.trigger('sweep.blue','3')", 700],
  ['6b', "vis.params.trigger('sweep.white','2')", 600],
  ['6c', "vis.params.trigger('sweep.solid','4')", 500],
];

for (const [name, expr, wait] of SHOTS) {
  await evalIn(expr);
  await sleep(wait);
  await shoot(name);
}

const stats = await evalIn("({fps: vis.engine.fps, ms: +vis.engine.frameMs.toFixed(1), escena: vis.scenes.current})");
console.log(JSON.stringify(stats));
console.log(logs.join('\n') || '(sin excepciones)');
ws.close();
chrome.kill();
process.exit(0);
