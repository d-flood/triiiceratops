---
'triiiceratops': patch
---

select an annotation from the image or the panel, and keep its connector

**A tap on a shape selects that annotation.** It is what the renderer's single
tap was reserved for all along — `clickToZoom` is false precisely so this gesture
stays free (spec §Input and animation) — and the arbiter now reports it instead of
swallowing it: `GestureUpdate` gains a `tap` kind, the host announces it on
`RendererPort.onTap`, and `ViewerState.subscribeSurfaceTap` fans it out. The
overlay hit-tests the point against the geometry it projected for the current
frame, the same numbers the shapes were positioned from, so what gets selected is
the shape the reader saw under their finger and no layout is read.

Deciding it there rather than with a `click` handler beside the overlay is what
keeps the arbiter's one-arbitration-point rule true: a drag over an annotation
still pans (the shapes take no pointer events, and that is asserted), a pinch is
not a tap, and a gesture suppressed by a phase-2 input claim reports nothing at
all — so selection cannot happen behind a claimant's back. There is one tap-slop
threshold, not two.

**A click on the panel row selects it too**, which is the same state from the
other side. That row was previously a second, unlabelled visibility toggle:
clicking the annotation you wanted to look at was as likely to make it disappear.
Visibility keeps its own control in each row (the eye) and its own bulk control in
the toolbar; the row now means "this one", from the pointer and from Enter/Space.
A search-hit row is selectable like any other — only its eye stays disabled — and
selecting never changes what is visible, in either direction.

**The connector outlives the pointer.** It used to be drawn only while a row was
hovered, so it vanished the moment the reader looked at what it pointed to. It is
now drawn for the selected annotation AND the hovered one: a selection's line
stays until another annotation is picked or the selection is cleared (the same
shape again, the same row again, or a tap on the image beside it), while hovering
another row still previews where that one is. The selected row is marked with an
accent bar and `aria-current`, so the selection is not colour-only, and it is
scrolled into view when the selection came from the image — respecting
`prefers-reduced-motion`.

**The connector carries its own contrast.** It crosses the image — arbitrary
pixels, and with `transparentBackground` not even a known colour — so a
single-colour line has no contrast guarantee whatever colour it is, and the drop
shadow it had softened that without solving it. It is now two-tone, the same
technique the image surface's focus ring uses and gated by the same pairing in
`pnpm test:contrast`: the ink stays `--tri-color-primary-text` over a wider casing
in `--tri-viewer-bg`, which clear 3:1 against each other in all four themes.
Whatever the image is doing underneath, one of the two stands off it. The selected
shape itself deepens its fill and thickens its border rather than gaining a third
indicator to keep legible.

New state: `ViewerState.activeAnnotationId` with `setActiveAnnotationId` (a
command member — the chrome selects annotations, so a plugin can; handed the id
already selected it clears). New subscription: `subscribeSurfaceTap`. The renderer
stand-in shipped at `triiiceratops/testing` gains `emitTap` so a plugin's tests can
drive selection with no DOM.

Drawing is four SVG elements however many connectors are on screen — every line a
subpath of one `d`, every end dot a zero-length subpath drawn as a round cap — so
a pan updates four attributes instead of re-rendering three elements per line per
frame. The element bundle's size baseline is re-recorded for the feature: +769
bytes gzipped (119,737 from 118,456).
