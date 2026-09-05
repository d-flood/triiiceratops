/**
 * The stage's DOM contract: what the media element is allowed to be, and what a
 * failed stream does to the canvas it failed on.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CaptionTrack } from './captions';
import { loadHls } from './hlsLink';
import { createMediaStage } from './mediaStage';
import type { AvSource } from './sources';
import { STYLES } from './styles';

// Only the loader is faked. `isHlsSource` and `hasNativeHlsSupport` are the
// decision under test and stay real; what must never run here is the import of
// hls.js itself, which needs Media Source Extensions this DOM does not have.
vi.mock('./hlsLink', async (importOriginal) => ({
    ...(await importOriginal<typeof import('./hlsLink')>()),
    loadHls: vi.fn(),
}));

const VIDEO: AvSource = {
    url: 'https://example.org/clip.mp4',
    kind: 'video',
    format: 'video/mp4',
    paintsPicture: true,
};

const AUDIO: AvSource = {
    url: 'https://example.org/tone.mp3',
    kind: 'audio',
    format: 'audio/mpeg',
    paintsPicture: false,
};

/** Every `place` needs the visible box the waveform surface clips against. */
const VIEWPORT = { width: 1280, height: 800 };

function stageFor(source: AvSource) {
    return createMediaStage({
        canvasId: 'canvas/1',
        source,
        layout: source.kind === 'video' ? 'video' : 'audio',
        cannotPlayMessage: 'This media cannot be played here.',
        onPlayStateChange: () => {},
    });
}

/**
 * Attach a stage to a document carrying the package's real stylesheet, so an
 * assertion can read what a reader would see rather than an attribute.
 */
function stagedInDocument(source: AvSource) {
    const style = document.createElement('style');
    style.textContent = STYLES;
    document.head.append(style);

    const stage = stageFor(source);
    document.body.append(stage.root);
    return stage;
}

/** The visual lane, whatever the layout put in it. */
function visualLaneOf(stage: { root: HTMLElement }): HTMLElement {
    return stage.root.querySelector<HTMLElement>(
        '[data-testid="av-visual-lane"]',
    )!;
}

/**
 * Whether this stage is showing the "can't play" treatment — read off the notice
 * the reader sees, which is the only place the stage publishes the answer.
 */
function showsCannotPlay(stage: { root: HTMLElement }): boolean {
    return !stage.root.querySelector<HTMLElement>(
        '[data-testid="av-cannot-play"]',
    )!.hidden;
}

/**
 * The timeline lane. Present in the DOM whatever the layout — a video layout
 * simply never places it — so the tests reach it the way a reader's pointer
 * does rather than through the stage's published interface.
 */
function timelineLaneOf(stage: { root: HTMLElement }): HTMLElement {
    return stage.root.querySelector<HTMLElement>(
        '[data-testid="av-timeline-lane"]',
    )!;
}

/** The full-rect tap target, which only a painted companion's stage builds. */
function tapTargetOf(stage: { root: HTMLElement }): HTMLElement {
    return stage.root.querySelector<HTMLElement>('[data-testid="av-tap"]')!;
}

/**
 * A pointer gesture on a lane: down where it started, up where it ended. The
 * `up` goes to the window because that is where the stage listens for it —
 * a drag has by then been handed to the renderer, which captured the pointer.
 */
function gesture(
    target: HTMLElement,
    from: { x: number; y: number },
    to: { x: number; y: number } = from,
): void {
    target.dispatchEvent(
        new PointerEvent('pointerdown', {
            bubbles: true,
            button: 0,
            clientX: from.x,
            clientY: from.y,
        }),
    );
    window.dispatchEvent(
        new PointerEvent('pointerup', {
            bubbles: true,
            button: 0,
            clientX: to.x,
            clientY: to.y,
        }),
    );
}

/** A tap at a point on a lane. */
function tap(target: HTMLElement, x = 0, y = 0): void {
    gesture(target, { x, y });
}

afterEach(() => {
    document.head.replaceChildren();
    document.body.replaceChildren();
});

describe('the media element', () => {
    it('plays video inline, never with the native controls', () => {
        const stage = stageFor(VIDEO);

        expect(stage.media.tagName).toBe('VIDEO');
        expect(stage.media.hasAttribute('playsinline')).toBe(true);
        expect(stage.media.hasAttribute('controls')).toBe(false);
        expect(stage.media.controls).toBe(false);
    });

    it.each([
        ['video', VIDEO],
        ['audio', AUDIO],
    ])(
        'puts the %s element in anonymous CORS mode, so a cross-origin VTT can load',
        (_kind, source) => {
            expect(stageFor(source).media.crossOrigin).toBe('anonymous');
        },
    );

    it('asks for metadata only, so twenty canvases do not fetch twenty files', () => {
        expect(stageFor(VIDEO).media.preload).toBe('metadata');
    });

    it('uses an audio element for a sound body', () => {
        const stage = stageFor(AUDIO);

        expect(stage.media.tagName).toBe('AUDIO');
        expect(stage.media.hasAttribute('controls')).toBe(false);
    });
});

