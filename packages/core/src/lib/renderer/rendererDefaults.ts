/**
 * The renderer's shipped defaults.
 *
 * Every numeric threshold here is **provisional** (spec §Further Notes). They
 * are defensible starting points, not measurements, and they are planner inputs
 * precisely so they can be tuned without restructuring anything. Tests supply
 * their own values rather than asserting these, so tuning them can never
 * silently rewrite what a test proves.
 */

import type { PlannerBudgets } from './types';

export const DEFAULT_BUDGETS: PlannerBudgets = {
    /** Decoded-pixel ceiling for the opportunistic cache; desktop figure. */
    byteBudget: 256 * 1024 * 1024,
    /** The viewport rect inflated by this factor is the residency margin. */
    marginFactor: 1.5,
    /** `effectiveSize` in CSS px at or above which a canvas holds a pyramid. */
    pyramidThreshold: 320,
    /** `effectiveSize` in CSS px below which a canvas is a layout rect only. */
    boxThreshold: 24,
    /**
     * Carried forward from OpenSeadragon unchanged, unlike every other number
     * here: it governs level promotion, so changing it would visibly shift
     * sharpness-versus-speed at the same time as the renderer swap and make
     * "is this better?" unanswerable.
     */
    minPixelRatio: 0.5,
};

/**
 * The bounded in-flight tile window.
 *
 * The OpenSeadragon path caps concurrency at nothing at all (`imageLoaderLimit:
 * 0`) while requesting at most one new tile per frame (`maxTilesPerFrame: 1`) —
 * slow to ask, then all at once. A window is the other way round: ask for
 * everything immediately, let at most this many be outstanding.
 */
export const TILE_IN_FLIGHT_LIMIT = 6;

/**
 * How many times a tile URL may fail before it is permanently dead. Two is one
 * retry — enough for a blip, and short of re-requesting a 404 every frame it is
 * visible.
 */
export const TILE_MAX_ATTEMPTS = 2;

/**
 * Backing-store cap. Above 2 the extra pixels cost memory and fill rate far out
 * of proportion to what anyone can see (spec §Rendering backend).
 */
export const MAX_DEVICE_PIXEL_RATIO = 2;

/**
 * Wheel-zoom time constant, in seconds: the time in which the remaining log-scale
 * distance falls to 1/e. Short — wheel input is animated, but only just, so it
 * reads as smoothing rather than as lag.
 *
 * There is deliberately **no** trackpad-versus-mouse detection: all wheel input
 * is animated with this one constant. The usual heuristics are unreliable and
 * the branch is a permanent source of hardware-specific bugs.
 */
export const WHEEL_TIME_CONSTANT = 0.09;

/** Log-scale change per unit of `WheelEvent.deltaY` (pixel delta mode). */
export const WHEEL_ZOOM_RATE = 0.0025;

/**
 * Pixels one `DOM_DELTA_LINE` unit stands for.
 *
 * A mouse-wheel notch is ~100 px in pixel mode and 3 lines in line mode
 * (Firefox on a classic wheel), so a third of that keeps one notch worth the
 * same zoom everywhere. See `viewportMath.normalizeWheelDelta` — this is the
 * unit the event declares, not a guess about the hardware.
 */
export const WHEEL_LINE_PIXELS = 100 / 3;

/**
 * Pixels one `DOM_DELTA_PAGE` unit stands for. Rare (mostly assistive and
 * remote-desktop stacks); a page is treated as a screenful of lines.
 */
export const WHEEL_PAGE_PIXELS = WHEEL_LINE_PIXELS * 24;

/**
 * How far past a whole-canvas fit the viewer may zoom in, as a multiple of the
 * fit scale. Generous: the point of a deep-zoom viewer is to exceed 1:1 on a
 * high-resolution scan.
 */
export const MAX_ZOOM_FACTOR = 128;
