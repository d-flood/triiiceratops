import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AvPlacement, AvSource } from '../sources';
import { createCanvasSequencer, type CanvasSequencer } from './index';

function placement(annotation: number, fragment: string): AvPlacement {
    return {
        annotation,
        fragment,
        alternatives: [
            {
                url: `body-${annotation}.mp4`,
                kind: 'video',
                format: 'video/mp4',
            },
        ],
        temporal: true,
        spatial: false,
    };
}

/**
 * A stand-in for the element the stage holds.
 *
 * Only the members the sequencer touches, so a test states the element's clock
 * and playback state directly rather than driving a real decoder — but the
 * events are real ones through a real `EventTarget`, because the sequencer
 * latches its play state off `play` and `pause` rather than sampling `paused`.
 */
function fakeMedia() {
    const events = new EventTarget();
    const media = {
        currentTime: 0,
        paused: true,
        readyState: 1,
        pause: vi.fn(() => media.setPlaying(false)),
        addEventListener: (
            type: string,
            listener: EventListener,
            options?: AddEventListenerOptions,
        ) => events.addEventListener(type, listener, options),
        removeEventListener: (type: string, listener: EventListener) =>
            events.removeEventListener(type, listener),
        /** Fire an element event, as a real decoder would. */
        emit: (type: string) => events.dispatchEvent(new Event(type)),
        /** Change playback state the way the element does: state, then event. */
        setPlaying: (playing: boolean) => {
            media.paused = !playing;
            media.emit(playing ? 'play' : 'pause');
        },
    };
    return media;
}

/** The sequencer over a fixed set of placements, with its port recorded. */
function sequencerOver(
    placements: AvPlacement[],
    canvasDuration: number | null,
    { resumes = true }: { resumes?: boolean } = {},
) {
    const media = fakeMedia();
    let attached: AvSource = placements[0].alternatives[0];
    // The stage's swap, told the way it really happens: the element is paused
    // synchronously and only reaches its asked-for state at `loadedmetadata`.
    // `resumes: false` stops it there, which is where a second seek arriving
    // mid-swap finds it.
    const attach = vi.fn((source: AvSource, offset: number, play: boolean) => {
        attached = source;
        media.setPlaying(false);
        media.currentTime = offset;
        if (resumes) media.setPlaying(play);
    });
    const onSegment = vi.fn();
    const onEnd = vi.fn();

    const sequencer: CanvasSequencer = createCanvasSequencer({
        placements,
        canvasDuration,
        media: () => media as unknown as HTMLMediaElement,
        attached: () => attached,
        select: (alternatives) => alternatives[0] ?? null,
        attach,
        onSegment,
        onEnd,
    });

    return {
        sequencer,
        media,
        attach,
        onSegment,
        onEnd,
        attachedUrl: () => attached.url,
    };
}

/** A `TimeRanges` stand-in: the interface is three members wide. */
function ranges(spans: [number, number][]): TimeRanges {
    return {
        length: spans.length,
        start: (index: number) => spans[index][0],
        end: (index: number) => spans[index][1],
    } as TimeRanges;
}

/**
 * A hand-cranked `requestAnimationFrame`, so a test can say "another frame
 * went by" rather than wait for one.
 */
function fakeFrames() {
    let pending: FrameRequestCallback | null = null;
    let next = 1;
    const rAF = vi
        .spyOn(globalThis, 'requestAnimationFrame')
        .mockImplementation((callback) => {
            pending = callback;
            return (next += 1);
        });
    const cancel = vi
        .spyOn(globalThis, 'cancelAnimationFrame')
        .mockImplementation(() => {
            pending = null;
        });

    return {
        /** Whether a frame is on order at all. */
        scheduled: () => pending !== null,
        /** Run the frame that was asked for. */
        run: () => {
            const callback = pending;
            pending = null;
            callback?.(performance.now());
        },
        restore: () => {
            rAF.mockRestore();
            cancel.mockRestore();
        },
    };
}

