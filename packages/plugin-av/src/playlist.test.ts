/**
 * `auto-advance` and `repeat` as the activation wires them, against a real
 * `ViewerState`: the end of one canvas's timeline navigating the viewer, and
 * playback continuing across the boundary.
 *
 * What the boundary actually does to the pixels is `av-structures.spec.ts`'s
 * business; what is asserted here is the decision — which canvas the viewer
 * lands on, and that it was told to play once it got there.
 *
 * And the rule that bounds all of it: `auto-advance` is the ONLY way playback
 * crosses a canvas boundary. A reader who navigates neither starts the canvas
 * they arrive at nor leaves the one they left sounding behind them.
 */

import {
    createTestViewerContext,
    flush,
    type TestViewerContext,
} from '@triiiceratops/plugin-sdk/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AvPlugin } from './plugin';

const UI_ID = 'av';
const MANIFEST = 'https://example.org/av/manifest.json';
const TONE = `${MANIFEST}/canvas/tone`;
const BARS = `${MANIFEST}/canvas/bars`;

function avCanvas(
    canvasId: string,
    format: string,
    type: string,
    behavior: string[] = [],
) {
    return {
        id: canvasId,
        type: 'Canvas',
        duration: 2,
        behavior,
        items: [
            {
                id: `${canvasId}/page`,
                type: 'AnnotationPage',
                items: [
                    {
                        id: `${canvasId}/annotation`,
                        type: 'Annotation',
                        motivation: 'painting',
                        body: {
                            id: `${canvasId}/media`,
                            type,
                            format,
                            duration: 2,
                        },
                        target: canvasId,
                    },
                ],
            },
        ],
    };
}

/** A canvas core paints itself — never scanned for AV, never claimed. */
function imageCanvas(canvasId: string, behavior: string[]) {
    return {
        id: canvasId,
        type: 'Canvas',
        width: 100,
        height: 100,
        behavior,
        items: [
            {
                id: `${canvasId}/page`,
                type: 'AnnotationPage',
                items: [
                    {
                        id: `${canvasId}/annotation`,
                        type: 'Annotation',
                        motivation: 'painting',
                        body: {
                            id: `${canvasId}/image`,
                            type: 'Image',
                            format: 'image/jpeg',
                        },
                        target: canvasId,
                    },
                ],
            },
        ],
    };
}

function manifest(behavior: string[], items?: unknown[]) {
    return {
        '@context': 'http://iiif.io/api/presentation/3/context.json',
        id: MANIFEST,
        type: 'Manifest',
        behavior,
        items: items ?? [
            avCanvas(TONE, 'audio/mpeg', 'Sound'),
            avCanvas(BARS, 'video/mp4', 'Video'),
        ],
    };
}

interface MountOptions {
    /** The manifest's own `behavior` terms. */
    readonly behavior?: string[];
    /** The canvases, when the default pair is not what a test is about. */
    readonly items?: unknown[];
    /**
     * Run against the viewer BEFORE the plugin mounts — the only way to state a
     * fact the activation has to pick up by hand rather than by notification.
     */
    readonly before?: (tc: TestViewerContext) => void;
}

/** Mount the plugin over a manifest carrying the given manifest behaviors. */
async function mount(options: MountOptions = {}): Promise<{
    tc: TestViewerContext;
    mediaFor: (canvasId: string) => HTMLMediaElement;
    cleanup: () => void;
}> {
    const tc = createTestViewerContext({
        uiId: UI_ID,
        fixtures: {
            manifest: {
                id: MANIFEST,
                json: manifest(options.behavior ?? [], options.items),
            },
        },
    });
    await flush();
    options.before?.(tc);

    const container = document.createElement('div');
    const unmount = AvPlugin.view.mount(container, tc.context);
    await flush();

    // Core's render site: the overlay layer the stages live in has to be in the
    // document, exactly as `TriiiceratopsViewer.svelte` puts it there.
    const root = document.createElement('div');
    document.body.append(root);
    const layers = tc.viewerState.overlayLayers.map((layer) => {
        const node = document.createElement('div');
        root.append(node);
        return layer.mount(node);
    });

    return {
        tc,
        mediaFor: (canvasId) => {
            const element = root.querySelector<HTMLMediaElement>(
                `[data-canvas-id="${canvasId}"] [data-testid="av-media"]`,
            );
            if (!element) throw new Error(`no stage for ${canvasId}`);
            return element;
        },
        cleanup(): void {
            for (const stop of layers) stop?.();
            root.remove();
            unmount();
        },
    };
}

