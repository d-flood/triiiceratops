---
'triiiceratops': patch
---

Fix composite canvases: a canvas painted by more than one painting annotation
showed only its first image, and an annotation targeting a `#xywh=` region was
stretched across the whole canvas instead of drawn into its rectangle. IIIF
Cookbook recipe 0036 — a folio with a miniature painted over part of it —
rendered as the folio alone, and the miniature's image service was never
requested at all.

Both halves were the same missing concept: **a canvas is a composition of placed
images, not one image.** `resolveCanvasImage` is `resolveAllCanvasImages()[0]`,
and the renderer took that one entry and discarded the placement that came with
it. The previous renderer composed correctly because it fed OpenSeadragon one
tiled image per annotation with its own `x`/`y`/`width`, so this is a regression
from the renderer swap rather than a gap in what the manifest layer knows — the
image-export plugin has been composing from the same data throughout.

- **`PlannerCanvas.source` is now `PlannerCanvas.images`**, a list of
  `PlannerImage` — each a source plus the box it paints into, normalized by the
  Canvas's own width on both axes exactly as `utils/resolveCanvasImage` computes
  it. Never empty; the common single-image canvas is a one-element list.
- **The planner plans per placed image.** Tiles, size-ladder rungs, thumbnails,
  and the pyramid-to-thumbnail handover each run against the image's own box, so
  a miniature covering a fifteenth of a folio picks its own (much coarser) level
  and its own thumbnail rung instead of the folio's. The residency tier stays a
  per-canvas decision, as does the `info.json` request — asked once for a canvas
  however many services it paints from.
- **The thumbnail tier prefers the Canvas's declared `thumbnail`**, painted once
  over the whole canvas box, because that picture depicts the finished canvas.
  Only where a canvas declares none does each placed image resolve its own
  service ladder into its own box.
- **`ScenePlan.staticImages`** is new: the whole-image placements the host should
  hold, already gated by the tier. The host keys decoded images on the placement
  rather than on the canvas, so a composition of static images no longer has its
  second image evict its first every frame.
- **Paint order is annotation order.** `tileDraws` is no longer sorted globally
  by level, and both it and `staticImages` carry an `order` the painter merges
  on. Coarsest-first is blur-up, a claim about ONE picture's own levels; applied
  across a scene it silently became a claim about the composition and was false
  there — a folio settles on a fine level while the miniature over it settles on
  a coarse one, so every folio tile sorted after the miniature and painted over
  it. The miniature vanished as the reader zoomed IN, surviving at the thumbnail
  tier only because both pictures sit at rungs 0 and 1 there. The same merge is
  what keeps a plain-JPEG overlay on top of a tiled folio, rather than under
  every tile of it.

These are core-internal renderer types with no public export; they appear in the
API report because the host component's declarations reference them.
