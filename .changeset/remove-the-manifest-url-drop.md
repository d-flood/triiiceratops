---
'triiiceratops': minor
---

Remove the drag-a-URL-onto-the-viewer interaction. Clean break on the retired config surface (pre-1.0, no deprecation shim): `enableDragDrop` is removed from `ViewerConfig`.

The interaction defaulted off, was enabled only by the in-repo demos, and was documented nowhere. It also accepted a base64url IIIF content state, so with it goes **the element's only built-in content-state delivery channel** — the element now ships none. Hosts compose one from public API: read the channel yourself (the `iiif-content` URL parameter, a drop handler, a paste), parse with `parseContentState`, and apply the resulting `{manifestId, canvasId?, region?}` through the `manifestId`, `canvasId`, and `initialCanvasRegion` properties, or through `viewerState`'s `setManifest`/`setCanvas`/`setInitialCanvasRegion`. That is a 1:1 field mapping and about four lines; it is what this repo's own demo does.
