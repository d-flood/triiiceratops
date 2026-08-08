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

/**
 * Ceiling, in bytes, on everything the tile scheduler holds decoded — the
 * required set plus the **opportunistic cache**.
 *
 * In BYTES rather than in tiles, deliberately: a count-based cache varies its
 * footprint by more than an order of magnitude with a server-side tile-size
 * choice it does not control, which is what the path this replaces did.
 */
export const DESKTOP_BYTE_BUDGET = 128 * 1024 * 1024;

/**
 * The same ceiling on a phone, where the browser will kill a tab for far less
 * (spec, user story 13) and decoded images do not show up in any heap metric
 * that would have warned first.
 */
export const MOBILE_BYTE_BUDGET = 48 * 1024 * 1024;

/**
 * The media query that picks between the two ceilings.
 *
 * A statement about the INPUT, not about the user agent: this is the one
 * question a device sniff would have been asked, and `(pointer: coarse)` is the
 * only form of it the platform answers honestly. The spec deletes the
 * OpenSeadragon path's device-sniffing *drawer* selection outright; a memory
 * ceiling is a different question, and it is one the platform has an API for.
 */
export const MOBILE_BUDGET_QUERY = '(pointer: coarse) and (hover: none)';

/**
 * Which byte ceiling this device gets.
 *
 * Takes the matcher rather than reaching for `window.matchMedia` itself, so it
 * is a pure function with an ordinary unit test and so nothing in the
 * renderer's module graph touches a browser global at module scope — the
 * whole of what SSR-safety reduces to for first-party code.
 */
export function resolveByteBudget(matches: (query: string) => boolean): number {
    return matches(MOBILE_BUDGET_QUERY)
        ? MOBILE_BYTE_BUDGET
        : DESKTOP_BYTE_BUDGET;
}

export const DEFAULT_BUDGETS: PlannerBudgets = {
    /**
     * The desktop ceiling. The host replaces it with
     * {@link resolveByteBudget}'s answer once it has a window to ask; this is
     * what a caller that never mounts (the server) would have used.
     */
    byteBudget: DESKTOP_BYTE_BUDGET,
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
    /**
     * 16 megapixels — 64 MB decoded — for one **size-ladder source** rung.
     *
     * Comfortably above an ordinary manuscript scan (a 4000x3000 page is 12 MP,
     * and must not be capped) and far below the 100+ megapixel level0 scans that
     * are the reason this exists at all.
     */
    maxDecodedPixels: 16 * 1024 * 1024,
};

/**
 * The gutter between adjacent canvases, as a fraction of the median laid-out
 * canvas extent along the axis the world flows in.
 *
 * The same 1.25% the OpenSeadragon path lays out with — that path's world is
 * normalized so a canvas is one unit wide, and its gap is the literal 0.0125 in
 * `components/osdLayout`. Expressed as a fraction here because this renderer's
 * world is canvas space, where the same number would be a sub-pixel hairline.
 *
 * Deliberately NOT a member of {@link DEFAULT_BUDGETS}: it decides where
 * canvases are, and a ticket tuning the byte and threshold budgets must not
 * move the layout as a side effect.
 */
