/**
 * Activation behavior, against a real `ViewerState` from the SDK test kit.
 *
 * The seams asserted here are the ticket's contract: which canvases the
 * activation claims, that a re-scan follows a manifest change, that the claims
 * go when the activation does, and that the degradation contract's warnings fire
 * on the manifests that trigger them. Nothing here reaches into the plugin's
 * internals — a claim is read back off `ViewerState`, a warning off the console.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
    createTestViewerContext,
    flush,
    type TestViewerContext,
} from '@triiiceratops/plugin-sdk/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PluginError } from 'triiiceratops';

import { getAVState } from './avState';
import { AvPlugin } from './plugin';
import { loadSequencer } from './sequencerLink';

const AV_DIR = join(
    import.meta.dirname,
    '../../core/src/lib/test/fixtures/manifests/av',
);

const UI_ID = 'av';

function recipe(file: string): unknown {
    return JSON.parse(readFileSync(join(AV_DIR, file), 'utf8'));
}

const IMAGE_MANIFEST = {
    '@context': 'http://iiif.io/api/presentation/3/context.json',
    id: 'https://example.org/images/manifest.json',
    type: 'Manifest',
    items: [
        {
            id: 'https://example.org/images/canvas/1',
            type: 'Canvas',
            width: 1000,
            height: 800,
            items: [
                {
                    type: 'AnnotationPage',
                    items: [
                        {
                            type: 'Annotation',
                            motivation: 'painting',
                            body: {
                                id: 'https://example.org/page.jpg',
                                type: 'Image',
                                format: 'image/jpeg',
                            },
                            target: 'https://example.org/images/canvas/1',
                        },
                    ],
                },
            ],
        },
    ],
};

/**
 * Mount the plugin's view against a test viewer context preloaded with one
 * manifest. Returns the context and the mount cleanup.
 */
async function mountWith(
    manifest: { id: string; json: unknown } | undefined,
    options: { open?: boolean } = {},
): Promise<{
    tc: TestViewerContext;
    container: HTMLElement;
    cleanup: () => void;
}> {
    const tc = createTestViewerContext({
        uiId: UI_ID,
        fixtures: manifest ? { manifest } : undefined,
        open: options.open,
    });
    await flush();

    const container = document.createElement('div');
    const cleanup = AvPlugin.view.mount(container, tc.context);
    await flush();

    return { tc, container, cleanup };
}

/**
 * Stand in for core's render site: give the viewer a root in the document and
 * mount every registered overlay layer into it, exactly as
 * `TriiiceratopsViewer.svelte` does. The plugin's own mount container is
 * deliberately NOT attached — core keeps it detached until the plugin's surface
 * opens, and a report dispatched on a detached node bubbles nowhere.
 */
function mountViewerRoot(tc: TestViewerContext): {
    root: HTMLElement;
    unmount: () => void;
} {
    const root = document.createElement('div');
    document.body.append(root);

    const cleanups = tc.viewerState.overlayLayers.map((layer) => {
        const node = document.createElement('div');
        root.append(node);
        return layer.mount(node);
    });

    return {
        root,
        unmount(): void {
            for (const cleanup of cleanups) cleanup?.();
            root.remove();
        },
    };
}

/**
 * Poll a condition to true, or fail the test.
 *
 * For the things this activation does fire-and-forget behind a dynamic import
 * — the sequencer chunk, the waveform chunk — where a single `flush()` proves
 * only that nothing has happened yet.
 */
async function waitFor(
    condition: () => boolean,
    what = 'condition',
): Promise<void> {
    for (let attempt = 0; attempt < 100; attempt += 1) {
        if (condition()) return;
        await settle();
    }
    throw new Error(`Timed out waiting for ${what}`);
}

/**
 * One turn of the microtask queue AND of the timer queue. A dynamic import
 * resolves off neither on its own, so a `flush()` alone proves only that
 * nothing has happened yet.
 */
async function settle(): Promise<void> {
    await flush();
    await new Promise((resolve) => setTimeout(resolve, 5));
}

