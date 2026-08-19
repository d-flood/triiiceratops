/**
 * First-party IIIF Presentation parsing over raw manifest JSON: how many
 * sequences a manifest has ({@link getSequenceCount}), which canvases are in
 * a given sequence ({@link getCanvasesForSequence}), and which painting
 * annotations are on a given canvas ({@link getPaintingAnnotations}). Both
 * the IIIF v2 and v3 shapes are handled directly.
 *
 * There is deliberately **no `Sequence` type** and no intermediate object
 * model. A canvas is the Canvas JSON as the manifest authored it.
 */

import { logger } from '../logging/logger';

/**
 * Coerce a field that should be an array into one.
 *
 * IIIF fields that the spec declares as arrays turn up in real manifests as
 * bare objects. Every array access over raw manifest JSON goes through here so
 * that a bare object degrades to a one-element list rather than throwing or
 * silently enumerating nothing, and an empty value degrades to no list at all.
 *
 * @internal Not exported from any package entry point. It appears in
 * `api-reports/core.api.md` because that report is a file-level rollup and a
 * sibling in this module is public — importing it from `triiiceratops` fails.
 */
export function asArray(value: unknown): any[] {
    if (Array.isArray(value)) return value;
    return value ? [value] : [];
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
 * Without this, a canvas that enumerates no painting annotations renders
 * blank and only logs at debug level, so the loss looks like the manifest
 * rather than a bug.
 *
 * Deliberately a developer warning and **not** an observable viewer error: a
 * degraded render should stay degraded rather than become a surfaced
 * failure. A canvas that legitimately paints nothing — IIIF Cookbook recipe
 * 0283, or an IxIF element whose media hangs off `rendering` — will trip
 * this, which is why it is a warning and not an error.
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
 * A IIIF Collection has members, not canvases. A v3 Collection's `items` are
 * its member Manifests, so the v3 branch below would otherwise enumerate
 * them as canvases; a Collection simply has no sequences.
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
 * `mediaSequences` is the IxIF spelling, checked *before* `sequences`.
 * `vendored/audio.json` carries both, so the order is load-bearing: reversing
 * it would enumerate that manifest's `sequences` instead of its `elements`.
 */
function rawSequences(manifest: any): any[] {
    if (!manifest || typeof manifest !== 'object') return [];
    if (isCollectionResource(manifest)) return [];

    // IIIF v2 (and IxIF).
    const sequences = manifest.mediaSequences ?? manifest.sequences;
    if (sequences) {
        // A `sequences` that is a bare object rather than an array occurs in
        // real manifests; degrade it to a one-element list rather than
        // enumerating nothing.
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
 * A `null` entry in the canvas list is dropped.
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
 * Both branches return **raw JSON** annotations. IIIF v2 reads
 * `canvas.images[]` directly. IIIF v3 flattens *every* AnnotationPage in the
 * canvas, in document order — reading only the first page silently drops
 * the rest on canvases that split their painting annotations across pages.
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
 * A `null` entry inside `images` or an AnnotationPage is skipped.
 *
 * Expects a Canvas. Handed a Manifest or Collection it will happily return
 * that resource's `items` — no caller can currently do so, but it is not
 * defended against.
 *
 * **Public API**, from `triiiceratops` and `triiiceratops/image-export`. It
 * is the supported way to enumerate a canvas's images.
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
 * `body` leaves a v2 annotation yielding nothing, so the viewer renders a
 * blank canvas with only a `logger.debug` line and no other signal.
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
 * `"@type": "oa:Choice"`.
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
 * IIIF v3 puts them all in `items` (`item` is accepted as an alias). IIIF v2
 * splits them: `default` holds the one to render initially and `item` holds
 * the rest, so the two are concatenated.
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

/**
 * A `behavior`/`viewingHint` field as a list of bare terms.
 *
 * Either spelling may be a single string or an array of them, and a term may
 * arrive fully qualified (`http://iiif.io/api/presentation/3#paged`) or
 * prefixed, so each is reduced to its last path/fragment segment, trimmed and
 * lowercased. Absent reads as no behaviors at all.
 *
 * The one reader of both spellings, everywhere: canvas hints
 * ({@link getCanvasBehaviors}), a range's `sequence` marker, and the
 * manifest-level viewing mode all resolve terms the same way.
 *
 * @internal Not exported from any package entry point. It appears in
 * `api-reports/core.api.md` because that report is a file-level rollup and a
 * sibling in this module is public — importing it from `triiiceratops` fails.
 */
export function toBehaviorList(value: unknown): string[] {
    return asArray(value).map((entry) => {
        const normalized = String(entry).trim().toLowerCase();
        const segments = normalized.split(/[#/:]/);
        return segments[segments.length - 1] || normalized;
    });
}

/**
 * @internal Not exported from any package entry point. It appears in
 * `api-reports/core.api.md` because that report is a file-level rollup and a
 * sibling in this module is public — importing it from `triiiceratops` fails.
 */
export function getCanvasBehaviors(canvas: any): string[] {
    // BOTH IIIF versions. `behavior` is the v3 spelling of a Canvas's own
    // display hints; `viewingHint` is the v2 spelling of the same idea.
    // `viewerControls.isSinglePageCanvas` looks for `non-paged`/`facing-pages`,
    // which is exactly what a v2 manifest writes as `"viewingHint": "non-paged"`
    // on a canvas — miss that spelling and a v2 book declaring a single-page
    // plate gets silently paired into a spread with its neighbour, showing the
    // wrong two pages from there on.
    //
    // v3 wins where a document somehow carries both: a manifest that has been
    // upgraded states its current intent in `behavior`, and a leftover
    // `viewingHint` is the stale copy.
    //
    // The first NON-EMPTY of the two, not the first truthy: `"behavior": []`
    // is an empty array, which is truthy, and it is exactly what a v2→v3
    // converter emits on every canvas while leaving `viewingHint` in place. A
    // truthiness test there discards the only hint the document carries and
    // re-pairs the single-page plate this function exists to keep unpaired.
    return (
        [
            toBehaviorList(canvas?.behavior),
            toBehaviorList(canvas?.viewingHint),
        ].find((list) => list.length > 0) ?? []
    );
}
