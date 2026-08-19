import { describe, expect, it } from 'vitest';

import type { AVState } from './avState';
import type { CaptionTrack } from './captions';
import { createAudioPrefs, createTransport } from './transportChrome';
import {
    bufferedSpans,
    captionOptions,
    elementSpans,
    formatMediaTime,
    fractionToTime,
    SEEK_STEP_LARGE,
    SEEK_STEP_SMALL,
    timeFraction,
    volumeIsSettable,
} from './transport';

/** A `TimeRanges` stand-in: the interface is three members wide. */
function ranges(spans: [number, number][]): TimeRanges {
    return {
        length: spans.length,
        start: (index: number) => spans[index][0],
        end: (index: number) => spans[index][1],
    } as TimeRanges;
}

describe('formatMediaTime', () => {
    it('formats a position as m:ss', () => {
        expect(formatMediaTime(0, 120)).toBe('0:00');
        expect(formatMediaTime(7, 120)).toBe('0:07');
        expect(formatMediaTime(72.9, 120)).toBe('1:12');
    });

    it('widens to h:mm:ss for the whole of an hour-long piece', () => {
        // The DURATION decides the shape, so the readout does not change width
        // mid-playback and shift the controls beside it.
        expect(formatMediaTime(12, 3600)).toBe('0:00:12');
        expect(formatMediaTime(3661, 3700)).toBe('1:01:01');
    });

    it('formats a lone position against itself', () => {
        expect(formatMediaTime(3661)).toBe('1:01:01');
        expect(formatMediaTime(59)).toBe('0:59');
    });

    it('reads --:-- for a position it cannot know', () => {
        expect(formatMediaTime(null)).toBe('--:--');
        expect(formatMediaTime(Number.NaN)).toBe('--:--');
        expect(formatMediaTime(Number.POSITIVE_INFINITY)).toBe('--:--');
        expect(formatMediaTime(-1)).toBe('--:--');
    });
});

describe('timeFraction / fractionToTime', () => {
    it('projects a position onto the scrubber', () => {
        expect(timeFraction(30, 120)).toBe(0.25);
        expect(fractionToTime(0.25, 120)).toBe(30);
    });

    it('rests at the start while there is no duration to divide by', () => {
        expect(timeFraction(30, null)).toBe(0);
        expect(timeFraction(30, 0)).toBe(0);
        expect(fractionToTime(0.5, null)).toBeNull();
    });

    it('clamps both directions', () => {
        expect(timeFraction(999, 120)).toBe(1);
        expect(timeFraction(-1, 120)).toBe(0);
        expect(fractionToTime(2, 120)).toBe(120);
        expect(fractionToTime(-2, 120)).toBe(0);
    });
});

describe('bufferedSpans', () => {
    it('normalizes each span onto the scrubber', () => {
        expect(bufferedSpans([{ start: 0, end: 30 }], 120)).toEqual([
            { start: 0, end: 0.25 },
        ]);
        expect(
            bufferedSpans(
                [
                    { start: 0, end: 30 },
                    { start: 60, end: 120 },
                ],
                120,
            ),
        ).toEqual([
            { start: 0, end: 0.25 },
            { start: 0.5, end: 1 },
        ]);
    });

    it('drops empty spans and answers nothing without a duration', () => {
        expect(bufferedSpans([{ start: 5, end: 5 }], 120)).toEqual([]);
        expect(bufferedSpans([{ start: 0, end: 30 }], null)).toEqual([]);
        expect(bufferedSpans([], 120)).toEqual([]);
    });
});

describe('elementSpans', () => {
    it('reads the element’s ranges as seconds, the identity mapping', () => {
        expect(
            elementSpans(
                ranges([
                    [0, 30],
                    [60, 120],
                ]),
            ),
        ).toEqual([
            { start: 0, end: 30 },
            { start: 60, end: 120 },
        ]);
        expect(elementSpans(null)).toEqual([]);
        expect(elementSpans(undefined)).toEqual([]);
    });
});