describe('activation and the canvas claim', () => {
    it('claims a video canvas whose only renderable content is time-based', async () => {
        const { tc, cleanup } = await mountWith({
            id: 'https://iiif.io/api/cookbook/recipe/0003-mvm-video/manifest.json',
            json: recipe('0003-mvm-video.json'),
        });

        expect([...tc.viewerState.claimedCanvases]).toEqual([
            [
                'https://iiif.io/api/cookbook/recipe/0003-mvm-video/canvas',
                UI_ID,
            ],
        ]);

        cleanup();
    });

    it('claims a duration-only audio canvas, which core lays out anyway', async () => {
        // The audio shape: `duration`, no `width`/`height`. It is claimed like
        // any other canvas core cannot paint, because core lays it out from its
        // siblings and `canvasSize` reports the box it was given — so there IS
        // a rect to project a stage onto, and claiming does not trade an honest
        // placard for a blank canvas.
        const { tc, cleanup } = await mountWith({
            id: 'https://iiif.io/api/cookbook/recipe/0002-mvm-audio/manifest.json',
            json: recipe('0002-mvm-audio.json'),
        });

        expect(
            tc.viewerState.isCanvasClaimed(
                'https://iiif.io/api/cookbook/recipe/0002-mvm-audio/canvas',
            ),
        ).toBe(true);

        cleanup();
    });

    it('does not stage a canvas whose claim was refused', async () => {
        // A second claim on a canvas somebody already holds is refused, and the
        // refusal still hands back a release — a no-op one. Staging anyway would
        // draw over a placard this plugin never suppressed.
        const canvasId =
            'https://iiif.io/api/cookbook/recipe/0003-mvm-video/canvas';
        const tc = createTestViewerContext({
            uiId: UI_ID,
            fixtures: {
                manifest: {
                    id: 'https://iiif.io/api/cookbook/recipe/0003-mvm-video/manifest.json',
                    json: recipe('0003-mvm-video.json'),
                },
            },
        });
        await flush();

        // Somebody else got there first. `claimCanvas` refuses on the structured
        // channel and returns an inert release.
        const other = vi
            .spyOn(tc.viewerState, 'claimCanvas')
            .mockReturnValue(() => {});

        const container = document.createElement('div');
        const cleanup = AvPlugin.view.mount(container, tc.context);
        await flush();

        expect(other).toHaveBeenCalledWith(canvasId, UI_ID);
        // No stage was built, so the panel has nothing to show — the same state
        // as an image manifest, which is exactly right: this canvas is not ours.
        expect(container.textContent).toContain(
            'This manifest paints no time-based media',
        );

        cleanup();
    });

    it('claims nothing on an image manifest', async () => {
        const { tc, cleanup } = await mountWith({
            id: IMAGE_MANIFEST.id,
            json: IMAGE_MANIFEST,
        });

        expect(tc.viewerState.claimedCanvases.size).toBe(0);

        cleanup();
    });

    it('leaves a canvas core can paint an image for unclaimed', async () => {
        // `0489-multimedia-canvas` paints an Image beside its Video, so core
        // paints it and there is no unsupported presentation to suppress.
        const { tc, cleanup } = await mountWith({
            id: 'https://iiif.io/api/cookbook/recipe/0489-multimedia-canvas/manifest.json',
            json: recipe('0489-multimedia-canvas.json'),
        });

        expect(tc.viewerState.claimedCanvases.size).toBe(0);

        cleanup();
    });

    it('re-scans when the manifest changes', async () => {
        const { tc, cleanup } = await mountWith({
            id: IMAGE_MANIFEST.id,
            json: IMAGE_MANIFEST,
        });
        expect(tc.viewerState.claimedCanvases.size).toBe(0);

        await tc.viewerState.setManifestData(
            'https://iiif.io/api/cookbook/recipe/0003-mvm-video/manifest.json',
            recipe('0003-mvm-video.json'),
        );
        await flush();

        expect(
            tc.viewerState.isCanvasClaimed(
                'https://iiif.io/api/cookbook/recipe/0003-mvm-video/canvas',
            ),
        ).toBe(true);

        cleanup();
    });

    it('drops the stage of a canvas that leaves between scans', async () => {
        const { tc, cleanup } = await mountWith({
            id: 'https://iiif.io/api/cookbook/recipe/0003-mvm-video/manifest.json',
            json: recipe('0003-mvm-video.json'),
        });
        expect(tc.viewerState.claimedCanvases.size).toBe(1);

        // A manifest with none of the previous canvas ids. The claim on a gone
        // canvas would be inert, but its stage's `<video>` would keep its source
        // and its per-frame placement for the rest of the session.
        await tc.viewerState.setManifestData(IMAGE_MANIFEST.id, IMAGE_MANIFEST);
        await flush();

        expect(tc.viewerState.claimedCanvases.size).toBe(0);

        cleanup();
    });

    it('releases every claim when the activation is torn down', async () => {
        const { tc, cleanup } = await mountWith({
            id: 'https://iiif.io/api/cookbook/recipe/0003-mvm-video/manifest.json',
            json: recipe('0003-mvm-video.json'),
        });
        expect(tc.viewerState.claimedCanvases.size).toBe(1);

        cleanup();
        await flush();

        expect(tc.viewerState.claimedCanvases.size).toBe(0);
    });
});

