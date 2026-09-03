import * as THREE from 'three/webgpu';
import { STAGE } from '../config/stage.js';

// Crea el WebGPURenderer a tamaño fijo (2688 × 1008, pixelRatio 1) y lo mete en #stage.
// El escalado a la ventana es puro CSS (transform: scale) para no tocar la resolución real.
export async function createRenderer() {
  // ?stats activa las consultas de timestamp de la GPU (tienen costo, no van en el show).
  const trackTimestamp = new URLSearchParams(location.search).has('stats');
  const renderer = new THREE.WebGPURenderer({ antialias: false, alpha: false, powerPreference: 'high-performance', trackTimestamp });
  await renderer.init();

  if (!renderer.backend.isWebGPUBackend) {
    throw new Error('WebGPU no disponible en este navegador/GPU.');
  }

  renderer.setPixelRatio(1);
  renderer.setSize(STAGE.width, STAGE.height, false);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const stageEl = document.getElementById('stage');
  stageEl.appendChild(renderer.domElement);
  fitStage(stageEl);
  window.addEventListener('resize', () => fitStage(stageEl));

  return renderer;
}

function fitStage(stageEl) {
  const scale = Math.min(window.innerWidth / STAGE.width, window.innerHeight / STAGE.height);
  stageEl.style.transform = `scale(${scale})`;
}

export function showFatalError(err) {
  console.error('[vis]', err);
  const div = document.createElement('div');
  div.id = 'fatal';
  div.textContent = `Error fatal:\n${err && err.stack ? err.stack : err}`;
  document.body.appendChild(div);
}
