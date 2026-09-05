/**
 * Drawing the peaks model into a 2D context — the pixel half of the waveform,
 * and part of the lazily-imported waveform chunk.
 *
 * Pixels rather than DOM because there is nothing here to operate: every seek
 * the waveform invites is already reachable through the transport's real
 * `role="slider"` and through the timeline lane's own tap handling, so this is
 * decoration over geometry the DOM already carries (ADR 0016).
 */

import type { Peaks } from './peaks';

/** What to draw, in the drawing surface's own pixels. */
export interface WaveformView {
    /** Surface size in CSS pixels. */
    readonly width: number;
    readonly height: number;
    /** Device pixel ratio the surface is backed at. */
    readonly scale: number;
    /** The first and last moment the surface shows — the timeline projection. */
    readonly startTime: number;
    readonly endTime: number;
    /**
     * The length of the timeline `startTime`/`endTime` are moments in — the
     * media's own duration, onto which the whole peaks range is stretched.
     */
    readonly duration: number;
    /** Where to draw the playhead, or `null` for no playhead (a static strip). */
    readonly playhead: number | null;
    readonly waveColor: string;
    readonly playheadColor: string;
}

/**
 * The min and max of the peaks data over `[from, to)` in POINT coordinates,
 * where a point index need not be an integer.
 *
 * This is where the honesty rule lives. Two regimes, and the boundary between
 * them is the data's own resolution:
 *
 * - **A column covering one point or more** aggregates: the true extremes over
 *   every point it covers. Zooming out cannot invent a peak, and zooming in
 *   sharpens because each column covers fewer points.
 * - **A column covering less than one point** — the reader has zoomed past what
 *   the file can resolve — interpolates linearly between the two neighbouring
 *   points. The waveform gets smoother, never more detailed. Repeating each
 *   point as a flat block would be the alternative, and it reads as structure
 *   the recording does not have.
 *
 * Channels are folded together into one envelope: the lane is a strip about the
 * shape of the sound, not a per-channel readout, and v1's layouts give it too
 * little height to stack.
 */
function extremesOver(
    peaks: Peaks,
    from: number,
    to: number,
): { min: number; max: number } {
    const { pairs, channels, points } = peaks;
    const stride = channels * 2;
    const last = points - 1;

    const at = (index: number, offset: number): number => {
        const base = Math.min(Math.max(Math.round(index), 0), last) * stride;
        let value = pairs[base + offset];
        for (let c = 1; c < channels; c += 1) {
            const other = pairs[base + c * 2 + offset];
            value =
                offset === 0 ? Math.min(value, other) : Math.max(value, other);
        }
        return value;
    };

    if (to - from < 1) {
        // Sub-point: interpolate between the neighbours the column falls between.
        // A point summarizes the whole span it covers, so its value belongs at
        // the span's MIDDLE — index `i` sits at `i + 0.5` in point
        // coordinates. Anchoring at `i` instead would slide the whole drawing
        // half a point left of where the playhead says it is.
        const centre = (from + to) / 2;
        const lower = Math.min(Math.max(Math.floor(centre - 0.5), 0), last);
        const upper = Math.min(lower + 1, last);
        const t = Math.min(Math.max(centre - (lower + 0.5), 0), 1);
        return {
            min: at(lower, 0) + (at(upper, 0) - at(lower, 0)) * t,
            max: at(lower, 1) + (at(upper, 1) - at(lower, 1)) * t,
        };
    }

    const first = Math.min(Math.max(Math.floor(from), 0), last);
    const stop = Math.min(Math.max(Math.ceil(to), first + 1), points);
    let min = at(first, 0);
    let max = at(first, 1);
    for (let index = first + 1; index < stop; index += 1) {
        min = Math.min(min, at(index, 0));
        max = Math.max(max, at(index, 1));
    }
    return { min, max };
}

/** Full-scale for 16-bit peaks; the divisor that puts a sample in `-1..1`. */
const FULL_SCALE = 32768;

/**
 * Paint one view of the peaks over the whole of `ctx`'s surface.
 *
 * The caller has already sized the surface and chosen the time window; this
 * function does no layout and holds no state, so the same code paints the
 * zoomable lane and the static scrubber strip.
 */
export function drawWaveform(
    ctx: CanvasRenderingContext2D,
    peaks: Peaks,
    view: WaveformView,
): void {
    const { width, height, scale, startTime, endTime, duration } = view;
    if (!(width > 0) || !(height > 0) || !(endTime > startTime)) return;

    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, width, height);

    if (!(duration > 0)) return;

    // Time → point index, against the CALLER's duration rather than the peaks'
    // own. The two routinely disagree — audiowaveform decodes every frame and
    // sees 2.014 s of an mp3 a browser reports as 2.0, because LAME pads the
    // last frame — and the caller's is the one the reader is working in: it is
    // what the lane's x-axis, the transport and every seek are measured
    // against. Stretching the whole peaks range onto it keeps the pixel a
    // reader taps and the moment that tap seeks to describing the same
    // instant, at the price of a sub-percent rescale of the drawing.
    const pointsPerSecond = peaks.points / duration;
    const secondsPerPixel = (endTime - startTime) / width;
    const middle = height / 2;
    const half = height / 2;

    ctx.fillStyle = view.waveColor;
    ctx.beginPath();
    for (let x = 0; x < width; x += 1) {
        const from = (startTime + x * secondsPerPixel) * pointsPerSecond;
        const to = (startTime + (x + 1) * secondsPerPixel) * pointsPerSecond;
        // Columns outside the data are left blank rather than clamped, so a
        // window wider than the recording shows where the recording ends.
        if (to <= 0 || from >= peaks.points) continue;

        const { min, max } = extremesOver(peaks, from, to);
        const top = middle - (max / FULL_SCALE) * half;
        const bottom = middle - (min / FULL_SCALE) * half;
        // A minimum of one pixel: silence is a line, not a gap.
        ctx.rect(x, top, 1, Math.max(bottom - top, 1));
    }
    ctx.fill();

    if (view.playhead === null) return;
    const x = (view.playhead - startTime) / secondsPerPixel;
    if (x < 0 || x > width) return;
    ctx.fillStyle = view.playheadColor;
    ctx.fillRect(Math.min(x, width - 1), 0, 1, height);
}
