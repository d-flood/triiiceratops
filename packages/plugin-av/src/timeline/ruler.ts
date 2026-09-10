/**
 * The **timeline ruler**: what a bare audio canvas draws in its lane.
 *
 * A canvas with a duration and no picture is laid out as a lane filling the
 * viewer, and the viewer's own zoom over it is purely temporal
 * (`planScene.laneWorld` in core). Left undrawn that is a featureless
 * rectangle: it shows neither where the playhead is nor which span of the
 * recording is on screen, so zooming into a two-hour tape tells the reader
 * nothing about where they landed and the temporal zoom is unusable. The ruler
 * is the graduations that make the projection legible — ticks at a round
 * interval chosen for the window, a clock label on each, the played span
 * filled, and the playhead.
 *
 * Eager, unlike the waveform: every bare audio canvas has one, so an
 * `await import()` would buy nothing and cost a round trip on the common case.
 *
 * Two neighbouring layouts deliberately draw no ruler:
 *
 * - A canvas with waveform data. The waveform graduates the same window and
 *   says more about the recording, so it replaces this rather than crowding it.
 * - A canvas core paints a companion Canvas into. The rect is spoken for and
 *   anything drawn there would cover the picture (ADR 0016), so the reader
 *   reaches the timeline through the control bar's scrubber — the same answer
 *   waveform data gets on that layout (`stageLayout.ts`).
 */

import {
    clipLaneWindow,
    createLaneCanvas,
    laneContext,
    laneScale,
    placeLaneCanvas,
    resolvedColor,
    type LaneWindow,
    type VisibleBox,
} from './lane';
import type { StageRect } from '../mediaStage';

/**
 * The graduations a ruler will use, shortest first: a labelled interval and the
 * unlabelled step that subdivides it, both round numbers a reader of a clock
 * already thinks in.
 *
 * `minor` is written per row rather than derived as a fixed division because
 * the round subdivision of a quarter minute is five seconds and of a minute is
 * fifteen — no single divisor gives round numbers across the ladder, and a
 * ruler ticking every 3.75 s is worse than one that does not tick at all.
 */
const TICK_STEPS: readonly {
    readonly major: number;
    readonly minor: number;
}[] = [
    { major: 0.1, minor: 0.05 },
    { major: 0.25, minor: 0.05 },
    { major: 0.5, minor: 0.1 },
    { major: 1, minor: 0.25 },
    { major: 2, minor: 0.5 },
    { major: 5, minor: 1 },
    { major: 10, minor: 5 },
    { major: 15, minor: 5 },
    { major: 30, minor: 10 },
    { major: 60, minor: 15 },
    { major: 120, minor: 30 },
    { major: 300, minor: 60 },
    { major: 600, minor: 300 },
    { major: 900, minor: 300 },
    { major: 1800, minor: 600 },
    { major: 3600, minor: 900 },
    { major: 7200, minor: 1800 },
    { major: 21600, minor: 3600 },
];

/**
 * Pixels a labelled tick is given to itself. Wide enough that `1:01:01` and its
 * neighbour cannot touch, which is what decides the interval: the ruler picks
 * the shortest round interval whose ticks are at least this far apart, so
 * zooming in steps it down through the ladder.
 */
const MIN_TICK_PX = 88;

/** Below this the lane is a sliver: it gets the playhead and the fill, no ticks. */
const MIN_TICKS_PX = 24;

/** Below this there is room for ticks but not for a clock reading above them. */
const MIN_LABELS_PX = 44;

const MAJOR_TICK_PX = 11;
const MINOR_TICK_PX = 5;
const LABEL_GAP_PX = 4;
const LABEL_FONT = '500 11px system-ui, -apple-system, sans-serif';

const FILL_COLOR = 'var(--tri-color-primary, #6ea8fe)';
const INK_COLOR = 'var(--tri-content, #fff)';

const FILL_ALPHA = 0.14;
const BASELINE_ALPHA = 0.5;
const MAJOR_ALPHA = 0.55;
const MINOR_ALPHA = 0.28;
const LABEL_ALPHA = 0.72;