describe('the overlay layer', () => {
    it('is registered once for the whole activation and released with it', async () => {
        // ONE layer hosts every stage: a layer per canvas would put the plugin's
        // registration count on the manifest's size, and each one would have to
        // be released by hand on a re-scan.
        const { tc, cleanup } = await mountWith({
            id: 'https://iiif.io/api/cookbook/recipe/0065-opera-multiple-canvases/manifest.json',
            json: recipe('0065-opera-multiple-canvases.json'),
        });

        expect(tc.viewerState.overlayLayers.map((layer) => layer.id)).toEqual([
            `${UI_ID}:av-stages`,
        ]);
        expect(tc.viewerState.claimedCanvases.size).toBeGreaterThan(1);

        cleanup();
        await flush();

        expect(tc.viewerState.overlayLayers).toHaveLength(0);
    });
});

/**
 * One canvas linking waveform data, composed of `bodies` bodies.
 *
 * Two `#t=` windows make it a temporally composed canvas; one body leaves the
 * canvas timeline as the element's own clock. Everything else is held equal, so
 * the only thing under test is the composition.
 */
function canvasLinkingWaveform(bodies: 1 | 2): unknown {
    const windows = bodies === 2 ? ['#t=0,2', '#t=2,4'] : [''];
    return {
        '@context': 'http://iiif.io/api/presentation/3/context.json',
        id: 'https://example.org/wave/manifest.json',
        type: 'Manifest',
        items: [
            {
                id: 'https://example.org/wave/canvas/1',
                type: 'Canvas',
                duration: 4,
                seeAlso: [
                    {
                        id: WAVEFORM_URL,
                        type: 'Dataset',
                        format: 'application/json',
                        label: { en: ['waveform.json'] },
                    },
                ],
                items: [
                    {
                        type: 'AnnotationPage',
                        items: windows.map((fragment, index) => ({
                            type: 'Annotation',
                            motivation: 'painting',
                            body: {
                                id: `https://example.org/wave/body-${index}.mp3`,
                                type: 'Sound',
                                format: 'audio/mpeg',
                                duration: 2,
                            },
                            target: `https://example.org/wave/canvas/1${fragment}`,
                        })),
                    },
                ],
            },
        ],
    };
}

const WAVEFORM_URL = 'https://example.org/wave/waveform.json';

