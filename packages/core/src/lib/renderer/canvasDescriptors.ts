/**
 * Raw IIIF Canvas JSON → the planner's canvas descriptors.
 *
 * This is the renderer's only contact with manifest shape, and it goes through
 * the existing first-party helper (`utils/resolveCanvasImage`) exactly as the
 * `remove-manifesto` baseline requires: raw v2/v3 JSON in, plain data out. No
 * adapter, accessor, or parser-owned Canvas type is reintroduced here.
 *
 * Geometry comes from the **manifest Canvas** `width`/`height`, never from an
 * image service: layout must cost no network requests, and manifest dimensions
 * win permanently for geometry so nothing shifts when tiles arrive later
 * (spec §Coordinate model and layout).
 */

import {
    buildIiifImageRequestUrl,
    getDeclaredCanvasDimensions,
    getRegionString,
    resolveCanvasImage,
} from '../utils/resolveCanvasImage';

import type { PlannerCanvas, SourceDescriptor } from './types';

type SelectedChoiceLookup = (canvasId: string) => string | undefined;

/**
 * Stand-in dimensions for a Canvas that declares none.
 *
 * Their value is irrelevant and they never reach layout: this module reports
 * such a canvas's geometry as `null` and the planner supplies the real guess (a
 * median of the canvas's siblings, then a reflow from the image service). They
 * exist only so `resolveCanvasImage` — whose every other caller wants an
 * unsized canvas dropped — still hands back the source descriptor rather than
 * refusing outright. Square, and a plausible page size, so nothing downstream
 * that stumbles on them divides by something absurd.
 */
const UNSIZED_CANVAS_PLACEHOLDER = { width: 1000, height: 1000 };

/**
 * The Canvas's own declared `thumbnail`, as a fixed URL — the first rung of the
 * **thumbnail tier**'s ladder (spec §Thumbnail resolution).
 *
 * Read straight off raw IIIF JSON: `thumbnail` is spelled the same in v2 and
 * v3, may be a bare string, a resource object, or an array of either, and the
 * resource's id is `id` in v3 and `@id` in v2. There is no `getThumbnail()`
 * accessor to fall back to — the `remove-manifesto` epic removed it — and this
 * branch must not be replaced by an image-service discovery fetch merely
 * because the canvas no longer arrives wrapped.
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
 * One canvas's source descriptor.
 *
 * The ordering mirrors `getCanvasTileSource`, so which URL a canvas resolves to
 * does not change with the renderer:
 *
 * 1. a service **plus** an Image API region is a prebuilt image request — a
 *    single static image of the cropped region (spec, user story 30);
 * 2. a service alone is a `service` source, resolved by tickets 05/06;
 * 3. otherwise the painting resource's own id is a plain static image
 *    (user story 29) — the only kind this ticket paints.
 */
function toSourceDescriptor(
    resolved: NonNullable<ReturnType<typeof resolveCanvasImage>>,
): SourceDescriptor | null {
    if (resolved.serviceId && resolved.imageApiRegion) {
        return {
            kind: 'static',
            url: buildIiifImageRequestUrl(resolved.serviceId, {
                region: getRegionString(resolved.imageApiRegion),
                size: 'max',
            }),
        };
    }

    if (resolved.serviceId) {
        return {
            kind: 'service',
            serviceId: resolved.serviceId,
            profile: resolved.serviceProfile,
        };
    }

    if (resolved.resourceId) {
        return { kind: 'static', url: resolved.resourceId };
    }

    return null;
}

/**
 * One raw Canvas → a planner canvas, or `null` if it paints nothing usable.
 *
 * A Canvas that declares no `width`/`height` is a spec violation the viewer
 * still has to render (user story 32), so it is **not** dropped here: it comes
 * back with `width`/`height` of `null`, which is the planner's signal to
 * position it from the median of its siblings and reposition it if an image
 * service later reports real dimensions. Guessing here instead would put the
 * guess out of reach of the reflow, since this function sees one canvas and
 * knows nothing about what a later fetch turns up.
 */
export function toPlannerCanvas(
    canvas: unknown,
    getSelectedChoice?: SelectedChoiceLookup,
): PlannerCanvas | null {
    const declared = getDeclaredCanvasDimensions(canvas);
    const resolved = resolveCanvasImage(canvas, {
        getSelectedChoice,
        fallbackCanvasDimensions: UNSIZED_CANVAS_PLACEHOLDER,
    });
    if (!resolved) return null;

    const source = toSourceDescriptor(resolved);
    if (!source) return null;

    return {
        id: resolved.canvasId,
        width: declared?.width ?? null,
        height: declared?.height ?? null,
        source,
        thumbnailUrl: getDeclaredThumbnailUrl(canvas),
    };
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
