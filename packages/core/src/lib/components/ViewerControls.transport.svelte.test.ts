/**
 * The control bar rendering registered **transport chrome**.
 *
 * The claimant here is a fake: a view model and a command port, both
 * media-agnostic, registered through the same public seam a plugin uses. That
 * is the point of the seam — core's playback controls are proved end to end
 * with no medium, no plugin and no media element anywhere in the test.
 *
 * What each control DOES is asserted as a call on the port, because the port is
 * the whole contract: a control that does not reach it is a control that does
 * nothing.
 */

import { flushSync, mount, unmount } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ViewerControlsTestHost from './ViewerControlsTestHost.svelte';
import { ViewerState } from '../state/viewer.svelte';
import type {
    TransportChromeLabels,
    TransportChromeView,
} from '../state/transportChrome';
import type { IconDescriptor } from '../types/plugin';

const ICON: IconDescriptor = {
    kind: 'svg',
    inner: '<path d="M0 0h1v1H0z" />',
    viewBox: '0 0 1 1',
};

const LABELS: TransportChromeLabels = {
    transport: 'Playback',
    play: 'Play',
    pause: 'Pause',
    elapsed: 'Elapsed',
    seek: 'Seek',
    duration: 'Duration',
    mute: 'Mute',
    unmute: 'Unmute',
    volume: 'Volume',
    tracks: 'Tracks',
    tracksOff: 'Off',
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
        stepSmall: 5,
        stepLarge: 30,
        labels: LABELS,
        ...overrides,
    } satisfies TransportChromeView;
}

const port = {
    toggle: vi.fn(),
    seek: vi.fn(),
    setMuted: vi.fn(),
    setVolume: vi.fn(),
    setTrack: vi.fn(),
};

const testId = (id: string) => document.querySelector(`[data-testid="${id}"]`);

