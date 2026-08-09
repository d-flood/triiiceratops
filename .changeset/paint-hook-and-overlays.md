---
'triiiceratops': minor
---

**The paint hook ships, and the annotation overlays are renderer-independent.**

`viewerState.registerPaintLayer({ id, order, draw })` registers an ordered layer
the renderer calls each frame, after the tiles are painted, with the 2D context
and the transform the tiles were drawn with. Lower `order` draws first; layers
sharing an `order` are called in registration order; the returned unregister is
idempotent. Registering before a renderer mounts is fine — the layer is kept and
drawn when one arrives, and it survives a remount — and a layer that throws is
reported once and skipped rather than stopping the renderer painting. Core
registers a layer of its own through the same API (a page-shaped placeholder for
the canvases too far from the viewport to hold pixels, which previously drew
nothing at all), so the hook is exercised on every frame rather than shipped
speculative. New public types: `PaintLayer`, `PaintFrame`, `PaintTransform`,
`PaintCanvasPlacement`, `PaintLayerDraw`.

The context arrives in the renderer's **laid-out world**, where every canvas has
a rect placed beside its neighbours and layout may have resized it — so a layer
holding geometry in **canvas space** (how IIIF annotations are persisted)
converts with `frame.canvasToWorld(point, canvasId)` or
`frame.canvasBoxToWorld(box, canvasId)`, which answer `null` for a canvas the
frame did not lay out. `frame.canvases` still carries the rects themselves, for a
layer drawing a whole page rather than something on one.

**Painted pixels are invisible to assistive technology** — no focus, no
accessible name, no keyboard reach, and no automated scan can report an element
that does not exist. The canvas paints pixels; a parallel DOM layer carries the
focusable, labelled targets, both projected from one geometry. Core's own
annotation shape overlay is built that way and stays that way.

The annotation shape overlay (the boxes, polygons, and points on the image) moved
out of the OpenSeadragon component into a layer of its own, mounted beside the
renderer. It takes its geometry from `ViewerState.canvasToScreen` and its redraw
signal from the `frame` cadence, so it no longer knows which renderer is mounted:
the shapes now appear on the first-party renderer, they are positioned in the same
frame the image is painted in rather than one frame later, and they subscribe to
the frame cadence only while there is a shape to move. Their markup, styling,
accessible names, and Enter/Space activation are unchanged. The SVG connector
lines between the annotation panel and those shapes are a separate layer and are
unchanged.
