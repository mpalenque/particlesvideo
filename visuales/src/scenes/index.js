// Escenas de prueba de la Fase 1. Se reemplazan por las del storyboard en la Fase 3.
export const SCENES = [
  {
    id: 'testA', name: 'Prueba 2D (cuadrado)', transition: 1.0,
    params: { 'test.opacity': 1, 'layer3d.opacity': 0 },
  },
  {
    id: 'testB', name: 'Prueba 3D (cubo)', transition: 1.0,
    params: { 'test.opacity': 0, 'layer3d.opacity': 1 },
  },
];
