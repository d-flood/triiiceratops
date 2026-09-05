/**
 * The canvas-timeline sequencer chunk's entry point.
 *
 * Everything that knows a composed canvas HAS segments is reachable only from
 * here, and this module is only ever reached through the `await import()` in
 * `../sequencerLink.ts`. A page whose manifests paint one body per canvas never
 * fetches these bytes — and, just as important, pays nothing for them: the pair
 * budget against TIFY had 1,105 gzip left when this ticket started.
 *
 * **The segment↔canvas-time boundary is this module's surface.** What leaves it
 * is `CanvasSequencer`, whose every member is in canvas time; AVState, the
 * transport, the timeline projection, temporal offsets and `ended` all speak
 * that and learn nothing about segments. Even the scrubber's buffered
 * indication crosses as canvas time: the element's own `TimeRanges` go IN to
 * `bufferedSpans` and canvas-time spans come out, clamped to the window the
 * active segment actually owns.
 */

import type { AvPlacement, AvSource } from '../sources';
import type { TimeSpan } from '../transport';
import {
    buildSegmentMap,
    canvasTimeAt,
    positionAt,
    type Segment,
    type SegmentMap,
} from './segments';

/**
 * How close to a **segment seam** the next segment starts loading, in seconds
 * of canvas time.
 *
 * Generous rather than tight: the swap costs a request, a container parse and a
 * decoder handshake, and the gap at the seam is the documented v1 cost of not
 * stitching with Media Source Extensions. Warming the next segment's element
 * ahead of the boundary is what keeps that gap to a hiccup rather than a stall.
 */
const PRELOAD_LEAD_SECONDS = 5;

/**
 * How far past a segment's window the playhead may be before the seam is taken.
 *
 * A window boundary rarely lands on a frame boundary, and `currentTime` is a
 * float the element rounds to its own sample grid, so an exact comparison can
 * miss the seam and leave a segment playing past its window.
 */
const SEAM_EPSILON_SECONDS = 0.05;

export interface SequencerPort {
    /** The element the active segment is playing in. */
    media(): HTMLMediaElement | null;
    /** The source currently attached to it. */
    attached(): AvSource;
    /**
     * Which rendition of a segment to attach — the reader's Choice pick, or the
     * first alternative this browser can decode. Per segment, because the
     * segments of one canvas need not offer the same renditions.
     */
    select(alternatives: readonly AvSource[]): AvSource | null;
    /**
     * Attach a segment's source and resume at `offset` in that segment's OWN
     * clock, playing or paused as asked. This is the only place the segment's
     * clock leaves this module.
     */
    attach(source: AvSource, offset: number, play: boolean): void;
    /**
     * The active segment changed: `annotation` is its painting annotation's
     * index, which is what decides whose caption tracks may show.
     */
    onSegment(annotation: number): void;
    /** The canvas timeline ran off the end of its LAST segment. */
    onEnd(): void;
}

export interface SequencerOptions extends SequencerPort {
    readonly placements: readonly AvPlacement[];
    readonly canvasDuration: number | null;
}

/**
 * A composed canvas's canvas timeline. Every time here is canvas time.
 *
 * This is the `CanvasTimeline` AVState publishes behind: `duration`,
 * `currentTime()` and `seek()` are exactly the three members that would
 * otherwise read and write one element's clock.
 */
export interface CanvasSequencer {
    readonly duration: number;
    /** The playhead, in canvas time. */
    currentTime(): number;
    /** Move the playhead in canvas time, swapping segments if it lands elsewhere. */
    seek(seconds: number): void;
    /**
     * The element's buffered ranges, in canvas time and clamped to the active
     * segment's window.
     *
     * Clamped because a body may be LONGER than the window it was given: what
     * the network fetched past the seam is not buffered canvas, and drawn
     * unclamped it would paint over the next segment's territory. Only the
     * active segment's ranges are reported — the others have no element yet.
     */
    bufferedSpans(ranges: TimeRanges | null | undefined): readonly TimeSpan[];
    /**
     * The element fired `ended`. That is the end of a SEGMENT; only the last
     * one is the end of the canvas timeline.
     */
    segmentEnded(): void;
    /** Re-apply the reader's Choice pick to the segment that is playing. */
    reselect(): void;
    destroy(): void;
}

