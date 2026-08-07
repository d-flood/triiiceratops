---
'triiiceratops': patch
---

fix: enumerate sequences and canvases first-party, and hand out canvases as raw IIIF Canvas JSON.

The last two library-backed enumerations in the manifest cache — how many sequences a manifest has, and which canvases are in a given sequence — are now first-party reads over the raw manifest JSON the cache already holds. IIIF v2 reads the manifest's sequences and each sequence's canvases; IIIF v3 yields exactly one sequence from `items`. The IxIF aliases are preserved deliberately: `mediaSequences` takes priority over `sequences`, and `elements` is accepted for `canvases`.

**Canvases handed out by viewer state are now plain IIIF Canvas JSON — v2 or v3 as the manifest authored it — rather than `manifesto.js` objects.** This reaches public API: `ViewerState.getCanvases`, `viewerState.canvases`, and every canvas passed to a plugin. Read them with ordinary property access, or with core's exported version-neutral helpers (`getCanvasId`, `getCanvasLabel`, `getCanvasChoices`, `resolveCanvasImage`). A v2 canvas spells its identifier `@id`, not `id`, and carries no accessor methods. **TypeScript will not catch this** — these values are typed `any`.

Behavior fixes that come with it:

- **A `sequences` written as a bare object rather than an array now enumerates.** `manifesto.js` walked it with an indexed loop, so such a manifest reported zero sequences and rendered a blank viewer with no error. Invalid per the spec; it occurs in the wild.
- **A IIIF Collection handed to the manifest path degrades instead of throwing.** It used to raise `TypeError: m.getSequences is not a function` out of manifest registration, leaving the viewer half-initialized. A Collection has members, not canvases, so it now enumerates none. Its `items` are member Manifests and are deliberately not reported as canvases.
- A `null` entry in a sequence's canvas list is skipped rather than throwing.
- **A canvas declaring an explicit `thumbnail` still uses it.** Thumbnail resolution reads the canvas's own `thumbnail` property directly. A `thumbnail` given as a bare URL string — legal in IIIF v2 — now resolves; the library wrapped it in an object with no id and produced nothing, so those canvases fell through to their first painting annotation.
- **Content-search hits on IIIF v2 canvases work again.** Search grouped hits by `canvas.id`, which only a v3 canvas has, so v2 hits matched no canvas once canvases became raw JSON. Both spellings are read.
- Search-result canvas labels resolve for IIIF v3 language maps, not only v2 strings.

Unchanged: multi-sequence v2 manifests and the sequence picker; structure-derived sequences (ranges with `behavior: "sequence"`), which still take priority over the manifest's own sequences and produce identical output; and out-of-range sequence-index clamping.

A v2 sequence that is a bare `@id`/`@type`/`label` reference to an external Sequence document still enumerates nothing, exactly as before. Resolving one requires an HTTP fetch, and manifest registration remains a pure store that neither parses nor walks.
