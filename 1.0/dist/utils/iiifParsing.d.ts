/**
 * First-party IIIF Presentation parsing.
 *
 * This module is the parsing surface the `remove-manifesto` epic replaces
 * `manifesto.js` with: how many sequences a manifest has
 * ({@link getSequenceCount}), which canvases are in a given sequence
 * ({@link getCanvasesForSequence}), and which painting annotations are on a
 * given canvas ({@link getPaintingAnnotations}). Three total functions over raw
 * JSON; both the IIIF v2 and the IIIF v3 branch of each are first-party and
 * nothing here calls `manifesto.js`.
 *
 * There is deliberately **no `Sequence` type** and no intermediate object model
 * of any kind. A canvas is the Canvas JSON as the manifest authored it. The
 * Manifest → Sequence → Canvas hierarchy exists in the library only to hide the
 * version difference, and recreating it is the shortest path back to the object
 * model this epic removes (SPEC → "The parsing surface").
 */
/**
 * How many sequences a manifest has.
 *
 * IIIF v2 manifests may declare several and the viewer surfaces them in a
 * sequence picker; IIIF v3 has exactly one, from `items`. Anything that is not
 * a manifest — a Collection, `null`, a string — has none.
 *
 * **Total.** Never throws.
 *
 * @internal Not exported from any package entry point. It appears in
 * `api-reports/core.api.md` because that report is a file-level rollup and a
 * sibling in this module is public — importing it from `triiiceratops` fails.
 */
export declare function getSequenceCount(manifest: any): number;
/**
 * The canvases in one of a manifest's sequences, as **raw IIIF Canvas JSON**,
 * v2 or v3 as the manifest authored it.
 *
 * `index` is **clamped** into range rather than returning empty, which is the
 * existing behavior of the manifest cache: a viewer holding a stale
 * `selectedSequenceIndex` shows the last sequence, not a blank page.
 *
 * A `null` entry in the canvas list is dropped. `manifesto.js` threw on one in
 * its `Canvas` constructor; a total function cannot.
 *
 * **Total.** Never throws, always returns an array.
 *
 * @internal Not exported from any package entry point. It appears in
 * `api-reports/core.api.md` because that report is a file-level rollup and a
 * sibling in this module is public — importing it from `triiiceratops` fails.
 */
export declare function getCanvasesForSequence(manifest: any, index: number): any[];
/**
 * Enumerate a canvas's painting annotations — the annotations that place image
 * content onto the canvas (IIIF v2 `canvas.images[]`; v3 the annotations inside
 * the AnnotationPages in `canvas.items[]`).
 *
 * These are *not* the commentary annotations returned by
 * `ensureCanvasAnnotations`; see CONTEXT.md → **Painting annotation**.
 *
 * Both branches are first-party and return **raw JSON** annotations. IIIF v2
 * reads `canvas.images[]` directly rather than through `manifesto.js`'s
 * `getImages()`. IIIF v3 flattens *every* AnnotationPage in the canvas, in
 * document order; `manifesto.js`'s `getContent()` read only the first page and
 * silently discarded the rest, which is a data-loss bug on canvases that split
 * their painting annotations across pages.
 *
 * A v2 annotation carries its image under `resource`, a v3 one under `body`.
 * Consumers must read **both** spellings — see `getPaintingBody`.
 *
 * No motivation filtering is applied: in v3 non-painting content belongs in
 * `canvas.annotations`, so filtering would only defend against already-malformed
 * manifests while newly dropping annotations that simply omit `motivation`.
 *
 * **Total.** Never throws, always returns an array. Every array access is
 * guarded, because a field the spec declares as an array turns up in real
 * manifests as a bare object — `images`, `items` and `content` all degrade to a
 * one-element list rather than throwing or enumerating nothing.
 *
 * A `null` entry inside `images` or an AnnotationPage is skipped, so such a
 * canvas enumerates fewer annotations than the library reported. The library
 * produced an `Annotation` wrapping nothing, which resolved to no resource
 * downstream; the rendered result is the same, the count is not.
 *
 * Expects a Canvas. Handed a Manifest or Collection it will happily return that
 * resource's `items` — no caller can currently do so, but it is not defended
 * against.
 *
 * **Public API**, from `triiiceratops` and `triiiceratops/image-export`. It is
 * the supported way to enumerate a canvas's images: without it an integrator
 * has no route to them and reimplements the removed `canvas.getContent()` /
 * `canvas.getImages()` idiom, which now returns nothing at all, silently
 * (SPEC → "The parsing surface").
 *
 * The annotations it returns are raw JSON. **A v2 annotation carries its image
 * under `resource` and a v3 one under `body`** — read both spellings, or use
 * `resolveCanvasImage` / `resolveAllCanvasImages` from
 * `triiiceratops/image-export` to go straight to resolved image URLs.
 */
export declare function getPaintingAnnotations(canvas: any): any[];
/**
 * The raw painting body of an annotation — the resource it places on the
 * canvas.
 *
 * **IIIF v2 spells this `resource`; IIIF v3 spells it `body`.** Reading only
 * `body` is the epic's named silent-failure mode: a v2 annotation then yields
 * nothing, and the viewer renders a blank canvas with a `logger.debug` line and
 * no other signal (SPEC → "The governing rule for the whole epic").
 *
 * Takes a **raw JSON** annotation, as `getPaintingAnnotations` returns.
 *
 * Returns `null` when the annotation carries neither spelling.
 *
 * @internal Not exported from any package entry point. It appears in
 * `api-reports/core.api.md` because that report is a file-level rollup and a
 * sibling in this module is public — importing it from `triiiceratops` fails.
 */
export declare function getPaintingBody(annotation: any): any;
/**
 * Is this raw painting body a Choice — a set of alternatives the viewer offers
 * the user rather than a single image?
 *
 * Both spellings are recognized: IIIF v3's `"type": "Choice"` and IIIF v2's
 * `"@type": "oa:Choice"`. The v2 one had no reader at all before this.
 *
 * @internal Not exported from any package entry point. It appears in
 * `api-reports/core.api.md` because that report is a file-level rollup and a
 * sibling in this module is public — importing it from `triiiceratops` fails.
 */
export declare function isChoiceBody(body: any): boolean;
/**
 * The alternatives a Choice body offers, in the order the viewer should offer
 * them — the default first.
 *
 * IIIF v3 puts them all in `items` (`item` is accepted as an alias, as it was
 * before). IIIF v2 splits them: `default` holds the one to render initially and
 * `item` holds the rest, so the two are concatenated.
 *
 * Guarded against a bare object in place of the array, per the spec's failure
 * contract — an unguarded `items.find(...)` on one throws all the way out
 * through `getViewerTileSources`, which has no `try`/`catch` anywhere on its
 * path.
 *
 * Returns `[]` for anything that is not a Choice-shaped object.
 *
 * @internal Not exported from any package entry point. It appears in
 * `api-reports/core.api.md` because that report is a file-level rollup and a
 * sibling in this module is public — importing it from `triiiceratops` fails.
 */
export declare function getChoiceAlternatives(body: any): any[];
/**
 * @internal Not exported from any package entry point. It appears in
 * `api-reports/core.api.md` because that report is a file-level rollup and a
 * sibling in this module is public — importing it from `triiiceratops` fails.
 */
export declare function getCanvasChoices(canvas: any): any[];
/**
 * @internal Not exported from any package entry point. It appears in
 * `api-reports/core.api.md` because that report is a file-level rollup and a
 * sibling in this module is public — importing it from `triiiceratops` fails.
 */
export declare function getCanvasBehaviors(canvas: any): string[];