describe('auto-advance and repeat', () => {
    let play: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        // jsdom implements no playback. The command is what this suite is
        // about, so the element's own `play` is recorded rather than run.
        play = vi
            .spyOn(HTMLMediaElement.prototype, 'play')
            .mockImplementation(() => Promise.resolve());
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('advances to the next canvas and keeps playing when the timeline ends', async () => {
        const { tc, mediaFor, cleanup } = await mount({
            behavior: ['auto-advance'],
        });
        tc.viewerState.setCanvas(TONE);
        await flush();

        mediaFor(TONE).dispatchEvent(new Event('ended'));

        expect(tc.viewerState.canvasId).toBe(BARS);
        expect(play).toHaveBeenCalled();

        cleanup();
    });

    it('stops at the last canvas when repeat is absent', async () => {
        const { tc, mediaFor, cleanup } = await mount({
            behavior: ['auto-advance'],
        });
        tc.viewerState.setCanvas(BARS);
        await flush();

        mediaFor(BARS).dispatchEvent(new Event('ended'));

        expect(tc.viewerState.canvasId).toBe(BARS);
        expect(play).not.toHaveBeenCalled();

        cleanup();
    });

    it('returns to the first canvas when repeat accompanies auto-advance', async () => {
        const { tc, mediaFor, cleanup } = await mount({
            behavior: ['auto-advance', 'repeat'],
        });
        tc.viewerState.setCanvas(BARS);
        await flush();

        // Where the previous pass through the playlist left the first canvas.
        // Without it the assertion below is vacuous: an element that was never
        // moved off zero reads zero whether or not anything rewound it.
        mediaFor(TONE).currentTime = 1.2;

        mediaFor(BARS).dispatchEvent(new Event('ended'));

        expect(tc.viewerState.canvasId).toBe(TONE);
        expect(play).toHaveBeenCalled();
        // From the beginning, not from where it was left.
        expect(mediaFor(TONE).currentTime).toBe(0);

        cleanup();
    });

    it('does nothing at all when repeat stands alone', async () => {
        const { tc, mediaFor, cleanup } = await mount({ behavior: ['repeat'] });
        tc.viewerState.setCanvas(TONE);
        await flush();

        mediaFor(TONE).dispatchEvent(new Event('ended'));

        expect(tc.viewerState.canvasId).toBe(TONE);
        expect(play).not.toHaveBeenCalled();

        cleanup();
    });

    it('advances on a canvas of its own that carries auto-advance', async () => {
        // Nothing on the manifest: `auto-advance` is valid on a Canvas too, and
        // the canvas's own term is the only thing that can carry this one.
        const { tc, mediaFor, cleanup } = await mount({
            items: [
                avCanvas(TONE, 'audio/mpeg', 'Sound', ['auto-advance']),
                avCanvas(BARS, 'video/mp4', 'Video'),
            ],
        });
        tc.viewerState.setCanvas(TONE);
        await flush();

        mediaFor(TONE).dispatchEvent(new Event('ended'));

        expect(tc.viewerState.canvasId).toBe(BARS);
        expect(play).toHaveBeenCalled();

        cleanup();
    });

    it('seeks a navigated-to canvas at readiness, and does not start it playing', async () => {
        const { tc, mediaFor, cleanup } = await mount({
            behavior: ['auto-advance'],
        });

        // The shape a chapter click, a manifest `start` and a content state all
        // reach the plugin as. The media has no metadata yet, so the offset is
        // held until it does.
        tc.viewerState.setCanvas(BARS, { seconds: 1 });
        await flush();

        const media = mediaFor(BARS);
        expect(media.currentTime).toBe(0);

        media.dispatchEvent(new Event('loadedmetadata'));

        expect(media.currentTime).toBe(1);
        expect(play).not.toHaveBeenCalled();

        cleanup();
    });

    it('applies an offset the viewer already carried when it mounted', async () => {
        // A manifest `start`, or a content state, resolved before the
        // activation existed: a selector notifies on change, never on
        // subscription, so nothing will ever tell the plugin about this one.
        const { mediaFor, cleanup } = await mount({
            before: (tc) => tc.viewerState.setCanvas(BARS, { seconds: 1 }),
        });

        const media = mediaFor(BARS);
        expect(media.currentTime).toBe(0);

        media.dispatchEvent(new Event('loadedmetadata'));

        expect(media.currentTime).toBe(1);
        expect(play).not.toHaveBeenCalled();

        cleanup();
    });

    it('ignores the end of a canvas the reader is not on', async () => {
        // The reader is on the FIRST canvas and the second ends. Ending the
        // last canvas would prove nothing: with nothing after it and no
        // `repeat`, an unguarded handler would stop there anyway.
        const { tc, mediaFor, cleanup } = await mount({
            behavior: ['auto-advance'],
        });
        tc.viewerState.setCanvas(TONE);
        await flush();

        mediaFor(BARS).dispatchEvent(new Event('ended'));

        expect(tc.viewerState.canvasId).toBe(TONE);
        expect(play).not.toHaveBeenCalled();

        cleanup();
    });
});

