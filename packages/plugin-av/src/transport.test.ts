import { flushSync } from 'svelte';
import { describe, expect, it } from 'vitest';

import type { AVState } from './avState';
import { createAudioPrefs, createTransport } from './transport.svelte';
import {
    TRANSPORT_MIN_WIDTH_PX,
    bufferedSpans,
    captionOptions,
    fitsTransport,
    formatMediaTime,
    fractionToTime,
    timeFraction,
    volumeIsSettable,
} from './transport';

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

describe('fitsTransport', () => {
    it('admits a canvas at or above the threshold', () => {
        expect(fitsTransport(TRANSPORT_MIN_WIDTH_PX)).toBe(true);
        expect(fitsTransport(TRANSPORT_MIN_WIDTH_PX + 1)).toBe(true);
    });

    it('refuses a canvas projected narrower than the chrome that controls it', () => {
        expect(fitsTransport(TRANSPORT_MIN_WIDTH_PX - 1)).toBe(false);
        expect(fitsTransport(0)).toBe(false);
    });

    it('refuses a width it cannot compare', () => {
        expect(fitsTransport(Number.NaN)).toBe(false);
        expect(fitsTransport(Number.POSITIVE_INFINITY)).toBe(false);
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
    /** A `TimeRanges` stand-in: the interface is three members wide. */
    function ranges(spans: [number, number][]): TimeRanges {
        return {
            length: spans.length,
            start: (index: number) => spans[index][0],
            end: (index: number) => spans[index][1],
        } as TimeRanges;
    }

    it('normalizes each span onto the scrubber', () => {
        expect(bufferedSpans(ranges([[0, 30]]), 120)).toEqual([
            { start: 0, end: 0.25 },
        ]);
        expect(
            bufferedSpans(
                ranges([
                    [0, 30],
                    [60, 120],
                ]),
                120,
            ),
        ).toEqual([
            { start: 0, end: 0.25 },
            { start: 0.5, end: 1 },
        ]);
    });

    it('drops empty spans and answers nothing without a duration', () => {
        expect(bufferedSpans(ranges([[5, 5]]), 120)).toEqual([]);
        expect(bufferedSpans(ranges([[0, 30]]), null)).toEqual([]);
        expect(bufferedSpans(null, 120)).toEqual([]);
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
                    },
                    {
                        url: 'it.vtt',
                        label: 'Captions in WebVTT format',
                        language: 'it',
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
                    { url: 'a.vtt', label: null, language: 'fr' },
                    { url: 'b.vtt', label: null, language: null },
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
        elapsed: 'Elapsed',
        duration: 'Duration',
        captions: 'Captions',
        captionsOff: 'Off',
        captionsTrack: 'Captions',
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
            prefs,
            labels: () => LABELS,
            peaksStrip: () => null,
            captions: () => ({ tracks: [], active: null }),
            setCaptionTrack: () => {},
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
            prefs: createAudioPrefs(),
            labels: () => LABELS,
            peaksStrip: () => null,
            captions: () => ({ tracks: [], active: null }),
            setCaptionTrack: () => {},
            t: (key, params) =>
                `${locale}:${key}:${String(params?.current)}/${String(params?.total)}`,
        });

        const scrubber = (): string | null | undefined => {
            flushSync();
            return transport.root
                .querySelector('[data-testid="av-scrubber"]')
                ?.getAttribute('aria-valuetext');
        };

        expect(scrubber()).toBe('en:av_position:0:00/0:02');

        // A paused canvas never ticks, so nothing but the locale change itself
        // can recompute what the scrubber announces.
        locale = 'fr';
        transport.retranslate();
        expect(scrubber()).toBe('fr:av_position:0:00/0:02');

        transport.destroy();
    });

    /** The transport with a fixed set of caption tracks under it. */
    function captionedTransport(
        tracks: {
            url: string;
            language: string | null;
            label: string | null;
        }[],
    ) {
        const media = document.createElement('video');
        const { state } = fakeAvState();
        let active: string | null = null;
        const transport = createTransport({
            avState: state,
            currentMedia: () => media,
            prefs: createAudioPrefs(),
            labels: () => LABELS,
            peaksStrip: () => null,
            captions: () => ({ tracks, active }),
            setCaptionTrack: (id) => {
                active = id;
            },
            t: (key) => key,
        });
        // Attached, because opening the list moves focus into it and an
        // unattached tree has no active element to move.
        document.body.append(transport.root);
        flushSync();
        const find = (selector: string): HTMLElement | null => {
            flushSync();
            return transport.root.querySelector(selector);
        };
        return { transport, find, active: () => active };
    }

    const EN = { url: 'en.vtt', language: 'en', label: 'English' };
    const IT = { url: 'it.vtt', language: 'it', label: 'Italiano' };

    it('renders no captions control when no track loaded', () => {
        const { transport, find } = captionedTransport([]);
        expect(find('[data-testid="av-captions"]')).toBeNull();
        transport.destroy();
    });

    it('renders a plain toggle for one track, off to begin with', () => {
        const { transport, find, active } = captionedTransport([EN]);

        const toggle = find('[data-testid="av-captions"]')!;
        expect(toggle.getAttribute('aria-pressed')).toBe('false');
        expect(find('[data-testid="av-caption-list"]')).toBeNull();

        toggle.click();
        expect(active()).toBe(EN.url);
        expect(
            find('[data-testid="av-captions"]')!.getAttribute('aria-pressed'),
        ).toBe('true');

        find('[data-testid="av-captions"]')!.click();
        expect(active()).toBeNull();
        transport.destroy();
    });

    it('opens a radio list of every track plus off when there are several', () => {
        const { transport, find } = captionedTransport([EN, IT]);

        find('[data-testid="av-captions"]')!.click();
        const list = find('[data-testid="av-caption-list"]')!;
        expect(list.getAttribute('role')).toBe('radiogroup');

        const radios = [...list.querySelectorAll('[role="radio"]')];
        expect(radios.map((radio) => radio.textContent?.trim())).toEqual([
            'Off',
            'English (en)',
            'Italiano (it)',
        ]);
        // Off is where it starts, and it is the group's only tab stop.
        expect(
            radios.map((radio) => radio.getAttribute('aria-checked')),
        ).toEqual(['true', 'false', 'false']);
        expect(radios.map((radio) => radio.getAttribute('tabindex'))).toEqual([
            '0',
            '-1',
            '-1',
        ]);
        transport.destroy();
    });

    it('moves between tracks with the arrow keys, selection following focus', async () => {
        const { transport, find, active } = captionedTransport([EN, IT]);
        find('[data-testid="av-captions"]')!.click();
        // The list is focused on the frame after it is rendered.
        flushSync();
        await new Promise((resolve) => requestAnimationFrame(resolve));

        const list = find('[data-testid="av-caption-list"]')!;
        list.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
        );
        expect(active()).toBe(EN.url);

        list.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'End', bubbles: true }),
        );
        expect(active()).toBe(IT.url);

        // Escape leaves rather than trapping the keyboard in the list.
        list.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
        );
        expect(find('[data-testid="av-caption-list"]')).toBeNull();
        transport.destroy();
    });
});
