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
 * The legal scale range: the zoom floor, and a ceiling a fixed factor above the
 * scale a fit lands at.
 *
 * ## The floor is the canvas against the viewport
 *
 * `minZoomFraction` is how small the canvas may get, as a fraction of the scale
 * at which it exactly **fits** — so at the shipped half, the canvas covers half
 * the viewport, with a quarter of it empty either side.
 *
 * "Half the viewport" needs an axis, and the fit has already chosen one:
 * `fitBounds` takes `min(width ratio, height ratio)`, so a fraction of it is a
 * fraction of whichever axis constrains the canvas. That is also why the two
 * spellings of the rule — half the viewport's width, or half its height — are one
 * number rather than two: `min(f·w/W, f·h/H)` is `f · min(w/W, h/H)`. The canvas
 * may well be under half the OTHER axis; a portrait page in a wide window is half
 * the height and a fraction of the width, and that is the intended reading.
 *
 * Measured against the live viewport every time it is asked, never stored, which
 * is what makes it hold on a phone and across a window resize: shrink the window
 * and the fit scale rises with it, so the floor follows.
 *
 * The fit reference is the current canvas (continuous mode) or the spread on
 * screen (every other mode) — see `layoutQueries.fitTargetBounds`. Deliberately
 * not the whole WORLD: fitting 800 folios is the one-pixel-per-page case, so a
 * floor derived from it would be no floor at all.
 *
 * ## Seeing the whole canvas is a guarantee, so the floor is capped at the fit
 *
 * `minZoom` is the renderer's **derived** floor — the scale at which the median
 * canvas reaches the box threshold, the point past which there is nothing left to
 * draw. It is kept as a backstop for a world whose canvases are so small that
 * half the fit is still below it, and it is capped at `fitScale`, because a
 * reader must always be able to zoom out far enough to see an entire canvas
 * whatever the viewport. A floor above the fit would make the home view itself
 * unreachable, which no threshold is allowed to do.
 *
 * The cap is also what keeps the range from collapsing. The floor and the ceiling
 * are derived from different things and the floor really could come out higher,
 * which would leave a viewer that can neither zoom in nor out with nothing
 * reported; bounded by the fit, and with `maxFactor` above 1, `min < max` always.
 *
 * `minZoom` of `0` means "no floor derived" — an empty world — and contributes a
 * nominal floor far below the ceiling rather than a real bound.
 */
export function zoomRange(
    fitScale: number,
    minZoom: number,
    maxFactor: number,
    minZoomFraction: number,
): { min: number; max: number } {
    const derived = minZoom > 0 ? minZoom : (fitScale * maxFactor) / 1e6;
    // Both guarded on a usable fit, because an unmeasured surface has no fit to
    // take a fraction of and none to be capped by: a floor invented from it
    // would clamp the first real frame.
    const readable = fitScale > 0 ? fitScale * minZoomFraction : 0;
    const wholeCanvas = fitScale > 0 ? fitScale : Infinity;
    const min = Math.min(Math.max(derived, readable), wholeCanvas);

    return { min, max: Math.max(fitScale, min) * maxFactor };
}

/**
 * Keep the world within reach of the viewport.
 *
 * Without this, pan is unbounded: a drag — and much more easily a flick, which
 * keeps travelling after the finger has left — can put the world arbitrarily
 * far off screen, at which point the viewer is a blank rectangle with no
 * affordance for getting back. The previous renderer constrained the pan on
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
 * The log-scale change per pixel of normalized `deltaY` that makes one wheel
 * notch multiply the zoom by `zoomPerNotch`.
 *
 * The wheel's natural unit is a rate per pixel, because that is what the event
 * supplies and what a trackpad's fractional deltas need. Nobody configures a
 * viewer in those units, though: `0.0025` says nothing about how far a notch
 * travels, while `1.15` says exactly. So the public knob is the per-notch
 * factor (`ViewerConfig.renderer.zoomPerWheelNotch`) and this converts it once,
 * at the edge, into the rate the accumulation actually uses.
 *
 * `notchPixels` is passed in rather than read from the shipped defaults, for
 * the same reason `normalizeWheelDelta` takes its units: tests must never
 * assert against a provisional number.
 *
 * A `zoomPerNotch` of 1 or less has no meaning — it would freeze the wheel or
 * invert it — and yields `0`, which callers read as "no zoom from the wheel".
 * Validation of the configured value belongs at the config edge; this stays
 * total so a bad number cannot produce a `NaN` scale.
 */
export function wheelZoomRate(
    zoomPerNotch: number,
    notchPixels: number,
): number {
    if (!Number.isFinite(zoomPerNotch) || zoomPerNotch <= 1) return 0;
    if (!Number.isFinite(notchPixels) || notchPixels <= 0) return 0;
    return Math.log(zoomPerNotch) / notchPixels;
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