describe('an HLS source', () => {
    const HLS: AvSource = {
        url: 'https://example.org/stream.m3u8',
        kind: 'video',
        format: 'application/vnd.apple.mpegurl',
        paintsPicture: true,
    };

    // The loader is a module-level mock, so its call record outlives a test.
    beforeEach(() => vi.clearAllMocks());
    // `withNativeHls` patches a prototype every later describe also uses.
    afterEach(() => vi.restoreAllMocks());

    /** What `canPlayType` answers for the HLS type on every element here. */
    function withNativeHls(answer: string): void {
        vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue(
            answer as CanPlayTypeResult,
        );
    }

    /** A loader that resolves an attachment, and the attachment it resolved. */
    function loaderAttaching() {
        const attachment = { destroy: vi.fn() };
        const attachHlsStream = vi.fn(
            (
                _media: HTMLMediaElement,
                _url: string,
                _onUnplayable: () => void,
            ) => attachment,
        );
        vi.mocked(loadHls).mockResolvedValue({
            attachHlsStream,
        } as unknown as Awaited<ReturnType<typeof loadHls>>);
        return { attachment, attachHlsStream };
    }

    it('plays natively, and loads no chunk, where the platform decodes it', async () => {
        withNativeHls('maybe');
        const stage = stageFor(HLS);
        await Promise.resolve();

        expect(stage.media.getAttribute('src')).toBe(HLS.url);
        expect(loadHls).not.toHaveBeenCalled();
    });

    it('assigns no src of its own when hls.js has to play it', async () => {
        withNativeHls('');
        const { attachHlsStream } = loaderAttaching();

        const stage = stageFor(HLS);
        await vi.waitFor(() => expect(attachHlsStream).toHaveBeenCalled());

        // hls.js owns the element's source; a `src` beside it would race the
        // MediaSource it attaches.
        expect(stage.media.hasAttribute('src')).toBe(false);
        expect(attachHlsStream.mock.calls[0][0]).toBe(stage.media);
        expect(attachHlsStream.mock.calls[0][1]).toBe(HLS.url);
        expect(showsCannotPlay(stage)).toBe(false);
    });

    it('leaves a progressive source alone', async () => {
        withNativeHls('');
        const stage = stageFor(VIDEO);
        await Promise.resolve();

        expect(stage.media.getAttribute('src')).toBe(VIDEO.url);
        expect(loadHls).not.toHaveBeenCalled();
    });

    it("shows this canvas's can't-play treatment when the chunk will not load", async () => {
        withNativeHls('');
        vi.mocked(loadHls).mockResolvedValue(null);

        const stage = stageFor(HLS);
        await vi.waitFor(() => expect(showsCannotPlay(stage)).toBe(true));

        expect(
            stage.root.querySelector<HTMLElement>(
                '[data-testid="av-cannot-play"]',
            )?.hidden,
        ).toBe(false);
    });

    it('shows the same treatment when hls.js cannot run here', async () => {
        withNativeHls('');
        // `attachHlsStream` answering null is "no Media Source Extensions".
        vi.mocked(loadHls).mockResolvedValue({
            attachHlsStream: () => null,
        } as unknown as Awaited<ReturnType<typeof loadHls>>);

        const stage = stageFor(HLS);
        await vi.waitFor(() => expect(showsCannotPlay(stage)).toBe(true));
    });

    it('shows the same treatment when attaching the player throws', async () => {
        withNativeHls('');
        vi.mocked(loadHls).mockResolvedValue({
            attachHlsStream: () => {
                throw new Error('attachMedia refused this element');
            },
        } as unknown as Awaited<ReturnType<typeof loadHls>>);

        const stage = stageFor(HLS);
        await vi.waitFor(() => expect(showsCannotPlay(stage)).toBe(true));

        expect(
            stage.root.querySelector<HTMLElement>(
                '[data-testid="av-cannot-play"]',
            )?.hidden,
        ).toBe(false);
    });

    it('destroys the player with the stage', async () => {
        withNativeHls('');
        const { attachment, attachHlsStream } = loaderAttaching();

        const stage = stageFor(HLS);
        await vi.waitFor(() => expect(attachHlsStream).toHaveBeenCalled());
        stage.destroy();

        expect(attachment.destroy).toHaveBeenCalled();
    });

    it('attaches nothing for a rendition swapped away while the chunk was in flight', async () => {
        withNativeHls('');
        const { attachment, attachHlsStream } = loaderAttaching();

        const stage = stageFor(HLS);
        // The reader picked the MP4 before the chunk landed. Attaching now would
        // put a player over a source nobody asked for any more.
        stage.setSource({
            url: 'https://example.org/clip.mp4',
            kind: 'video',
            format: 'video/mp4',
            paintsPicture: true,
        });
        await vi.waitFor(() => expect(loadHls).toHaveBeenCalled());
        await Promise.resolve();

        expect(attachHlsStream).not.toHaveBeenCalled();
        expect(attachment.destroy).not.toHaveBeenCalled();
        expect(stage.media.getAttribute('src')).toBe(
            'https://example.org/clip.mp4',
        );
    });

    it('reports no failure for a rendition swapped away before the chunk threw', async () => {
        withNativeHls('');
        vi.mocked(loadHls).mockRejectedValue(new Error('chunk unreachable'));

        const stage = stageFor(HLS);
        stage.setSource({
            url: 'https://example.org/clip.mp4',
            kind: 'video',
            format: 'video/mp4',
            paintsPicture: true,
        });
        await vi.waitFor(() => expect(loadHls).toHaveBeenCalled());
        await Promise.resolve();

        // The abandoned stream's failure is not the MP4's.
        expect(showsCannotPlay(stage)).toBe(false);
    });

    it('attaches nothing to a stage torn down while the chunk was in flight', async () => {
        withNativeHls('');
        const { attachment, attachHlsStream } = loaderAttaching();

        const stage = stageFor(HLS);
        stage.destroy();
        await vi.waitFor(() => expect(loadHls).toHaveBeenCalled());
        await Promise.resolve();

        expect(attachHlsStream).not.toHaveBeenCalled();
        expect(attachment.destroy).not.toHaveBeenCalled();
    });
});