describe('repeat on a canvas', () => {
    it('warns about a canvas this plugin never claims', async () => {
        // The contract is unqualified: `repeat` is misplaced on a Canvas
        // whatever that canvas holds, and the curator who put it on a page of
        // images is exactly the one who cannot see it being ignored.
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const { cleanup } = await mount({
            items: [
                imageCanvas(`${MANIFEST}/canvas/page`, ['repeat']),
                avCanvas(TONE, 'audio/mpeg', 'Sound'),
            ],
        });

        const said = warn.mock.calls.map((call) => String(call[0])).join('\n');
        expect(said).toContain(`${MANIFEST}/canvas/page`);
        expect(said).toContain('`repeat`');

        cleanup();
        warn.mockRestore();
    });
});

describe('navigation does not carry playback', () => {
    let play: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        play = vi
            .spyOn(HTMLMediaElement.prototype, 'play')
            .mockImplementation(() => Promise.resolve());
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('pauses the recording being left, and starts nothing on arrival', async () => {
        // The reported defect: both elements sounded at once. The stage left
        // behind is hidden by `rectFor` in `individuals` mode, so it carried no
        // glyph, no transport and no tap target that could have stopped it.
        const { tc, mediaFor, cleanup } = await mount();
        tc.viewerState.setCanvas(TONE);
        await flush();

        const leaving = vi.spyOn(mediaFor(TONE), 'pause');
        const arriving = vi.spyOn(mediaFor(BARS), 'pause');

        tc.viewerState.nextCanvas();
        await flush();

        expect(tc.viewerState.canvasId).toBe(BARS);
        expect(leaving).toHaveBeenCalled();
        // Only the canvas the transport was driving. A sweep over every stage
        // would also silence a recording a `continuous`-mode reader had tapped
        // to play beside the current one — which is what the glyph reports.
        expect(arriving).not.toHaveBeenCalled();
        expect(play).not.toHaveBeenCalled();

        cleanup();
    });

    it('pauses where it stands, so returning resumes rather than restarts', async () => {
        // `continuePlayback` seeks to 0 explicitly BECAUSE a canvas rests where
        // an earlier pass left it. Nothing on the navigation path may rewind it.
        const { tc, mediaFor, cleanup } = await mount();
        tc.viewerState.setCanvas(TONE);
        await flush();

        const media = mediaFor(TONE);
        const paused = vi.spyOn(media, 'pause').mockImplementation(() => {});
        media.currentTime = 1.5;

        tc.viewerState.nextCanvas();
        await flush();
        tc.viewerState.previousCanvas();
        await flush();

        expect(tc.viewerState.canvasId).toBe(TONE);
        // Anchored to the pause having happened, so this cannot pass for the
        // want of anything touching the element at all.
        expect(paused).toHaveBeenCalled();
        expect(mediaFor(TONE).currentTime).toBe(1.5);
        expect(play).not.toHaveBeenCalled();

        cleanup();
    });

    it('still lets auto-advance carry playback across the boundary', async () => {
        // The pause hook fires on the same navigation `auto-advance` performs,
        // and must not take the step back: it pauses the canvas being LEFT —
        // which has already ended — never the one arrived at.
        const { tc, mediaFor, cleanup } = await mount({
            behavior: ['auto-advance'],
        });
        tc.viewerState.setCanvas(TONE);
        await flush();

        const arriving = vi.spyOn(mediaFor(BARS), 'pause');
        mediaFor(TONE).dispatchEvent(new Event('ended'));
        await flush();

        expect(tc.viewerState.canvasId).toBe(BARS);
        expect(play).toHaveBeenCalled();
        expect(arriving).not.toHaveBeenCalled();

        cleanup();
    });
});
