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
    getRegionString,
    resolveCanvasImage,
} from '../utils/resolveCanvasImage';

import type { PlannerCanvas, SourceDescriptor } from './types';

type SelectedChoiceLookup = (canvasId: string) => string | undefined;

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

/** One raw Canvas → a planner canvas, or `null` if it paints nothing usable. */
export function toPlannerCanvas(
    canvas: unknown,
    getSelectedChoice?: SelectedChoiceLookup,
): PlannerCanvas | null {
    const resolved = resolveCanvasImage(canvas, { getSelectedChoice });
    if (!resolved) return null;

    const source = toSourceDescriptor(resolved);
    if (!source) return null;

    return {
        id: resolved.canvasId,
        width: resolved.canvasWidth,
        height: resolved.canvasHeight,
        source,
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