/*
    The spec fence of ticket 18: the timeline lane renders WITHOUT peaks on a
    composed canvas. Any waveform a canvas links describes ONE body, and the
    lane there spans the whole work — so peaks drawn across it would be a
    picture of act one stretched over the opera.

    Asserted at the fetch, because not requesting the bytes is the whole of the
    behaviour: there is nothing to adopt if nothing is loaded.
*/
describe('the waveform fence on a composed canvas', () => {
    let fetched: string[];
    let original: typeof globalThis.fetch;

    beforeEach(() => {
        fetched = [];
        original = globalThis.fetch;
        globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
            fetched.push(String(input));
            return Promise.reject(new Error('no network in this suite'));
        }) as typeof globalThis.fetch;
    });

    afterEach(() => {
        globalThis.fetch = original;
    });

    it('loads no peaks for a canvas its bodies tile', async () => {
        const { cleanup } = await mountWith({
            id: 'https://example.org/wave/manifest.json',
            json: canvasLinkingWaveform(2),
        });
        // Long enough that a request would have been made: the control below
        // pins that a wait this long DOES see one where the fence is off.
        for (let turn = 0; turn < 20; turn += 1) await settle();

        expect(fetched).not.toContain(WAVEFORM_URL);

        cleanup();
    });

    it('still loads them where one body fills the canvas', async () => {
        const { cleanup } = await mountWith({
            id: 'https://example.org/wave/manifest.json',
            json: canvasLinkingWaveform(1),
        });
        await waitFor(
            () => fetched.includes(WAVEFORM_URL),
            'the waveform request',
        );

        cleanup();
    });
});

describe('the degradation contract', () => {
    let warn: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        warn.mockRestore();
    });

    function warnings(): string[] {
        return warn.mock.calls.map((call: unknown[]) => String(call[0]));
    }

    /*
        The vendored opera-on-one-canvas recipe is the composed shape this
        release plays through as one work. Nothing about it is degraded any
        more, so the console must be silent about it — the acceptance criterion
        "loads and plays with no dev warnings", asserted where the whole
        activation runs.
    */
    it('says nothing about a temporally composed canvas', async () => {
        const { cleanup } = await mountWith({
            id: 'https://iiif.io/api/cookbook/recipe/0064-opera-one-canvas/manifest.json',
            json: recipe('0064-opera-one-canvas.json'),
        });

        // The sequencer arrives behind a dynamic import, and it is the segment
        // map's own normalization that has the most to warn about — so
        // asserting on a console the chunk has not reached yet would pass
        // whatever this recipe provokes. Awaiting the same module the
        // activation awaited is what settles it.
        expect(await loadSequencer()).not.toBeNull();
        await settle();

        expect(warnings()).toEqual([]);

        cleanup();
    });

    it('warns that a spatially placed body is placed over the whole rect', async () => {
        const { cleanup } = await mountWith({
            id: 'https://iiif.io/api/cookbook/recipe/0489-multimedia-canvas/manifest.json',
            json: recipe('0489-multimedia-canvas.json'),
        });

        expect(
            warnings().filter((message) =>
                /Spatial placement of audiovisual content is not supported/.test(
                    message,
                ),
            ),
        ).toHaveLength(1);

        cleanup();
    });

    it('says nothing about a plain single-body video canvas', async () => {
        const { cleanup } = await mountWith({
            id: 'https://iiif.io/api/cookbook/recipe/0003-mvm-video/manifest.json',
            json: recipe('0003-mvm-video.json'),
        });

        expect(warnings()).toEqual([]);

        cleanup();
    });
});

describe('the published AVState', () => {
    const VIDEO_MANIFEST = {
        id: 'https://iiif.io/api/cookbook/recipe/0003-mvm-video/manifest.json',
        json: recipe('0003-mvm-video.json'),
    };
    const VIDEO_CANVAS =
        'https://iiif.io/api/cookbook/recipe/0003-mvm-video/canvas';

    /** Every `pluginerror` that reaches the given node by bubbling. */
    function commandErrors(node: HTMLElement): PluginError[] {
        const seen: PluginError[] = [];
        node.addEventListener('pluginerror', (event) => {
            seen.push((event as CustomEvent<PluginError>).detail);
        });
        return seen;
    }

    it('is reachable through the typed accessor and addresses the current canvas', async () => {
        const { tc, cleanup } = await mountWith(VIDEO_MANIFEST);
        tc.viewerState.setCanvas(VIDEO_CANVAS);
        await flush();

        const av = getAVState(tc.viewerState);
        expect(av).not.toBeNull();
        expect(av!.activeMediaCanvasId).toBe(VIDEO_CANVAS);
        expect(av!.paused).toBe(true);

        cleanup();
    });

    // Retirement is the SDK's, not the view's: `runActivation` retires the
    // publication with the activation, and the conformance case "retires its
    // published state when the activation ends" is where that is asserted.

    // The documented refusal: the canvas is core's, this plugin has no media
    // there, and the host hears about it on the `command` phase rather than
    // watching a command do nothing.
    // Asserted at the viewer root with the panel CLOSED, because that is the
    // case a host actually hits: the plugin's mount container is detached
    // whenever the surface is closed, so a report dispatched there reaches
    // nobody. The refusal has to leave from a node that is always in the viewer.
    it('refuses a command on a canvas it has not claimed, on the command phase', async () => {
        const { tc, cleanup } = await mountWith(
            {
                id: IMAGE_MANIFEST.id,
                json: IMAGE_MANIFEST,
            },
            { open: false },
        );
        const viewer = mountViewerRoot(tc);
        const errors = commandErrors(viewer.root);

        const av = getAVState(tc.viewerState);
        expect(av).not.toBeNull();
        av!.play();

        expect(errors).toHaveLength(1);
        expect(errors[0]!.phase).toBe('command');
        expect(errors[0]!.pluginName).toBe('@triiiceratops/plugin-av');
        expect(av!.activeMediaCanvasId).toBeNull();

        viewer.unmount();
        cleanup();
    });
});

