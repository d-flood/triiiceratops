/**
 * The coordinate model, as pure functions.
 *
 * Two spaces, one number relating them:
 *
 * - **canvas space** — manifest Canvas pixel coordinates. Annotation geometry
 *   is already persisted here, so keeping it as the renderer's world space is
 *   what makes annotation geometry correct by construction.
 * - **screen space** — CSS pixels within the viewport element.
 *
 * `Viewport.scale` is screen pixels per canvas-space unit, and `Viewport.centre`
 * is the canvas-space point at the middle of the viewport. Everything else here
 * follows from those two.
 *
 * This module is DOM-free on purpose: the geometric e2e assertions
 * (`tests/helpers/numberedGrid.ts`) check what the *painter* did with these
 * numbers, and these unit tests check the numbers themselves. Together that is
 * what catches coordinate-transform regressions without a screenshot diff.
 */

import type { Point, Viewport } from './types';

/** Canvas space → screen space. */
export function canvasToScreen(point: Point, viewport: Viewport): Point {
    return {
        x: (point.x - viewport.centre.x) * viewport.scale + viewport.width / 2,
        y: (point.y - viewport.centre.y) * viewport.scale + viewport.height / 2,
    };
}

/** Screen space → canvas space. The exact inverse of {@link canvasToScreen}. */
export function screenToCanvas(point: Point, viewport: Viewport): Point {
    return {
        x: (point.x - viewport.width / 2) / viewport.scale + viewport.centre.x,
        y: (point.y - viewport.height / 2) / viewport.scale + viewport.centre.y,
    };
}

export function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

/**
 * The scale at which a canvas-space box exactly fits inside the viewport, and
 * the centre that puts it in the middle.
 */
export function fitBounds(
    bounds: { x: number; y: number; width: number; height: number },
    size: { width: number; height: number },
): { centre: Point; scale: number } {
    const scale =
        bounds.width > 0 && bounds.height > 0
            ? Math.min(size.width / bounds.width, size.height / bounds.height)
            : 1;

    return {
        centre: {
            x: bounds.x + bounds.width / 2,
            y: bounds.y + bounds.height / 2,
        },
        scale,
    };
}

/**
 * Keep the world within reach of the viewport.
 *
 * Without this, pan is unbounded: a drag — and much more easily a flick, which
 * keeps travelling after the finger has left — can put the world arbitrarily
 * far off screen, at which point the viewer is a blank rectangle with no
 * affordance for getting back. The OpenSeadragon path constrained the pan on
 * release; this constrains it continuously, so the image never leaves at all
 * rather than springing back afterwards.
 *
 * `visibilityRatio` is the fraction of the **smaller** of the two extents (the
 * world's or the viewport's, per axis) that must stay in view. Taking the
 * smaller of the two is what makes one rule cover both regimes: zoomed in, the
 * world is larger than the viewport and the rule keeps the viewport covered;
 * zoomed out, the viewport is larger and the rule keeps the world on screen.
 * At `1` the world may never part from the viewport edge at all.
 *
 * The allowed centre range is never empty for `0 <= visibilityRatio <= 1`, so
 * this always has an answer and never oscillates.
 */
export function constrainCentre(
    centre: Point,
    scale: number,
    world: { x: number; y: number; width: number; height: number },
    size: { width: number; height: number },
    visibilityRatio: number,
): Point {
    if (!(scale > 0) || world.width <= 0 || world.height <= 0) return centre;

    return {
        x: constrainAxis(
            centre.x,
            world.x,
            world.width,
            size.width / scale,
            visibilityRatio,
        ),
        y: constrainAxis(
            centre.y,
            world.y,
            world.height,
            size.height / scale,
            visibilityRatio,
        ),
    };
}

/**
 * One axis of {@link constrainCentre}. `window` is the visible extent in
 * canvas space (screen extent ÷ scale).
 */
function constrainAxis(
    centre: number,
    worldMin: number,
    worldExtent: number,
    window: number,
    visibilityRatio: number,
): number {
    if (window <= 0 || !Number.isFinite(window)) return centre;

    const required = visibilityRatio * Math.min(worldExtent, window);
    const worldMax = worldMin + worldExtent;
    // The viewport spans [centre - window/2, centre + window/2]; requiring its
    // overlap with [worldMin, worldMax] to be at least `required` is these two
    // bounds, rearranged.
    const low = worldMin + required - window / 2;
    const high = worldMax - required + window / 2;

    return clamp(centre, low, high);
}

