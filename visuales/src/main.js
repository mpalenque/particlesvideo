import { createRenderer, showFatalError } from './render/Renderer.js';
import { Params } from './core/Params.js';
import { SceneManager } from './core/SceneManager.js';
import { Engine } from './core/Engine.js';
import { Keyboard } from './core/Keyboard.js';
import { Layer2D } from './layers2d/Layer2D.js';
import { Layer3D } from './layers3d/Layer3D.js';
import { Compositor } from './render/Compositor.js';
import { MidiInput } from './io/MidiInput.js';
import { OscClient } from './io/OscClient.js';
import { Mapper } from './io/Mapper.js';
import { Bridge } from './io/Bridge.js';
import { STAGE } from './config/stage.js';
import { SCENES } from './scenes/index.js';
import { BASE } from './scenes/base.js';

async function boot() {
  const renderer = await createRenderer();
  console.info('[vis] WebGPU listo · backend', renderer.backend.constructor.name);

  // El registro tiene que estar completo antes de crear nada (el editor pide el listado al arrancar).
  const params = new Params();
  Compositor.defineParams(params);
  SceneManager.defineParams(params, SCENES);
  Layer2D.defineParams(params);
  Layer3D.defineParams(params);

  const ctx = { params, stage: STAGE, renderer, scenes: null, mapper: null, bridge: null };

  const scenes = new SceneManager(ctx, SCENES, BASE);
  ctx.scenes = scenes;
  scenes.init();

  const layer2d = new Layer2D(ctx);
  await layer2d.init();
  const layer3d = new Layer3D(ctx);
  await layer3d.init();

  const compositor = new Compositor(ctx, layer2d, layer3d);
  compositor.init();

  const engine = new Engine(ctx, { layer2d, layer3d, compositor });
  engine.initFpsOverlay();

  // IO: todo lo que entra pasa por el Mapper, que solo escribe en Params.
  const mapper = new Mapper(ctx);
  ctx.mapper = mapper;
  await mapper.init();
  scenes.onSceneChange((id) => mapper.onSceneChange(id));

  const midi = new MidiInput({
    onMessage: (msg) => { mapper.dispatch(msg); bridge.midiActivity(msg); },
    onInputsChange: (list) => bridge.midiInputs(list),
  });
  const osc = new OscClient({
    onMessage: (msg) => { mapper.dispatch(msg); bridge.midiActivity(msg); },
    onStatus: (status) => bridge.oscStatus(status),
  });

  const bridge = new Bridge(ctx, { midi, osc, mapper });
  ctx.bridge = bridge;
  bridge.init();

  await midi.init();
  osc.connect();

  new Keyboard(ctx, { onToggleFps: () => engine.toggleFps() }).init();

  scenes.goto(SCENES[0].id, { transition: 0 });
  engine.start();

  window.vis = ctx;             // acceso desde la consola en desarrollo
  Object.assign(window.vis, { engine, layer2d, layer3d, midi, osc });
  console.info('[vis] arrancado ·', params.list().length, 'params/actions ·', mapper.mappings.length, 'mapeos');
}

boot().catch(showFatalError);
