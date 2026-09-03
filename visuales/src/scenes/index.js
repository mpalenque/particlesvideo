// Ids = número de imagen del storyboard. 1b/2b/6b/6c no son escenas: son acciones
// dentro de su escena (warning.bgOff, line.flip, sweep.white, sweep.solid).
// `mainAction` es lo que dispara la barra espaciadora.
const GRID_FINE = { 'grid.cellW': 84, 'grid.cellH': 63 };   // medido del storyboard 4.png

export const SCENES = [
  {
    id: '1', name: 'Placa de advertencia', transition: 1.0,
    params: { 'warning.band': 1, 'warning.bg': 1 },
    mainAction: 'warning.pulse',
  },
  {
    id: '2', name: 'Marco + línea trueno', transition: 3.0,
    params: {
      'frame.opacity': 1, 'frame.color': '#7A0000',
      'line.opacity': 1, 'line.mode': 'strike', 'line.speed': 30,
    },
    actions: [['line.strike', 'edge']],
    mainAction: ['line.strike', 'edge'],
  },
  {
    id: '3', name: 'Grilla gruesa por bloque', transition: 1.0,
    params: {
      'frame.opacity': 1, 'frame.color': '#7A0000',
      'line.opacity': 1, 'line.mode': 'strike', 'line.speed': 30,
      'grid.opacity': 1, 'grid.coarse': true, 'grid.lineWidth': 1, 'grid.brightness': 0.35, 'grid.scrollSpeed': 8,
      'grid.b1.enabled': true, 'grid.b2.enabled': true, 'grid.b3.enabled': true, 'grid.b4.enabled': true, 'grid.b5.enabled': true,
    },
    mainAction: 'grid.toggleAll',
  },
  {
    id: '4', name: 'Grillas finas', transition: 1.0,
    params: {
      'frame.opacity': 1, 'frame.color': '#E00000',
      'line.opacity': 1, 'line.mode': 'strike',
      'grid.opacity': 1, 'grid.coarse': false, ...GRID_FINE, 'grid.brightness': 0.6, 'grid.scrollSpeed': 12,
      'grid.b1.enabled': true, 'grid.b3.enabled': true, 'grid.b5.enabled': true,
      'grid.b2.dir': -1, 'grid.b4.dir': -1,
    },
    mainAction: 'grid.toggleAll',
  },
  {
    id: '5', name: 'Grillas finas (igual que 4)', transition: 1.0,
    params: {
      'frame.opacity': 1, 'frame.color': '#E00000',
      'line.opacity': 1, 'line.mode': 'strike',
      'grid.opacity': 1, 'grid.coarse': false, ...GRID_FINE, 'grid.brightness': 0.6, 'grid.scrollSpeed': 12,
      'grid.b2.enabled': true, 'grid.b4.enabled': true,
      'grid.b1.dir': -1, 'grid.b5.dir': -1,
    },
    mainAction: 'grid.toggleAll',
  },
  {
    id: '6', name: 'Grillas + barridos', transition: 1.0,
    params: {
      'frame.opacity': 1, 'frame.color': '#7A0000',
      'line.opacity': 1, 'line.mode': 'strike',
      'grid.opacity': 1, 'grid.coarse': false, ...GRID_FINE, 'grid.brightness': 0.6, 'grid.scrollSpeed': 12,
      'grid.b1.enabled': true, 'grid.b3.enabled': true, 'grid.b5.enabled': true,
      'sweep.enabled': true, 'sweep.opacity': 1,
    },
    mainAction: ['sweep.blue', 'random'],
  },
  {
    id: '7', name: 'Piso con fuga', transition: 2.0,
    params: { 'layer3d.opacity': 1, 'floor.opacity': 1, 'floor.scrollSpeed': 0.6 },
    actions: [['floor.reveal']],
    mainAction: 'grid.toggleAll',      // las grillas 2D pueden volver a jugar encima
  },
  // 8 y 9 todavía no están definidas en el storyboard: por ahora son copias de la 7.
  {
    id: '8', name: 'Piso (placeholder)', transition: 2.0,
    params: { 'layer3d.opacity': 1, 'floor.opacity': 1, 'floor.scrollSpeed': 0.6 },
    mainAction: 'grid.toggleAll',
  },
  {
    id: '9', name: 'Piso (placeholder)', transition: 2.0,
    params: { 'layer3d.opacity': 1, 'floor.opacity': 1, 'floor.scrollSpeed': 0.6 },
    mainAction: 'grid.toggleAll',
  },
  {
    id: '10', name: 'Caja + palitos blancos', transition: 1.5,
    params: {
      'layer3d.opacity': 1, 'floor.opacity': 0,
      'box.visible': 1, 'box.enabled': true, 'box.preset': 'center',
      'particles.opacity': 1, 'particles.baseColor': '#FFFFFF', 'particles.turbulence': 0.8,
    },
    actions: [['particles.resetInBox']],
    mainAction: 'particles.resetInBox',
  },
  {
    id: '11', name: 'Piso + palitos rojos', transition: 1.5,
    params: {
      'layer3d.opacity': 1, 'floor.opacity': 1,
      'box.visible': 1, 'box.enabled': true, 'box.preset': 'center',
      'particles.opacity': 1, 'particles.baseColor': '#FF0000', 'particles.turbulence': 0.8,
      'particles.whiteSpeedMin': 0.8,
    },
    actions: [['floor.reveal']],
    mainAction: 'particles.resetInBox',
  },
  {
    id: '12', name: 'Flujo azul que sube', transition: 1.5,
    params: {
      'layer3d.opacity': 1, 'floor.opacity': 1, 'floor.revealDist': 60,
      'box.visible': 0, 'box.enabled': true, 'box.preset': 'center',
      'particles.opacity': 1, 'particles.baseColor': '#0000FF', 'particles.turbulence': 0.3,
      'particles.flowY': 1.2, 'particles.wrapMode': 'vertical',
    },
    mainAction: 'particles.kick',
  },
  {
    id: '13', name: 'Caja + rojos (turbulencia)', transition: 1.5,
    params: {
      'layer3d.opacity': 1, 'floor.opacity': 1, 'floor.revealDist': 60,
      'box.visible': 1, 'box.enabled': true, 'box.preset': 'center',
      'particles.opacity': 1, 'particles.baseColor': '#FF0000', 'particles.turbulence': 0.8,
      'particles.whiteSpeedMin': 0.8,
    },
    mainAction: 'particles.resetInBox',
  },
  {
    id: '14', name: 'Bloque rojo a la izquierda', transition: 1.5,
    params: {
      'layer3d.opacity': 1, 'floor.opacity': 1, 'floor.revealDist': 60,
      'box.visible': 0, 'box.enabled': true, 'box.preset': 'center', 'box.wallStiffness': 0.5,
      'redBlock.opacity': 1, 'redBlock.side': 'left', 'redBlock.attract': 6,
      'particles.opacity': 1, 'particles.baseColor': '#0000FF', 'particles.turbulence': 0.4,
    },
    mainAction: 'particles.kick',
  },
  {
    id: '15', name: 'Bloque rojo a la derecha', transition: 1.5,
    params: {
      'layer3d.opacity': 1, 'floor.opacity': 1, 'floor.revealDist': 60,
      'box.visible': 0, 'box.enabled': true, 'box.preset': 'center', 'box.wallStiffness': 0.5,
      'redBlock.opacity': 1, 'redBlock.side': 'right', 'redBlock.attract': 6,
      'particles.opacity': 1, 'particles.baseColor': '#0000FF', 'particles.turbulence': 0.4,
    },
    mainAction: 'particles.kick',
  },
  {
    id: '16', name: 'Caja a la izquierda', transition: 1.5,
    params: {
      'layer3d.opacity': 1, 'floor.opacity': 1, 'floor.revealDist': 60,
      'box.visible': 1, 'box.enabled': true, 'box.preset': 'left',
      'particles.opacity': 1, 'particles.baseColor': '#FF0000', 'particles.turbulence': 0.8,
      'particles.whiteSpeedMin': 0.8,
    },
    mainAction: 'particles.resetInBox',
  },
  {
    id: '20', name: 'Partículas libres', transition: 2.0,
    params: {
      'layer3d.opacity': 1, 'floor.opacity': 1, 'floor.revealDist': 60,
      'box.visible': 0, 'box.enabled': false,
      'particles.opacity': 1, 'particles.baseColor': '#FF0000',
      'particles.turbulence': 0.5, 'particles.drag': 0.02,
    },
    mainAction: 'particles.kick',
  },
  {
    id: '21', name: 'Torbellino', transition: 2.0,
    params: {
      'layer3d.opacity': 1, 'floor.opacity': 1, 'floor.revealDist': 60,
      'box.visible': 0, 'box.enabled': false,
      'particles.opacity': 1, 'particles.baseColor': '#FF0000',
      'particles.turbulence': 0.5, 'particles.drag': 0.02,
      'vortex.swirl': 1.2, 'vortex.pull': 1.0, 'vortex.radius': 3.0,
    },
    mainAction: 'particles.kick',
  },
  {
    id: '22', name: 'Torbellino en la caja', transition: 2.0,
    params: {
      'layer3d.opacity': 1, 'floor.opacity': 1, 'floor.revealDist': 60,
      'box.visible': 1, 'box.enabled': true, 'box.preset': 'center',
      'particles.opacity': 1, 'particles.baseColor': '#FF0000',
      'particles.turbulence': 0.5, 'particles.drag': 0.02, 'particles.whiteSpeedMin': 0.4,
      'vortex.swirl': 2.2, 'vortex.pull': 1.4, 'vortex.radius': 2.5,
    },
    mainAction: 'particles.kick',
  },
  {
    id: '23', name: 'Torbellino + caja titilando', transition: 1.0,
    params: {
      'layer3d.opacity': 1, 'floor.opacity': 1, 'floor.revealDist': 60,
      'box.visible': 1, 'box.enabled': true, 'box.preset': 'center',
      'box.flicker': true, 'box.flickerRate': 8,
      'particles.opacity': 1, 'particles.baseColor': '#FF0000',
      'particles.turbulence': 0.5, 'particles.drag': 0.02, 'particles.whiteSpeedMin': 0.4,
      'vortex.swirl': 2.2, 'vortex.pull': 1.4, 'vortex.radius': 2.5,
    },
    mainAction: 'particles.kick',
  },
];
