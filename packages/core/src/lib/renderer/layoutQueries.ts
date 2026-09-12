/**
 * Questions about a laid-out world, as pure functions.
 *
 * The planner produces a `LayoutRect[]`; the host, the painter, and the planner
 * itself then ask the same handful of things about it — where the world's
 * outer edge is, which canvas a point is on, which canvas a fit should target,
 * and how far a rect moved when a reflow re-laid the world out. Each of those
 * is a decision, each one has a wrong answer that is silent, and none of them
 * needs a DOM. They live here so they can be asserted in plain Node rather than
 * inferred from a Svelte component's behaviour in a browser.
 *
 * Nothing here holds state or reads the viewport: a caller passes the world and
 * the point it cares about.
 */

import type { CanvasSize } from '../types/viewport';
import type { Box } from './tilePyramid';
import type { LayoutRect, Point } from './types';

/**
 * The outer edge of every laid-out canvas, or `null` for an empty world.
 *
 * What **panning** is constrained against — deliberately, and unlike the fit
 * target below: scrolling the whole manifest is the point of continuous mode,
 * so the reachable area is the world even where a fit is measured on one page.
 */
export function worldBounds(layout: readonly LayoutRect[]): Box | null {
    if (layout.length === 0) return null;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const rect of layout) {
        minX = Math.min(minX, rect.x);
        minY = Math.min(minY, rect.y);
        maxX = Math.max(maxX, rect.x + rect.width);
        maxY = Math.max(maxY, rect.y + rect.height);
    }

    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Canvas-space distance from a point to the **nearest point of** a box — zero
 * when the box contains it.
 *
 * Distance to the box, deliberately not to its centre. A coarse tile is huge in
 * canvas space, so its centre can be far from the viewport centre while the tile
 * covers it: measured centre-to-centre, the base tile that guarantees the viewer
 * is never blank is scheduled *behind* dozens of current-level tiles at any
 * off-centre entry point (a deep link, a programmatic view), which is exactly
 * where blur-up is needed most.
 *
 * The same reasoning makes it the right measure for {@link nearestRect}: the
 * canvas a reader is looking at is the one under the viewport centre, whatever
 * its extent, and a centre-to-centre test picks a small neighbour over the tall
 * folio the centre is actually standing on.
 */
export function distanceToBox(point: Point, box: Box): number {
    const nearestX = Math.min(Math.max(point.x, box.x), box.x + box.width);
    const nearestY = Math.min(Math.max(point.y, box.y), box.y + box.height);

    return Math.hypot(point.x - nearestX, point.y - nearestY);
}

/**
 * The laid-out canvas a point is on, or the nearest one when it is on none —
 * `null` only for an empty world.
 *
 * Ties are broken by layout order, which makes the answer a pure function of
 * the world and the point: a point exactly between two folios always resolves
 * to the earlier one rather than to whichever the scan reached first.
 */
export function nearestRect(
    layout: readonly LayoutRect[],
    point: Point,
): LayoutRect | null {
    let best: LayoutRect | null = null;
    let bestDistance = Infinity;

    for (const rect of layout) {
        const distance = distanceToBox(point, rect);
        if (distance < bestDistance) {
            best = rect;
            bestDistance = distance;
        }
        // Nothing can beat standing on it, so a long manifest stops at the
        // folio under the point rather than measuring the 799 behind it.
        if (bestDistance === 0) break;
    }

    return best;
}

/** Whether a point is inside a box, used to answer `nearestRect` without a scan. */
export function boxContains(box: Box, point: Point): boolean {
    return (
        point.x >= box.x &&
        point.x <= box.x + box.width &&
        point.y >= box.y &&
        point.y <= box.y + box.height
    );
}

