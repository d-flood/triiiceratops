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
    seek: 'Seek',
    mute: 'Mute',
    unmute: 'Unmute',
    volume: 'Volume',
    tracks: 'Tracks',
    tracksOff: 'Off',
    transcript: 'Transcript',
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
    setTranscript: vi.fn(),
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
                transcript: ICON,
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

        it('keeps a list open while the track set only grows', () => {
            // A caption track joins the set once it has parsed with cues in
            // it, so a canvas with two of them arrives as one and then two. A
            // list open over the first must survive the second: this is the
            // path a `config.openMenu` of `captions` always takes.
            state.setOpenMenu('captions');
            const update = claimLive(
                makeView({ tracks: [{ id: 'en', label: 'English' }] }),
            );
            render();
            expect(testId('transport-track-list')).not.toBeNull();

            update(
                makeView({
                    tracks: [
                        { id: 'en', label: 'English' },
                        { id: 'it', label: 'Italian' },
                    ],
                }),
            );

            expect(testId('transport-track-list')).not.toBeNull();
            expect(state.openMenu).toBe('captions');
        });

        it('opens the list from config before any track has loaded', () => {
            // The config is applied long before the claimant has parsed
            // anything, so the list is asked for over an empty set and has to
            // be standing when the set fills.
            state.setOpenMenu('captions');
            const update = claimLive(makeView({ tracks: [] }));
            render();

            update(
                makeView({
                    tracks: [
                        { id: 'en', label: 'English' },
                        { id: 'it', label: 'Italian' },
                    ],
                }),
            );

            expect(testId('transport-track-list')).not.toBeNull();
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

    describe('the readable-text control', () => {
        it('renders nothing at all where the claimant offers no text', () => {
            claim(makeView({ transcript: false }));
            render();

            // The same no-dead-control rule the track control follows.
            expect(testId('transport-transcript')).toBeNull();
        });

        it('renders a two-state toggle, and asks for the text to be shown', () => {
            claim(makeView({ transcript: true, transcriptOpen: false }));
            render();

            const button = testId('transport-transcript') as HTMLButtonElement;
            expect(button.getAttribute('aria-pressed')).toBe('false');
            expect(button.getAttribute('aria-label')).toBe('Transcript');
            // Not a popover this button owns — the surface it shows lives
            // wherever the claimant put it.
            expect(button.getAttribute('aria-expanded')).toBeNull();

            button.click();
            expect(port.setTranscript).toHaveBeenCalledWith(true);
        });

        it('closes what it opened rather than asking to open twice', () => {
            claim(makeView({ transcript: true, transcriptOpen: true }));
            render();

            const button = testId('transport-transcript') as HTMLButtonElement;
            expect(button.getAttribute('aria-pressed')).toBe('true');

            button.click();
            expect(port.setTranscript).toHaveBeenCalledWith(false);
        });

        it('is independent of the caption tracks', () => {
            // A recording may have captions and no transcript, or a transcript
            // and no captions; the two controls answer different questions and
            // neither stands in for the other.
            claim(makeView({ tracks: [], transcript: true }));
            render();

            expect(testId('transport-tracks')).toBeNull();
            expect(testId('transport-transcript')).not.toBeNull();
        });
    });

    describe('hover tooltips', () => {
        /**
         * The transport's buttons carry the toolbar's own tooltip vocabulary, so
         * a unified toolbar and the transport beside it label their buttons the
         * same way. A picture alone cannot say which of a transcript, a
         * `rendering` transcript or timed notes the panel control opens.
         */
        it('names every button it renders, matching the accessible name', () => {
            claim(
                makeView({
                    transcript: true,
                    tracks: [{ id: 'en', label: 'English' }],
                }),
            );
            render();

            for (const [id, tip] of [
                ['transport-play', 'Play'],
                ['transport-mute', 'Mute'],
                ['transport-tracks', 'Tracks'],
                ['transport-transcript', 'Transcript'],
            ] as const) {
                const button = testId(id) as HTMLButtonElement;
                expect(button, `no button ${id}`).not.toBeNull();
                expect(button.getAttribute('data-tip'), id).toBe(tip);
                // The tooltip and the accessible name are one string: a sighted
                // reader and a screen-reader user are told the same thing.
                expect(button.getAttribute('aria-label'), id).toBe(tip);
                expect(button.className, id).toContain('tooltip');
            }
        });

        it('follows the state the two-state controls are in', () => {
            claim(makeView({ paused: false, muted: true, transcript: true }));
            render();

            expect(testId('transport-play')!.getAttribute('data-tip')).toBe(
                'Pause',
            );
            expect(testId('transport-mute')!.getAttribute('data-tip')).toBe(
                'Unmute',
            );
        });

        it('points away from the edge the bar is docked to', () => {
            // A tooltip above a bar docked to the top paints off the viewer.
            state.config = { ...state.config, nav: { edge: 'top' } };
            claim(makeView({ transcript: true }));
            render();

            expect(testId('transport-play')!.className).toContain(
                'place-bottom',
            );

            unmount(mounted!);
            mounted = null;
            state.config = { ...state.config, nav: { edge: 'bottom' } };
            claim(makeView({ transcript: true }));
            render();

            expect(testId('transport-play')!.className).toContain('place-top');
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
                transcript: ICON,
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
    /**
     * Keyframe previews (`thumbnail-nav`, Cookbook 0229). The keyframes reach
     * the transport from the manifest's own ranges through the control bar, so
     * the manifest is loaded on the same real `ViewerState` the chrome is
     * registered on.
     */
    describe('keyframe previews on the scrubber', () => {
        const MANIFEST_ID = 'https://example.org/iiif/lecture';
        const CANVAS_ID = `${MANIFEST_ID}/canvas/1`;
        const THUMB = (at: number) => `https://example.org/thumb/${at}.png`;

        /** One canvas, and a `thumbnail-nav` range of keyframes over it. */
        async function loadKeyframeManifest() {
            await state.setManifestData(MANIFEST_ID, {
                '@context': 'http://iiif.io/api/presentation/3/context.json',
                id: MANIFEST_ID,
                type: 'Manifest',
                label: { en: ['Lecture'] },
                items: [
                    {
                        id: CANVAS_ID,
                        type: 'Canvas',
                        duration: 100,
                        items: [],
                    },
                ],
                structures: [
                    {
                        id: `${MANIFEST_ID}/range/nav`,
                        type: 'Range',
                        behavior: ['thumbnail-nav'],
                        items: [0, 50].map((at) => ({
                            id: `${MANIFEST_ID}/range/${at}`,
                            type: 'Range',
                            label: { en: [`${at}s – 100s`] },
                            thumbnail: THUMB(at),
                            items: [
                                {
                                    id: `${CANVAS_ID}#t=${at},100`,
                                    type: 'Canvas',
                                },
                            ],
                        })),
                    },
                ],
            });
            flushSync();
        }

        /** The scrubber, with a measurable track so a pointer maps to a fraction. */
        function scrubber() {
            const element = testId('transport-scrubber') as HTMLElement;
            element.getBoundingClientRect = () =>
                ({ left: 0, width: 200 }) as DOMRect;
            return element;
        }

        function hover(clientX: number) {
            scrubber().dispatchEvent(
                new PointerEvent('pointermove', { clientX, bubbles: true }),
            );
            flushSync();
        }

        const previewSrc = () =>
            (document.querySelector('.preview img') as HTMLImageElement | null)
                ?.src;

        const previewLabel = () =>
            document.querySelector('.preview-label')?.textContent;

        it('marks where the keyframes are without being asked', async () => {
            await loadKeyframeManifest();
            claim(makeView());
            render();

            // Visible before any hover: a reader can see the recording offers
            // them at all.
            const ticks = [...document.querySelectorAll('.tick')];
            expect(
                ticks.map((tick) => (tick as HTMLElement).style.left),
            ).toEqual(['0%', '50%']);
        });

        it('previews the keyframe covering the pointer', async () => {
            await loadKeyframeManifest();
            claim(makeView());
            render();

            expect(previewSrc()).toBeUndefined();

            // 60% of a 100s timeline is 60s, which the keyframe at 50s covers.
            hover(120);
            expect(previewSrc()).toBe(THUMB(50));

            // 20% is 20s, still inside the keyframe that opens at 0s.
            hover(40);
            expect(previewSrc()).toBe(THUMB(0));
        });

        it('captions the preview with the range’s own label', async () => {
            await loadKeyframeManifest();
            claim(makeView());
            render();

            hover(120);
            expect(previewLabel()).toBe('50s – 100s');

            hover(40);
            expect(previewLabel()).toBe('0s – 100s');
        });

        it('clears the preview when the pointer leaves', async () => {
            await loadKeyframeManifest();
            claim(makeView());
            render();

            hover(120);
            scrubber().dispatchEvent(
                new PointerEvent('pointerleave', { bubbles: true }),
            );
            flushSync();

            expect(previewSrc()).toBeUndefined();
        });

        it('previews the playhead’s own keyframe for a keyboard reader', async () => {
            await loadKeyframeManifest();
            // The playhead at 75s, which the keyframe at 50s covers.
            claim(makeView({ currentTime: 75, fraction: 0.75 }));
            render();

            scrubber().dispatchEvent(
                new FocusEvent('focus', { bubbles: false }),
            );
            flushSync();
            // Reaching the scrubber by Tab is enough to see where the playhead
            // stands; no pointer is involved.
            expect(previewSrc()).toBe(THUMB(50));

            scrubber().dispatchEvent(
                new FocusEvent('blur', { bubbles: false }),
            );
            flushSync();
            expect(previewSrc()).toBeUndefined();
        });

        it('announces the keyframe the playhead stands in', async () => {
            await loadKeyframeManifest();
            // The playhead at 75s of 100s, which the keyframe at 50s covers.
            claim(makeView({ currentTime: 75, fraction: 0.75 }));
            render();

            // The preview and the ticks are decoration; this is the only route
            // by which a keyframe reaches assistive technology.
            expect(
                testId('transport-scrubber')!.getAttribute('aria-valuetext'),
            ).toBe('0:25 of 1:40, 50s – 100s');
        });

        it('renders nothing extra for a manifest with no keyframes', () => {
            claim(makeView());
            render();

            hover(120);
            expect(document.querySelector('.tick')).toBeNull();
            expect(previewSrc()).toBeUndefined();
            // The announced position is untouched where nothing offers
            // keyframes, which is every manifest that declares none.
            expect(
                testId('transport-scrubber')!.getAttribute('aria-valuetext'),
            ).toBe('0:25 of 1:40');
        });
    });
});
