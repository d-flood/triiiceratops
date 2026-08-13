---
'triiiceratops': minor
---

Add the **canvas claim**: a plugin takes ownership of one canvas's non-image content.

`viewerState.claimCanvas(canvasId, pluginId)` claims a canvas per viewer instance and returns an idempotent release. The claim suppresses exactly the **unsupported presentation** for that canvas and its audiovisual glyph in the thumbnail strip, leaving a clean box the claimant renders into through the existing overlay-layer and paint-hook substrates. It carries no payload, and nothing else changes: core keeps painting the canvas's image bodies through the whole tile pipeline — which is what makes a composite image+video canvas compose — and layout, navigation, residency, and coordinate projection are untouched. `viewerState.isCanvasClaimed(canvasId)` answers whether a canvas is held, and `viewerState.claimedCanvases` is the read-only claim set (a new `command` row in the state inventory, observable through `subscribe`).

`pluginId` must be the id the viewer knows the caller by — the activation's `surface.id`, the same id an overlay layer's is prefixed with. A claim naming anything else is refused on the structured `viewererror` channel with `code: 'canvas-claim-refused'`, as is a second claim on a canvas somebody already holds: the first claimant keeps it rather than being silently displaced. A claim is auto-released when its activation ends (cleanup, retry, unregister, teardown), so a departed plugin cannot suppress a treatment for the rest of the session. A claim against a canvas id the current manifest does not carry is inert, kept, and applies if that id appears.

Core's painting-body classifier is now public API — `isUnsupportedCanvas`, `isImageBody`, and `paintingBodyAlternatives` from `triiiceratops`. A claimant has to answer "is this canvas mine to claim", which is the same question core answers when it decides to show the unsupported treatment; exporting the functions core itself paints with is what keeps the two from drifting apart.

Plugin API 1.0.0 → 1.1.0: core declares its first real capability, `canvas-claim`. A plugin listing it in `requiredCapabilities` activates on this core and fails closed on one that predates the seam.
