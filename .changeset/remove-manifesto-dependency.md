---
'triiiceratops': major
'@triiiceratops/plugin-pdf-export': patch
---

**BREAKING:** remove the `manifesto.js` dependency, and with it four public members that handed out its parsed objects.

Nothing in the viewer called the library any more; this release deletes it, its transitive dependency tail, and the dual SSR/browser module-loading shim that existed **solely** because the package ships no `exports` map. IIIF Presentation 2 and 3 are parsed first-party, against the raw JSON the manifest cache already holds. No rendering behavior changes — the behavioral golden frozen before the migration does not move by a single record.

## Breaking changes

Each of these returned a `manifesto.js` object. **None was repurposed to return raw JSON.** Keeping the name over a different value would have left an identical `any` signature that no compiler, linter, or API report could see, and would have surfaced only as a runtime type error in your production build. They are deleted so your build fails where you can act on it.

- **`ManifestsState.getManifest(manifestId)` — REMOVED.** Use `getManifestEntry(manifestId)?.json` for the raw IIIF Manifest JSON.
- **`ManifestEntry.manifesto` — REMOVED.** The cache entry is now `{ json, error, isFetching }` and holds only the document as fetched.
- **`ViewerState.manifest` — REMOVED.** Use `viewerState.manifestEntry?.json`. This is the same removal one layer up, on the surface plugins and framework wrappers actually read.
- **`SearchProviderContext.manifest` → `manifestJson` — RENAMED.** A custom `searchProvider` now receives the manifest as raw IIIF JSON under a new name, for the same reason: the value changed, so the name changed with it. Read it with ordinary property access; a v2 manifest spells its identifier `@id` and hangs its canvases off `sequences[].canvases[]`.

`registerManifest` is unchanged in signature and remains a **pure store**: it does not parse, validate, or walk the manifest, and therefore cannot throw. Passing manifest JSON directly still works exactly as before.

## New public API

- **`getPaintingAnnotations(canvas)`**, from `triiiceratops` and `triiiceratops/image-export`. The supported way to enumerate a canvas's image-bearing annotations — IIIF v2 `images[]`, IIIF v3 the annotations inside *every* annotation page in `items[]`. It is total: it never throws and always returns an array. Without it there is no supported route to a canvas's images, and hand-rolling the removed `canvas.getContent()` / `canvas.getImages()` idiom now returns an empty list with no error.
- **`resolveLanguageValue(value, locale?)`**, from `triiiceratops/image-export`. One reader for all three shapes a IIIF label arrives in: a bare v2 string, a v2 `[{"@value","@language"}]` array, and a v3 language map.

## The canvas contract, stated

Canvases handed out by viewer state and passed to plugins are **raw IIIF Canvas JSON, v2 or v3 exactly as the manifest authored it** — no wrapper, no accessor methods. The manifest is likewise raw JSON at `viewerState.manifestEntry?.json`. All of it is typed `any`, so TypeScript will not tell you which version you are holding; read it with the version-neutral helpers (`getPaintingAnnotations`, `getCanvasId`, `getCanvasLabel`, `getThumbnailSrc`, `resolveCanvasImage`, `resolveAllCanvasImages`, `resolveLanguageValue`) rather than branching yourself. Documented under "The canvas contract" in the plugin-authoring guide.

## Everything else

- **Smaller download and a quieter audit.** 15.3 KB gzip of Presentation-API parsing leaves the bundle (measured: -15,643 B gzipped, -6.7%, on the IIFE element build), along with the library's transitive dependency tail.
- **SSR builds get simpler.** `state/manifestoRuntime.ts` and `state/manifestoRuntime.browser.ts` are gone, and so is the separate `state/manifestoRuntime.browser` bundle entry. There is no browser-versus-server module shim left in core.
- **The metadata panel reads both IIIF versions.** Its title, description, attribution, and rights/license reads reached the library's accessors, which were the only reader of the IIIF v2 spelling for four of them. They now read `label`, `description`, `attribution`, and `license` directly, alongside the v3 `summary`, `requiredStatement`, and `rights`.
- The PDF-export plugin reads its manifest label from raw JSON. No consumer-visible change.
