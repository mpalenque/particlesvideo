import * as THREE from 'three/webgpu';
import { STAGE } from '../config/stage.js';

// Crea el WebGPURenderer a tamaño fijo (2688 × 1008, pixelRatio 1) y lo mete en #stage.
// El buffer de dibujo SIEMPRE es 2688 × 1008; lo único que cambia es a qué tamaño lo muestra
// el navegador. En la LED se ve 1:1; en una ventana más chica el navegador lo reduce.
export async function createRenderer() {
  // ?stats activa las consultas de timestamp de la GPU (tienen costo, no van en el show).
  const trackTimestamp = new URLSearchParams(location.search).has('stats');
  const renderer = new THREE.WebGPURenderer({ antialias: false, alpha: false, powerPreference: 'high-performance', trackTimestamp });
  await renderer.init();

  if (!renderer.backend.isWebGPUBackend) {
    throw new Error('WebGPU no disponible en este navegador/GPU.');
  }

  renderer.setPixelRatio(1);
  renderer.setSize(STAGE.width, STAGE.height, false);   // false: no toca el CSS
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const stageEl = document.getElementById('stage');
  stageEl.appendChild(renderer.domElement);

  // Nativo SIEMPRE: 2688 × 1008 reales, pixel a pixel. Cambiar el tamaño de la ventana
  // no reescala el contenido (solo recentra lo que entra) — así lo que se ve en desarrollo
  // es exactamente lo que va a salir por la LED, nunca una versión reducida por el navegador.
  const view = { mode: 'native' };
  const apply = () => fitStage(stageEl, renderer.domElement, view.mode);
  apply();
  window.addEventListener('resize', apply);

  // Se deja el modo 'fit' accesible por si hace falta ver el cuadro completo en una
  // ventana chica durante el desarrollo, pero el default y el del show es 'native'.
  view.toggleNative = () => {
    view.mode = view.mode === 'fit' ? 'native' : 'fit';
    apply();
    return view.mode;
  };

  return { renderer, view };
}

// Se ajusta el tamaño CSS del canvas (no un transform): así el navegador lo reescala
// con filtrado, en vez de con el muestreo duro que deja los bordes escalonados.
function fitStage(stageEl, canvas, mode) {
  if (mode === 'native') {
    canvas.style.width = `${STAGE.width}px`;
    canvas.style.height = `${STAGE.height}px`;
    // Centrado en el medio del cuadro; lo que no entra queda fuera de la ventana.
    stageEl.style.left = `${Math.round((window.innerWidth - STAGE.width) / 2)}px`;
    stageEl.style.top = `${Math.round((window.innerHeight - STAGE.height) / 2)}px`;
    return;
  }
  const scale = Math.min(window.innerWidth / STAGE.width, window.innerHeight / STAGE.height);
  canvas.style.width = `${Math.round(STAGE.width * scale)}px`;
  canvas.style.height = `${Math.round(STAGE.height * scale)}px`;
  stageEl.style.left = '0px';
  stageEl.style.top = '0px';
}

export function showFatalError(err) {
  console.error('[vis]', err);
  const div = document.createElement('div');
  div.id = 'fatal';
  div.textContent = `Error fatal:\n${err && err.stack ? err.stack : err}`;
  document.body.appendChild(div);
}
