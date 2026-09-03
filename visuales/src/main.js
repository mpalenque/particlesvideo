import { createRenderer, showFatalError } from './render/Renderer.js';
import { Engine } from './core/Engine.js';

async function boot() {
  const renderer = await createRenderer();
  console.info('[vis] WebGPU renderer listo', renderer.backend.isWebGPUBackend);

  const engine = new Engine(renderer);
  engine.initFpsOverlay();
  engine.start();

  window.vis = { renderer, engine }; // acceso rápido desde la consola en desarrollo
}

boot().catch(showFatalError);
