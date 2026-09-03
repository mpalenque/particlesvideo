import { createRenderer, showFatalError } from './render/Renderer.js';
import { Params } from './core/Params.js';
import { SceneManager } from './core/SceneManager.js';
import { Engine } from './core/Engine.js';
import { Keyboard } from './core/Keyboard.js';
import { Layer2D } from './layers2d/Layer2D.js';
import { Layer3D } from './layers3d/Layer3D.js';
import { Compositor } from './render/Compositor.js';
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

  const ctx = { params, stage: STAGE, renderer, scenes: null, mapper: null, clock: null };

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

  new Keyboard(ctx, { onToggleFps: () => engine.toggleFps() }).init();

  scenes.goto(SCENES[0].id, { transition: 0 });
  engine.start();

  window.vis = ctx;             // acceso desde la consola en desarrollo
  window.vis.engine = engine;
  window.vis.layer2d = layer2d;
  window.vis.layer3d = layer3d;
  console.info('[vis] arrancado ·', params.list().length, 'params/actions');
}

boot().catch(showFatalError);
