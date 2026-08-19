/**
 * Raw IIIF Canvas JSON → the planner's canvas descriptors.
 *
 * This is the renderer's only contact with manifest shape, and it goes through
 * the existing first-party helper (`utils/resolveCanvasImage`): raw v2/v3 JSON
 * in, plain data out. No adapter, accessor, or parser-owned Canvas type is
 * reintroduced here.
 *
 * Geometry comes from the **manifest Canvas** `width`/`height`, never from an
 * image service: layout must cost no network requests, and manifest dimensions
 * win permanently for geometry so nothing shifts when tiles arrive later
 * (spec §Coordinate model and layout).
 */

import { getCanvasId } from '../utils/iiifIds';
import { isUnsupportedCanvasFor } from '../utils/paintingBodies';
import {
    getDeclaredCanvasDimensions,
    resolveAllCanvasImages,
    toImageSource,
} from '../utils/resolveCanvasImage';

import { UNSIZED_CANVAS_PLACEHOLDER } from './rendererDefaults';
import type { PlannerCanvas, PlannerImage } from './types';

type SelectedChoiceLookup = (canvasId: string) => string | undefined;

/**
 * The Canvas's own declared `thumbnail`, as a fixed URL — the first rung of the
 * **thumbnail tier**'s ladder (spec §Thumbnail resolution).
 *
 * Read straight off raw IIIF JSON: `thumbnail` is spelled the same in v2 and
 * v3, may be a bare string, a resource object, or an array of either, and the
 * resource's id is `id` in v3 and `@id` in v2. There is no `getThumbnail()`
 * accessor to fall back to, and this branch must not be replaced by an
 * image-service discovery fetch merely because the canvas arrives as raw JSON.
 *
 * Deliberately **not** `utils/getThumbnailSrc.resolveThumbnailResourceSrc`,
 * which is the thumbnail gallery's helper and answers a different question: it
 * prefers a URL constructed from the resource's image service at a size baked
 * in by its caller. The ladder wants the URL the publisher actually published —
 * used as-is, at whatever size they chose, costing no discovery — and reaches
 * its own rungs for a service, at a rung the projection decides.
 */
export function getDeclaredThumbnailUrl(canvas: unknown): string | null {
    const declared = (canvas as { thumbnail?: unknown } | null)?.thumbnail;
    const resource = Array.isArray(declared) ? declared[0] : declared;

    if (typeof resource === 'string') return resource || null;
    if (!resource || typeof resource !== 'object') return null;

    const entry = resource as Record<string, unknown>;
    const id = entry.id ?? entry['@id'];
    return typeof id === 'string' && id.length > 0 ? id : null;
}

/**
 * One raw Canvas → a planner canvas, or `null` if it paints nothing usable.
 *
 * **Every painting annotation, not the first one.** `resolveAllCanvasImages`
 * already returns them all, each with its `#xywh=` target normalized into a
 * placement box, and reading only `[0]` was two silent drops at once: the
 * second and later pictures of a composite canvas were never requested (IIIF
 * Cookbook recipe 0036 paints a miniature over a folio, and only the folio
 * appeared), and the placement was discarded, so even a single region-targeted
 * image was stretched across the whole canvas instead of into its rectangle
 * (user story 30). The previous renderer composed correctly because it fed
 * OpenSeadragon one tiled image per annotation, with its own `x`/`y`/`width`;
 * this is that same fact, expressed as data.
 *
 * The Image API region selector on a body is a different mechanism and is
 * unaffected: that one is a crop of the SOURCE and is already handled by
 * {@link toImageSource} as a prebuilt static request.
 *
 * A Canvas that declares no `width`/`height` is a spec violation the viewer
 * still has to render (user story 32), so it is **not** dropped here: it comes
 * back with `width`/`height` of `null`, which is the planner's signal to
 * position it from the median of its siblings and reposition it if an image
 * service later reports real dimensions. Guessing here instead would put the
 * guess out of reach of the reflow, since this function sees one canvas and
 * knows nothing about what a later fetch turns up.
 *
 * **A canvas core cannot paint is still a canvas.** Where the painting bodies
 * are all non-image — a video, a sound recording — the descriptor comes back
 * with no images at all, so the canvas keeps its layout rect and its place in
 * navigation and the thumbnail strip and gets the **unsupported presentation**
 * rather than vanishing (CONTEXT.md; ADR 0017). That is the one case an
 * imageless descriptor is returned for: a canvas that paints nothing at all, or
 * whose image bodies resolved to nothing requestable, is `null` here as it has
 * always been.
 */
