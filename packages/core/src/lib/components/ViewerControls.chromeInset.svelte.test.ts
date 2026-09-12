/**
 * **The control bar reports what it is covering** (`ViewerState.chromeInset`).
 *
 * The bar floats OVER the canvas rect, so a claimant drawing into that rect has
 * no way to find out which band of its own picture a reader cannot see. The
 * case that forced this is captions: a video element paints its cues at the
 * foot of the picture, which is exactly where a bottom-anchored bar is, and the
 * cue box lives in the user agent's shadow DOM where nothing of ours can
 * measure or style it. So the bar states the band and the claimant lifts its
 * cues.
 *
 * Geometry is stubbed rather than laid out: this DOM gives every element a zero
 * box, and what is under test is the arithmetic and the rules around it — which
 * edge, and when the band is nothing.
 */

import { flushSync, mount, unmount } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ViewerControlsTestHost from './ViewerControlsTestHost.svelte';
import { IDLE_CHROME_DELAY_MS } from './viewerControls';
import { ViewerState } from '../state/viewer.svelte';
import type { TransportChromeView } from '../state/transportChrome';
import type { IconDescriptor } from '../types/plugin';

const ICON: IconDescriptor = {
    kind: 'svg',
    inner: '<path d="M0 0h1v1H0z" />',
    viewBox: '0 0 1 1',
};

/** The surface the bar floats over, in the stubbed layout. */
const SURFACE = { top: 0, bottom: 600 };

function view(overrides: Partial<TransportChromeView> = {}) {
    return {
        present: true,
        paused: true,
        duration: 100,
        currentTime: 0,
        fraction: 0,
        buffered: [],
        muted: false,
        volume: 1,
        volumeSettable: true,
        positionText: '0:00 of 1:40',
        elapsedText: '0:00',
        durationText: '1:40',
        strip: null,
        tracks: [],
        activeTrack: null,
        transcript: false,
        transcriptOpen: false,
        stepSmall: 5,
        stepLarge: 30,
        labels: {
            transport: 'Playback',
            play: 'Play',
            pause: 'Pause',
            seek: 'Seek',
            mute: 'Mute',
            unmute: 'Unmute',
            volume: 'Volume',
            tracks: 'Tracks',
            tracksOff: 'Off',
            transcript: 'Transcript',
        },
        ...overrides,
    } satisfies TransportChromeView;
}

const port = {
    toggle: vi.fn(),
    seek: vi.fn(),
    setMuted: vi.fn(),
    setVolume: vi.fn(),
    setTrack: vi.fn(),
    setTranscript: vi.fn(),
};

describe('the control bar’s reported chrome inset', () => {
    let mounted: ReturnType<typeof mount> | null = null;
    let state: ViewerState;
    /** Where the stub puts the bar. The surface is fixed under it. */
    let barBox = { top: 567, bottom: 600 };

    beforeEach(() => {
        vi.resetAllMocks();
        vi.useFakeTimers();
        barBox = { top: 567, bottom: 600 };
        vi.stubGlobal(
            'ResizeObserver',
            class {
                observe() {}
                disconnect() {}
            },
        );
        vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
            function (this: Element) {
                const box = this.classList.contains('control-bar')
                    ? barBox
                    : SURFACE;
                return {
                    ...box,
                    height: box.bottom - box.top,
                    left: 0,
                    right: 800,
                    width: 800,
                    x: 0,
                    y: box.top,
                    toJSON: () => ({}),
                } as DOMRect;
            },
        );
        state = new ViewerState();
    });

    afterEach(async () => {
        if (mounted) {
            await unmount(mounted);
            mounted = null;
        }
        document.body.innerHTML = '';
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    /** Register a claimant so the bar renders its transport and can idle-hide. */
    function claim(initial: TransportChromeView) {
        let current = initial;
        const listeners = new Set<() => void>();

        state.registerSdkChrome({
            id: 'fake',
            name: 'Fake claimant',
            icon: ICON,
            mount: () => () => {},
        } as never);

        state.registerTransportChrome({
            id: 'fake:playback',
            icons: {
                play: ICON,
                pause: ICON,
                mute: ICON,
                unmute: ICON,
                tracks: ICON,
                transcript: ICON,
            },
            view: () => current,
            port,
            subscribe: (listener) => {
                listeners.add(listener);
                return () => listeners.delete(listener);
            },
        });

        return (next: TransportChromeView) => {
            current = next;
            for (const listener of listeners) listener();
            flushSync();
        };
    }

    function render() {
        mounted = mount(ViewerControlsTestHost, {
            target: document.body,
            props: { viewerState: state },
        });
        flushSync();
    }

    it('states the band a bottom-anchored bar covers', () => {
        claim(view());
        render();

        expect(state.chromeInset).toEqual({
            top: 0,
            right: 0,
            bottom: 33,
            left: 0,
        });
    });

    it('states the band a top-anchored bar covers, from its geometry alone', () => {
        // Where the bar sits is decided by measurement rather than by
        // `nav.edge`: a bar the config anchored to the top and one pushed there
        // because a rail took the other edge are the same fact underneath.
        barBox = { top: 0, bottom: 40 };
        claim(view());
        render();

        expect(state.chromeInset).toEqual({
            top: 40,
            right: 0,
            bottom: 0,
            left: 0,
        });
    });

    it('covers nothing while the bar is idle-hidden', () => {
        const update = claim(view({ paused: true }));
        render();
        expect(state.chromeInset.bottom).toBe(33);

        update(view({ paused: false }));
        vi.advanceTimersByTime(IDLE_CHROME_DELAY_MS + 1);
        flushSync();

        // The bar hides by going transparent — it stays laid out and focusable —
        // so its box is unchanged and only the flag can say the reader sees
        // nothing there. A claimant that kept lifting for it would be holding
        // its captions clear of a bar that has gone.
        expect(
            document
                .querySelector('[data-testid="control-bar"]')!
                .classList.contains('idle-hidden'),
        ).toBe(true);
        expect(state.chromeInset).toEqual({
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
        });
    });

    it('covers nothing again once the bar comes back', () => {
        const update = claim(view({ paused: true }));
        render();
        update(view({ paused: false }));
        vi.advanceTimersByTime(IDLE_CHROME_DELAY_MS + 1);
        flushSync();
        expect(state.chromeInset.bottom).toBe(0);

        document
            .querySelector('[data-testid="control-bar"]')!
            .parentElement!.dispatchEvent(
                new Event('pointermove', { bubbles: true }),
            );
        flushSync();

        expect(state.chromeInset.bottom).toBe(33);
    });

    it('covers nothing once the bar is gone', async () => {
        claim(view());
        render();
        expect(state.chromeInset.bottom).toBe(33);

        await unmount(mounted!);
        mounted = null;
        flushSync();

        expect(state.chromeInset).toEqual({
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
        });
    });
});
