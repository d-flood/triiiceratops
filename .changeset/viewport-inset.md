---
'triiiceratops': minor
---

**Viewport inset: a plugin can reserve edges of the surface so fits frame into
what the reader can actually see.**

`viewerState.setViewportInset({ bottom: 200 })` reserves edges of the viewer
surface in screen pixels, merging over the current set; `resetViewportInset()`
returns every edge to zero, and `viewportInset` reads the set back and notifies at
`state` cadence, exactly as `imageAdjustments` does. `fitCanvas`, `fitBounds`, and
canvas navigation now take their scale from the inset extent and offset their
centre by half the asymmetry, so a folio lands above a plugin's filmstrip rather
than behind it. New public type `ViewportInset` and identity constant
`ZERO_VIEWPORT_INSET`.

**Fit targets only, and that is the design.** Pan, zoom, wheel and pinch
anchoring, the centre constraint, the zoom range, `canvasToScreen` /
`screenToCanvas`, the viewport queries and the visible-canvas set are all
unchanged and still measured against the whole surface. An overlay layer's DOM
spans the full surface, so an inset that shifted the coordinate mapping would
misplace every marker every plugin has placed — including those of the plugin that
set the inset.

The zoom range in particular is measured against the whole surface, and that is
load-bearing rather than incidental: it is derived from the fit scale, so an
inset threaded into it would gate pinch, the wheel, double-tap, keyboard zoom,
`zoomTo`, `zoomBy` and the re-clamp after every resize — lowering the zoom
ceiling under the reader's fingers when a panel opened, and snapping a reader
already at the ceiling back out on the next nudge.

**The limit of what an inset can ask for, stated rather than fixed.** Up to half
of an axis, a fit lands exactly centred in what is left. Past that the viewer's
standing guarantees take over and the inset is honoured in direction but not in
full: the reader's zoom floor (half the scale at which a whole canvas fits, and
measured against the whole surface for the reason above) stops the fit from
shrinking further, and the pan constraint stops the framed box being lifted past
the edge of the world — which in continuous mode shows up on the strip's first
and last folio. Both outrank a plugin's request for space deliberately; the
alternative is a viewer whose zoom range and pan bounds a plugin can collapse.
Reserving more than half an axis is documented as unsupported in
`docs/plugin-authoring.md`, and the threshold is pinned by unit tests.

**Nothing is reactive and nothing replays.** Setting an inset does not move the
current view: the next fit uses it, and a plugin that wants to be re-framed issues
a fit itself. Core animating the viewport because a panel opened would be
surprising, and wrong whenever the reader had deliberately zoomed in (ADR 0015).
`RendererPort` is untouched — the renderer *reads* the inset when it fits, which is
what makes "honoured by a renderer that mounts later" structural rather than replay
machinery.

**`panTo` deliberately still aims at the middle of the surface**, so that it stays
the exact inverse of the `viewportCentre` query. `docs/plugin-authoring.md` carries
the one-line pattern for aiming it at the inset centre yourself from `viewportInset`
and `viewportScale`.

**Accepted limitation:** one inset per viewer — a second setter wins, and two
plugins reserving space clobber each other. Documented rather than fixed; a keyed
map with maximum-per-edge resolution was considered and deferred until there is
evidence for it.

Invalid input is split by whose fault it is. A negative or non-finite edge is
refused whole and logged at set time, the way `zoomTo` refuses an unusable scale —
it is an author error at any window size. An edge passed as `undefined` is not an
error at all and means the same as an omitted one, so
`setViewportInset({ bottom: open ? 200 : undefined })` — which type-checks,
because `exactOptionalPropertyTypes` is off — releases the bottom edge instead of
being refused. An inset that leaves no room on an axis of the *current* window is
environmental, and that axis silently falls back to the full surface extent at fit
time, per axis, so the standing guarantee that a reader can always zoom out far
enough to see a whole canvas is preserved.

**Element size.** `size-baseline.json` is re-recorded on top of the overlay-layer
re-baseline in this release. Measured against that baseline, this change costs
**+1122 bytes raw / +381 gzip / +221 brotli** on the IIFE artifact and
**+1194 / +349 / +315** on the ESM one — over the 512-byte raw slack on both, which
is why the baseline moves rather than absorbing it. (Of that, roughly 220–260 raw
bytes are the review remediation: the inset's centre arithmetic split into a second
exported helper so a clamped fit can be composed at the scale it actually adopts,
and the `undefined`-edge filter in `setViewportInset`.)
