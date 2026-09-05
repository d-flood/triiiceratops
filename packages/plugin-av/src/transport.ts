/**
 * The **transport**'s pure parts: the formatting and the clock arithmetic
 * behind the view model, as functions that need no DOM and are tested as
 * functions rather than through a browser.
 *
 * Time here is always **canvas time** on the canvas timeline, the same clock
 * `AVState.currentTime` and `AVState.seek` speak.
 */

import type { CaptionTrack } from './captions';

/** Seconds an arrow key moves the playhead. */
export const SEEK_STEP_SMALL = 5;

/** Seconds PageUp/PageDown move the playhead. */
export const SEEK_STEP_LARGE = 30;

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

/** One contiguous span of the canvas timeline, in seconds. */
export interface TimeSpan {
    readonly start: number;
    readonly end: number;
}

/**
 * A media element's buffered ranges as canvas-time spans, where the canvas
 * timeline IS the element's clock.
 *
 * The non-identity mapping is the sequencer's `bufferedSpans`, which is where
 * it belongs: it needs the active segment's window to clamp against, and this
 * side of the seam has no idea a segment exists.
 */
export function elementSpans(
    ranges: TimeRanges | null | undefined,
): TimeSpan[] {
    if (!ranges) return [];
    const spans: TimeSpan[] = [];
    for (let index = 0; index < ranges.length; index += 1)
        spans.push({ start: ranges.start(index), end: ranges.end(index) });
    return spans;
}

/**
 * Canvas-time spans, normalized onto the scrubber.
 *
 * What a network has fetched is the one thing the transport reads off the media
 * element rather than off AVState: it is not playback state and has no place on
 * a contract hosts command playback through, and `TimeRanges` has no
 * notification of its own to publish it on. It is redrawn on the frame cadence
 * with everything else.
 */
export function bufferedSpans(
    spans: readonly TimeSpan[],
    duration: number | null,
): BufferedSpan[] {
    if (duration === null || !(duration > 0)) return [];

    const fractions: BufferedSpan[] = [];
    for (const span of spans) {
        const start = timeFraction(span.start, duration);
        const end = timeFraction(span.end, duration);
        if (end > start) fractions.push({ start, end });
    }
    return fractions;
}

/** One selectable caption track, as the control row lists it. */
export interface CaptionOption {
    /** The track's URL — its identity through AVState-free caption commands. */
    readonly id: string;
    readonly label: string;
}

/**
 * The caption tracks as a reader reads them: the resource's own label, with its
 * language beside it when it declares one, because "Captions in WebVTT format"
 * is what both caption cookbook recipes write for every language they offer and
 * a list of identical labels is not a choice.
 *
 * The labels are authored content and are never translated. `fallback` is the
 * localized generic — the one string here that is the viewer's to say — for a
 * track that declares neither a label nor a language.
 */
export function captionOptions(
    tracks: readonly CaptionTrack[],
    fallback: string,
): CaptionOption[] {
    return tracks.map((track) => ({
        id: track.url,
        label:
            track.label && track.language
                ? `${track.label} (${track.language})`
                : (track.label ?? track.language ?? fallback),
    }));
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