/**
 * Zoom about a screen point: the canvas-space point under `anchor` stays under
 * `anchor` (spec §Input and animation, user story 7).
 *
 * Returns the centre the viewport must adopt at `nextScale` for that to hold.
 * Expressed as a pure function rather than as a mutation inside the wheel
 * handler so it can be asserted without a browser, and so the same anchoring is
 * reused by double-click zoom (ticket 10) and pinch without being reimplemented.
 */
export function anchoredZoomCentre(
    viewport: Viewport,
    anchor: Point,
    nextScale: number,
): Point {
    const world = screenToCanvas(anchor, viewport);

    // Solve `canvasToScreen(world, {…viewport, scale: nextScale, centre}) ===
    // anchor` for `centre`.
    return {
        x: world.x - (anchor.x - viewport.width / 2) / nextScale,
        y: world.y - (anchor.y - viewport.height / 2) / nextScale,
    };
}

/**
 * One step of a frame-rate-independent exponential approach to a target.
 *
 * `timeConstant` is the time (in the same unit as `elapsed`) in which the
 * remaining distance falls to 1/e. Using elapsed time rather than a per-frame
 * fraction is what keeps the motion identical at 60 and 120 Hz.
 *
 * A zero (or negative) `elapsed` is a **no-op**: no time has passed, so nothing
 * has moved, and `current` is returned unchanged. This is not a pedantic edge
 * case — a `requestAnimationFrame` callback scheduled from an input handler is
 * given a timestamp from the frame that was already in flight, which can be
 * *earlier* than the `performance.now()` the handler read, so the animation's
 * very first step routinely has a non-positive elapsed. Returning `target`
 * there would snap instantly and skip the easing altogether.
 *
 * A non-positive `timeConstant` is different: it means "no smoothing at all",
 * for which arriving immediately is the correct answer.
 */
export function approach(
    current: number,
    target: number,
    timeConstant: number,
    elapsed: number,
): number {
    if (timeConstant <= 0) return target;
    if (elapsed <= 0) return current;
    return target + (current - target) * Math.exp(-elapsed / timeConstant);
}

/**
 * `WheelEvent.deltaY` expressed in **pixels**, whatever unit the event used.
 *
 * `deltaMode` is part of the wheel event's contract and says what its deltas
 * count: `0` pixels, `1` lines, `2` pages. Firefox on a mouse wheel reports
 * lines — roughly 3 per notch, where the pixel mode of the same notch is around
 * 100 — so consuming `deltaY` raw would zoom about a fortieth as far per notch
 * there as elsewhere.
 *
 * This is a *unit conversion declared by the event*, not the trackpad-versus-
 * mouse sniffing the spec bans (`rendererDefaults.WHEEL_TIME_CONSTANT`): all
 * wheel input is still animated by the same constant, and nothing here inspects
 * the hardware, the platform, or the user agent.
 *
 * `linePixels` and `pagePixels` are passed in rather than read from the shipped
 * defaults so tests never assert against provisional numbers.
 */
export function normalizeWheelDelta(
    delta: number,
    deltaMode: number,
    linePixels: number,
    pagePixels: number,
): number {
    if (!Number.isFinite(delta)) return 0;
    // `1` and `2` are DOM_DELTA_LINE and DOM_DELTA_PAGE. Anything else —
    // including DOM_DELTA_PIXEL and any future mode — is treated as pixels,
    // which is the only mode that needs no conversion.
    if (deltaMode === 1) return delta * linePixels;
    if (deltaMode === 2) return delta * pagePixels;
    return delta;
}

/**
 * Interpolate scale in **log space**, so zooming feels uniform rather than
 * lurching: a step from 1× to 2× and a step from 8× to 16× take the same time
 * and cover the same perceived distance (spec §Input and animation).
 */
export function approachScale(
    current: number,
    target: number,
    timeConstant: number,
    elapsed: number,
): number {
    if (current <= 0 || target <= 0) return target;
    return Math.exp(
        approach(Math.log(current), Math.log(target), timeConstant, elapsed),
    );
}