describe('volumeIsSettable', () => {
    it('reports a settable volume and leaves it where it found it', () => {
        const media = { volume: 0.4 } as HTMLMediaElement;
        expect(volumeIsSettable(media)).toBe(true);
        expect(media.volume).toBe(0.4);
    });

    it('reports a read-only volume — the iOS shape — without sniffing the UA', () => {
        const media = {
            get volume(): number {
                return 1;
            },
            set volume(_value: number) {
                /* iOS WebKit: the hardware buttons own it. */
            },
        } as HTMLMediaElement;
        expect(volumeIsSettable(media)).toBe(false);
    });

    it('reports a throwing setter as unsettable', () => {
        const media = {
            get volume(): number {
                return 1;
            },
            set volume(_value: number) {
                throw new Error('nope');
            },
        } as HTMLMediaElement;
        expect(volumeIsSettable(media)).toBe(false);
    });
});

describe('captionOptions', () => {
    it('puts the language beside the label, because the labels repeat', () => {
        // Both caption cookbook recipes label every language identically.
        expect(
            captionOptions(
                [
                    {
                        url: 'en.vtt',
                        label: 'Captions in WebVTT format',
                        language: 'en',
                        annotation: 0,
                    },
                    {
                        url: 'it.vtt',
                        label: 'Captions in WebVTT format',
                        language: 'it',
                        annotation: 0,
                    },
                ],
                'Captions',
            ),
        ).toEqual([
            { id: 'en.vtt', label: 'Captions in WebVTT format (en)' },
            { id: 'it.vtt', label: 'Captions in WebVTT format (it)' },
        ]);
    });

    it('falls back to the language, then to the localized generic', () => {
        expect(
            captionOptions(
                [
                    {
                        url: 'a.vtt',
                        label: null,
                        language: 'fr',
                        annotation: 0,
                    },
                    {
                        url: 'b.vtt',
                        label: null,
                        language: null,
                        annotation: 0,
                    },
                ],
                'Captions',
            ).map((option) => option.label),
        ).toEqual(['fr', 'Captions']);
    });
});

