---
'triiiceratops': patch
---

`getCanvasDisplayLayouts` now takes each source's dimensions explicitly
(`canvasWidth`/`canvasHeight` on every input) instead of reading `width`/`height`
off the source's tile source. Layout no longer inspects the tile source at all —
it carries it through untouched — so it can position canvases without an
`info.json` having been fetched first.

Layout positions are unchanged for the same inputs: same gap, same median-height
normalization, same `[0.25, 4]` scale clamp.