/**
 * The graduation for a window, or `null` when there is nothing to graduate.
 *
 * A window longer than the ladder's last rung doubles that rung until it fits,
 * which keeps a very long recording ticking on whole hours instead of falling
 * back to some remainder of its own duration.
 */
export function chooseTickStep(
    windowSeconds: number,
    width: number,
): { major: number; minor: number } | null {
    if (!Number.isFinite(windowSeconds) || !(windowSeconds > 0)) return null;
    if (!(width > 0)) return null;

    const wanted = (windowSeconds / width) * MIN_TICK_PX;
    const step = TICK_STEPS.find((candidate) => candidate.major >= wanted);
    if (step) return step;

    const last = TICK_STEPS[TICK_STEPS.length - 1];
    let major = last.major;
    while (major < wanted) major *= 2;
    return { major, minor: major / 4 };
}

/**
 * How a moment of the recording reads as a clock. The transport's own
 * `formatMediaTime`, handed in rather than imported: this is chunk code, and a
 * chunk that reached into the eager graph for a value would be hoisted out of
 * its own bundle into a shared one the IIFE build cannot express.
 */
export type Clock = (seconds: number, total: number) => string;

/**
 * A tick's clock label.
 *
 * The clock floors to whole seconds, which is right down to a one-second
 * interval and wrong below it — every tick in a sub-second window would read
 * the same. Those get a decimal, at the interval's own precision. The value is
 * rounded once and then split, so a tick that floating-point arithmetic left at
 * 1.9999 reads `0:02.0` rather than `0:01.0`.
 */
export function formatTickLabel(
    seconds: number,
    interval: number,
    total: number,
    clock: Clock,
): string {
    if (interval >= 1) return clock(seconds, total);

    // As many decimals as the interval itself has, so every tick in the window
    // reads differently and none carries a digit that is always zero.
    const digits = Number.isInteger(interval * 10) ? 1 : 2;
    const rounded = Number(seconds.toFixed(digits));
    const whole = Math.floor(rounded);
    return `${clock(whole, total)}${(rounded - whole).toFixed(digits).slice(1)}`;
}

/** What to draw, in the drawing surface's own CSS pixels. */
export interface RulerView {
    readonly width: number;
    readonly height: number;
    /** The first and last moment the surface shows — the timeline projection. */
    readonly startTime: number;
    readonly endTime: number;
    /** The length of the timeline those moments sit on, which labels read against. */
    readonly duration: number;
    /** Where the playhead is, in canvas time. */
    readonly playhead: number;
    /** The played span's colour, and the colour of every mark over it. */
    readonly fillColor: string;
    readonly inkColor: string;
    /** How a tick's moment reads. */
    readonly clock: Clock;
}

/**
 * Paint one view of the ruler over the whole of `ctx`'s surface.
 *
 * The caller has already sized the surface, chosen the time window and resolved
 * the theme; this function does no layout and holds no state, which is what
 * lets the graduations be asserted as arithmetic rather than as pixels.
 */
export function drawRuler(
    ctx: CanvasRenderingContext2D,
    view: RulerView,
): void {
    const { width, height, startTime, endTime, playhead } = view;
    if (!(width > 0) || !(height > 0) || !(endTime > startTime)) return;

    ctx.clearRect(0, 0, width, height);

    const perPixel = (endTime - startTime) / width;
    const at = (seconds: number): number => (seconds - startTime) / perPixel;

    // The played span, full height and faint: the reading a glance should get
    // without measuring anything. Clamped to the window, so a playhead off to
    // the right of a zoomed-in view fills all of it rather than none.
    const played = Math.min(Math.max(at(playhead), 0), width);
    if (played > 0) {
        ctx.globalAlpha = FILL_ALPHA;
        ctx.fillStyle = view.fillColor;
        ctx.fillRect(0, 0, played, height);
    }

    if (height >= MIN_TICKS_PX) drawTicks(ctx, view, at);

    // Last and at full strength, so it reads over the ticks it crosses. Drawn
    // only where it actually falls in the window: a playhead clamped to the
    // edge would put the reader somewhere they are not.
    const head = at(playhead);
    if (head >= 0 && head <= width) {
        ctx.globalAlpha = 1;
        ctx.fillStyle = view.inkColor;
        ctx.fillRect(Math.min(head, width - 1), 0, 1, height);
    }

    ctx.globalAlpha = 1;
}

