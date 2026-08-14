/**
 * The stage's DOM contract: what the media element is allowed to be, and what a
 * failed stream does to the canvas it failed on.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createMediaStage } from './mediaStage';
import type { AvSource } from './sources';
import { STYLES } from './styles';

const VIDEO: AvSource = {
    url: 'https://example.org/clip.mp4',
    kind: 'video',
    format: 'video/mp4',
};

const AUDIO: AvSource = {
    url: 'https://example.org/tone.mp3',
    kind: 'audio',
    format: 'audio/mpeg',
};

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

    it('asks for metadata only, so twenty canvases do not fetch twenty files', () => {
        expect(stageFor(VIDEO).media.preload).toBe('metadata');
    });

    it('uses an audio element for a sound body', () => {
        const stage = stageFor(AUDIO);

        expect(stage.media.tagName).toBe('AUDIO');
        expect(stage.media.hasAttribute('controls')).toBe(false);
    });
});

describe('a failed stream', () => {
    it('shows the localized treatment inside its own stage', () => {
        const stage = stageFor(VIDEO);
        const notice = stage.root.querySelector<HTMLElement>(
            '[data-testid="av-cannot-play"]',
        );

        expect(notice?.hidden).toBe(true);
        expect(stage.unplayable).toBe(false);

        stage.media.dispatchEvent(new Event('error'));

        expect(notice?.hidden).toBe(false);
        expect(notice?.textContent).toBe('This media cannot be played here.');
        expect(stage.unplayable).toBe(true);
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

describe('placement', () => {
    it('is hidden while the canvas has no projection', () => {
        const stage = stageFor(VIDEO);

        stage.place(null);

        expect(stage.root.hidden).toBe(true);
    });

    it('takes the projected rect verbatim — the layer origin is canvasToScreen’s', () => {
        const stage = stageFor(VIDEO);

        stage.place({ left: 12, top: 34, width: 320, height: 180 });

        expect(stage.root.hidden).toBe(false);
        expect(stage.root.style.left).toBe('12px');
        expect(stage.root.style.top).toBe('34px');
        expect(stage.root.style.width).toBe('320px');
        expect(stage.root.style.height).toBe('180px');
    });
});

describe('the stage layout', () => {
    it('puts the video in the visual lane and gives it no timeline lane', () => {
        const stage = stageFor(VIDEO);
        stage.place({ left: 0, top: 0, width: 640, height: 360 });

        const visual = stage.root.querySelector<HTMLElement>(
            '[data-testid="av-visual-lane"]',
        )!;
        expect(visual.contains(stage.media)).toBe(true);
        expect(visual.style.height).toBe('360px');
        expect(stage.timelineLane).toBeNull();
        expect(
            stage.root.querySelector<HTMLElement>(
                '[data-testid="av-timeline-lane"]',
            )?.hidden,
        ).toBe(true);
    });

    it('gives audio alone the whole rect as its timeline lane', () => {
        const stage = stageFor(AUDIO);
        stage.place({ left: 5, top: 7, width: 640, height: 400 });

        // The lanes divide the ROOT, which already carries the projection.
        expect(stage.timelineLane?.style.top).toBe('0px');
        expect(stage.timelineLane?.style.height).toBe('400px');
        expect(
            stage.root.querySelector<HTMLElement>(
                '[data-testid="av-visual-lane"]',
            )?.hidden,
        ).toBe(true);
    });

    it('stacks an accompanying image over the strip', () => {
        const stage = stageWithImage();
        stage.place({ left: 0, top: 0, width: 640, height: 400 });

        const visual = visualLaneOf(stage);
        expect(
            visual.querySelector('[data-testid="av-accompanying"]'),
        ).not.toBeNull();
        expect(visual.style.height).toBe('300px');
        expect(stage.timelineLane?.style.top).toBe('300px');
        expect(stage.timelineLane?.style.height).toBe('100px');
    });
});

/**
 * A stage carrying an accompanying still whose URL records the width it was
 * asked for — which is the whole of the sizing contract this stage owns.
 */
function stageWithImage() {
    return createMediaStage({
        canvasId: 'canvas/1',
        source: AUDIO,
        layout: 'audio-with-image',
        accompanying: {
            plain: false,
            urlFor: (width) => `https://example.org/score/${Math.round(width)}`,
        },
        cannotPlayMessage: 'nope',
        onPlayStateChange: () => {},
    });
}