describe('createTransport', () => {
    const LABELS = {
        transport: 'Playback',
        play: 'Play',
        pause: 'Pause',
        seek: 'Seek',
        mute: 'Mute',
        unmute: 'Unmute',
        volume: 'Volume',
        tracks: 'Captions',
        tracksOff: 'Off',
        transcript: 'Transcript',
        trackFallback: 'Captions',
    };

    /** An AVState stand-in: the members the transport reads, and its cadences. */
    function fakeAvState() {
        const frameListeners = new Set<() => void>();
        return {
            state: {
                paused: true,
                duration: 2,
                currentTime: 0,
                play: () => {},
                pause: () => {},
                seek: () => {},
                setMuted: () => {},
                setVolume: () => {},
                subscribe: () => () => {},
                subscribeFrame: (listener: () => void) => {
                    frameListeners.add(listener);
                    return () => frameListeners.delete(listener);
                },
            } as unknown as AVState,
            frame: () => {
                for (const listener of frameListeners) listener();
            },
        };
    }

    it('brings a newly addressed element to the remembered volume and mute', () => {
        const first = document.createElement('audio');
        const second = document.createElement('audio');
        let current: HTMLMediaElement = first;

        const prefs = createAudioPrefs();
        const { state, frame } = fakeAvState();
        const transport = createTransport({
            avState: state,
            currentMedia: () => current,
            bufferedSpans: elementSpans,
            prefs,
            labels: () => LABELS,
            peaksStrip: () => null,
            captions: () => ({ tracks: [], active: null }),
            setCaptionTrack: () => {},
            hasTranscript: () => false,
            panelOpen: () => false,
            setPanelOpen: () => {},
            t: (key) => key,
        });

        prefs.set(0.4, true);
        // The switch a navigation makes. Every stage was built before this
        // point, so nothing applied the reader's settings to the second one.
        current = second;
        frame();

        expect(second.muted).toBe(true);
        expect(second.volume).toBeCloseTo(0.4);
        transport.destroy();
    });

    it('re-announces the scrubber position after a locale change', () => {
        const media = document.createElement('audio');
        const { state } = fakeAvState();
        let locale = 'en';
        const transport = createTransport({
            avState: state,
            currentMedia: () => media,
            bufferedSpans: elementSpans,
            prefs: createAudioPrefs(),
            labels: () => LABELS,
            peaksStrip: () => null,
            captions: () => ({ tracks: [], active: null }),
            setCaptionTrack: () => {},
            hasTranscript: () => false,
            panelOpen: () => false,
            setPanelOpen: () => {},
            t: (key, params) =>
                `${locale}:${key}:${String(params?.current)}/${String(params?.total)}`,
        });

        expect(transport.view().positionText).toBe('en:av_position:0:00/0:02');

        // A paused canvas never ticks, so nothing but the locale change itself
        // can recompute what the scrubber announces.
        locale = 'fr';
        transport.retranslate();
        expect(transport.view().positionText).toBe('fr:av_position:0:00/0:02');

        transport.destroy();
    });

    it('renders nothing while no claimed canvas is current', () => {
        const { state } = fakeAvState();
        let media: HTMLMediaElement | null = null;
        const transport = createTransport({
            avState: state,
            currentMedia: () => media,
            bufferedSpans: elementSpans,
            prefs: createAudioPrefs(),
            labels: () => LABELS,
            peaksStrip: () => null,
            captions: () => ({ tracks: [], active: null }),
            setCaptionTrack: () => {},
            hasTranscript: () => false,
            panelOpen: () => false,
            setPanelOpen: () => {},
            t: (key) => key,
        });

        expect(transport.view().present).toBe(false);

        media = document.createElement('audio');
        transport.refresh();
        expect(transport.view().present).toBe(true);

        transport.destroy();
    });

    it('seeks in canvas seconds from the fraction core commands', () => {
        const media = document.createElement('audio');
        const { state } = fakeAvState();
        const sought: number[] = [];
        state.seek = (seconds: number) => sought.push(seconds);

        const transport = createTransport({
            avState: state,
            currentMedia: () => media,
            bufferedSpans: elementSpans,
            prefs: createAudioPrefs(),
            labels: () => LABELS,
            peaksStrip: () => null,
            captions: () => ({ tracks: [], active: null }),
            setCaptionTrack: () => {},
            hasTranscript: () => false,
            panelOpen: () => false,
            setPanelOpen: () => {},
            t: (key) => key,
        });

        // The duration is 2s, so a quarter of the scrubber is half a second.
        transport.port.seek(0.25);
        expect(sought).toEqual([0.5]);

        transport.destroy();
    });

    /*
        Core holds the view in `$state.raw` and `===`-compares the assignment,
        so a `view()` that handed back the state object itself would leave every
        re-read looking unchanged: the controls would freeze mid-playback with no
        error anywhere. Nothing else in the suite can see that, because every
        other assertion reads the fields rather than the identity.
    */
    it('hands core a fresh object on every read, so its assignment lands', () => {
        const media = document.createElement('audio');
        const { state, frame } = fakeAvState();
        const transport = createTransport({
            avState: state,
            currentMedia: () => media,
            bufferedSpans: elementSpans,
            prefs: createAudioPrefs(),
            labels: () => LABELS,
            peaksStrip: () => null,
            captions: () => ({ tracks: [], active: null }),
            setCaptionTrack: () => {},
            hasTranscript: () => false,
            panelOpen: () => false,
            setPanelOpen: () => {},
            t: (key) => key,
        });

        const before = transport.view();
        expect(transport.view()).not.toBe(before);

        // And the copy is a snapshot, not a window: a later frame must not
        // mutate a view core has already assigned and rendered from.
        (state as { currentTime: number }).currentTime = 1;
        frame();
        expect(before.currentTime).toBe(0);
        expect(transport.view().currentTime).toBe(1);

        transport.destroy();
    });

    it('carries the seek-step policy to core on the view', () => {
        const media = document.createElement('audio');
        const { state } = fakeAvState();
        const transport = createTransport({
            avState: state,
            currentMedia: () => media,
            bufferedSpans: elementSpans,
            prefs: createAudioPrefs(),
            labels: () => LABELS,
            peaksStrip: () => null,
            captions: () => ({ tracks: [], active: null }),
            setCaptionTrack: () => {},
            hasTranscript: () => false,
            panelOpen: () => false,
            setPanelOpen: () => {},
            t: (key) => key,
        });

        const view = transport.view();
        expect(view.stepSmall).toBe(SEEK_STEP_SMALL);
        expect(view.stepLarge).toBe(SEEK_STEP_LARGE);

        transport.destroy();
    });

    it("tells core to re-read on AVState's own cadences", () => {
        const media = document.createElement('audio');
        const { state, frame } = fakeAvState();
        const transport = createTransport({
            avState: state,
            currentMedia: () => media,
            bufferedSpans: elementSpans,
            prefs: createAudioPrefs(),
            labels: () => LABELS,
            peaksStrip: () => null,
            captions: () => ({ tracks: [], active: null }),
            setCaptionTrack: () => {},
            hasTranscript: () => false,
            panelOpen: () => false,
            setPanelOpen: () => {},
            t: (key) => key,
        });

        let reads = 0;
        const stop = transport.subscribe(() => (reads += 1));
        frame();
        expect(reads).toBe(1);

        stop();
        frame();
        expect(reads).toBe(1);

        transport.destroy();
    });

    /** The transport with a fixed set of caption tracks under it. */
    function captionedTransport(tracks: CaptionTrack[]) {
        const media = document.createElement('video');
        const { state } = fakeAvState();
        let active: string | null = null;
        const transport = createTransport({
            avState: state,
            currentMedia: () => media,
            bufferedSpans: elementSpans,
            prefs: createAudioPrefs(),
            labels: () => LABELS,
            peaksStrip: () => null,
            captions: () => ({ tracks, active }),
            setCaptionTrack: (id) => {
                active = id;
            },
            hasTranscript: () => false,
            panelOpen: () => false,
            setPanelOpen: () => {},
            t: (key) => key,
        });
        return { transport, active: () => active };
    }

    const EN: CaptionTrack = {
        url: 'en.vtt',
        language: 'en',
        label: 'English',
        annotation: 0,
    };
    const IT: CaptionTrack = {
        url: 'it.vtt',
        language: 'it',
        label: 'Italiano',
        annotation: 0,
    };

    it('offers no track at all when none loaded, so core renders no control', () => {
        const { transport } = captionedTransport([]);
        expect(transport.view().tracks).toEqual([]);
        transport.destroy();
    });

    it('offers the loaded tracks by their reader-facing names', () => {
        const { transport } = captionedTransport([EN, IT]);
        const view = transport.view();
        expect(view.tracks).toEqual([
            { id: 'en.vtt', label: 'English (en)' },
            { id: 'it.vtt', label: 'Italiano (it)' },
        ]);
        // Off is where every canvas starts.
        expect(view.activeTrack).toBeNull();
        transport.destroy();
    });

    it('selects a track through the stage and reports it back', () => {
        const { transport, active } = captionedTransport([EN, IT]);

        transport.port.setTrack(IT.url);
        expect(active()).toBe(IT.url);
        expect(transport.view().activeTrack).toBe(IT.url);

        transport.port.setTrack(null);
        expect(active()).toBeNull();
        expect(transport.view().activeTrack).toBeNull();
        transport.destroy();
    });

    /** The transport over a canvas that does or does not offer a transcript. */
    function transcriptTransport(available: boolean) {
        const media = document.createElement('video');
        const { state } = fakeAvState();
        let open = false;
        const transport = createTransport({
            avState: state,
            currentMedia: () => media,
            bufferedSpans: elementSpans,
            prefs: createAudioPrefs(),
            labels: () => LABELS,
            peaksStrip: () => null,
            captions: () => ({ tracks: [], active: null }),
            setCaptionTrack: () => {},
            hasTranscript: () => available,
            panelOpen: () => open,
            setPanelOpen: (next) => {
                open = next;
            },
            t: (key) => key,
        });
        return { transport, open: () => open };
    }

    it('offers no transcript control where the canvas has no transcript', () => {
        const { transport } = transcriptTransport(false);
        expect(transport.view().transcript).toBe(false);
        transport.destroy();
    });

    it('opens and closes the reading surface, and reports which it is', () => {
        const { transport, open } = transcriptTransport(true);
        expect(transport.view().transcript).toBe(true);
        expect(transport.view().transcriptOpen).toBe(false);

        transport.port.setTranscript(true);
        expect(open()).toBe(true);
        // Read back without waiting for a playback cadence: the panel's open
        // state is core's, and a paused canvas ticks no frames.
        expect(transport.view().transcriptOpen).toBe(true);

        transport.port.setTranscript(false);
        expect(open()).toBe(false);
        expect(transport.view().transcriptOpen).toBe(false);
        transport.destroy();
    });

    it('names the control from the catalog, so it announces in the locale', () => {
        const { transport } = transcriptTransport(true);
        expect(transport.view().labels.transcript).toBe('Transcript');
        transport.destroy();
    });
});