function drawTicks(
    ctx: CanvasRenderingContext2D,
    view: RulerView,
    at: (seconds: number) => number,
): void {
    const { width, height, startTime, endTime, duration } = view;
    const step = chooseTickStep(endTime - startTime, width);
    if (!step) return;

    const baseline = height - 0.5;
    const labelled = height >= MIN_LABELS_PX;
    ctx.fillStyle = view.inkColor;

    ctx.globalAlpha = BASELINE_ALPHA;
    ctx.fillRect(0, height - 1, width, 1);

    // Ticks are struck at multiples of the interval in CANVAS time rather than
    // from the window's left edge: a graduation has to stay on the same moment
    // of the recording while the reader pans, or the whole ruler crawls.
    ctx.globalAlpha = MINOR_ALPHA;
    for (
        let t = Math.ceil(startTime / step.minor) * step.minor;
        t <= endTime;
        t += step.minor
    ) {
        ctx.fillRect(
            Math.round(at(t)),
            baseline - MINOR_TICK_PX,
            1,
            MINOR_TICK_PX,
        );
    }

    ctx.textBaseline = 'bottom';
    ctx.font = LABEL_FONT;
    const labelY = baseline - MAJOR_TICK_PX - LABEL_GAP_PX;

    for (
        let t = Math.ceil(startTime / step.major) * step.major;
        t <= endTime;
        t += step.major
    ) {
        const x = Math.round(at(t));
        ctx.globalAlpha = MAJOR_ALPHA;
        ctx.fillRect(x, baseline - MAJOR_TICK_PX, 1, MAJOR_TICK_PX);
        if (!labelled) continue;

        // Anchored so the first and last labels stay inside the surface rather
        // than being cut in half by the edge of the viewport.
        const text = formatTickLabel(t, step.major, duration, view.clock);
        const overhang = ctx.measureText(text).width / 2;
        ctx.textAlign =
            x - overhang < 0
                ? 'left'
                : x + overhang > width
                  ? 'right'
                  : 'center';
        ctx.globalAlpha = LABEL_ALPHA;
        ctx.fillText(text, x, labelY);
    }
}

/** The ruler's drawing surface, driven by the stage exactly as the waveform's is. */
export interface RulerSurface {
    /**
     * Position the surface for a lane box, or take it off screen when the lane
     * is not placed. `lane` is in the overlay container's coordinates.
     */
    place(lane: StageRect | null, visible: VisibleBox): void;
    /** Redraw at this playhead position, in seconds of the canvas timeline. */
    paint(currentTime: number): void;
    /**
     * Stand down, permanently, for a waveform over the same lane: it graduates
     * the same window and says more. Not reversible, because peaks never
     * un-resolve.
     */
    yieldToWaveform(): void;
    destroy(): void;
}

export function createRulerSurface(
    lane: HTMLElement,
    duration: () => number | null,
    clock: Clock,
): RulerSurface {
    const canvas = createLaneCanvas(lane, 'tri-av-ruler', 'av-ruler');

    let view: LaneWindow | null = null;
    let superseded = false;

    const standDown = (): void => {
        superseded = true;
        view = null;
        canvas.remove();
    };

    return {
        place(rect: StageRect | null, visible: VisibleBox): void {
            if (superseded) return;
            view = clipLaneWindow(rect, visible, duration());
            placeLaneCanvas(canvas, view);
        },

        paint(currentTime: number): void {
            if (superseded || !view || canvas.hidden) return;
            const ctx = laneContext(canvas, view, laneScale());
            if (!ctx) return;
            drawRuler(ctx, {
                width: view.width,
                height: view.height,
                startTime: view.startTime,
                endTime: view.endTime,
                duration: view.duration,
                playhead: currentTime,
                fillColor: resolvedColor(lane, FILL_COLOR),
                inkColor: resolvedColor(lane, INK_COLOR),
                clock,
            });
        },

        yieldToWaveform: standDown,
        destroy: standDown,
    };
}