/**
 * The bounds a **fit** is measured against, and the reference the zoom ceiling
 * is derived from.
 *
 * In continuous mode that is the canvas under the viewport centre; in every
 * other mode it is the whole world, which there IS the spread on screen.
 *
 * The distinction only exists once continuous mode carries a whole manifest,
 * and it is not cosmetic. Fitting an 800-folio world puts every page at one
 * pixel across — below the box threshold, so the manifest opens on a screen
 * with nothing on it, and below the derived zoom floor, so the scale is not
 * even reachable.
 *
 * **Derived from the viewport, never from the viewer's current canvas.** In
 * continuous mode a drag, a flick, and a scroll change only the viewport: the
 * "current canvas" stays whatever the reader last *navigated* to, which after
 * a scroll from folio 1 to folio 400 is 399 folios behind the page on screen.
 * A fit keyed on it snaps the reader back there, and a zoom ceiling keyed on it
 * governs how far folio 400 may be zoomed from the size of a folio nobody can
 * see. Continuous mode also never falls back to the whole world here: that is
 * the collapse this function exists to remove, and it must not come back
 * through an error path (see {@link navigationTargetBounds}).
 */
export function fitTargetBounds(
    layout: readonly LayoutRect[],
    centre: Point,
    continuous: boolean,
): Box | null {
    if (!continuous) return worldBounds(layout);
    return nearestRect(layout, centre);
}

/**
 * The bounds **navigation** lands on: the canvas the viewer says is current.
 *
 * Distinct from {@link fitTargetBounds} because the two answer different
 * questions. Choosing folio 400 from the canvas list is a request to go there,
 * so it must fit that folio even though the viewport is still on folio 1;
 * pressing `0` after scrolling is a request to fit *what is on screen*, so it
 * must not travel at all.
 *
 * A current canvas that is not in the layout — dropped for having no usable id,
 * or a frame in which the viewer's canvas has changed and the planner's input
 * has not caught up yet — falls back to the canvas under the viewport centre,
 * **never** to the whole world. Fitting an 800-folio world for one frame sets
 * the zoom ceiling from a home scale a thousandth of the real one, and the
 * clamp then drags the live scale down to it: a silent, momentary miss that
 * leaves the reader stuck fully zoomed out.
 */
export function navigationTargetBounds(
    layout: readonly LayoutRect[],
    canvasId: string | null | undefined,
    centre: Point,
    continuous: boolean,
): Box | null {
    if (!continuous) return worldBounds(layout);

    const current = canvasId
        ? layout.find((rect) => rect.canvasId === canvasId)
        : undefined;

    return current ?? nearestRect(layout, centre);
}

/**
 * How far the world moved under the viewport when a reflow re-laid it out.
 *
 * A canvas the manifest never sized is laid out from a guess and re-laid out
 * when its `info.json` lands. In continuous mode every canvas after it is
 * positioned by a cumulative offset, so re-sizing canvas N moves canvases
 * N+1..799 — and a reader scrolling through a manifest with no declared
 * dimensions meets that on every folio, because every folio entering the
 * residency window fetches metadata. Uncompensated, the page jumps sideways
 * under the cursor each time; compensated, the reflow is invisible.
 *
 * The delta is measured on the canvas **under the viewport centre**, which is
 * the one the reader is looking at and therefore the one that must not move.
 * Everything else in the world is free to shift: the reflow really did change
 * where it is.
 *
 * Zero whenever the centre's canvas is absent from either layout — there is no
 * common reference to measure against, and guessing one would move a viewport
 * the reflow did not.
 */
export function reflowShift(
    before: readonly LayoutRect[],
    after: readonly LayoutRect[],
    centre: Point,
): Point {
    const anchor = nearestRect(before, centre);
    if (!anchor) return { x: 0, y: 0 };

    const moved = after.find((rect) => rect.canvasId === anchor.canvasId);
    if (!moved) return { x: 0, y: 0 };

    return { x: moved.x - anchor.x, y: moved.y - anchor.y };
}

/**
 * The canvas's own coordinate space, as it sits in the laid-out world.
 *
 * A **canvas-space** point runs from `(0, 0)` to the Canvas's declared
 * `width`/`height` — the space IIIF annotation geometry is persisted in, and
 * the only space the public API speaks. The world a layout rect lives in is a
 * different one: canvases are placed side by side there, and layout may have
 * normalized their sizes so that facing pages match.
 *
 * The mapping is therefore expressed as a **fraction of the rect**, not as a
 * shared unit: a point 30% across the Canvas is 30% across its rect, whatever
 * layout did to the rect's size. That is what makes these two functions correct
 * under `preserveCanvasScale` in both settings, rather than correct only when
 * layout happens to have left the sizes alone.
 *
 * A canvas whose manifest declares no dimensions is laid out from its siblings'
 * median, and its rect is then the only statement of its extent
 * anyone has — so its rect stands in for its declared size and the mapping
 * becomes the identity. That is a better answer than refusing to convert: the
 * viewer is already drawing the canvas at that size.
 */
