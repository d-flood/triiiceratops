---
'triiiceratops': patch
'@triiiceratops/plugin-pdf-export': patch
---

Remove the `manifesto.js` dependency. IIIF Presentation 2 and 3 are now parsed first-party from the raw manifest JSON.

**Canvases from viewer state, and painting annotations and their bodies, are now plain IIIF JSON rather than library objects.** They are typed `any`, so TypeScript will not flag the change: read them as JSON, or use the exported helpers — `getPaintingAnnotations`, `getCanvasId`, `getCanvasLabel`, `resolveCanvasImage`.

Removed: `ManifestsState.getManifest`, `ManifestEntry.manifesto`, `ViewerState.manifest` (use `viewerState.manifestEntry?.json`), and `SearchProviderContext.manifest` (renamed `manifestJson`).

Fixed on the way: v3 canvases render every annotation page instead of only the first; v2 `oa:Choice`, `viewingHint`, and sequence-level `viewingDirection` are read at all; v2 painting annotations resolve their `resource` bodies; a Collection no longer throws when handed to the manifest path.

15.3 KB gzip smaller.