describe('a failed stream', () => {
    it('shows the localized treatment inside its own stage', () => {
        const stage = stageFor(VIDEO);
        const notice = stage.root.querySelector<HTMLElement>(
            '[data-testid="av-cannot-play"]',
        );

        expect(notice?.hidden).toBe(true);
        expect(showsCannotPlay(stage)).toBe(false);

        stage.media.dispatchEvent(new Event('error'));

        expect(notice?.hidden).toBe(false);
        expect(notice?.textContent).toBe('This media cannot be played here.');
        expect(showsCannotPlay(stage)).toBe(true);
    });

    it('takes the picture away, so the notice is not read beside a black box', () => {
        // Read the computed value, not the attribute: setting `hidden` is not
        // the same as being hidden. `.tri-av-media { display: block }` is an
        // author rule, and where a UA implements the spec's suggested
        // `[hidden] { display: none }` without `!important` — as this DOM does —
        // the author rule wins and the black box stays on screen.
        const stage = stagedInDocument(VIDEO);

        expect(getComputedStyle(stage.media).display).not.toBe('none');

        stage.media.dispatchEvent(new Event('error'));

        expect(getComputedStyle(stage.media).display).toBe('none');
    });

    it('is retranslated when the viewer locale changes', () => {
        const stage = stageFor(VIDEO);
        stage.media.dispatchEvent(new Event('error'));

        stage.setCannotPlayMessage('Ce média ne peut pas être lu ici.');

        expect(
            stage.root.querySelector('[data-testid="av-cannot-play"]')
                ?.textContent,
        ).toBe('Ce média ne peut pas être lu ici.');
    });

    it('stops responding to taps', () => {
        const stage = stageFor(VIDEO);
        const play = vi.spyOn(stage.media, 'play').mockResolvedValue(undefined);

        stage.media.dispatchEvent(new Event('error'));
        tap(visualLaneOf(stage));

        expect(play).not.toHaveBeenCalled();
    });
});

/**
 * Swapping rendition — the Choice path. The contract is that the reader keeps
 * their place: `currentTime` and the paused state are captured before the old
 * source is detached, and restored once the new one reports metadata.
 */
describe('a source swap between choice renditions', () => {
    const MP4_LOW: AvSource = {
        url: 'https://example.org/clip-low.mp4',
        kind: 'video',
        format: 'video/mp4',
        paintsPicture: true,
    };

    /** jsdom's `paused` is a getter, so playing is staged rather than done. */
    function setPaused(media: HTMLMediaElement, paused: boolean): void {
        Object.defineProperty(media, 'paused', {
            configurable: true,
            get: () => paused,
        });
    }

    it('restores the playhead and stays paused', () => {
        const stage = stageFor(VIDEO);
        const play = vi.spyOn(stage.media, 'play').mockResolvedValue(undefined);
        stage.media.currentTime = 5;

        stage.setSource(MP4_LOW);

        // Detached first: the element is emptied, which is what resets the
        // playhead the capture had to be taken before.
        expect(stage.source).toBe(MP4_LOW);
        expect(stage.media.getAttribute('src')).toBe(MP4_LOW.url);

        stage.media.dispatchEvent(new Event('loadedmetadata'));

        expect(stage.media.currentTime).toBeCloseTo(5, 3);
        expect(play).not.toHaveBeenCalled();
    });

    it('resumes playing when the swap interrupted playback', () => {
        const stage = stageFor(VIDEO);
        const play = vi.spyOn(stage.media, 'play').mockResolvedValue(undefined);
        stage.media.currentTime = 5;
        setPaused(stage.media, false);

        stage.setSource(MP4_LOW);
        // `pause()` on the way out is the swap's own doing, not the reader's.
        setPaused(stage.media, true);
        stage.media.dispatchEvent(new Event('loadedmetadata'));

        expect(stage.media.currentTime).toBeCloseTo(5, 3);
        expect(play).toHaveBeenCalledTimes(1);
    });

    it('does nothing when the same rendition is selected again', () => {
        const stage = stageFor(VIDEO);
        const load = vi.spyOn(stage.media, 'load');

        stage.setSource({ ...VIDEO });

        expect(load).not.toHaveBeenCalled();
    });

    it('clears the treatment the old rendition earned', () => {
        const stage = stageFor(VIDEO);
        stage.media.dispatchEvent(new Event('error'));
        expect(showsCannotPlay(stage)).toBe(true);

        stage.setSource(MP4_LOW);

        // A rendition the browser refused says nothing about the next one.
        expect(showsCannotPlay(stage)).toBe(false);
        expect(
            stage.root.querySelector<HTMLElement>(
                '[data-testid="av-cannot-play"]',
            )?.hidden,
        ).toBe(true);
    });

    it('carries the capture forward when a second swap supersedes the first', () => {
        const MP4_HIGH: AvSource = {
            url: 'https://example.org/clip-high.mp4',
            kind: 'video',
            format: 'video/mp4',
            paintsPicture: true,
        };
        const stage = stageFor(VIDEO);
        const play = vi.spyOn(stage.media, 'play').mockResolvedValue(undefined);
        stage.media.currentTime = 5;
        setPaused(stage.media, false);

        stage.setSource(MP4_LOW);
        // What the first swap did to the element: emptied and paused. A second
        // capture taken from here would record the swap, not the reader.
        stage.media.currentTime = 0;
        setPaused(stage.media, true);
        stage.setSource(MP4_HIGH);

        // The superseded swap's listener bows out; only the live one restores.
        stage.media.dispatchEvent(new Event('loadedmetadata'));

        expect(stage.media.currentTime).toBeCloseTo(5, 3);
        expect(play).toHaveBeenCalledTimes(1);
    });

    it('restores once, from the live swap alone', () => {
        const MP4_HIGH: AvSource = {
            url: 'https://example.org/clip-high.mp4',
            kind: 'video',
            format: 'video/mp4',
            paintsPicture: true,
        };
        const stage = stageFor(VIDEO);
        const play = vi.spyOn(stage.media, 'play').mockResolvedValue(undefined);
        stage.media.currentTime = 5;
        setPaused(stage.media, false);

        stage.setSource(MP4_LOW);
        stage.setSource(MP4_HIGH);
        stage.media.dispatchEvent(new Event('loadedmetadata'));

        // The superseded swap left a listener behind; only the swap the element
        // is actually loading may act on it, or the reader is resumed twice.
        expect(play).toHaveBeenCalledTimes(1);
    });

    it('does not restore into a stage that has been destroyed', () => {
        const stage = stageFor(VIDEO);
        const play = vi.spyOn(stage.media, 'play').mockResolvedValue(undefined);
        stage.media.currentTime = 5;
        setPaused(stage.media, false);

        stage.setSource(MP4_LOW);
        stage.destroy();
        stage.media.dispatchEvent(new Event('loadedmetadata'));

        expect(play).not.toHaveBeenCalled();
    });
});

