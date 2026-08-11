---
'triiiceratops': patch
---

show annotations on every canvas on screen, not just the current one

**A facing page's annotations were missing entirely.** With a four-canvas paged
manifest annotated on every page, a spread drew one shape and listed one row while
two annotated pages were on screen — nothing to hover, nothing to select, and no
row for a connector to reach. Continuous mode was worse: the panel followed the
canvas last *navigated* to, so after scrolling to folio 400 it still described
folio 1 (`renderer/layoutQueries.navigationTargetBounds` documents the same trap
for fit targets).

The cause was that the shape overlay, the connector overlay, and the annotation
panel each asked `getAnnotations(manifestId, canvasId)` for themselves — one
canvas, three times, and the wrong one in two of the three viewing modes. They now
read one shared enumeration (`utils/canvasAnnotations.collectCanvasAnnotations`)
over `ViewerState.annotatableCanvasIds`, so a row exists for every shape and a
shape for every row. Placement needed no new machinery: every parsed annotation
carries the canvas it came from, and `canvasToScreen(point, canvasId)` already
maps through that canvas's own laid-out rect.

**Which canvases those are is the renderer's answer, and it depends on the mode.**
`RendererPort.getVisibleCanvasIds()` returns the laid-out world in `individuals`
and `paged` — where that world IS the canvas or the spread, so zooming into one
page does not close the facing one — and the canvases whose rect meets the
viewport in `continuous`. The host publishes it on the new observable
`ViewerState.visibleCanvasIds` only when the SET changes, never per frame: that is
what makes it safe for ordinary chrome to subscribe to, and it is the cadence a
panel following a scroll should update at.

Also fixed on the way:

- **Search hits on a facing page were ~15 canvas units out of place.**
  `currentCanvasSearchAnnotations` shifted them by a hand-rolled
  `canvasWidth * 1.025` and handed them back as the current canvas's — a stand-in
  for multi-canvas layout, wrong by the difference from the renderer's real 1.25%
  gap, and incapable of describing more than two pages. The offset is gone; each
  hit is projected through its own canvas.
- **Annotations on a newly visible canvas arrived hidden.** The default-visibility
  pass ran once, when the set was empty, so every canvas after the first was
  drawn nowhere while its panel row's eye claimed the reader had hidden it. It now
  re-applies while the reader has not touched visibility themselves
  (`showVisibleCanvasAnnotations`, beside the single-canvas
  `showCurrentCanvasAnnotations`).
- **`fetchAnnotationList` could fire the same request several times.** Its guard
  read a cache slot written only after the response parsed, so concurrent callers
  each started a fetch. Survivable when annotations were read once per navigation;
  not now that a scroll asks about each folio as it arrives. In-flight urls are
  marked synchronously, and released on failure so a blip stays retryable.

A selection survives its canvas scrolling off screen: it is a deliberate act, and
the mark returns with the folio.

New: `ViewerState.visibleCanvasIds` (observable), `annotatableCanvasIds` (derived
read), `showVisibleCanvasAnnotations`, `RendererPort.getVisibleCanvasIds`, and
`ParsedAnnotation.canvasId`. `parseAnnotation`/`parseAnnotations` take an optional
trailing `canvasId`, and `projectAnnotationShapes` now takes `toScreen(point,
canvasId)` and `imageDimensions(canvasId)` — per canvas, because the canvases on
screen are not all the same size. The element bundle's size baseline is re-recorded:
+382 bytes gzipped (120,119 from 119,737).
