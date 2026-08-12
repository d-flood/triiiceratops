---
'triiiceratops': minor
---

**Overlay layers: a plugin can put real DOM on the image.**

`viewerState.registerOverlayLayer({ id, mount })` asks core for a DOM container
over the image. Core creates it, places it in the viewer's stage beside the
renderer, and calls `mount` with it — the same `(container) => cleanup` thunk
plugin chrome already uses, so there is no second mount mechanism to learn. It
returns an idempotent dispose, so releasing from a mount cleanup and from a
teardown path is safe. Ids are `<pluginId>:<name>`, derived from
`context.surface.id`; a duplicate id is refused with a no-op dispose, reported on
the `viewererror` channel. New public type: `OverlayLayer`.

**The container's origin is `canvasToScreen`'s origin** — a published contract,
so a plugin positions an element straight from a projected point with no offset
arithmetic. Re-place on the `frame` cadence (`subscribeFrame`) and the write lands
in the same frame the tiles are painted in; re-placing after the plugin's own
state changed is the plugin's own `requestAnimationFrame`'s job.

**The container is created once on registration and removed once on dispose**,
never remounted in between — including across the renderer remount a manifest
change causes, so a plugin's DOM and state survive it. Registering before any
renderer has mounted is valid. Clearing content that was scoped to the old
manifest stays the plugin's own concern, since core cannot know which of a
plugin's DOM that is.

**Pointer events pass through by default.** The container is
`pointer-events: none`, so adding a layer cannot cost the reader panning and
pinching; individual children opt in with `pointer-events: auto`. A plugin drawing
a full-surface SVG — connector lines, for instance — must keep that SVG
transparent or it will swallow every gesture. Layers render in registration order
and stack below the viewer's own annotation shapes, which are focusable targets
carrying the viewer's own accessible names. There is no ordering field:
cross-plugin ordering cannot be coordinated, and a plugin needing internal
stacking uses one container with `z-index` on its own children.

**Choosing between an overlay layer and the paint hook is the accessibility
rule**, not a timing judgement: anything a reader must perceive or operate is DOM
in an overlay layer, because painted pixels have no focus, no accessible name, and
no keyboard reach. The paint hook is decoration, or a second rendering of geometry
the DOM already carries. The paint hook's own "why a hook rather than an overlay"
argument is amended to say so — it argued that a DOM overlay is structurally one
frame late, which is true of event-driven repositioning and false of a
`frame`-cadence layer.

The shared plugin mount host now calls a plugin's mount thunk **untracked**, for
plugin panels and flyouts as well as for overlay layers. An attachment re-runs when
anything it read while running changes, and what a plugin's thunk reads is not
core's to bound: a plugin that consults reactive viewer state while building its
DOM — the active canvas, the manifest, its own selected data — would otherwise
enrol each of those as a remount trigger, so turning a page could tear its DOM and
its closures down and rebuild them. No such remount was observed in core's own
callers, and none was possible through the renderer: `canvasToScreen` reads the
renderer port, which is deliberately not reactive state, so a manifest change was
never propagating through this host. This is a guarantee for third-party thunks,
which makes the documented contract ("mounted when the container appears,
unmounted when it goes away") true for every plugin rather than for the ones that
happen to read nothing.

Core's own annotation overlays are unchanged and do not move onto the new
registry.

**Element size.** `size-baseline.json` is re-recorded. This change accounts for
+1240 bytes raw / +226 gzip on the IIFE artifact and +1413 raw / +228 gzip on the
ESM one. The rest of the re-baseline is **growth already on the branch before this
epic**, never re-recorded at the time, and it is the larger half: an element built
from the last commit before this work measures 407407 raw / 114750 gzip / 95117
brotli (IIFE) and 426335 / 121034 / 100674 (ESM), which is +2190 raw / +818 gzip /
+845 brotli and +2324 / +915 / +905 over the baseline this branch inherited — over
budget on all six metrics on its own. The re-baseline therefore absorbs those bytes
as well as this epic's; they belong to the branch's renderer commits (the
multi-image composition and tile-seam work), not to overlay layers.

Also in this change, because it is what unblocked typechecking the suite: the
`placement()` fixture in `renderer/imageRequests.test.ts` gained the `order: 0`
field. `order` became required on the placement type in the multi-image
composition commit on this branch, which left that fixture failing to typecheck;
`0` is the correct value for the single-image canvas the fixture describes.
