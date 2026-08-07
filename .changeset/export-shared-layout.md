---
'triiiceratops': minor
'@triiiceratops/plugin-image-export': patch
---

Multi-canvas layout has one implementation, and the export path lays out from
manifest Canvas geometry.

- `MULTI_CANVAS_GAP` is no longer exported from `triiiceratops/image-export`.
  It existed so that code reconstructing the viewer's layout elsewhere could
  use the same spacing; there is no such code any more. `getCanvasDisplayLayouts`
  takes `gap` as an optional option instead, defaulting to the spacing the
  viewer itself lays out with, so a caller that wants what is on screen simply
  omits it.
- `ResolvedCanvasImage` gains `height`: the image's box on its canvas, in
  manifest Canvas coordinates normalized by canvas width, alongside the existing
  `x`/`y`/`width`. A canvas-filling image gets the canvas's aspect ratio; a
  region-targeted image gets its target's box.
- `@triiiceratops/plugin-image-export` feeds that box to layout instead of the
  image service's `resourceWidth`/`resourceHeight`. For the common canvas whose
  declared dimensions match its image, "current view" exports are unchanged.
  Where a manifest's Canvas dimensions disagree with its image's, the export now
  matches the manifest — the same geometry annotations are stored in.