/**
 * Choice of formats, end to end through the activation: the browser's own
 * answer decides which rendition is attached, and the reader's explicit pick
 * overrides it through core's existing selection command.
 */
describe('a choice of renditions', () => {
    const CANVAS =
        'https://iiif.io/api/cookbook/recipe/0434-choice-av/canvas/1';
    const MP3 = 'https://fixtures.iiif.io/audio/ucla/egbe-iyawo-ucla.mp3';
    const FLAC = 'https://fixtures.iiif.io/audio/ucla/egbe-iyawo-ucla.flac';

    const canPlayType = HTMLMediaElement.prototype.canPlayType;
    afterEach(() => {
        HTMLMediaElement.prototype.canPlayType = canPlayType;
    });

    /** Only MP3, which is the everyday state of a browser outside Safari. */
    function onlyMp3IsPlayable(): void {
        HTMLMediaElement.prototype.canPlayType = (type: string) =>
            type === 'audio/mpeg' ? 'probably' : '';
    }

    async function stagedChoice(): Promise<{
        tc: TestViewerContext;
        media: HTMLMediaElement;
        done: () => void;
    }> {
        onlyMp3IsPlayable();
        const { tc, cleanup } = await mountWith({
            id: 'https://iiif.io/api/cookbook/recipe/0434-choice-av/manifest.json',
            json: recipe('0434-choice-av.json'),
        });
        const viewer = mountViewerRoot(tc);
        const media = viewer.root.querySelector<HTMLMediaElement>(
            '[data-testid="av-media"]',
        )!;
        return {
            tc,
            media,
            done: () => {
                viewer.unmount();
                cleanup();
            },
        };
    }

    it('skips the alternatives this browser cannot decode', async () => {
        const { media, done } = await stagedChoice();

        // The recipe's first alternative is Apple Lossless. First-item-wins
        // would have handed the reader a canvas that cannot play.
        expect(media.getAttribute('src')).toBe(MP3);

        done();
    });

    it('stops listening for selections once the activation is gone', async () => {
        onlyMp3IsPlayable();
        const { tc, cleanup } = await mountWith({
            id: 'https://iiif.io/api/cookbook/recipe/0434-choice-av/manifest.json',
            json: recipe('0434-choice-av.json'),
        });
        expect(tc.viewerState.isCanvasClaimed(CANVAS)).toBe(true);

        cleanup();
        // A selection arriving after teardown must not re-stage anything: the
        // canvas is core's again, placard and all.
        tc.viewerState.selectChoice(CANVAS, FLAC);
        await flush();

        expect([...tc.viewerState.claimedCanvases]).toEqual([]);
    });

    it('follows an explicit selection, playable or not', async () => {
        const { tc, media, done } = await stagedChoice();

        tc.viewerState.selectChoice(CANVAS, FLAC);
        await flush();

        expect(media.getAttribute('src')).toBe(FLAC);

        done();
    });
});
