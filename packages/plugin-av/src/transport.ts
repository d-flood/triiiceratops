/**
 * The **transport**'s pure parts: the formatting and the clock arithmetic
 * behind the view model, as functions that need no DOM and are tested as
 * functions rather than through a browser.
 *
 * Time here is always **canvas time** on the canvas timeline, the same clock
 * `AVState.currentTime` and `AVState.seek` speak.
 */

import type { CaptionTrack } from './captions';

// The formatter lives beside `parseIiifTime` in core, its inverse; re-exported
// here because this module is where the transport's time functions are found.
export { formatMediaTime } from 'triiiceratops';

/** Seconds an arrow key moves the playhead. */
export const SEEK_STEP_SMALL = 5;

/** Seconds PageUp/PageDown move the playhead. */
export const SEEK_STEP_LARGE = 30;

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

/**
 * One moment on the canvas timeline worth pointing at, in seconds. A moment
 * with no extent — an annotation that targeted only a start — has no `end`.
 */
export interface TimedMark {
    readonly start: number;
    readonly end?: number;
}

/** A {@link TimedMark} normalized onto the scrubber, as `0..1` fractions. */
export interface MarkSpan {
    readonly start: number;
    readonly end?: number;
}

/**
 * Canvas-time moments as the scrubber's marks.
 *
 * A moment starting past the end of the recording is dropped rather than
 * clamped: `timeFraction` would pile every such mark onto the final pixel,
 * which claims the recording has something there when the manifest said
 * otherwise. The comparison is written to reject a NaN start with it, which is
 * what a media fragment of nonsense parses to.
 *
 * An `end` survives only where it lands beyond its own start once normalized.
 * Below that the mark is a moment rather than a span — a note that named no
 * end, or one whose end rounds onto its own start — and the render site draws
 * it at its minimum width instead of at nothing.
 */
export function markSpans(
    marks: readonly TimedMark[],
    duration: number | null,
): MarkSpan[] {
    if (duration === null || !(duration > 0)) return [];

    const spans: MarkSpan[] = [];
    for (const mark of marks) {
        if (!(mark.start <= duration)) continue;
        const start = timeFraction(mark.start, duration);
        // `timeFraction` floors a missing end at zero, which is below every
        // start it could pair with and so falls to the moment case below.
        const end = timeFraction(mark.end ?? 0, duration);
        spans.push(end > start ? { start, end } : { start });
    }
    return spans;
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
