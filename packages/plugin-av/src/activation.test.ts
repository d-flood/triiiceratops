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
        // No stage was built — the same state as an image manifest, which is
        // exactly right: this canvas is not ours.
        const viewer = mountViewerRoot(tc);
        expect(
            viewer.root.querySelector('[data-testid="av-media"]'),
        ).toBeNull();
        viewer.unmount();

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

/*
    Which layout a claimed canvas gets is decided by whether the picture is the
    plugin's element to show, and a duration-only canvas is not the answer to
    that: `0015-start` declares no `width`/`height` and still paints a `Video`.
*/
describe('the stage layout', () => {
    async function laneOf(file: string): Promise<{
        media: Element | null;
        visual: Element | null;
        cleanup: () => void;
    }> {
        const { tc, cleanup } = await mountWith({
            id: `https://iiif.io/api/cookbook/recipe/${file.replace('.json', '')}/manifest.json`,
            json: recipe(file),
        });
        const viewer = mountViewerRoot(tc);
        const stage = viewer.root.querySelector<HTMLElement>(
            '[data-testid="av-stage"]',
        )!;

        return {
            media: stage.querySelector('[data-testid="av-media"]'),
            visual: stage.querySelector('[data-testid="av-visual-lane"]'),
            cleanup: () => {
                viewer.unmount();
                cleanup();
            },
        };
    }

    it('puts the element in the visual lane of a duration-only video canvas', async () => {
        const { media, visual, cleanup } = await laneOf('0015-start.json');

        expect(media?.tagName).toBe('VIDEO');
        expect(visual?.contains(media!)).toBe(true);

        cleanup();
    });

    it('keeps a duration-only sound body out of the lane', async () => {
        const { media, visual, cleanup } = await laneOf(
            '0014-accompanyingcanvas.json',
        );

        expect(visual?.contains(media!)).toBe(false);

        cleanup();
    });
});