describe('placement', () => {
    it('is hidden while the canvas has no projection', () => {
        const stage = stageFor(VIDEO);

        stage.place(null, VIEWPORT);

        expect(stage.root.hidden).toBe(true);
    });

    it('takes the projected rect verbatim — the layer origin is canvasToScreen’s', () => {
        const stage = stageFor(VIDEO);

        stage.place({ left: 12, top: 34, width: 320, height: 180 }, VIEWPORT);

        expect(stage.root.hidden).toBe(false);
        expect(stage.root.style.left).toBe('12px');
        expect(stage.root.style.top).toBe('34px');
        expect(stage.root.style.width).toBe('320px');
        expect(stage.root.style.height).toBe('180px');
    });

    it('clips an overhanging projection to the container', () => {
        const stage = stageFor(AUDIO);

        // Wider than the container and hanging off both sides of it.
        stage.place({ left: -60, top: 0, width: 1400, height: 800 }, VIEWPORT);

        // The box is still the projection — the lanes divide the canvas — but
        // the overhang is clipped away, which takes it out of hit testing too:
        // an audio lane fills its rect, and outside the container those taps
        // belong to whatever chrome is docked beside it.
        expect(stage.root.style.left).toBe('-60px');
        expect(stage.root.style.width).toBe('1400px');
        expect(timelineLaneOf(stage).style.width).toBe('1400px');
        expect(stage.root.style.clipPath).toBe('inset(0px 60px 0px 60px)');
    });

    it('clips nothing when the projection is inside the container', () => {
        const stage = stageFor(AUDIO);

        stage.place({ left: 10, top: 10, width: 400, height: 300 }, VIEWPORT);

        expect(stage.root.style.clipPath).toBe('none');
    });

    it('is hidden when the projection falls entirely outside the container', () => {
        const stage = stageFor(AUDIO);

        stage.place({ left: 1400, top: 0, width: 200, height: 200 }, VIEWPORT);

        expect(stage.root.hidden).toBe(true);
    });
});

describe('the stage layout', () => {
    it('puts the video in the visual lane and never places a timeline lane', () => {
        const stage = stageFor(VIDEO);
        stage.place({ left: 0, top: 0, width: 640, height: 360 }, VIEWPORT);

        const visual = stage.root.querySelector<HTMLElement>(
            '[data-testid="av-visual-lane"]',
        )!;
        expect(visual.contains(stage.media)).toBe(true);
        expect(visual.style.height).toBe('360px');
        expect(timelineLaneOf(stage).hidden).toBe(true);
    });

    it('gives audio alone the whole rect as its timeline lane', () => {
        const stage = stageFor(AUDIO);
        stage.place({ left: 5, top: 7, width: 640, height: 400 }, VIEWPORT);

        // The lanes divide the ROOT, which already carries the projection.
        expect(timelineLaneOf(stage).style.top).toBe('0px');
        expect(timelineLaneOf(stage).style.height).toBe('400px');
        expect(
            stage.root.querySelector<HTMLElement>(
                '[data-testid="av-visual-lane"]',
            )?.hidden,
        ).toBe(true);
    });

    /*
        The rect is core's where core paints a companion into it. Anything this
        plugin drew there would sit above the renderer's canvas and hide the
        picture, so the stage contributes a tap target and nothing else.
    */
    it('draws no lanes and no still where core paints a companion', () => {
        const stage = stageWithImage();
        stage.place({ left: 0, top: 0, width: 640, height: 400 }, VIEWPORT);

        expect(visualLaneOf(stage).hidden).toBe(true);
        expect(timelineLaneOf(stage).hidden).toBe(true);
        expect(stage.root.querySelector('img')).toBeNull();
        expect(tapTargetOf(stage)).not.toBeNull();
    });

    // The overlay layer is above the renderer's canvas, so an opaque stage
    // renders the companion correctly and shows a black rect over it.
    it('is transparent, element included, where core paints', () => {
        const style = document.createElement('style');
        style.textContent = STYLES;
        document.head.append(style);
        const stage = stageWithImage();
        document.body.append(stage.root);

        expect(getComputedStyle(stage.root).backgroundColor).toBe(
            'rgba(0, 0, 0, 0)',
        );
        expect(getComputedStyle(stage.media).visibility).toBe('hidden');
    });
});

/** A stage on a canvas core is painting a companion Canvas into. */
function stageWithImage() {
    return createMediaStage({
        canvasId: 'canvas/1',
        source: AUDIO,
        layout: 'audio-with-image',
        cannotPlayMessage: 'nope',
        onPlayStateChange: () => {},
    });
}

describe('tapping the timeline lane', () => {
    function seekingStage(source: AvSource) {
        const fractions: number[] = [];
        const stage = createMediaStage({
            canvasId: 'canvas/1',
            source,
            layout: 'audio',
            cannotPlayMessage: 'nope',
            onPlayStateChange: () => {},
            onSeekFraction: (fraction) => fractions.push(fraction),
        });
        document.body.append(stage.root);
        stage.place({ left: 0, top: 0, width: 400, height: 100 }, VIEWPORT);
        // This DOM lays nothing out, so the lane's box is supplied: the
        // arithmetic under test is the stage's own, not the environment's.
        timelineLaneOf(stage).getBoundingClientRect = () =>
            ({ left: 20, top: 0, width: 400, height: 100 }) as DOMRect;
        return { stage, fractions };
    }

    it('reports where along the lane the tap landed', () => {
        const { stage, fractions } = seekingStage(AUDIO);

        tap(timelineLaneOf(stage), 120, 40);

        expect(fractions).toEqual([0.25]);
    });

    /*
        The lane fills the whole rect of a plain-audio canvas, so without this
        every attempt to pan such a canvas would seek it instead.
    */
    it('leaves a drag to the viewer rather than seeking', () => {
        const { stage, fractions } = seekingStage(AUDIO);

        gesture(timelineLaneOf(stage), { x: 120, y: 40 }, { x: 260, y: 45 });

        expect(fractions).toEqual([]);
    });

    it('reports nothing once the stream has failed', () => {
        const { stage, fractions } = seekingStage(AUDIO);
        stage.media.dispatchEvent(new Event('error'));

        tap(timelineLaneOf(stage), 120, 40);

        expect(fractions).toEqual([]);
    });
});

