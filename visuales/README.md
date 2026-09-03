# Visuales LED

Sistema de visuales en tiempo real (WebGPU / three.js + TSL) para la pantalla LED 8 × 3 m
(2688 × 1008 px). Ver `../../PLAN.md` (raíz del repo) para el plan completo por fases.

## Correr en desarrollo

```
npm install
npm run dev
```

Abrir `http://localhost:5173/` en Chrome (≥ 113, WebGPU). El editor (Fase 2 en adelante)
vive en `http://localhost:5173/editor.html`, en otra ventana.

## OneDrive

Este sub-proyecto vive dentro de `particlesvideo/` (repo sincronizado por OneDrive).
`node_modules/` está en `.gitignore`; si el sync de OneDrive molesta o hace lento el `npm install`,
marcar la carpeta `visuales/node_modules` como "Liberar espacio" o excluirla del sync de OneDrive.

## Build para el show

```
npm run build
npm run preview
```

`preview` es más estable que `dev` para el show en vivo.
