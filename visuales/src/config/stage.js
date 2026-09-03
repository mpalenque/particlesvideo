export const STAGE = {
  width: 2688, height: 1008,
  physical: { widthM: 8.0, heightM: 3.0, bottomM: 0.0, pitchMm: 2.976 },
  blocks: 5,
  blockBounds: [0, 538, 1075, 1613, 2150, 2688],
  camera: { eyeX: 0, eyeY: 1.0, eyeZ: 4.0, near: 0.05, far: 60 },
  sim: { min: [-4.5, -0.5, -5.5], max: [4.5, 3.5, 0.5], cellSize: 0.1, maxParticles: 8192 * 64 },
  box: { width: 2.6, height: 3.0, depth: 2.6, yawDeg: 45, y: 1.5, z: -1.84, presets: { left: -2.1, center: 0, right: 2.1 } },
};