/*
    The placeholder is core's painting now, so the stage's whole part in it is
    keeping out of the rect until playback starts. It builds no still of its
    own and no image URL at all.
*/
describe('a canvas whose placeholder core paints', () => {
    const awaiting = (onFirstPlay?: () => void, source: AvSource = VIDEO) =>
        createMediaStage({
            canvasId: 'canvas/1',
            source,
            layout: source.kind === 'video' ? 'video' : 'audio',
            awaitsFirstPlay: true,
            onFirstPlay,
            cannotPlayMessage: 'nope',
            onPlayStateChange: () => {},
        });

    /** What a media element reports before anything at all has been decoded. */
    function withReadyState(media: HTMLMediaElement, value: number): void {
        vi.spyOn(media, 'readyState', 'get').mockReturnValue(value);
    }

    it('keeps the element out of the picture until playback begins', () => {
        const stage = awaiting();
        stage.place({ left: 0, top: 0, width: 640, height: 360 }, VIEWPORT);

        // By a class of its own, never the `hidden` attribute: `hidden` means
        // "unplayable" on this element and would take it out of layout before
        // it has been asked to decode anything.
        expect(stage.root.classList.contains('tri-av-unplayed')).toBe(true);
        expect(stage.media.hidden).toBe(false);
        expect(stage.root.querySelector('img')).toBeNull();

        stage.media.dispatchEvent(new Event('play'));
        stage.media.dispatchEvent(new Event('loadeddata'));

        expect(stage.root.classList.contains('tri-av-unplayed')).toBe(false);
    });

    /*
        User story 12, and the whole reason the `poster` attribute could be
        retired: `play` means the element was asked to play, not that it has a
        picture. The element's own background is black, so revealing it here
        would black the still out for the entire buffering interval — which on
        the MSE path is every first play.
    */
    it('holds the still while the element is still buffering', () => {
        const stage = awaiting();
        withReadyState(stage.media, 0);

        stage.media.dispatchEvent(new Event('play'));

        expect(stage.root.classList.contains('tri-av-unplayed')).toBe(true);

        stage.media.dispatchEvent(new Event('playing'));

        expect(stage.root.classList.contains('tri-av-unplayed')).toBe(false);
    });

    // An element that already has data may fire neither event again, so the
    // reveal cannot be left waiting on one.
    it('reveals at once where there is already a frame', () => {
        const stage = awaiting();
        withReadyState(stage.media, 2);

        stage.media.dispatchEvent(new Event('play'));

        expect(stage.root.classList.contains('tri-av-unplayed')).toBe(false);
    });

    /*
        The stream hls.js attaches has nothing buffered until after `play()`, so
        this is the path the black rect was worst on: no `src`, a MediaSource,
        and a first frame whenever the network delivers one.
    */
    it('holds the still across an HLS attachment', async () => {
        vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue(
            '' as CanPlayTypeResult,
        );
        const attachHlsStream = vi.fn(() => ({ destroy: vi.fn() }));
        vi.mocked(loadHls).mockResolvedValue({
            attachHlsStream,
        } as unknown as Awaited<ReturnType<typeof loadHls>>);

        const stage = awaiting(undefined, {
            url: 'https://example.org/stream.m3u8',
            kind: 'video',
            format: 'application/vnd.apple.mpegurl',
            paintsPicture: true,
        });
        await vi.waitFor(() => expect(attachHlsStream).toHaveBeenCalled());
        withReadyState(stage.media, 0);

        stage.media.dispatchEvent(new Event('play'));
        expect(stage.root.classList.contains('tri-av-unplayed')).toBe(true);

        stage.media.dispatchEvent(new Event('loadeddata'));
        expect(stage.root.classList.contains('tri-av-unplayed')).toBe(false);

        vi.restoreAllMocks();
    });

    /*
        A stream that fails has no frame coming, so the still stays: the stage
        is transparent behind the can't-play notice rather than a black rect
        over the only picture this canvas has.
    */
    it('leaves the still standing under a failed stream', () => {
        const stage = awaiting();

        stage.media.dispatchEvent(new Event('error'));

        expect(stage.root.classList.contains('tri-av-unplayed')).toBe(true);
        expect(
            stage.root.querySelector<HTMLElement>(
                '[data-testid="av-cannot-play"]',
            )!.hidden,
        ).toBe(false);
    });

    /*
        User story 12. The element is revealed BEFORE the caller is told to hand
        the rect back, so the two pictures overlap for a frame rather than
        leaving one in which neither is drawn.
    */
    it('reveals the element before reporting the first play', () => {
        let classAtCallback: boolean | null = null;
        const stage = awaiting(() => {
            classAtCallback = stage.root.classList.contains('tri-av-unplayed');
        });

        stage.media.dispatchEvent(new Event('play'));
        stage.media.dispatchEvent(new Event('loadeddata'));

        expect(classAtCallback).toBe(false);
    });

    // Once, not on every play: a reader who pauses and resumes has already seen
    // the handover, and asking for the placeholder back would flash the rect.
    it('reports the first play and no later one', () => {
        let plays = 0;
        const stage = awaiting(() => {
            plays += 1;
        });

        stage.media.dispatchEvent(new Event('play'));
        stage.media.dispatchEvent(new Event('loadeddata'));
        stage.media.dispatchEvent(new Event('pause'));
        stage.media.dispatchEvent(new Event('play'));
        stage.media.dispatchEvent(new Event('playing'));

        expect(plays).toBe(1);
    });

    /*
        A duration-only canvas whose only companion is a placeholder: its
        timeline lane is opaque and fills the rect, so it stands down for the
        still and takes the rect back on the first play. The rect itself never
        changes — it is the still's, and a reflow at the moment playback starts
        is what story 10 forbids.
    */
    describe('over an audio canvas', () => {
        const RECT = { left: 0, top: 0, width: 640, height: 480 };
        const stagedAudio = () => {
            const stage = awaiting(undefined, AUDIO);
            stage.place(RECT, VIEWPORT);
            return stage;
        };
        const laneOf = (stage: ReturnType<typeof stagedAudio>) =>
            stage.root.querySelector<HTMLElement>(
                '[data-testid="av-timeline-lane"]',
            )!;
        const tapOf = (stage: ReturnType<typeof stagedAudio>) =>
            stage.root.querySelector<HTMLElement>('[data-testid="av-tap"]');

        it('draws no lane over the still, only a tap target', () => {
            const stage = stagedAudio();

            expect(laneOf(stage).hidden).toBe(true);
            expect(tapOf(stage)!.hidden).toBe(false);
        });

        it('takes the rect back with its lane on the first frame', () => {
            const stage = stagedAudio();

            stage.media.dispatchEvent(new Event('play'));
            stage.media.dispatchEvent(new Event('loadeddata'));

            // Re-placed by the stage itself: the first play is not a frame the
            // viewport moved in, so no placement of the reader's arrives.
            const lane = laneOf(stage);
            expect(lane.hidden).toBe(false);
            expect(lane.style.width).toBe(`${RECT.width}px`);
            expect(lane.style.height).toBe(`${RECT.height}px`);
            // Gone with the lanes it stood in for: a target left over them
            // would swallow every seek.
            expect(tapOf(stage)!.hidden).toBe(true);
        });

        // The waveform is this canvas's picture of its own recording, and it is
        // adopted long before the first play. Declining it for the layout the
        // stage only borrows would lose it for good.
        it('keeps its waveform for the playing rect', () => {
            const stage = stagedAudio();
            const surface = {
                setPeaks: vi.fn(),
                place: vi.fn(),
                paint: vi.fn(),
                destroy: vi.fn(),
            };

            stage.adoptWaveform(
                {
                    createWaveformSurface: () => surface,
                } as unknown as Parameters<typeof stage.adoptWaveform>[0],
                { length: 1, peaks: new Float32Array([1]) } as never,
            );
            stage.media.dispatchEvent(new Event('play'));
            stage.media.dispatchEvent(new Event('loadeddata'));

            expect(surface.setPeaks).toHaveBeenCalled();
            expect(surface.place).toHaveBeenCalledWith(
                expect.objectContaining({ width: RECT.width }),
                VIEWPORT,
            );
        });
    });

    // A canvas with no placeholder shows its element from the start, as it
    // always has: there is nothing behind it to let through.
    it('shows the element from the start where nothing is painted', () => {
        const stage = createMediaStage({
            canvasId: 'canvas/1',
            source: VIDEO,
            layout: 'video',
            cannotPlayMessage: 'nope',
            onPlayStateChange: () => {},
        });

        expect(stage.root.classList.contains('tri-av-unplayed')).toBe(false);
    });
});