export const MULTI_CANVAS_GAP_FRACTION = 0.0125;

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
 * The bounded in-flight `info.json` window.
 *
 * The tier and the view-stable gate decide WHICH canvases may ask; this decides
 * how many may ask at once, and without it the two together are only a delay.
 * At the derived zoom floor roughly fifty canvases sit in the residency window,
 * every one of them is thumbnail tier, and a level0 manifest resolves every one
 * of them to "fetch `info.json`" — so the first frame after a flick settles
 * would start fifty simultaneous metadata requests, which is the fetch storm
 * this epic exists to remove arriving one frame later rather than not at all
 * (spec §Thumbnail resolution: "under the same gate and concurrency cap as
 * thumbnail fetches").
 *
 * The same number as {@link TILE_IN_FLIGHT_LIMIT} and for the same reason,
 * spelled separately because metadata and tiles are two windows: they are
 * different servers' worth of latency and either may be tuned without the
 * other.
 */
export const METADATA_IN_FLIGHT_LIMIT = 6;

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

/**
 * Time constant, in seconds, for **discrete and programmatic** motion:
 * double-tap zoom, toolbar zoom, fit, canvas navigation.
 *
 * Longer than `WHEEL_TIME_CONSTANT`, because these fill a genuine jump between
 * two states the user asked for rather than smoothing a stream of small steps.
 * It is the OpenSeadragon path's `springStiffness: 7.0` expressed as the
 * equivalent 1/e time — the motion the current viewer already has.
 *
 * Continuous input (drag, pinch) uses **no** time constant at all: it is
 * applied directly (spec §Input and animation).
 */
export const ANIMATION_TIME_CONSTANT = 1 / 7;

/**
 * Zoom factor for one double-click / double-tap. Carried forward from the
 * OpenSeadragon path's `zoomPerClick: 2.0`.
 *
 * Single click stays unbound (`clickToZoom: false` there): it is reserved for
 * annotation selection.
 */
export const DOUBLE_TAP_ZOOM_FACTOR = 2;

/**
 * Zoom factor for one **toolbar / API** zoom step (`ViewerState.zoomIn` and
 * `zoomOut`), and the default behind `ViewerConfig.renderer.zoomPerClick`.
 *
 * Carried forward from the OpenSeadragon path's toolbar, which zoomed in by
 * 1.2 and out by 0.8. Those were not each other's inverse, so a zoom-in
 * followed by a zoom-out did not return to where it started; one factor
 * applied in both directions fixes that without changing how big a step feels.
 *
 * Smaller than {@link DOUBLE_TAP_ZOOM_FACTOR} for the same reason
 * {@link KEY_ZOOM_FACTOR} is: a button is easy to press repeatedly.
 */
export const ZOOM_PER_CLICK = 1.2;

/**
 * Time constant, in seconds, of the friction that decays flick momentum. About
 * a third of a second to fall to 1/e, which reads as sliding to a stop rather
 * than as either a hard cut or a drift.
 */
export const MOMENTUM_TIME_CONSTANT = 0.325;

/** Speed, in screen px/s, below which momentum stops rather than crawls. */
export const MOMENTUM_MIN_SPEED = 8;

/** Screen px a press may travel and still count as a tap. */
export const TAP_SLOP = 6;

/** Longest gap between two taps that still reads as a double tap, in ms. */
export const DOUBLE_TAP_MS = 320;

/** How far apart two taps may be and still pair, in screen px. */
export const DOUBLE_TAP_SLOP = 24;

/**
 * How far back release velocity is measured, in ms — a few frames, so a flick
 * reflects how the finger was actually moving as it left rather than the whole
 * drag's average.
 */
export const VELOCITY_WINDOW_MS = 90;

/** Speed, in screen px/s, below which a release carries no momentum at all. */
export const MIN_FLICK_SPEED = 120;

/**
 * Shortest pointer trail, in ms, that carries usable timing — one frame.
 *
 * A gesture whose samples all land inside a single task (coalesced moves
 * delivered together, or a synthesized sequence) says nothing about speed; see
 * `gestureArbiter.GestureConfig.minVelocitySpanMs`.
 */
export const MIN_VELOCITY_SPAN_MS = 16;

/**
 * Steady speed of a held arrow key, in screen px/s.
 *
 * A speed, not a step: a held key drives a velocity (spec §Keyboard), so this
 * is how fast the view travels for as long as the key is down, independent of
 * the OS key-repeat rate.
 */
export const KEY_PAN_SPEED = 700;

/** How much further Shift+arrow travels, as a multiple of `KEY_PAN_SPEED`. */
export const KEY_PAN_SHIFT_FACTOR = 3;

/**
 * Screen px one arrow key **press** moves the view under
 * `prefers-reduced-motion: reduce`, where held-key panning becomes instant
 * stepping and there is no velocity to speak of.
 *
 * Per deliberate press, NOT per key-down: OS key repeat fires at roughly 30 Hz,
 * so a step per repeat would travel about 4800 px/s — seven times the
 * `KEY_PAN_SPEED` glide the reduced-motion user opted out of, which inverts
 * WCAG 2.3.3. `CanvasHost.handleKeyDown` drops repeats on this path; the size
 * here is one comfortable nudge (roughly a quarter-second of `KEY_PAN_SPEED`),
 * not a rate.
 */
export const KEY_PAN_STEP = 160;

/**
 * Zoom factor for one `+`/`-` press.
 *
 * Smaller than `DOUBLE_TAP_ZOOM_FACTOR`: a key is easy to press repeatedly (and
 * repeats on its own when held), so a finer step gives keyboard users the
 * control a pointer gets from the wheel.
 */
export const KEY_ZOOM_FACTOR = 1.5;

/**
 * Fraction of the smaller of the world and viewport extents that must stay
 * visible on each axis. See `viewportMath.constrainCentre`: this is what stops
 * a drag or a flick putting the image off screen with no way back.
 */
export const VISIBILITY_RATIO = 0.5;
