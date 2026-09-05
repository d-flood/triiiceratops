# Residency is tiered by projected size, nested canvas-over-level, and budgeted in bytes

Every canvas is assigned a **residency tier** each frame from its projected on-screen
size, measured orientation-invariantly as `sqrt(projectedWidth × projectedHeight)` in CSS
pixels: above the pyramid threshold it gets the full tile pyramid, between the thresholds
one thumbnail sized to the projection, below the box threshold only its layout rect — no
network, no decoded pixels. Thresholding on projected *height* was rejected because it
decides differently for a portrait page in a left-to-right world and a landscape page in
a top-to-bottom world at identical visual size, which is a bug that only appears in one
viewing direction. From those thresholds the **minimum zoom is derived** rather than
tuned: it is the zoom at which the median canvas reaches the box threshold, below which
there is by definition no information on screen — so the floor scales with the manifest
instead of being a percentage someone picked. The residency margin is likewise expressed
as a factor the viewport rect is inflated by, never as a count of canvases, so it is
correct for wide and tall worlds with no axis conditional. Eviction is **distance-based,
not LRU**: residency is a pure function of viewport position, so the same viewport always
yields the same resident set regardless of how the reader arrived there — which is also
what makes the planner testable from Node against a viewport rect instead of against a
history of gestures.

Inside the canvas tiers sits per-canvas **level residency**, and the nesting direction is
the load-bearing rule: **the canvas tier gates level residency, never the reverse.** A
canvas that leaves the pyramid tier releases everything below it, including its base
level; no level can hold itself resident under a canvas that is no longer pyramid-tier.
Without that rule a long manifest scrolled through once accumulates base levels forever
and the byte budget is decided by history rather than by the view. The **required set** —
never evicted while required — is the base level, the full chain of coarser levels over
the same viewport-plus-margin box (geometric level sizes make that whole chain roughly a
third of the current level, which is what makes zooming *out* instant as well as in), the
current level's tiles intersecting viewport-plus-margin, and the resolved thumbnail for
thumbnail-tier canvases. Everything recently dropped from the required set falls into an
**opportunistic cache** under an LRU capped by a **decoded-byte** budget, with separate
desktop and mobile ceilings. Budgeting in bytes rather than tile counts is a deliberate
correction of the previous renderer, whose tile-count cache varied its actual footprint
by more than an order of magnitude with a server-side tile-size choice it did not
control; a count is only a memory budget if you also control the tile size, and we do
not. Because the cap governs only what is held *beyond* the required set, lowering it
costs re-fetches and never a blank canvas. Image-service metadata is cached separately
from decoded pixels with a longer lifetime, so re-entering a canvas never refetches
`info.json`.
