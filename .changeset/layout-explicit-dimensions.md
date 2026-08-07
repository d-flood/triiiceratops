---
'triiiceratops': patch
---

`getCanvasDisplayLayouts` now takes each source's dimensions explicitly
(`sourceWidth`/`sourceHeight` on every input) instead of reading `width`/`height`
off the source's tile source. Layout no longer inspects the tile source at all —
it carries it through untouched — so it can position canvases without an
`info.json` having been fetched first. They are named for the source rather than
the canvas because a caller may lay out in a space other than manifest Canvas
coordinates; omitted or `null` geometry falls back to the same defaults as
before (x/y `0`, width `1`, a generated canvas id).

Layout positions are unchanged for the same inputs: same gap, same median-height
normalization, same `[0.25, 4]` scale clamp.