/**
 * Sequence a temporally composed canvas.
 *
 * The stage is already up and playing the first placement when this is called
 * — the sequencer arrives with its chunk, a few frames later — so construction
 * corrects the attachment only if the segment map disagrees with it, which it
 * does when the annotations are authored out of time order.
 */
export function createCanvasSequencer(
    options: SequencerOptions,
): CanvasSequencer {
    const map: SegmentMap = buildSegmentMap(
        options.placements,
        options.canvasDuration,
    );

    let index = 0;
    let destroyed = false;
    let frame: number | null = null;
    /** The last window's end has already been reported; see {@link crossSeam}. */
    let atEnd = false;
    /** The next segment's element, warmed ahead of the seam. */
    let preloaded: { url: string; element: HTMLMediaElement } | null = null;

    /**
     * Whether playback is meant to be running — latched, not sampled.
     *
     * `!media.paused` is not the answer during a swap: the stage pauses the
     * element synchronously when it changes source and only resumes at the new
     * one's `loadedmetadata`, so a second seek arriving in that window (a held
     * arrow key, a scrubber drag) would read a paused element and carry
     * "paused" into the segment it lands in, silently stopping playback.
     */
    let playing = !(options.media()?.paused ?? true);
    /** An `attach(…, play)` whose element has not resumed yet; see {@link onPause}. */
    let resuming = false;

    const segmentAtIndex = (at: number): Segment | null =>
        map.segments[at] ?? null;

    /** The element time the active segment's window ends at. */
    function windowLength(): number {
        const segment = segmentAtIndex(index);
        return segment ? segment.end - segment.start : 0;
    }

    function releasePreload(): void {
        preloaded?.element.removeAttribute('src');
        preloaded?.element.load();
        preloaded = null;
    }

    /**
     * Warm the next segment.
     *
     * A detached element rather than a `<link rel=preload>`: what has to be
     * ready is a DECODER on this media, and only a media element proves the
     * browser got that far. It is released after the seam, by which time the
     * bytes it fetched are in the HTTP cache the real element reads from.
     */
    function preload(): void {
        const next = segmentAtIndex(index + 1);
        if (!next) return;
        const source = options.select(next.alternatives);
        if (!source || preloaded?.url === source.url) return;

        releasePreload();
        const element = document.createElement(
            source.kind === 'audio' ? 'audio' : 'video',
        ) as HTMLMediaElement;
        element.preload = 'auto';
        element.src = source.url;
        preloaded = { url: source.url, element };
    }

    /** Put the playhead on a segment, attaching its media if it is not the active one. */
    function go(at: number, offset: number, play: boolean): void {
        const segment = segmentAtIndex(at);
        if (!segment) return;
        atEnd = false;

        const source = options.select(segment.alternatives);
        const media = options.media();
        if (at === index && source && source.url === options.attached().url) {
            if (!media) return;
            // Assigning `currentTime` before the element knows its own
            // duration is silently dropped. For a composed canvas this is the
            // whole of `temporalOffsets.ts`'s readiness gate: the canvas
            // timeline is ready as soon as the segment map exists, and it is
            // the SEGMENT that may not be.
            if (media.readyState >= 1) media.currentTime = offset;
            else
                media.addEventListener(
                    'loadedmetadata',
                    () => {
                        if (!destroyed && index === at)
                            media.currentTime = offset;
                    },
                    { once: true },
                );
            return;
        }

        index = at;
        releasePreload();
        options.onSegment(segment.annotation);
        if (!source) return;
        playing = play;
        // The stage's swap pauses the element and only resumes it at the new
        // source's `loadedmetadata`; until then the intent above is the truth.
        resuming = play;
        options.attach(source, offset, play);
        if (play) schedule();
    }

    /**
     * The seam, and the end of the timeline.
     *
     * Both are reached the same way — the playhead arriving at the active
     * window's end — whether the element ran out of media (`ended`) or the
     * window closes before its media does. A gap after the segment is skipped
     * rather than waited out, which is what `positionAt` already answers.
     */
    function crossSeam(): void {
        if (segmentAtIndex(index + 1)) {
            go(index + 1, 0, true);
            return;
        }
        // Latched: the last window's end is reached by the frame check AND by
        // the element's own `ended`, and `auto-advance` must not step twice.
        atEnd = true;
        playing = false;
        resuming = false;
        options.media()?.pause();
        options.onEnd();
    }

    /**
     * The playback cadence, running only while something is playing. It does
     * what `ended` cannot: take a seam whose window closes before its media
     * does, and start the next segment loading before the reader reaches it.
     */
    function tick(): void {
        frame = null;
        if (destroyed || !playing) return;

        const media = options.media();
        if (media && !media.paused) {
            const remaining = windowLength() - media.currentTime;
            if (remaining > SEAM_EPSILON_SECONDS) {
                atEnd = false;
                if (remaining <= PRELOAD_LEAD_SECONDS) preload();
            } else if (!atEnd) crossSeam();
        }
        schedule();
    }

    /**
     * Ask for the next frame, if one is wanted.
     *
     * Gated on {@link playing} rather than run forever: a paused composed
     * canvas — every one on a page the reader has not started, and every one
     * scrolled out of sight — would otherwise hold a per-frame callback for the
     * life of the activation. The `play` listener is what starts it again.
     */
    function schedule(): void {
        if (destroyed || frame !== null || !playing) return;
        if (typeof requestAnimationFrame !== 'function') return;
        frame = requestAnimationFrame(tick);
    }

    function onPlay(): void {
        playing = true;
        resuming = false;
        schedule();
    }

    /**
     * The element paused. Ignored while a swap is outstanding: `setSource`
     * pauses synchronously on its way to resuming, and that pause is not the
     * reader's.
     */
    function onPause(): void {
        if (!resuming) playing = false;
    }

    const listening = options.media();
    listening?.addEventListener('play', onPlay);
    listening?.addEventListener('pause', onPause);

    // The first segment may not be the first annotation: `#t=` decides the
    // order, and `stages.svelte.ts` staged `placements[0]` before this chunk
    // arrived. Correcting it here rather than in the stage is what keeps the
    // "one canvas → one source provider" seam free of segment knowledge.
    const first = segmentAtIndex(0);
    if (first) {
        options.onSegment(first.annotation);
        const source = options.select(first.alternatives);
        if (source && source.url !== options.attached().url) {
            resuming = playing;
            options.attach(source, 0, playing);
        }
    }
    schedule();

    return {
        duration: map.duration,

        currentTime(): number {
            const media = options.media();
            if (!media) return 0;
            return canvasTimeAt(map, { index, offset: media.currentTime });
        },

        seek(seconds: number): void {
            const position = positionAt(map, seconds);
            if (position) go(position.index, position.offset, playing);
        },

        bufferedSpans(ranges): TimeSpan[] {
            const segment = segmentAtIndex(index);
            if (!segment || !ranges) return [];

            const length = segment.end - segment.start;
            const spans: TimeSpan[] = [];
            for (let at = 0; at < ranges.length; at += 1) {
                const start = Math.max(ranges.start(at), 0);
                const end = Math.min(ranges.end(at), length);
                if (end > start)
                    spans.push({
                        start: segment.start + start,
                        end: segment.start + end,
                    });
            }
            return spans;
        },

        segmentEnded(): void {
            if (!atEnd) crossSeam();
        },

        reselect(): void {
            const segment = segmentAtIndex(index);
            const media = options.media();
            if (!segment || !media) return;
            const source = options.select(segment.alternatives);
            if (!source || source.url === options.attached().url) return;
            resuming = playing;
            options.attach(source, media.currentTime, playing);
        },

        destroy(): void {
            destroyed = true;
            listening?.removeEventListener('play', onPlay);
            listening?.removeEventListener('pause', onPause);
            if (frame !== null && typeof cancelAnimationFrame === 'function')
                cancelAnimationFrame(frame);
            frame = null;
            releasePreload();
        },
    };
}