describe('ViewerControls transport chrome', () => {
    let mounted: ReturnType<typeof mount> | null = null;
    let state: ViewerState;

    beforeEach(() => {
        vi.resetAllMocks();
        // jsdom has no ResizeObserver, and the bar watches its own size to work
        // out which of its groups share a row.
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
    });

    /**
     * Register chrome whose view can be replaced afterwards, the way a claimant
     * replaces it on navigation: the returned `update` swaps the view and
     * notifies, which is the only signal the seam carries.
     */
    function claimLive(initial: TransportChromeView) {
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

    /** Register chrome answering `view`, through the public seam. */
    function claim(view: TransportChromeView) {
        state.registerSdkChrome({
            id: 'fake',
            name: 'Fake claimant',
            icon: ICON,
            mount: () => () => {},
        } as never);

        return state.registerTransportChrome({
            id: 'fake:playback',
            icons: {
                play: ICON,
                pause: ICON,
                mute: ICON,
                unmute: ICON,
                tracks: ICON,
            },
            view: () => view,
            port,
            subscribe: () => () => {},
        });
    }

    function render() {
        mounted = mount(ViewerControlsTestHost, {
            target: document.body,
            props: { viewerState: state },
        });
        flushSync();
    }

    it('renders no playback controls when no chrome is registered', () => {
        render();

        // A seam nobody uses costs a host nothing visible.
        expect(testId('transport')).toBeNull();
        expect(testId('transport-play')).toBeNull();
    });

    it('renders no controls for a view with nothing to drive', () => {
        claim(makeView({ present: false }));
        render();

        // The transient case — the reader moved to something this claimant does
        // not drive — is `present: false` rather than deregistration.
        expect(testId('transport')).toBeNull();
    });

    it('renders the group, the clock readings and a real slider', () => {
        claim(makeView());
        render();

        const group = testId('transport')!;
        expect(group.getAttribute('role')).toBe('group');
        // Announced as its own labelled group, in the claimant's locale, so it
        // is distinguishable from the navigation beside it.
        expect(group.getAttribute('aria-label')).toBe('Playback');

        expect(testId('transport-elapsed')?.textContent?.trim()).toBe('0:25');
        expect(testId('transport-duration')?.textContent?.trim()).toBe('1:40');

        const scrubber = testId('transport-scrubber')!;
        expect(scrubber.getAttribute('role')).toBe('slider');
        expect(scrubber.getAttribute('tabindex')).toBe('0');
        // A clock reading, not a bare number: "25" is not a position a listener
        // can place.
        expect(scrubber.getAttribute('aria-valuetext')).toBe('0:25 of 1:40');
        expect(scrubber.getAttribute('aria-valuenow')).toBe('25');
        expect(scrubber.getAttribute('aria-valuemax')).toBe('100');
    });

    it('names the play button for what pressing it does, and toggles', () => {
        claim(makeView({ paused: true }));
        render();

        const play = testId('transport-play') as HTMLButtonElement;
        expect(play.getAttribute('aria-label')).toBe('Play');
        play.click();
        expect(port.toggle).toHaveBeenCalledTimes(1);
    });

    it('drives mute from the mute button', () => {
        claim(makeView({ muted: false }));
        render();

        const mute = testId('transport-mute') as HTMLButtonElement;
        expect(mute.getAttribute('aria-pressed')).toBe('false');
        mute.click();
        expect(port.setMuted).toHaveBeenCalledWith(true);
    });

    it('drives volume from the slider, and hides it where volume is read-only', async () => {
        claim(makeView());
        render();

        const volume = testId('transport-volume') as HTMLInputElement;
        expect(volume.value).toBe('0.8');
        volume.value = '0.3';
        volume.dispatchEvent(new Event('input', { bubbles: true }));
        expect(port.setVolume).toHaveBeenCalledWith(0.3);

        await unmount(mounted!);
        mounted = null;
        document.body.innerHTML = '';
        state = new ViewerState();
        claim(makeView({ volumeSettable: false }));
        render();

        // A slider that cannot move is a dead control, so it is not rendered.
        expect(testId('transport-volume')).toBeNull();
        expect(testId('transport-mute')).not.toBeNull();
    });

    describe('the scrubber keyboard', () => {
        function press(key: string) {
            testId('transport-scrubber')!.dispatchEvent(
                new KeyboardEvent('keydown', { key, bubbles: true }),
            );
        }

        beforeEach(() => {
            // currentTime 25 of a 100s timeline; steps of 5 and 30 seconds.
            claim(makeView());
            render();
        });

        it('moves by the claimant’s small step on the arrows', () => {
            press('ArrowRight');
            // Seconds in, a fraction out: core computes the coordinate because
            // it knows no clock.
            expect(port.seek).toHaveBeenLastCalledWith(0.3);
            press('ArrowLeft');
            expect(port.seek).toHaveBeenLastCalledWith(0.2);
        });

        it('moves by the claimant’s large step on the page keys', () => {
            press('PageUp');
            expect(port.seek).toHaveBeenLastCalledWith(0.55);
            press('PageDown');
            // Clamped rather than negative: 25 − 30 is off the start.
            expect(port.seek).toHaveBeenLastCalledWith(0);
        });

        it('jumps to the ends on Home and End', () => {
            press('Home');
            expect(port.seek).toHaveBeenLastCalledWith(0);
            press('End');
            expect(port.seek).toHaveBeenLastCalledWith(1);
        });

        it('leaves an unhandled key to the viewer', () => {
            press('Tab');
            expect(port.seek).not.toHaveBeenCalled();
        });
    });

    describe('the alternative-track control', () => {
        it('renders nothing at all with no tracks', () => {
            claim(makeView({ tracks: [] }));
            render();

            // The no-dead-control rule: there is no state in which this is
            // visible and does nothing.
            expect(testId('transport-tracks')).toBeNull();
        });

        it('renders a toggle for a single track', () => {
            claim(makeView({ tracks: [{ id: 'en', label: 'English' }] }));
            render();

            const button = testId('transport-tracks') as HTMLButtonElement;
            expect(button.getAttribute('aria-pressed')).toBe('false');
            // No list: one track is a pressed/unpressed toggle.
            expect(button.getAttribute('aria-expanded')).toBeNull();

            button.click();
            expect(port.setTrack).toHaveBeenCalledWith('en');
        });

        it('turns a single active track off again', () => {
            claim(
                makeView({
                    tracks: [{ id: 'en', label: 'English' }],
                    activeTrack: 'en',
                }),
            );
            render();

            const button = testId('transport-tracks') as HTMLButtonElement;
            expect(button.getAttribute('aria-pressed')).toBe('true');
            button.click();
            expect(port.setTrack).toHaveBeenCalledWith(null);
        });

        it('opens a radio group of the tracks and "off" for several', () => {
            claim(
                makeView({
                    tracks: [
                        { id: 'en', label: 'English' },
                        { id: 'fr', label: 'French' },
                    ],
                    activeTrack: 'fr',
                }),
            );
            render();

            const button = testId('transport-tracks') as HTMLButtonElement;
            expect(button.getAttribute('aria-expanded')).toBe('false');
            expect(testId('transport-track-list')).toBeNull();

            button.click();
            flushSync();

            const list = testId('transport-track-list')!;
            expect(list.getAttribute('role')).toBe('radiogroup');
            const radios = [...list.querySelectorAll('[role="radio"]')];
            // "Off" is an option of the same group, and first, so turning tracks
            // off is the same gesture as choosing one.
            expect(radios.map((radio) => radio.textContent?.trim())).toEqual([
                'Off',
                'English',
                'French',
            ]);
            // Roving tabindex: the active option is the group's one tab stop.
            expect(
                radios.map((radio) => radio.getAttribute('tabindex')),
            ).toEqual(['-1', '-1', '0']);

            (radios[1] as HTMLButtonElement).click();
            expect(port.setTrack).toHaveBeenCalledWith('en');
        });

        it('closes an open list when the offered track set changes', () => {
            const update = claimLive(
                makeView({
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

            // Navigation to a canvas offering one track: the button stops
            // claiming to be expanded, so a list left open could no longer be
            // closed by pressing it.
            update(makeView({ tracks: [{ id: 'en', label: 'English' }] }));

            expect(testId('transport-track-list')).toBeNull();
            expect(
                testId('transport-tracks')!.getAttribute('aria-expanded'),
            ).toBeNull();
        });

        it('closes an open list when the tracks go away entirely', () => {
            const update = claimLive(
                makeView({
                    tracks: [
                        { id: 'en', label: 'English' },
                        { id: 'fr', label: 'French' },
                    ],
                }),
            );
            render();

            (testId('transport-tracks') as HTMLButtonElement).click();
            flushSync();
            update(makeView({ tracks: [] }));
            expect(testId('transport-tracks')).toBeNull();

            // Back to the same two tracks: the list must wait for a gesture
            // rather than reappearing already open.
            update(
                makeView({
                    tracks: [
                        { id: 'en', label: 'English' },
                        { id: 'fr', label: 'French' },
                    ],
                }),
            );
            expect(testId('transport-track-list')).toBeNull();
        });
    });

    it('subscribes once, however many frames the claimant publishes', () => {
        // Core and a plugin share one Svelte runtime, so a claimant's `view()`
        // touching its own `$state` is the ordinary case, not an exotic one. If
        // the transport read it tracked, those signals would become
        // dependencies of the subscribing effect and every published frame
        // would tear the subscription down and build it again.
        const model = $state({ currentTime: 0 });
        let subscribeCalls = 0;
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
            },
            view: () =>
                makeView({ paused: false, currentTime: model.currentTime }),
            port,
            subscribe: (listener) => {
                subscribeCalls += 1;
                listeners.add(listener);
                return () => listeners.delete(listener);
            },
        });

        render();
        const afterMount = subscribeCalls;

        for (let frame = 1; frame <= 5; frame += 1) {
            model.currentTime = frame;
            for (const listener of listeners) listener();
            flushSync();
        }

        expect(subscribeCalls).toBe(afterMount);
        expect(listeners.size).toBe(afterMount);
    });
});