describe('destroy', () => {
    it('stops the transfer rather than leaving a detached element streaming', () => {
        // The whole anti-leak story: a canvas nobody is looking at any more must
        // not keep pulling bytes. Dropping `src` without `load()` leaves the
        // resource selection algorithm running on the old source.
        const stage = stagedInDocument(VIDEO);
        const pause = vi
            .spyOn(stage.media, 'pause')
            .mockImplementation(() => {});
        const load = vi.spyOn(stage.media, 'load').mockImplementation(() => {});

        stage.destroy();

        expect(pause).toHaveBeenCalledTimes(1);
        expect(stage.media.hasAttribute('src')).toBe(false);
        expect(load).toHaveBeenCalledTimes(1);
        expect(stage.root.isConnected).toBe(false);
    });

    it('deafens the element, so a late event reaches no plugin callback', () => {
        const changes: boolean[] = [];
        const stage = createMediaStage({
            canvasId: 'canvas/1',
            source: VIDEO,
            layout: 'video',
            cannotPlayMessage: 'nope',
            onPlayStateChange: (paused) => changes.push(paused),
        });
        const play = vi.spyOn(stage.media, 'play').mockResolvedValue(undefined);

        stage.destroy();

        // Every listener the stage attached: play/pause/ended report state, error
        // shows the treatment, a tap on the visual lane toggles playback.
        stage.media.dispatchEvent(new Event('play'));
        stage.media.dispatchEvent(new Event('pause'));
        stage.media.dispatchEvent(new Event('ended'));
        stage.media.dispatchEvent(new Event('error'));
        tap(visualLaneOf(stage));

        expect(changes).toEqual([]);
        expect(showsCannotPlay(stage)).toBe(false);
        expect(play).not.toHaveBeenCalled();
    });
});

describe('tapping the visual lane', () => {
    it('plays a paused element and pauses a playing one', () => {
        const stage = stageFor(VIDEO);
        const play = vi.spyOn(stage.media, 'play').mockResolvedValue(undefined);
        const pause = vi
            .spyOn(stage.media, 'pause')
            .mockImplementation(() => {});

        tap(visualLaneOf(stage));
        expect(play).toHaveBeenCalledTimes(1);

        vi.spyOn(stage.media, 'paused', 'get').mockReturnValue(false);
        tap(visualLaneOf(stage));
        expect(pause).toHaveBeenCalledTimes(1);
    });

    /*
        User story 6 — the picture is the tap target. Where core paints the
        picture the plugin owns no element over it at all, so the toggle hangs
        on a transparent full-rect target rather than on the media element.
    */
    it('toggles from the tap target over a painted companion', () => {
        const stage = stageWithImage();
        document.body.append(stage.root);
        stage.place({ left: 0, top: 0, width: 640, height: 400 }, VIEWPORT);
        const play = vi.spyOn(stage.media, 'play').mockResolvedValue(undefined);

        tap(tapTargetOf(stage), 100, 100);

        expect(play).toHaveBeenCalledTimes(1);
    });

    it('leaves a drag to the viewer rather than toggling', () => {
        const stage = stageWithImage();
        document.body.append(stage.root);
        stage.place({ left: 0, top: 0, width: 640, height: 400 }, VIEWPORT);
        const play = vi.spyOn(stage.media, 'play').mockResolvedValue(undefined);

        gesture(tapTargetOf(stage), { x: 100, y: 100 }, { x: 240, y: 130 });

        expect(play).not.toHaveBeenCalled();
    });

    it('swallows an autoplay-policy rejection rather than throwing', async () => {
        const stage = stageFor(VIDEO);
        vi.spyOn(stage.media, 'play').mockRejectedValue(
            new DOMException('NotAllowedError'),
        );

        expect(() => tap(visualLaneOf(stage))).not.toThrow();
        await Promise.resolve();
    });
});

