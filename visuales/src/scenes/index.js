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
];
