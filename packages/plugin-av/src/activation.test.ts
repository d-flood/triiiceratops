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

    it('warns that a temporally composed canvas plays its first body only', async () => {
        const { cleanup } = await mountWith({
            id: 'https://iiif.io/api/cookbook/recipe/0064-opera-one-canvas/manifest.json',
            json: recipe('0064-opera-one-canvas.json'),
        });

        expect(
            warnings().filter((message) =>
                /2 time-based bodies sharing its duration/.test(message),
            ),
        ).toHaveLength(1);

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
