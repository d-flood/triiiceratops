/**
 * **Idle chrome**: the control bar getting out of the way over a claimed
 * canvas.
 *
 * Driven through the same public seam a plugin registers against, with a fake
 * claimant and no medium anywhere — the bar's rule is about a thing that plays,
 * not about video.
 *
 * The two absolute rules — never hide while paused, never hide while the bar
 * holds keyboard focus — have a test each, because a viewer that broke either
 * would be worse than one that never hid anything.
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

function makeView(overrides: Partial<TransportChromeView> = {}) {
    return {
        present: true,
        paused: true,
        duration: 100,
        currentTime: 25,
        fraction: 0.25,
        buffered: [],
        muted: false,
        volume: 0.8,
        volumeSettable: true,
        positionText: '0:25 of 1:40',
        elapsedText: '0:25',
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

const testId = (id: string) => document.querySelector(`[data-testid="${id}"]`);
const bar = () => testId('control-bar')!;
const hidden = () => bar().classList.contains('idle-hidden');

/** Past the idle delay, with the reactive flush the timeout schedules. */
function waitOutTheDelay() {
    vi.advanceTimersByTime(IDLE_CHROME_DELAY_MS + 1);
    flushSync();
}

describe('ViewerControls idle chrome', () => {
    let mounted: ReturnType<typeof mount> | null = null;
    let state: ViewerState;

    beforeEach(() => {
        vi.resetAllMocks();
        vi.useFakeTimers();
        vi.stubGlobal(
            'ResizeObserver',
            class {
                observe() {}
                disconnect() {}
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
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    /** A claimant whose view can be swapped, as one does on every frame. */
    function claim(initial: TransportChromeView) {
        let view = initial;
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
            view: () => view,
            port,
            subscribe: (listener) => {
                listeners.add(listener);
                return () => listeners.delete(listener);
            },
        });

        return (next: TransportChromeView) => {
            view = next;
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

    /** Playing, and left alone long enough to have hidden. */
    function playUntilHidden() {
        const update = claim(makeView({ paused: true }));
        render();
        update(makeView({ paused: false }));
        waitOutTheDelay();
        expect(hidden()).toBe(true);
        return update;
    }

    it('hides the bar once a recording has played untouched', () => {
        playUntilHidden();

        // Both halves: transparent, and taking no clicks. An invisible bar that
        // still swallowed a tap aimed at the picture is the original bug.
        const style = getComputedStyle(bar());
        expect(style.opacity).toBe('0');
        expect(style.pointerEvents).toBe('none');
    });

    it('keeps the hidden bar in the accessibility tree and focusable', () => {
        playUntilHidden();

        // Not `visibility: hidden` and not `display: none`: a reader tabbing in
        // must reveal the controls rather than find nothing there.
        expect(bar().hasAttribute('aria-hidden')).toBe(false);
        expect(getComputedStyle(bar()).display).not.toBe('none');
        expect(testId('transport-play')).not.toBeNull();
    });

    it('never hides while playback is paused, however long the wait', () => {
        claim(makeView({ paused: true }));
        render();

        waitOutTheDelay();
        waitOutTheDelay();
        expect(hidden()).toBe(false);
    });

    it('reveals the bar the moment playback pauses', () => {
        const update = playUntilHidden();

        update(makeView({ paused: true }));
        expect(hidden()).toBe(false);

        // And a pause is a resting state, not a postponement.
        waitOutTheDelay();
        expect(hidden()).toBe(false);
    });

    it('reveals on a pointer move over the viewer', () => {
        playUntilHidden();

        document.body.dispatchEvent(new Event('pointermove'));
        flushSync();
        expect(hidden()).toBe(false);
    });

    it('reveals on a tap, for a reader with no pointer to move', () => {
        playUntilHidden();

        document.body.dispatchEvent(new Event('pointerdown'));
        flushSync();
        expect(hidden()).toBe(false);
    });

    it('reveals on a key press', () => {
        playUntilHidden();

        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'k' }));
        flushSync();
        expect(hidden()).toBe(false);
    });

    it('hides again once the reader stops interacting', () => {
        playUntilHidden();

        document.body.dispatchEvent(new Event('pointermove'));
        flushSync();
        expect(hidden()).toBe(false);

        waitOutTheDelay();
        expect(hidden()).toBe(true);
    });

    it('never hides while keyboard focus is inside the bar', () => {
        playUntilHidden();

        // Focus arriving reveals it, and then pins it: a keyboard reader must
        // never be walking controls they cannot see.
        (testId('transport-play') as HTMLButtonElement).focus();
        flushSync();
        expect(hidden()).toBe(false);

        waitOutTheDelay();
        waitOutTheDelay();
        expect(hidden()).toBe(false);

        // Focus leaving restarts the clock rather than hiding on the spot.
        (testId('transport-play') as HTMLButtonElement).blur();
        flushSync();
        expect(hidden()).toBe(false);
        waitOutTheDelay();
        expect(hidden()).toBe(true);
    });

    it('never hides while the pointer rests on the bar', () => {
        playUntilHidden();

        bar().dispatchEvent(new Event('pointerenter'));
        flushSync();
        waitOutTheDelay();
        waitOutTheDelay();
        expect(hidden()).toBe(false);

        bar().dispatchEvent(new Event('pointerleave'));
        waitOutTheDelay();
        expect(hidden()).toBe(true);
    });

    it('never hides while the canvas-info popover is open', () => {
        playUntilHidden();

        document.body.dispatchEvent(new Event('pointermove'));
        state.showCanvasInfo = true;
        flushSync();

        waitOutTheDelay();
        expect(hidden()).toBe(false);
    });

    it('never hides while the track list is open', () => {
        const update = claim(
            makeView({
                paused: true,
                tracks: [
                    { id: 'en', label: 'English' },
                    { id: 'fr', label: 'French' },
                ],
            }),
        );
        render();

        (testId('transport-tracks') as HTMLButtonElement).click();
        flushSync();
        expect(testId('transport-track-list')).not.toBeNull();

        update(
            makeView({
                paused: false,
                tracks: [
                    { id: 'en', label: 'English' },
                    { id: 'fr', label: 'French' },
                ],
            }),
        );
        waitOutTheDelay();
        expect(hidden()).toBe(false);
    });

    it('never hides while a flyout the unified toolbar owns is open', () => {
        // Under `controls: 'unified'` the toolbar renders inside the bar, so
        // its flyouts are popovers the bar owns as much as the track list is.
        // A keyboard reader is covered by the `:focus-visible` probe; a reader
        // who opened the menu with the mouse and moved the pointer off the bar
        // is not.
        state.config.controls = 'unified';
        const update = claim(makeView({ paused: true }));
        render();

        const toggle = bar().querySelector<HTMLButtonElement>(
            '[aria-controls="tri-flyout-viewing-mode"]',
        )!;
        toggle.click();
        flushSync();
        expect(bar().querySelector('[data-flyout-panel].open')).not.toBeNull();

        // Opening a menu sends focus into it. Take that away, so the open
        // flyout is the only thing left that could pin the bar — otherwise the
        // `:focus-visible` probe would answer this test instead.
        vi.advanceTimersByTime(50);
        (document.activeElement as HTMLElement | null)?.blur();

        // The pointer leaves the bar, which is what schedules the timer.
        bar().dispatchEvent(new Event('pointerleave'));
        update(makeView({ paused: false }));
        waitOutTheDelay();
        expect(hidden()).toBe(false);

        // Dismissing it lets the bar go idle again. The dismissal restarts the
        // clock the way any other interaction does.
        toggle.click();
        flushSync();
        expect(bar().querySelector('[data-flyout-panel].open')).toBeNull();
        // Opening the menu moved focus into it; a mouse reader's focus goes
        // with the dismissal, and only then is nothing pinning the bar.
        (document.activeElement as HTMLElement | null)?.blur();
        document.body.dispatchEvent(new Event('pointermove'));
        flushSync();
        waitOutTheDelay();
        expect(hidden()).toBe(true);
    });

    it('registers no idle timer at all with no chrome registered', () => {
        render();

        // A manifest of page images: the bar behaves exactly as it did before,
        // and nothing is scheduled to make it stop.
        expect(vi.getTimerCount()).toBe(0);
        waitOutTheDelay();
        expect(hidden()).toBe(false);
    });
});
