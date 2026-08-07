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
 */
export function approach(
    current: number,
    target: number,
    timeConstant: number,
    elapsed: number,
): number {
    if (timeConstant <= 0 || elapsed <= 0) return target;
    return target + (current - target) * Math.exp(-elapsed / timeConstant);
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