describe('the accompanying still', () => {
    function srcOf(stage: { root: HTMLElement }): string | null {
        return (
            stage.root
                .querySelector<HTMLImageElement>(
                    '[data-testid="av-accompanying"]',
                )
                ?.getAttribute('src') ?? null
        );
    }

    // The request must be for the lane, not for the canvas: at claim time the
    // renderer has usually laid nothing out, and asking then buys a
    // full-resolution image for a strip a fraction of that size.
    it('is not requested until there is a lane to size it against', () => {
        const stage = stageWithImage();

        expect(srcOf(stage)).toBeNull();

        stage.place(null);
        expect(srcOf(stage)).toBeNull();

        stage.place({ left: 0, top: 0, width: 640, height: 400 });
        expect(srcOf(stage)).toBe('https://example.org/score/640');
    });

    // The v1 fence: one request, at the size the lane first had.
    it('is not re-requested when the projection changes', () => {
        const stage = stageWithImage();
        stage.place({ left: 0, top: 0, width: 640, height: 400 });
        stage.place({ left: 0, top: 0, width: 1280, height: 800 });

        expect(srcOf(stage)).toBe('https://example.org/score/640');
    });
});

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
        stage.place({ left: 0, top: 0, width: 400, height: 100 });
        // This DOM lays nothing out, so the lane's box is supplied: the
        // arithmetic under test is the stage's own, not the environment's.
        stage.timelineLane!.getBoundingClientRect = () =>
            ({ left: 20, top: 0, width: 400, height: 100 }) as DOMRect;
        return { stage, fractions };
    }

    it('reports where along the lane the tap landed', () => {
        const { stage, fractions } = seekingStage(AUDIO);

        tap(stage.timelineLane!, 120, 40);

        expect(fractions).toEqual([0.25]);
    });

    /*
        The lane fills the whole rect of a plain-audio canvas, so without this
        every attempt to pan such a canvas would seek it instead.
    */
    it('leaves a drag to the viewer rather than seeking', () => {
        const { stage, fractions } = seekingStage(AUDIO);

        gesture(stage.timelineLane!, { x: 120, y: 40 }, { x: 260, y: 45 });

        expect(fractions).toEqual([]);
    });

    it('reports nothing once the stream has failed', () => {
        const { stage, fractions } = seekingStage(AUDIO);
        stage.media.dispatchEvent(new Event('error'));

        tap(stage.timelineLane!, 120, 40);

        expect(fractions).toEqual([]);
    });
});

describe('the placeholder', () => {
    const PLAIN = {
        plain: true,
        urlFor: () => 'https://example.org/poster.png',
    };

    it('is the video element’s poster when it is a plain image URL', () => {
        const stage = createMediaStage({
            canvasId: 'canvas/1',
            source: VIDEO,
            layout: 'video',
            placeholder: PLAIN,
            cannotPlayMessage: 'nope',
            onPlayStateChange: () => {},
        });
        stage.place({ left: 0, top: 0, width: 640, height: 360 });

        expect((stage.media as HTMLVideoElement).poster).toContain(
            'poster.png',
        );
        expect(
            stage.root.querySelector('[data-testid="av-placeholder"]'),
        ).toBeNull();
    });

    // An audio element has no poster to hang it on, and a URL this plugin built
    // off an image service is not the plain URL the contract reserves for one.
    it('is an overlay otherwise, and the first play takes it away', () => {
        const stage = createMediaStage({
            canvasId: 'canvas/1',
            source: AUDIO,
            layout: 'audio',
            placeholder: PLAIN,
            cannotPlayMessage: 'nope',
            onPlayStateChange: () => {},
        });

        const overlay = stage.root.querySelector(
            '[data-testid="av-placeholder"]',
        );
        expect(overlay).not.toBeNull();

        stage.media.dispatchEvent(new Event('play'));

        expect(
            stage.root.querySelector('[data-testid="av-placeholder"]'),
        ).toBeNull();
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

    // The stills are transfers too, and a stage is destroyed while they may
    // still be in flight — on a manifest change, or when the activation ends.
    it('drops the stills’ sources as well as the stream’s', () => {
        const stage = createMediaStage({
            canvasId: 'canvas/1',
            source: AUDIO,
            layout: 'audio-with-image',
            accompanying: { plain: true, urlFor: () => 'score.png' },
            placeholder: { plain: true, urlFor: () => 'poster.png' },
            cannotPlayMessage: 'nope',
            onPlayStateChange: () => {},
        });
        stage.place({ left: 0, top: 0, width: 640, height: 400 });
        const stills = [
            ...stage.root.querySelectorAll<HTMLImageElement>('img'),
        ];
        expect(stills.every((img) => img.hasAttribute('src'))).toBe(true);

        stage.destroy();

        expect(stills.some((img) => img.hasAttribute('src'))).toBe(false);
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
        expect(stage.unplayable).toBe(false);
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
        User story 6 — the picture is the tap target. For audio that picture is
        the accompanying still, which is NOT the media element: binding the
        toggle to the element alone would leave the image inert.
    */
    it('toggles for an accompanying still, which is not the media element', () => {
        const stage = stageWithImage();
        document.body.append(stage.root);
        stage.place({ left: 0, top: 0, width: 640, height: 400 });
        const play = vi.spyOn(stage.media, 'play').mockResolvedValue(undefined);

        tap(visualLaneOf(stage), 100, 100);

        expect(play).toHaveBeenCalledTimes(1);
    });

    it('leaves a drag to the viewer rather than toggling', () => {
        const stage = stageWithImage();
        document.body.append(stage.root);
        stage.place({ left: 0, top: 0, width: 640, height: 400 });
        const play = vi.spyOn(stage.media, 'play').mockResolvedValue(undefined);

        gesture(visualLaneOf(stage), { x: 100, y: 100 }, { x: 240, y: 130 });

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