describe('the stage — caption tracks', () => {
    const EN: CaptionTrack = {
        url: 'https://example.org/en.vtt',
        language: 'en',
        label: 'English',
        annotation: 0,
    };
    const IT: CaptionTrack = {
        url: 'https://example.org/it.vtt',
        language: 'it',
        label: 'Italiano',
        annotation: 1,
    };

    function captionedStage(
        source: AvSource,
        captions: CaptionTrack[],
        onCaptionTracksChange: () => void = () => {},
    ) {
        return createMediaStage({
            canvasId: 'canvas/1',
            source,
            layout: source.kind === 'video' ? 'video' : 'audio',
            cannotPlayMessage: 'nope',
            onPlayStateChange: () => {},
            captions,
            onCaptionTracksChange,
        });
    }

    /**
     * Give every `<track>` the stage creates a stand-in `TextTrack`.
     *
     * jsdom builds the ELEMENT but not the text track behind it, so the two
     * things the caption machinery actually manipulates — the mode it sets and
     * the cues it counts — do not exist here otherwise, and neither could be
     * asserted at all. `cueCount` is looked up per track by URL when it is read,
     * because the element's `src` is written after it is created.
     */
    function fakeTextTracks(cueCount: (url: string) => number = () => 1): void {
        const create = document.createElement.bind(document);
        vi.spyOn(document, 'createElement').mockImplementation(((
            name: string,
            ...rest: unknown[]
        ) => {
            const element = create(name, ...(rest as [])) as HTMLTrackElement;
            if (name !== 'track') return element;
            Object.defineProperty(element, 'track', {
                value: {
                    mode: 'disabled' as TextTrackMode,
                    get cues() {
                        return { length: cueCount(element.src) };
                    },
                },
            });
            return element;
        }) as typeof document.createElement);
    }

    /** The mode of the stand-in text track on the `<track>` for this URL. */
    function modeOf(stage: { media: HTMLMediaElement }, url: string): string {
        const element = stage.media.querySelector<HTMLTrackElement>(
            `track[src="${url}"]`,
        );
        return (element?.track as TextTrack).mode;
    }

    afterEach(() => {
        vi.restoreAllMocks();
    });

    /** jsdom builds the element but not the `TextTrack`, so the fetch is faked. */
    function settle(
        stage: { media: HTMLMediaElement },
        url: string,
        event: 'load' | 'error',
    ): void {
        const track = stage.media.querySelector(`track[src="${url}"]`);
        track?.dispatchEvent(new Event(event));
    }

    it('attaches every authored track with its language and label', () => {
        const stage = captionedStage(VIDEO, [EN, IT]);

        const tracks = [...stage.media.querySelectorAll('track')];
        expect(tracks.map((track) => track.src)).toEqual([EN.url, IT.url]);
        expect(tracks.map((track) => track.kind)).toEqual([
            'captions',
            'captions',
        ]);
        expect(tracks.map((track) => track.srclang)).toEqual(['en', 'it']);
        expect(tracks.map((track) => track.label)).toEqual([
            'English',
            'Italiano',
        ]);
    });

    it('offers nothing until a track has actually loaded, and is off then', () => {
        const changed = vi.fn();
        const stage = captionedStage(VIDEO, [EN], changed);

        expect(stage.captionTracks).toEqual([]);

        settle(stage, EN.url, 'load');

        expect(changed).toHaveBeenCalledTimes(1);
        expect(stage.captionTracks).toEqual([EN]);
        // Off by default, always — the track is loaded and not showing.
        expect(stage.activeCaptionTrack).toBeNull();
    });

    /*
        User story 46: a track the browser refused — the everyday cause being a
        VTT served cross-origin without CORS — must not reach the reader as a
        control that selects nothing.
    */
    it('drops a track that failed to load, with one warning', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const failing = { ...EN, url: 'https://elsewhere.test/no-cors.vtt' };
        const stage = captionedStage(VIDEO, [failing, IT]);

        settle(stage, failing.url, 'error');
        settle(stage, IT.url, 'load');

        expect(stage.captionTracks).toEqual([IT]);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toContain(failing.url);

        // And it cannot be selected by anyone who asks for it anyway.
        stage.setCaptionTrack(failing.url);
        expect(stage.activeCaptionTrack).toBeNull();
        warn.mockRestore();
    });

    it('selects a loaded track and turns back off', () => {
        const stage = captionedStage(VIDEO, [EN, IT]);
        settle(stage, EN.url, 'load');
        settle(stage, IT.url, 'load');

        stage.setCaptionTrack(IT.url);
        expect(stage.activeCaptionTrack).toBe(IT.url);

        stage.setCaptionTrack(null);
        expect(stage.activeCaptionTrack).toBeNull();
    });

    /*
        An `<audio>` element has no rendering area, so cues attached to one are
        parsed and never drawn — which is why `rendersCaptions` is false there
        and no toggle is offered over them (user story 46). The tracks are
        attached all the same: parsed-and-not-drawn is exactly what the
        transcript panel reads (user story 12a).
    */
    it('attaches a sound recording its tracks, and paints none of them', () => {
        const stage = captionedStage(AUDIO, [EN]);

        expect(stage.media.querySelectorAll('track')).toHaveLength(1);
        expect(stage.rendersCaptions).toBe(false);

        settle(stage, EN.url, 'load');
        expect(stage.captionTracks).toEqual([EN]);
    });

    it('reports a video stage as able to paint its cues', () => {
        expect(captionedStage(VIDEO, [EN]).rendersCaptions).toBe(true);
    });

    /*
        `0014`'s shape: a Sound body formatted `video/mp4`, which only a
        `<video>` will decode, on a canvas whose rect belongs to the companion
        core paints. The element is hidden behind that picture, so its cues go
        nowhere and the toggle would be the dead control user story 46 forbids —
        while the tracks stay attached for the transcript panel.
    */
    it('paints no cues where core owns the rect, whatever the element is', () => {
        const stage = createMediaStage({
            canvasId: 'canvas/1',
            source: VIDEO,
            layout: 'audio-with-image',
            cannotPlayMessage: 'nope',
            onPlayStateChange: () => {},
            captions: [EN],
            onCaptionTracksChange: () => {},
        });

        expect(stage.rendersCaptions).toBe(false);
        expect(stage.media.querySelectorAll('track')).toHaveLength(1);
    });

    /* The transcript panel's source: the parsed cues behind one loaded track. */
    it('hands out the live text track behind a caption track, by URL', () => {
        fakeTextTracks();
        const stage = captionedStage(AUDIO, [EN, IT]);

        expect(stage.captionTextTrack(EN.url)).toBe(
            stage.media.querySelector<HTMLTrackElement>(
                `track[src="${EN.url}"]`,
            )?.track,
        );
        expect(
            stage.captionTextTrack('https://example.org/nope.vtt'),
        ).toBeNull();
    });

    /*
        `hidden` rather than `disabled`: a disabled track is never fetched, so
        neither the CORS refusal above nor the empty file below could be
        detected before a reader turned captions on and met nothing.
    */
    it('attaches tracks hidden, so they load without showing', () => {
        fakeTextTracks();
        const stage = captionedStage(VIDEO, [EN, IT]);

        expect(modeOf(stage, EN.url)).toBe('hidden');
        expect(modeOf(stage, IT.url)).toBe('hidden');

        settle(stage, EN.url, 'load');
        settle(stage, IT.url, 'load');
        stage.setCaptionTrack(IT.url);

        expect(modeOf(stage, IT.url)).toBe('showing');
        expect(modeOf(stage, EN.url)).toBe('hidden');
    });

    /*
        User story 46 again, by the other route: a well-formed VTT with no cues
        in it LOADS. Offering it would be a toggle that selects a track which
        draws nothing, which is the same dead control as a refused one.
    */
    it('drops a track that loaded but carries no cues, with one warning', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        fakeTextTracks((url) => (url.endsWith('en.vtt') ? 0 : 1));
        const stage = captionedStage(VIDEO, [EN, IT]);

        settle(stage, EN.url, 'load');
        settle(stage, IT.url, 'load');

        expect(stage.captionTracks).toEqual([IT]);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toContain(EN.url);

        stage.setCaptionTrack(EN.url);
        expect(stage.activeCaptionTrack).toBeNull();
    });

    /*
        The tracks settle when the network says so, which is not the order they
        were authored in. The list a reader picks a language from is the
        manifest's order or it is nothing.
    */
    it('lists tracks in manifest order however they settle', () => {
        const stage = captionedStage(VIDEO, [EN, IT]);

        settle(stage, IT.url, 'load');
        settle(stage, EN.url, 'load');

        expect(stage.captionTracks).toEqual([EN, IT]);
    });

    it('ignores a track that settles after the stage is destroyed', () => {
        const changed = vi.fn();
        const stage = captionedStage(VIDEO, [EN], changed);

        stage.destroy();
        settle(stage, EN.url, 'load');

        expect(stage.captionTracks).toEqual([]);
        expect(changed).not.toHaveBeenCalled();
    });
});

