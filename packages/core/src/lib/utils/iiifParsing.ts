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

import { logger } from '../logging/logger';

/**
 * Coerce a field that should be an array into one.
 *
 * IIIF fields that the spec declares as arrays turn up in real manifests as
 * bare objects, and `manifesto.js` tolerated that. Every array access in this
 * module goes through here so that a bare object degrades to a one-element list
 * rather than throwing or silently enumerating nothing.
 */
function asArray(value: unknown): any[] {
    if (Array.isArray(value)) return value;
    return value === null || value === undefined ? [] : [value];
}

/**
 * Canvases already warned about, so the cap below is one warning per manifest
 * rather than one per canvas. A 3,000-canvas book with a systemic authoring
 * quirk would otherwise emit 3,000 identical lines and bury the signal it
 * exists to provide.
 *
 * Keyed by canvas identity rather than by manifest because the enumerators are
 * pure functions over a canvas and never see the manifest. A `WeakSet` lets the
 * entry go when the canvas JSON does, so this cannot grow without bound across
 * manifest loads.
 */
const warnedCanvases = new WeakSet<object>();

/**
 * Warn once when a canvas is recognized as a canvas but yields no painting
 * annotations.
 *
 * This is the epic's signature failure mode made audible. When enumeration
 * returns nothing the viewer renders a blank canvas and logs at debug level, so
 * the loss looks like the manifest rather than like a bug — which is exactly
 * how a v2-blind read survived in this codebase for as long as it did.
 *
 * Deliberately a developer warning and **not** an observable viewer error: a
 * degraded render should stay degraded rather than become a surfaced failure
 * (SPEC → "Failure contract"). A canvas that legitimately paints nothing —
 * IIIF Cookbook recipe 0283, or an IxIF element whose media hangs off
 * `rendering` — will trip this, which is why it is a warning and not an error.
 */
function warnUnreadableCanvas(canvas: any): void {
    if (!canvas || typeof canvas !== 'object') return;
    if (warnedCanvases.has(canvas)) return;
    warnedCanvases.add(canvas);

    const id = canvas.id ?? canvas['@id'] ?? '(no id)';
    const spellings = ['images', 'items', 'content'].filter(
        (key) => canvas[key] !== undefined,
    );

    logger.warn(
        `[triiiceratops] Canvas ${id} yielded no painting annotations, so it will render blank. ` +
            (spellings.length
                ? `It declares ${spellings.map((s) => `\`${s}\``).join(' and ')}, but nothing readable inside. ` +
                  `IIIF v2 puts painting annotations in \`images[]\`; v3 puts them in AnnotationPages under \`items[]\`.`
                : `It declares none of \`images\`, \`items\` or \`content\`.`),
    );
}

/**
 * A IIIF Collection has members, not canvases. Handed to the manifest path it
 * used to throw a `TypeError` (`m.getSequences is not a function`), which
 * violates the failure contract — and, worse, a v3 Collection's `items` are its
 * member Manifests, so the v3 branch below would otherwise enumerate them as
 * canvases. Both are wrong; a Collection simply has no sequences.
 *
 * Deliberately inlined rather than imported from `utils/collections`, which
 * reaches `getThumbnailSrc` and back into this module.
 */
function isCollectionResource(resource: any): boolean {
    const type = resource?.type ?? resource?.['@type'];
    return type === 'Collection' || type === 'sc:Collection';
}

/**
 * The manifest's sequences, as the **raw JSON sub-objects the manifest already
 * holds**. Nothing is constructed and nothing is wrapped: this is not a
 * `Sequence` type, it never leaves this module, and its only two consumers are
 * the two exported functions below.
 *
 * ```
 * v2   mediaSequences ?? sequences        (IxIF first — priority, not fallback)
 * v3   items                              always exactly ONE sequence
 * ```
 *
 * `mediaSequences` is the IxIF spelling and `manifesto.js` checked it *before*
 * `sequences`. `vendored/audio.json` carries both, so the order is load-bearing
 * rather than theoretical: reversing it would enumerate that manifest's
 * `sequences` instead of its `elements`.
 *
 * The `??` pair is the ticket's spelling; the truthiness check that follows
 * reproduces `manifesto.js`'s `||`, so a present-but-falsy `sequences` still
 * falls through to the v3 read exactly as it did before.
 */
function rawSequences(manifest: any): any[] {
    if (!manifest || typeof manifest !== 'object') return [];
    if (isCollectionResource(manifest)) return [];

    // IIIF v2 (and IxIF).
    const sequences = manifest.mediaSequences ?? manifest.sequences;
    if (sequences) {
        // A `sequences` that is a bare object rather than an array occurs in
        // real manifests. `manifesto.js` walked it with an indexed loop, so it
        // enumerated nothing at all, silently — the epic's signature failure
        // mode. Degrading it to a one-element list is the fix ticket 07 owns.
        return asArray(sequences).filter((sequence) => !!sequence);
    }

    // IIIF v3 — one sequence, and it IS the `items` array.
    return manifest.items ? [manifest.items] : [];
}

/**
 * The canvases of one raw sequence.
 *
 * `canvases` is the IIIF v2 spelling and `elements` its IxIF alias. Neither
 * exists in IIIF v3, where the "sequence" is the manifest's `items` array
 * itself and therefore already the canvas list.
 *
 * A sequence object carrying neither — `vendored/illustrationsofchina.json`
 * has three, bare `@id`/`@type`/`label` references to external Sequence
 * documents — enumerates **nothing**, as it does today. Resolving one means an
 * HTTP fetch, and these functions are synchronous, total and pure over the JSON
 * the manifest cache already holds.
 */