/*
    The companion phase is the second half of what claiming a canvas means: the
    claim suppresses core's placard, and the phase says which of the canvas's own
    companion Canvases core should paint into the rect instead. The plugin sets
    it and reads nothing back — what a phase produces is core's.
*/
describe('the companion phase', () => {
    const ACCOMPANYING_CANVAS =
        'https://iiif.io/api/cookbook/recipe/0014-accompanyingcanvas/canvas/p1';

    it('asks core to paint the accompanying canvas of a canvas that has one', async () => {
        const { tc, cleanup } = await mountWith({
            id: 'https://iiif.io/api/cookbook/recipe/0014-accompanyingcanvas/manifest.json',
            json: recipe('0014-accompanyingcanvas.json'),
        });

        expect(tc.viewerState.isPaintingCompanion(ACCOMPANYING_CANVAS)).toBe(
            true,
        );

        cleanup();
    });

    // The claim's suppression-only semantics: painting is opt-in, so a canvas
    // with no accompanying canvas leaves core rendering exactly what it would
    // have rendered without the phase command existing at all.
    it('asks for nothing on a canvas with no accompanying canvas', async () => {
        const { tc, cleanup } = await mountWith({
            id: 'https://iiif.io/api/cookbook/recipe/0002-mvm-audio/manifest.json',
            json: recipe('0002-mvm-audio.json'),
        });

        expect(
            tc.viewerState.isPaintingCompanion(
                'https://iiif.io/api/cookbook/recipe/0002-mvm-audio/canvas',
            ),
        ).toBe(false);

        cleanup();
    });

    /*
        A canvas that declares its own dimensions paints its picture in the
        `<video>` element, which covers the rect. Core would still paint the
        companion behind it — a Video body yields no images of its own, so
        core's composite-canvas skip does not fire — and the tile pipeline would
        buy the score at every zoom for a picture nobody can see.
    */
    it('asks for nothing on a video canvas that carries one', async () => {
        const manifest = recipe('0003-mvm-video.json') as {
            items: Record<string, unknown>[];
        };
        manifest.items[0].accompanyingCanvas = (
            recipe('0014-accompanyingcanvas.json') as {
                items: Record<string, unknown>[];
            }
        ).items[0].accompanyingCanvas;

        const { tc, cleanup } = await mountWith({
            id: 'https://iiif.io/api/cookbook/recipe/0003-mvm-video/manifest.json',
            json: manifest,
        });

        expect(
            tc.viewerState.isPaintingCompanion(
                'https://iiif.io/api/cookbook/recipe/0003-mvm-video/canvas',
            ),
        ).toBe(false);

        cleanup();
    });

    /*
        Core resolves a companion painting a non-image body to nothing and warns.
        Asking for it anyway would cost the canvas its timeline lane and its
        waveform for a picture that never arrives, leaving the reader a rect with
        nothing in it at all.
    */
    it('asks for nothing where the companion paints no image', async () => {
        const manifest = recipe('0014-accompanyingcanvas.json') as {
            items: { accompanyingCanvas: { items: unknown } }[];
        };
        manifest.items[0].accompanyingCanvas.items = [
            {
                type: 'AnnotationPage',
                items: [
                    {
                        type: 'Annotation',
                        motivation: 'painting',
                        body: {
                            id: 'https://example.org/notes.vtt',
                            type: 'Text',
                            format: 'text/vtt',
                        },
                        target: 'https://iiif.io/api/cookbook/recipe/0014-accompanyingcanvas/canvas/accompanying',
                    },
                ],
            },
        ];

        const { tc, cleanup } = await mountWith({
            id: 'https://iiif.io/api/cookbook/recipe/0014-accompanyingcanvas/manifest.json',
            json: manifest,
        });

        expect(tc.viewerState.isPaintingCompanion(ACCOMPANYING_CANVAS)).toBe(
            false,
        );

        cleanup();
    });

    /*
        Core reaches a companion's annotations through `items` and no other
        spelling, so a 3.0-beta manifest whose companion carries `content`
        paints nothing however readable it is elsewhere. Asking for it would
        hide the element for a picture that never arrives — a blank rect, and
        strictly worse than no companion at all.
    */
    it('asks for nothing for a companion spelling its pages "content"', async () => {
        const manifest = recipe('0014-accompanyingcanvas.json') as {
            items: {
                accompanyingCanvas: { items?: unknown; content?: unknown };
            }[];
        };
        const companion = manifest.items[0].accompanyingCanvas;
        companion.content = companion.items;
        delete companion.items;

        const { tc, cleanup } = await mountWith({
            id: 'https://iiif.io/api/cookbook/recipe/0014-accompanyingcanvas/manifest.json',
            json: manifest,
        });

        expect(tc.viewerState.isPaintingCompanion(ACCOMPANYING_CANVAS)).toBe(
            false,
        );

        cleanup();
    });

    /*
        A Choice is the reader's pick between equivalents, and core resolves the
        SELECTED alternative — the first one, by default. An image sitting
        beside it is not a fallback core hunts through, so answering `true` on
        the strength of one costs the canvas its lane for a still that never
        paints.
    */
    it('asks for nothing where the selected alternative is no image', async () => {
        const manifest = recipe('0014-accompanyingcanvas.json') as {
            items: { accompanyingCanvas: { items: { items: unknown[] }[] } }[];
        };
        manifest.items[0].accompanyingCanvas.items[0].items = [
            {
                type: 'Annotation',
                motivation: 'painting',
                body: {
                    type: 'Choice',
                    items: [
                        {
                            id: 'https://example.org/act1.mp4',
                            type: 'Video',
                            format: 'video/mp4',
                        },
                        {
                            id: 'https://example.org/score.jpg',
                            type: 'Image',
                            format: 'image/jpeg',
                        },
                    ],
                },
                target: 'https://iiif.io/api/cookbook/recipe/0014-accompanyingcanvas/canvas/accompanying',
            },
        ];

        const { tc, cleanup } = await mountWith({
            id: 'https://iiif.io/api/cookbook/recipe/0014-accompanyingcanvas/manifest.json',
            json: manifest,
        });

        expect(tc.viewerState.isPaintingCompanion(ACCOMPANYING_CANVAS)).toBe(
            false,
        );

        cleanup();
    });

    it('goes with the claim when the activation is torn down', async () => {
        const { tc, cleanup } = await mountWith({
            id: 'https://iiif.io/api/cookbook/recipe/0014-accompanyingcanvas/manifest.json',
            json: recipe('0014-accompanyingcanvas.json'),
        });

        cleanup();
        await flush();

        expect(tc.viewerState.isPaintingCompanion(ACCOMPANYING_CANVAS)).toBe(
            false,
        );
    });

    /*
        The placeholder half of the schedule (user stories 11 and 12).
        `0013-placeholderCanvas` is a 640×360 video canvas carrying a still to
        show before playback. Core paints it, so it is on the tier ladder like
        anything else, and the element stays invisible until the reader presses
        play.
    */
    describe('the placeholder', () => {
        const PLACEHOLDER_CANVAS =
            'https://iiif.io/api/cookbook/recipe/0013-placeholderCanvas/canvas/donizetti';

        /**
         * Playback as the element reports it: asked for, then holding a frame.
         * The handover waits for the second, because `play` alone means only
         * that the browser is preparing — see `mediaStage`'s `onPlay`.
         */
        function beginPlayback(media: HTMLMediaElement): void {
            media.dispatchEvent(new Event('play'));
            media.dispatchEvent(new Event('loadeddata'));
        }

        async function stagedPlaceholder(): Promise<{
            tc: TestViewerContext;
            media: HTMLMediaElement;
            done: () => void;
        }> {
            const { tc, cleanup } = await mountWith({
                id: 'https://iiif.io/api/cookbook/recipe/0013-placeholderCanvas/manifest.json',
                json: recipe('0013-placeholderCanvas.json'),
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

        it('asks core to paint the still before playback', async () => {
            const { tc, done } = await stagedPlaceholder();

            expect(tc.viewerState.companionPhaseFor(PLACEHOLDER_CANVAS)).toBe(
                'placeholder',
            );

            done();
        });

        // What the reader sees is core's painting: the plugin puts nothing of
        // its own over the rect, and requests no image anywhere.
        it('draws no still of its own over the rect', async () => {
            const { media, done } = await stagedPlaceholder();

            expect(
                media.closest('[data-testid="av-stage"]')!.querySelector('img'),
            ).toBeNull();

            done();
        });

        /*
            The handover, and the reason `'none'` is stated rather than the
            phase simply released: core keeps the rect a phase gave the canvas,
            so a still giving way to nothing never reflows the page (story 10).
        */
        it('hands the rect back on the first play', async () => {
            const { tc, media, done } = await stagedPlaceholder();

            beginPlayback(media);
            await flush();

            expect(tc.viewerState.companionPhaseFor(PLACEHOLDER_CANVAS)).toBe(
                'none',
            );

            done();
        });

        // Nothing but the first play moves it. Metadata arriving, a seek and a
        // pause are all states the placeholder is still the right picture for.
        it('is unmoved by metadata, seeking and pausing', async () => {
            const { tc, media, done } = await stagedPlaceholder();

            for (const event of ['loadedmetadata', 'seeked', 'pause'])
                media.dispatchEvent(new Event(event));
            await flush();

            expect(tc.viewerState.companionPhaseFor(PLACEHOLDER_CANVAS)).toBe(
                'placeholder',
            );

            done();
        });

        /*
            A canvas carrying BOTH companions: the placeholder is the phase until
            playback starts and the accompanying canvas takes over from it,
            because that one is permanent. The rect is core's and identical
            across the two, so nothing moves at the handover.
        */
        it('gives way to the accompanying canvas where there is one', async () => {
            const manifest = recipe('0014-accompanyingcanvas.json') as {
                items: Record<string, unknown>[];
            };
            manifest.items[0].placeholderCanvas = (
                recipe('0013-placeholderCanvas.json') as {
                    items: Record<string, unknown>[];
                }
            ).items[0].placeholderCanvas;

            const { tc, cleanup } = await mountWith({
                id: 'https://iiif.io/api/cookbook/recipe/0014-accompanyingcanvas/manifest.json',
                json: manifest,
            });
            const viewer = mountViewerRoot(tc);

            expect(tc.viewerState.companionPhaseFor(ACCOMPANYING_CANVAS)).toBe(
                'placeholder',
            );

            beginPlayback(
                viewer.root.querySelector<HTMLMediaElement>(
                    '[data-testid="av-media"]',
                )!,
            );
            await flush();

            expect(tc.viewerState.companionPhaseFor(ACCOMPANYING_CANVAS)).toBe(
                'accompanying',
            );

            viewer.unmount();
            cleanup();
        });

        /*
            Album art on a duration-only audio canvas — the canonical use of
            `placeholderCanvas`, and the one shape whose picture the timeline
            lane would otherwise cover. The lane stands down for the still and
            takes the rect back on the first play, so the reader gets the art
            before playback and the waveform during it.
        */
        const AUDIO_CANVAS =
            'https://iiif.io/api/cookbook/recipe/0002-mvm-audio/canvas';

        /** That recipe's audio canvas, given `0013`'s placeholder. */
        function audioWithPlaceholder() {
            const manifest = recipe('0002-mvm-audio.json') as {
                items: Record<string, unknown>[];
            };
            manifest.items[0].placeholderCanvas = (
                recipe('0013-placeholderCanvas.json') as {
                    items: Record<string, unknown>[];
                }
            ).items[0].placeholderCanvas;
            return {
                id: 'https://iiif.io/api/cookbook/recipe/0002-mvm-audio/manifest.json',
                json: manifest,
            };
        }

        it('shows the still over an audio canvas until it plays', async () => {
            const { tc, cleanup } = await mountWith(audioWithPlaceholder());
            const viewer = mountViewerRoot(tc);
            const stage = viewer.root.querySelector<HTMLElement>(
                '[data-testid="av-stage"]',
            )!;

            expect(tc.viewerState.companionPhaseFor(AUDIO_CANVAS)).toBe(
                'placeholder',
            );
            // The companion layout: a tap target over the still and no lane of
            // this plugin's own. Which lanes are actually placed is geometry,
            // and belongs to `mediaStage`'s own tests.
            expect(
                stage.querySelector('[data-testid="av-tap"]'),
            ).not.toBeNull();

            beginPlayback(
                stage.querySelector<HTMLMediaElement>(
                    '[data-testid="av-media"]',
                )!,
            );
            await flush();

            // `'none'`, not a released phase: the rect is the still's, and
            // handing the canvas its own geometry back would reflow the page at
            // the moment story 10 forbids it. The lane simply occupies it.
            expect(tc.viewerState.companionPhaseFor(AUDIO_CANVAS)).toBe('none');

            viewer.unmount();
            cleanup();
        });

        /*
            Ticket 03's rule, unmoved: a companion that resolves to nothing
            requestable is no companion at all, and the canvas keeps the
            full-rect lane and waveform it would have had without one — never a
            blank rect.
        */
        it('keeps the lane where the still would resolve to nothing', async () => {
            const { json, id } = audioWithPlaceholder();
            const placeholder = json.items[0].placeholderCanvas as {
                items: { items: { body: unknown }[] }[];
            };
            placeholder.items[0].items[0].body = {
                id: 'https://example.org/act1.mp4',
                type: 'Video',
                format: 'video/mp4',
            };

            const { tc, cleanup } = await mountWith({ id, json });
            const viewer = mountViewerRoot(tc);

            expect(
                tc.viewerState.companionPhaseFor(AUDIO_CANVAS),
            ).toBeUndefined();
            // The plain audio layout, lane and all: no tap target stands in
            // for a picture that was never going to arrive.
            expect(
                viewer.root.querySelector('[data-testid="av-tap"]'),
            ).toBeNull();

            viewer.unmount();
            cleanup();
        });
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

describe('the transport chrome', () => {
    const VIDEO_MANIFEST = {
        id: 'https://iiif.io/api/cookbook/recipe/0003-mvm-video/manifest.json',
        json: recipe('0003-mvm-video.json'),
    };
    const VIDEO_CANVAS =
        'https://iiif.io/api/cookbook/recipe/0003-mvm-video/canvas';

    /** That recipe's video canvas, followed by a page of images. */
    const MIXED_MANIFEST = {
        id: 'https://example.org/mixed/manifest.json',
        json: {
            '@context': 'http://iiif.io/api/presentation/3/context.json',
            id: 'https://example.org/mixed/manifest.json',
            type: 'Manifest',
            items: [
                (recipe('0003-mvm-video.json') as { items: unknown[] })
                    .items[0],
                IMAGE_MANIFEST.items[0],
            ],
        },
    };
    const MIXED_IMAGE_CANVAS = 'https://example.org/images/canvas/1';

    it('is registered for a manifest with a claimed canvas and released with the activation', async () => {
        const { tc, cleanup } = await mountWith(VIDEO_MANIFEST);

        expect(tc.viewerState.transportChrome.map((entry) => entry.id)).toEqual(
            [`${UI_ID}:transport`],
        );

        cleanup();
        await flush();

        expect(tc.viewerState.transportChrome).toHaveLength(0);
    });

    // Manifest-scoped, not canvas-scoped: a viewer of page images must render
    // exactly the chrome it renders with no AV plugin at all.
    it('registers nothing for a manifest it claims no canvas in', async () => {
        const { tc, cleanup } = await mountWith({
            id: IMAGE_MANIFEST.id,
            json: IMAGE_MANIFEST,
        });

        expect(tc.viewerState.transportChrome).toHaveLength(0);

        cleanup();
    });

    it('answers a view consistent with the published playback state', async () => {
        const { tc, cleanup } = await mountWith(VIDEO_MANIFEST);
        tc.viewerState.setCanvas(VIDEO_CANVAS);
        await flush();

        const av = getAVState(tc.viewerState)!;
        const view = tc.viewerState.transportChrome[0]!.view();

        // The parity rule, asserted rather than assumed: the bar reads the same
        // facts a host reads, because there is one contract behind both.
        expect(view.present).toBe(true);
        expect(view.paused).toBe(av.paused);
        expect(view.duration).toBe(av.duration);
        expect(view.currentTime).toBe(av.currentTime);

        cleanup();
    });

    // The panel control names what it opens (user story 13). The canvas's
    // linked transcript is not read until its stage is built, which happens
    // after the transport, so a label captured once reads "Notes" over a panel
    // holding a transcript.
    it('names the panel control for the transcript its canvas links', async () => {
        const { tc, cleanup } = await mountWith({
            id: 'https://iiif.io/api/cookbook/recipe/0017-transcription-av/manifest.json',
            json: recipe('0017-transcription-av.json'),
        });
        tc.viewerState.setCanvas(
            'https://iiif.io/api/cookbook/recipe/0017-transcription-av/canvas',
        );
        await flush();

        const view = tc.viewerState.transportChrome[0]!.view();
        expect(view.transcript).toBe(true);
        // The test context echoes catalog keys rather than translating them:
        // the point is which key, not which language.
        expect(view.labels.transcript).toBe('av_transcript');

        cleanup();
    });

    // The transient case: within a manifest, navigation flips `present` rather
    // than churning the registration.
    it('stays registered and renders nothing on an unclaimed canvas', async () => {
        const { tc, cleanup } = await mountWith(MIXED_MANIFEST);
        tc.viewerState.setCanvas(MIXED_IMAGE_CANVAS);
        await flush();

        expect(tc.viewerState.transportChrome).toHaveLength(1);
        expect(tc.viewerState.transportChrome[0]!.view().present).toBe(false);

        cleanup();
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
                /spatial placement is unsupported/.test(message),
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