/*
    A caption track belongs to the body it was authored on. On a temporally
    composed canvas that matters: the tracks beside segment 1's video must not
    caption segment 2's, and a reader must not be offered a language that will
    produce nothing while the segment carrying it is not playing. No vendored
    recipe pairs captions with a composed canvas, so this is the whole of the
    coverage for it.
*/
describe('the stage — captions on a composed canvas', () => {
    const EN: CaptionTrack = {
        url: 'https://example.org/segment-1.vtt',
        language: 'en',
        label: 'Act I',
        annotation: 0,
    };
    const IT: CaptionTrack = {
        url: 'https://example.org/segment-2.vtt',
        language: 'it',
        label: 'Atto II',
        annotation: 1,
    };

    afterEach(() => vi.restoreAllMocks());

    function stageWithBothTracks() {
        const stage = createMediaStage({
            canvasId: 'canvas/1',
            source: VIDEO,
            layout: 'video',
            cannotPlayMessage: 'nope',
            onPlayStateChange: () => {},
            captions: [EN, IT],
        });
        for (const url of [EN.url, IT.url])
            stage.media
                .querySelector(`track[src="${url}"]`)
                ?.dispatchEvent(new Event('load'));
        return stage;
    }

    it('offers only the playing body’s tracks', () => {
        const stage = stageWithBothTracks();
        expect(stage.captionTracks).toEqual([EN, IT]);

        stage.setEligibleCaptions([EN.url]);
        expect(stage.captionTracks).toEqual([EN]);

        stage.setEligibleCaptions([IT.url]);
        expect(stage.captionTracks).toEqual([IT]);

        // `null` is the state of every canvas that is not composed.
        stage.setEligibleCaptions(null);
        expect(stage.captionTracks).toEqual([EN, IT]);
        stage.destroy();
    });

    it('turns off a showing track the next segment does not carry', () => {
        const stage = stageWithBothTracks();

        stage.setEligibleCaptions([EN.url]);
        stage.setCaptionTrack(EN.url);
        expect(stage.activeCaptionTrack).toBe(EN.url);

        stage.setEligibleCaptions([IT.url]);
        expect(stage.activeCaptionTrack).toBeNull();
        stage.destroy();
    });

    it('refuses to select a track the playing body does not carry', () => {
        const stage = stageWithBothTracks();

        stage.setEligibleCaptions([EN.url]);
        stage.setCaptionTrack(IT.url);
        expect(stage.activeCaptionTrack).toBeNull();
        stage.destroy();
    });
});
