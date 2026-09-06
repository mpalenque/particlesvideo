# Radiance source preservation

Imported from the local copy of `radiance-live-show`, source commit
`18998e4bd48558b88013c2242194001ed33923dc`. The full original project remains
beside `particlesvideo` in the workspace. This directory preserves its entire
`src`, package lock and TypeScript configuration; public assets are in
`../../public/radiance/`, including the WAV, show document, analysis, worker,
WASM and their notices. Optional engines remain available without loading them
in the scene 24/25 output.

Install these dependencies with `npm ci --prefix vendor/radiance` from
`visuales`; local module resolution keeps Radiance's Three 0.181 separate from
the original show's Three 0.176. The destination Vite build consumes the runtime
and remote editor entries. Do not deduplicate Three across these packages.

`src/integration/FluidRuntime.ts` owns one fluid worker and one renderer. It has
no animation loop, audio context, MIDI input or document persistence. The main
application owns those. Scene 24 feeds the original `FluidsShowDirector` with
the preserved document and audio time. Scene 25 removes that director and its
geometry, then accepts live scalars/actions. A worker command barrier drains
dispatched work before changing modes. A replay of scene 24 resets the native
solver, director, radiance and transport; timeline scrubbing retains the
original fluid history semantics.

Live values: emission 0–1 (2400 particles/s at 1), x/y 0–1, hue 0–1, gravity
−1–1, viscosity/cohesion 0–1, light 0–3, forceX/Y −1–1. Actions: `burst`
(`count`, `x`, `y`, `material` 0–2), `attractor` (`mode`, `x`, `y`, `radius`,
`strength`) and `reset`. These are engine controls; future MIDI choreography
belongs in the host mapping editor.

Public asset paths use the application base followed by `radiance/`. The
original exported document may contain `/audio/fluids.wav`; the host resolves
this to its namespaced asset. The original browser's local storage is not
modified by the imported runtime.