/** The two-segment shape both the local fixture and recipe 0064 have. */
const TWO = [placement(0, 't=0,2'), placement(1, 't=2,4')];

describe('the canvas timeline sequencer', () => {
    let warn: ReturnType<typeof vi.spyOn>;
    const built: CanvasSequencer[] = [];

    beforeEach(() => {
        warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterEach(() => {
        for (const sequencer of built.splice(0)) sequencer.destroy();
        warn.mockRestore();
    });

    function build(
        placements: AvPlacement[],
        canvasDuration: number | null = 4,
    ) {
        const harness = sequencerOver(placements, canvasDuration);
        built.push(harness.sequencer);
        return harness;
    }

    it('publishes the CANVAS duration, not the segment’s', () => {
        expect(build(TWO).sequencer.duration).toBe(4);
    });

    it('reports the playhead in canvas time', () => {
        const { sequencer, media, onSegment } = build(TWO);

        media.currentTime = 1.5;
        expect(sequencer.currentTime()).toBe(1.5);

        sequencer.seek(3);
        media.currentTime = 1;
        expect(sequencer.currentTime()).toBe(3);
        expect(onSegment).toHaveBeenLastCalledWith(1);
    });

    it('resolves a seek to the right segment at the right offset', () => {
        const { sequencer, attach, attachedUrl } = build(TWO);

        sequencer.seek(3.25);
        expect(attachedUrl()).toBe('body-1.mp4');
        expect(attach).toHaveBeenCalledWith(
            expect.objectContaining({ url: 'body-1.mp4' }),
            1.25,
            false,
        );
    });

    it('seeks inside the active segment without swapping anything', () => {
        const { sequencer, media, attach } = build(TWO);

        sequencer.seek(1.25);
        expect(attach).not.toHaveBeenCalled();
        expect(media.currentTime).toBe(1.25);
    });

    it('carries the paused state across a seek between segments', () => {
        const { sequencer, media, attach } = build(TWO);

        sequencer.seek(3);
        expect(attach).toHaveBeenLastCalledWith(
            expect.anything(),
            1,
            /* play */ false,
        );

        media.setPlaying(true);
        sequencer.seek(0.5);
        expect(attach).toHaveBeenLastCalledWith(
            expect.anything(),
            0.5,
            /* play */ true,
        );
    });

    it('crosses the seam on `ended` and keeps playing', () => {
        const { sequencer, attach, onSegment, onEnd, attachedUrl } = build(TWO);

        sequencer.segmentEnded();

        expect(attachedUrl()).toBe('body-1.mp4');
        expect(attach).toHaveBeenCalledWith(
            expect.objectContaining({ url: 'body-1.mp4' }),
            0,
            /* play */ true,
        );
        expect(onSegment).toHaveBeenLastCalledWith(1);
        expect(onEnd).not.toHaveBeenCalled();
    });

    it('reports the end of the TIMELINE only from the last segment', () => {
        const { sequencer, media, onEnd } = build(TWO);

        sequencer.segmentEnded();
        expect(onEnd).not.toHaveBeenCalled();

        sequencer.segmentEnded();
        expect(onEnd).toHaveBeenCalledTimes(1);
        expect(media.pause).toHaveBeenCalled();

        // The window's end is reached by the frame check as well as by
        // `ended`; `auto-advance` must not step twice for one boundary.
        sequencer.segmentEnded();
        expect(onEnd).toHaveBeenCalledTimes(1);
    });

    it('skips a gap rather than resting in it', () => {
        const { sequencer, attach } = build(
            [placement(0, 't=0,2'), placement(1, 't=5,7')],
            7,
        );

        // Playing off the end of the first window lands at the next one's
        // start, not in the silence between them.
        sequencer.segmentEnded();
        expect(attach).toHaveBeenLastCalledWith(expect.anything(), 0, true);
        expect(sequencer.currentTime()).toBe(5);
    });

    it('maps the element’s buffered ranges onto the canvas timeline', () => {
        const { sequencer } = build(TWO);

        expect(sequencer.bufferedSpans(ranges([[0, 1.5]]))).toEqual([
            { start: 0, end: 1.5 },
        ]);

        // The second segment's own clock starts at zero and its window starts
        // two seconds into the canvas.
        sequencer.seek(3);
        expect(sequencer.bufferedSpans(ranges([[0, 1.5]]))).toEqual([
            { start: 2, end: 3.5 },
        ]);
    });

    /*
        A body may be longer than the window it was given. What the network
        fetched past the seam is not buffered canvas: drawn unclamped it paints
        the bar over the NEXT segment's territory.
    */
    it('clamps buffered ranges to the window the segment owns', () => {
        const { sequencer } = build(TWO);

        expect(sequencer.bufferedSpans(ranges([[0, 10]]))).toEqual([
            { start: 0, end: 2 },
        ]);
        expect(sequencer.bufferedSpans(ranges([[5, 10]]))).toEqual([]);
        expect(sequencer.bufferedSpans(null)).toEqual([]);
    });

    it('corrects an initial attachment the segment map disagrees with', () => {
        // Annotations authored out of time order: the stage staged
        // `placements[0]`, which is the SECOND segment.
        const { attach, onSegment } = build(
            [placement(0, 't=2,4'), placement(1, 't=0,2')],
            4,
        );

        expect(onSegment).toHaveBeenCalledWith(1);
        expect(attach).toHaveBeenCalledWith(
            expect.objectContaining({ url: 'body-1.mp4' }),
            0,
            false,
        );
    });

    it('leaves a correctly staged first segment alone', () => {
        const { attach, onSegment } = build(TWO);

        expect(onSegment).toHaveBeenCalledWith(0);
        expect(attach).not.toHaveBeenCalled();
    });

    it('re-selects the rendition of the segment that is PLAYING', () => {
        const media = fakeMedia();
        let attached: AvSource = TWO[0].alternatives[0];
        const attach = vi.fn((source: AvSource) => {
            attached = source;
        });
        let pick = 0;

        const sequencer = createCanvasSequencer({
            placements: [
                placement(0, 't=0,2'),
                {
                    ...placement(1, 't=2,4'),
                    alternatives: [
                        { url: 'low.mp4', kind: 'video', format: 'video/mp4' },
                        { url: 'high.mp4', kind: 'video', format: 'video/mp4' },
                    ],
                },
            ],
            canvasDuration: 4,
            media: () => media as unknown as HTMLMediaElement,
            attached: () => attached,
            select: (alternatives) => alternatives[pick] ?? alternatives[0],
            attach,
            onSegment: () => {},
            onEnd: () => {},
        });
        built.push(sequencer);

        sequencer.seek(3);
        expect(attached.url).toBe('low.mp4');

        media.currentTime = 1;
        pick = 1;
        sequencer.reselect();
        expect(attached.url).toBe('high.mp4');
        // The reader's place is kept: the segment's own clock, not zero.
        expect(attach).toHaveBeenLastCalledWith(
            expect.objectContaining({ url: 'high.mp4' }),
            1,
            false,
        );
    });

    it('holds a seek until the element that will play it knows its duration', () => {
        const { sequencer, media } = build(TWO);
        media.readyState = 0;

        sequencer.seek(1.5);

        expect(media.currentTime).toBe(0);

        media.emit('loadedmetadata');
        expect(media.currentTime).toBe(1.5);
    });

    /*
        The reader holds the arrow key, or drags the scrubber: a second seek
        arrives while the first swap is still in flight. The stage paused the
        element on its way to resuming it, so an element sampled now says
        "paused" — and carrying that into the next segment would silently stop
        playback the reader never asked to stop.
    */
    it('keeps playing across a seek that lands mid-swap', () => {
        const harness = sequencerOver(TWO, 4, { resumes: false });
        built.push(harness.sequencer);
        const { sequencer, media, attach } = harness;

        media.setPlaying(true);
        sequencer.seek(3);
        expect(media.paused).toBe(true);

        sequencer.seek(0.5);

        expect(attach).toHaveBeenLastCalledWith(
            expect.anything(),
            0.5,
            /* play */ true,
        );
    });
});

/*
    The frame check, which is what `ended` cannot be: a body may be LONGER than
    the window it was given, and then the window closes while the element is
    still happily playing. Nothing else takes that seam.
*/
describe('the sequencer’s frame check', () => {
    let warn: ReturnType<typeof vi.spyOn>;
    let frames: ReturnType<typeof fakeFrames>;
    const built: CanvasSequencer[] = [];

    beforeEach(() => {
        warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        frames = fakeFrames();
    });
    afterEach(() => {
        for (const sequencer of built.splice(0)) sequencer.destroy();
        frames.restore();
        warn.mockRestore();
    });

    function build(placements: AvPlacement[], canvasDuration: number) {
        const harness = sequencerOver(placements, canvasDuration);
        built.push(harness.sequencer);
        return harness;
    }

    it('takes the seam when the window closes before the media does', () => {
        const { media, attach, onSegment } = build(TWO, 4);

        media.setPlaying(true);
        // A two-second window, and an element that has three seconds of media
        // left to play: `ended` will not fire for another three seconds.
        media.currentTime = 1.99;
        frames.run();

        expect(attach).toHaveBeenCalledWith(
            expect.objectContaining({ url: 'body-1.mp4' }),
            0,
            /* play */ true,
        );
        expect(onSegment).toHaveBeenLastCalledWith(1);
    });

    it('leaves a segment alone while its window still has time in it', () => {
        const { media, attach } = build(TWO, 4);

        media.setPlaying(true);
        media.currentTime = 1;
        frames.run();

        expect(attach).not.toHaveBeenCalled();
    });

    it('ends the timeline when the LAST window closes before its media does', () => {
        const { sequencer, media, onEnd } = build(TWO, 4);

        sequencer.seek(3);
        media.setPlaying(true);
        media.currentTime = 1.99;
        frames.run();

        expect(onEnd).toHaveBeenCalledTimes(1);
        expect(media.pause).toHaveBeenCalled();

        // Latched: the element's own `ended` follows the frame check over the
        // same boundary, and `auto-advance` must not step twice for it.
        sequencer.segmentEnded();
        expect(onEnd).toHaveBeenCalledTimes(1);
    });

    it('warms the next segment ahead of the seam, and not before', () => {
        const created: HTMLMediaElement[] = [];
        const create = document.createElement.bind(document);
        const createElement = vi
            .spyOn(document, 'createElement')
            .mockImplementation((tag: string) => {
                const element = create(tag);
                if (tag === 'video' || tag === 'audio')
                    created.push(element as HTMLMediaElement);
                return element;
            });

        try {
            const { media } = build(
                [placement(0, 't=0,20'), placement(1, 't=20,40')],
                40,
            );

            media.setPlaying(true);
            // Ten seconds of the window left: further out than the lead.
            media.currentTime = 10;
            frames.run();
            expect(created).toHaveLength(0);

            // Four seconds left: inside it.
            media.currentTime = 16;
            frames.run();
            expect(created).toHaveLength(1);
            expect(created[0].src).toContain('body-1.mp4');
        } finally {
            createElement.mockRestore();
        }
    });

    /*
        The cadence costs a callback every frame for as long as it runs. A
        composed canvas the reader has not started — or has scrolled past —
        must not be paying it.
    */
    it('runs only while something is playing', () => {
        const { media } = build(TWO, 4);

        expect(frames.scheduled()).toBe(false);

        media.setPlaying(true);
        expect(frames.scheduled()).toBe(true);

        media.currentTime = 0.5;
        frames.run();
        expect(frames.scheduled()).toBe(true);

        media.setPlaying(false);
        frames.run();
        expect(frames.scheduled()).toBe(false);
    });
});
