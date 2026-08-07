---
'triiiceratops': patch
---

fix: read IIIF v2 painting annotations first-party, and recognize the IIIF v2 `oa:Choice` spelling.

Enumerating a IIIF v2 canvas's images ran through `manifesto.js`'s `Canvas.getImages()`. It is now first-party and reads `canvas.images[]` directly, so painting-annotation enumeration no longer calls the library on either version.

**A v2 `oa:Choice` painting annotation now works.** IIIF v2 spells a Choice `"@type": "oa:Choice"` and splits its alternatives across `default` (the one to render) and `item[]`; IIIF v3 spells it `"type": "Choice"` with `items[]`. Only the v3 spelling had a reader, so a v2 Choice canvas offered no alternatives **and rendered nothing at all** — no image, no thumbnail, no error. Such a canvas now renders its `default`, offers all of its alternatives (default first, then `item[]`), honors the selection, and is badged in the thumbnail gallery.

Smaller consequences of the same rewrite:

- `images` given as a bare object rather than an array now enumerates instead of yielding nothing. Invalid per the spec, but it occurs in the wild — the same shape the corpus already carries for `sequences`.
- A `null` entry inside `images` is skipped rather than yielding an empty annotation that threw the moment anything read it.
- A v2 canvas that is plain JSON, with no `manifesto.js` accessors on it, now enumerates. Previously the v2 read required the library object.
- A `Choice` whose `items` is a bare object no longer throws a `TypeError` out through `getCanvasTileSources` and `getViewerTileSources`, neither of which has a `try`/`catch` on its path to the viewer, and is no longer silently dropped by `getCanvasChoices`.
- `getCanvasChoices` now always returns an array.

**For v2 canvases, painting annotations and their bodies are now raw IIIF JSON rather than `manifesto.js` objects — and this reaches public API**, exactly as the previous release note describes for v3. The same values are affected: `resolveCanvasImage`, `resolveAllCanvasImages`, `ResolvedCanvasImage.annotation` and `.resource`, and the elements of `getCanvasChoices`. A v2 annotation carries its image under `resource`, not `body`, and its identifiers under `@id`, not `id`; core's exported version-neutral helpers read both. **TypeScript will not catch this** — every one of these values is typed `any`.

`getCanvasChoices` also returns a freshly-built array rather than the manifest's own `items` array, because the v2 spelling has to concatenate `default` with `item[]`. The alternatives inside it are still the manifest's own objects.

Not changed: v2 `on` fragment targeting. A v2 composite canvas resolves all of its images, as it always did, but they are still all positioned at the canvas origin rather than at the `#xywh=` region each annotation names.