function canvasesOfRawSequence(sequence: any): any[] {
    if (!sequence) return [];

    const canvases = sequence.canvases ?? sequence.elements;
    if (canvases) return asArray(canvases).filter((canvas) => !!canvas);

    // IIIF v3 only. An unresolved v2 sequence reference is an object, not an
    // array, and must enumerate nothing rather than pass itself off as a canvas.
    return Array.isArray(sequence) ? sequence.filter((canvas) => !!canvas) : [];
}

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
export function getSequenceCount(manifest: any): number {
    return rawSequences(manifest).length;
}

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
export function getCanvasesForSequence(manifest: any, index: number): any[] {
    const sequences = rawSequences(manifest);
    if (!sequences.length) return [];

    const clamped = Math.max(0, Math.min(index, sequences.length - 1));
    return canvasesOfRawSequence(sequences[clamped]);
}

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
export function getPaintingAnnotations(canvas: any): any[] {
    if (!canvas) return [];

    // IIIF v2 — `canvas.images[]`, read first-party.
    const images = asArray(canvas.images).filter((annotation) => !!annotation);
    if (images.length > 0) return images;

    // IIIF v3 — the annotations inside every AnnotationPage of the canvas.
    //
    // `content` was the IIIF 3.0-beta spelling of `items`; the library accepted
    // it, so dropping it would silently regress beta-era manifests.
    const pages = asArray(canvas.items ?? canvas.content);

    const annotations = pages.flatMap((page) =>
        asArray(page?.items).filter((annotation) => !!annotation),
    );

    if (annotations.length === 0) warnUnreadableCanvas(canvas);

    return annotations;
}

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
export function getPaintingBody(annotation: any): any {
    return annotation?.body || annotation?.resource || null;
}

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
export function isChoiceBody(body: any): boolean {
    if (!body || Array.isArray(body)) return false;
    const type = body.type || body['@type'];
    return type === 'Choice' || type === 'oa:Choice';
}

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
export function getChoiceAlternatives(body: any): any[] {
    if (!body) return [];

    return [
        ...asArray(body.default),
        ...asArray(body.items || body.item),
    ].filter((alternative) => !!alternative);
}

/**
 * @internal Not exported from any package entry point. It appears in
 * `api-reports/core.api.md` because that report is a file-level rollup and a
 * sibling in this module is public — importing it from `triiiceratops` fails.
 */
export function getCanvasChoices(canvas: any) {
    if (!canvas) return [];

    const images = getPaintingAnnotations(canvas);

    if (!images || !images.length) return [];

    for (const paintingAnno of images) {
        if (!paintingAnno) continue;

        // v3 spells the painting body `body`, v2 spells it `resource`, and the
        // Choice inside it is `Choice`/`items` in v3 and `oa:Choice`/`default`
        // + `item` in v2. Reading only the v3 half meant a v2 Choice canvas
        // offered no alternatives at all.
        const body = getPaintingBody(paintingAnno);

        if (!isChoiceBody(body)) continue;

        // Always an array, even when the manifest wrote `items` as a bare
        // object: the caller reads `.length`, so returning the object itself
        // dropped the choice group silently.
        const alternatives = getChoiceAlternatives(body);
        if (alternatives.length) {
            return alternatives;
        }
    }

    return [];
}

/** Either spelling's value as a list, dropping empties and non-values. */
function toBehaviorList(value: unknown): unknown[] {
    if (value === null || value === undefined || value === '') return [];
    return Array.isArray(value) ? value : [value];
}

/**
 * @internal Not exported from any package entry point. It appears in
 * `api-reports/core.api.md` because that report is a file-level rollup and a
 * sibling in this module is public — importing it from `triiiceratops` fails.
 */
export function getCanvasBehaviors(canvas: any): string[] {
    // BOTH IIIF versions. `behavior` is the v3 spelling of a Canvas's own
    // display hints; `viewingHint` is the v2 spelling of the same idea, and it
    // went unread until the renderer epic's multi-canvas layout needed it
    // (`.tracker/replace-openseadragon`, ticket 07).
    //
    // The gap was user-visible, which is why it is closed here rather than
    // recorded. `viewerControls.isSinglePageCanvas` looks for
    // `non-paged`/`facing-pages`, which is exactly what a v2 manifest writes as
    // `"viewingHint": "non-paged"` on a canvas — so a v2 book declaring a
    // single-page plate was silently paired into a spread with its neighbour,
    // and paged mode showed the wrong two pages from there on.
    //
    // v3 wins where a document somehow carries both: a manifest that has been
    // upgraded states its current intent in `behavior`, and a leftover
    // `viewingHint` is the stale copy.
    //
    // Read directly off raw JSON, deliberately: the rung this replaced was
    // `canvas.getBehavior()`, which `manifesto.js` defined on Range, Collection
    // and Manifest but NEVER on Canvas, so it was dead from the day it was
    // written — its removal was never evidence that either spelling was covered.
    //
    // The first NON-EMPTY of the two, not the first truthy: `"behavior": []`
    // is an empty array, which is truthy, and it is exactly what a v2→v3
    // converter emits on every canvas while leaving `viewingHint` in place. A
    // truthiness test there discards the only hint the document carries and
    // re-pairs the single-page plate this function exists to keep unpaired.
    const behaviors = [
        toBehaviorList(canvas?.behavior),
        toBehaviorList(canvas?.viewingHint),
    ].find((list) => list.length > 0);

    return (behaviors ?? []).map((value) => {
        const normalized = String(value).trim().toLowerCase();
        const segments = normalized.split(/[#/:]/);
        return segments[segments.length - 1] || normalized;
    });
}