export interface CanvasPlacement {
    rect: LayoutRect;
    /** The Canvas's declared width, or `null` when the manifest omits it. */
    width: number | null;
    /** The Canvas's declared height, or `null` when the manifest omits it. */
    height: number | null;
}

/** Canvas space → world space. */
export function canvasPointToWorld(
    point: Point,
    placement: CanvasPlacement,
): Point {
    const { rect } = placement;
    const width = usableExtent(placement.width, rect.width);
    const height = usableExtent(placement.height, rect.height);
    return {
        x: rect.x + (point.x / width) * rect.width,
        y: rect.y + (point.y / height) * rect.height,
    };
}

/** World space → canvas space. */
export function worldPointToCanvas(
    point: Point,
    placement: CanvasPlacement,
): Point {
    const { rect } = placement;
    const width = usableExtent(placement.width, rect.width);
    const height = usableExtent(placement.height, rect.height);
    return {
        x: ((point.x - rect.x) / rect.width) * width,
        y: ((point.y - rect.y) / rect.height) * height,
    };
}

/** Canvas space → world space, for a box. */
export function canvasBoxToWorld(box: Box, placement: CanvasPlacement): Box {
    const { rect } = placement;
    const width = usableExtent(placement.width, rect.width);
    const height = usableExtent(placement.height, rect.height);
    return {
        x: rect.x + (box.x / width) * rect.width,
        y: rect.y + (box.y / height) * rect.height,
        width: (box.width / width) * rect.width,
        height: (box.height / height) * rect.height,
    };
}

/** World space → canvas space, for a box. */
export function worldBoxToCanvas(box: Box, placement: CanvasPlacement): Box {
    const { rect } = placement;
    const width = usableExtent(placement.width, rect.width);
    const height = usableExtent(placement.height, rect.height);
    return {
        x: ((box.x - rect.x) / rect.width) * width,
        y: ((box.y - rect.y) / rect.height) * height,
        width: (box.width / rect.width) * width,
        height: (box.height / rect.height) * height,
    };
}

/**
 * World units per canvas unit for a placement — the one factor relating the
 * scale the public viewport API speaks (screen pixels per CANVAS unit) to the
 * scale the renderer's viewport holds (screen pixels per WORLD unit).
 *
 * `1` unless layout resized this canvas's rect, which it does for a facing-page
 * spread (median-height normalization) and whenever `preserveCanvasScale` is
 * off. It lives here, beside the point and box conversions, because it is the
 * SAME factor they apply: `getScale` and `zoomTo` on the host are inverses of
 * each other and both must agree with the coordinate helpers, and the way that
 * breaks is one caller applying the factor while another forgets — which reads
 * as `zoomTo(viewportScale)` quietly changing the zoom.
 */
export function canvasScaleFactor(placement: CanvasPlacement): number {
    const { rect } = placement;
    return rect.width / usableExtent(placement.width, rect.width);
}

/**
 * The extent of a placement's canvas space — the box a canvas-space point runs
 * from `(0, 0)` to.
 *
 * The declared size when the manifest gave a usable one, and the laid-out rect
 * otherwise. It is the same {@link usableExtent} the point and box conversions
 * divide by, named so callers outside this module can ask what canvas space a
 * dimensionless canvas actually has: the geometry ladder's answer, not a guess
 * of their own.
 */
export function canvasExtent(placement: CanvasPlacement): CanvasSize {
    const { rect } = placement;
    return {
        width: usableExtent(placement.width, rect.width),
        height: usableExtent(placement.height, rect.height),
    };
}

/**
 * The declared extent when the manifest gave a usable one, and the laid-out
 * extent otherwise. Guards a zero or negative declared size too — a manifest
 * can carry `"width": 0`, and dividing by it would silently produce infinities
 * that travel a long way before anyone notices.
 */
function usableExtent(declared: number | null, laidOut: number): number {
    return declared !== null && declared > 0 ? declared : laidOut;
}
