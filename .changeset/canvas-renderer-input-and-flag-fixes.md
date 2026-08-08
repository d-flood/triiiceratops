---
'triiiceratops': patch
---

harden the development-only Canvas2D renderer and stop the published package from exposing its flag

The npm tarball's main entry comes from `svelte-package`, which no Vite `define`
reaches, so it shipped `globalThis.__TRIIICERATOPS_CANVAS_RENDERER__` as a live
runtime read — anything setting that global before load could switch an
installed, production viewer onto the in-progress renderer. `build:lib` now
folds the flag to the build's literal (`src/packaging/foldRendererFlag.ts`), so
the published package has no such switch. The element IIFE/ESM builds were
already folded by their bundler define.

Still outstanding, and deliberate: the **demo** bundles published to `docs/`
(`vite.config.demo.ts` and the other demo configs) carry no define, so the
project's demo site continues to contain both renderers and the mutable global.
That is a demo, not an integration surface, and ticket 18 removes the flag
entirely — but it is a real published artifact and is recorded rather than
silently tolerated.

Renderer fixes behind the flag (no effect on the shipping OpenSeadragon path):
wheel zoom no longer snaps to its target on the first frame; easing speed no
longer depends on paint cost; `WheelEvent.deltaMode` is normalized, so a
line-mode mouse wheel (Firefox) zooms the same distance per notch as everywhere
else; a decoded image is cached by resolved URL rather than canvas id, so
switching a Choice repaints instead of showing the previous image forever; the
viewport keeps the container's fractional size; a `devicePixelRatio` change
(moving the window between displays) re-measures the backing store; and a
right-button press no longer starts a pan under the context menu.