export function toPlannerCanvas(
    canvas: unknown,
    getSelectedChoice?: SelectedChoiceLookup,
): PlannerCanvas | null {
    const declared = getDeclaredCanvasDimensions(canvas);
    const resolved = resolveAllCanvasImages(canvas, {
        getSelectedChoice,
        // Never reaches layout: this module reports such a canvas's geometry
        // as `null` and the planner supplies the real guess (a median of the
        // canvas's siblings, then a reflow from the image service). It is here
        // only so `resolveCanvasImage` — whose every other caller wants an
        // unsized canvas dropped — still hands back the source descriptor
        // rather than refusing outright.
        fallbackCanvasDimensions: UNSIZED_CANVAS_PLACEHOLDER,
    });

    const images: PlannerImage[] = [];
    resolved.forEach((image, index) => {
        const source = toImageSource(image);
        if (!source) return;

        images.push({
            // The annotation's POSITION, not its id: an annotation id is
            // optional in IIIF and duplicated in the wild, while a placement's
            // position on its canvas is total and stable. Composed with the
            // canvas id so the key is unique across the manifest rather than
            // only within one canvas.
            key: `${image.canvasId}#${index}`,
            source,
            x: image.x,
            y: image.y,
            width: image.width,
            height: image.height,
        });
    });

    if (images.length) {
        return {
            id: resolved[0].canvasId,
            width: declared?.width ?? null,
            height: declared?.height ?? null,
            images,
            thumbnailUrl: getDeclaredThumbnailUrl(canvas),
        };
    }

    // Nothing to paint, and which of the two reasons that is decides whether
    // the canvas survives — decided on what its painting bodies ARE rather than
    // on what resolution managed to do with them.
    //
    // A canvas whose bodies are all non-image has content the manifest
    // describes and core cannot show, which the reader is owed an honest
    // statement about. A canvas with an image body that resolved to nothing
    // requestable — no service, no id — is a broken image annotation, and the
    // viewer has always dropped it; announcing that as unsupported content
    // would be a lie about the manifest. A canvas with no painting bodies at
    // all (Cookbook recipe 0283, an IxIF element) is dropped for the same
    // reason.
    // Classified over the SELECTED body, the same one resolution just took: a
    // mixed Choice resting on its non-image alternative is a canvas core cannot
    // paint, and asking about the alternatives as authored answers `false` and
    // drops it (see `isUnsupportedCanvas`).
    const canvasId = getCanvasId(canvas);
    if (!canvasId || !isUnsupportedCanvasFor(getSelectedChoice, canvas))
        return null;

    // No `thumbnailUrl`, and its absence is deliberate rather than an omission.
    // A declared thumbnail on this canvas is a poster frame, and painting it in
    // the canvas rect would read as the film itself having loaded — the exact
    // dishonesty the unsupported presentation exists to avoid. Poster and
    // placeholder handling belongs to the AV plugin.
    return {
        id: canvasId,
        width: declared?.width ?? null,
        height: declared?.height ?? null,
        images,
    };
}

/**
 * The canvases getting the **unsupported presentation**, by id.
 *
 * A canvas with no images on it is one core cannot paint — that is
 * {@link toPlannerCanvas}' whole statement of the condition — unless a plugin
 * has **claimed** it, in which case the claimant renders its content and an
 * honest "core cannot show this" placard over the top of it would be a lie
 * (CONTEXT.md **Canvas claim**; ADR 0017).
 *
 * That is the claim's ENTIRE effect on rendering. The descriptors are untouched
 * by it, so a claimed composite canvas keeps painting its image bodies through
 * the whole tile pipeline, and layout, residency, and projection never learn
 * that a claim exists.
 *
 * `isClaimed` is consulted only for a canvas that would otherwise get the
 * treatment, which is what keeps this free on the image manifests that have no
 * such canvas at all.
 */
export function unsupportedPresentationIds(
    canvases: readonly PlannerCanvas[],
    isClaimed?: (canvasId: string) => boolean,
): Set<string> {
    const ids = new Set<string>();
    for (const canvas of canvases) {
        if (canvas.images.length === 0 && !isClaimed?.(canvas.id)) {
            ids.add(canvas.id);
        }
    }
    return ids;
}

/** Raw Canvases → planner canvases, dropping any that paint nothing usable. */
export function toPlannerCanvases(
    canvases: unknown[],
    getSelectedChoice?: SelectedChoiceLookup,
): PlannerCanvas[] {
    return canvases
        .map((canvas) => toPlannerCanvas(canvas, getSelectedChoice))
        .filter((canvas): canvas is PlannerCanvas => canvas !== null);
}
