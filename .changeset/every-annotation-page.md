---
'triiiceratops': patch
---

fix: render every painting annotation on a IIIF v3 canvas, not just the ones on its first annotation page.

**This is a bug fix with a deliberate behavior change.** A v3 canvas holds its painting annotations inside one or more `AnnotationPage`s in `canvas.items`. Enumeration ran through `manifesto.js`'s `Canvas.getContent()`, which constructs an AnnotationPage from `items[0]` and stops: enumeration was **truncated to the first annotation page**, and every annotation on a second or later page was silently discarded. On an affected canvas the viewer rendered a partial image (a composite missing its other halves), the gallery thumbnail resolved from a truncated list, and a Choice authored on a later page was never offered. Nothing warned; the loss looked like the manifest.

The v3 branch of the shared painting-annotation enumerator is now first-party and flattens the annotations of **every** annotation page, in document order. Canvases with a single annotation page — the overwhelming majority — enumerate exactly the annotations they always did.

One known gap remains: the thumbnail gallery's "has choices" badge still inspects only the first annotation, so a Choice authored on a later page renders and is selectable but is not badged in the gallery.

Smaller consequences of the same rewrite:

- The pre-release IIIF 3.0-beta `content` spelling of `items` is still accepted, and now also reads past its first page.
- `items` given as a bare object rather than an array now enumerates instead of yielding nothing. Invalid per the spec, but it occurs in the wild.
- A v3 canvas that is plain JSON, with no `manifesto.js` accessors on it, now enumerates. Previously the v3 read required the library object.
- A `null` or `undefined` canvas now returns `[]` instead of throwing.
- A `null` entry inside an annotation page is skipped rather than yielding an empty annotation, so the enumerated count on such a page drops by one.

**For v3 canvases, painting annotations and their bodies are now raw IIIF JSON rather than `manifesto.js` objects — and this reaches public API.** The enumerator itself is not exported, but its output flows through:

- `resolveCanvasImage` and `resolveAllCanvasImages`
- `ResolvedCanvasImage.annotation` (the enumerated annotation verbatim) and `.resource` (a raw JSON body for v3)
- `getCanvasChoices`, whose v3 elements change from `AnnotationBody[]` to the raw JSON of the Choice's `items`

**TypeScript will not catch this.** All of these are typed `any`, so the compiler, the linter, and the API report stay silent. If you call a `manifesto.js` method on one of these values — `.getWidth()`, `.getLabel()`, `.getProperty()` — it breaks at runtime on v3 manifests with no build-time signal. Read them as plain IIIF JSON, or use core's exported version-neutral helpers. (IIIF v2 enumeration becomes raw JSON too, in the release note below.)

No motivation filtering is applied. In v3 non-painting content belongs in `canvas.annotations`, so filtering would only defend against already-malformed manifests while newly dropping annotations that simply omit `motivation`.
