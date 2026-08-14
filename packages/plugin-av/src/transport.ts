/**
 * The **transport**'s pure parts: the decisions that do not need a DOM, kept
 * out of the component so they can be tested as functions rather than through a
 * browser.
 *
 * Time here is always **canvas time** on the canvas timeline, the same clock
 * `AVState.currentTime` and `AVState.seek` speak.
 */

/**
 * Narrowest projected canvas width, in SCREEN pixels, that still gets a
 * transport.
 *
 * The transport's own size never scales with zoom, so at a wide zoom a canvas
 * can project narrower than the chrome that controls it — controls would
 * overhang the picture they belong to, and two adjacent canvases' transports
 * would overlap and stop saying which canvas each one drives. Below this the
 * canvas shows the play-state glyph instead (user story 26); playback stays
 * reachable through the media element's own tap-to-toggle and through AVState.
 *
 * The figure is the width the v1 control row needs before it starts eliding:
 * two 2rem touch targets, the time readout, the volume slider, and a scrubber
 * still wide enough to aim at.
 */
export const TRANSPORT_MIN_WIDTH_PX = 240;

/** Seconds an arrow key moves the playhead. */
export const SEEK_STEP_SMALL = 5;

/** Seconds PageUp/PageDown move the playhead. */
export const SEEK_STEP_LARGE = 30;

/** Whether a canvas projected this wide gets the transport rather than the glyph. */
export function fitsTransport(projectedWidthPx: number): boolean {
    return (
        Number.isFinite(projectedWidthPx) &&
        projectedWidthPx >= TRANSPORT_MIN_WIDTH_PX
    );
}

/**
 * A clock reading for a media position: `m:ss`, widening to `h:mm:ss` only when
 * the piece actually runs an hour.
 *
 * `total` decides the shape rather than `seconds` alone, so a 90-minute
 * recording reads `0:04:12` from its first minute instead of jumping from
 * `4:12` to `1:00:00` mid-playback and shifting the layout under the reader.
 * A position with no known duration formats to `--:--`, which is what the
 * readout shows before metadata lands.
 */
export function formatMediaTime(
    seconds: number | null,
    total: number | null = seconds,
): string {
    if (seconds === null || !Number.isFinite(seconds) || seconds < 0)
        return '--:--';

    const whole = Math.floor(seconds);
    const withHours =
        total !== null && Number.isFinite(total)
            ? total >= 3600
            : whole >= 3600;

    const secondsPart = String(whole % 60).padStart(2, '0');
    const minutes = Math.floor(whole / 60);
    if (!withHours) return `${minutes}:${secondsPart}`;

    return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${secondsPart}`;
}

/** Where a position sits on a `[0, duration]` scrubber, as `0..1`. */
export function timeFraction(
    currentTime: number,
    duration: number | null,
): number {
    if (duration === null || !(duration > 0)) return 0;
    if (!Number.isFinite(currentTime) || currentTime <= 0) return 0;
    return Math.min(currentTime / duration, 1);
}

/** A `0..1` position on the scrubber, as a canvas-time seek target. */
export function fractionToTime(
    fraction: number,
    duration: number | null,
): number | null {
    if (duration === null || !(duration > 0)) return null;
    if (!Number.isFinite(fraction)) return null;
    return Math.min(Math.max(fraction, 0), 1) * duration;
}

/** One contiguous buffered span, as `0..1` fractions of the duration. */
export interface BufferedSpan {
    readonly start: number;
    readonly end: number;
}

/**
 * The element's buffered spans, normalized onto the scrubber.
 *
 * The one thing the transport reads off the media element rather than off
 * AVState: what a network has fetched is not playback state and has no place on
 * a contract hosts command playback through, and `TimeRanges` has no
 * notification of its own to publish it on. It is redrawn on the frame cadence
 * with everything else.
 */
export function bufferedSpans(
    ranges: TimeRanges | null | undefined,
    duration: number | null,
): BufferedSpan[] {
    if (!ranges || duration === null || !(duration > 0)) return [];

    const spans: BufferedSpan[] = [];
    for (let index = 0; index < ranges.length; index += 1) {
        const start = timeFraction(ranges.start(index), duration);
        const end = timeFraction(ranges.end(index), duration);
        if (end > start) spans.push({ start, end });
    }
    return spans;
}

/**
 * Whether this browser lets a script set output volume.
 *
 * iOS WebKit makes `volume` read-only — the hardware buttons own it — so a
 * volume slider there is a control that visibly does nothing. Feature-detected
 * by writing and reading back rather than sniffed off the user agent, so a
 * desktop Safari (which does honour it) keeps its slider and any future engine
 * with the same restriction loses it without a UA-string edit. Mute is
 * unaffected and stays on every platform.
 */
export function volumeIsSettable(media: HTMLMediaElement): boolean {
    const original = media.volume;
    try {
        const probe = original === 1 ? 0.5 : 1;
        media.volume = probe;
        const settable = media.volume !== original;
        media.volume = original;
        return settable;
    } catch {
        return false;
    }
}
