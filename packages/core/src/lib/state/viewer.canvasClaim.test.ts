import { describe, expect, it } from 'vitest';

import { configureLogging } from '../logging/logger';
import {
    toPlannerCanvases,
    unsupportedPresentationIds,
} from '../renderer/canvasDescriptors';
import { createRendererStub } from '../testing/rendererStub';
import type { ViewerError } from '../types/viewerError';
import { isUnsupportedCanvas } from '../utils/paintingBodies';
import { ViewerState } from './viewer.svelte';

/**
 * The **canvas claim** as viewer state owns it: lifecycle, refusal, and the
 * auto-release that keeps a departed plugin from suppressing a treatment
 * forever (CONTEXT.md; ADR 0017).
 *
 * What a claim DOES — the unsupported presentation and its thumbnail glyph
 * disappearing for that canvas — is asserted where the presentation is decided
 * (`renderer/unsupportedPresentation.test.ts`) and end to end over the mounted
 * viewer (`components/CanvasHost.canvasClaim.svelte.test.ts`). What this file is
 * for is the bookkeeping: who holds a claim, who is refused, and when it is let
 * go.
 */
describe('canvas claims', () => {
    const CANVAS = 'https://example.test/canvas/video';

    /**
     * A viewer that knows the named plugins.
     *
     * `ensurePluginUiState` is the seam core itself uses: it is populated before
     * a plugin's `view.mount` runs, which is where a plugin claims from, so it
     * is what `claimCanvas` validates the claimant against.
     */
    function viewerWithPlugins(...pluginIds: string[]): ViewerState {
        const state = new ViewerState();
        for (const pluginId of pluginIds) state.ensurePluginUiState(pluginId);
        return state;
    }

    function reporting(state: ViewerState): ViewerError[] {
        const reported: ViewerError[] = [];
        state.setErrorReporter((error) => reported.push(error));
        return reported;
    }

    it('claims a canvas for one plugin and reads back the claimant', () => {
        const state = viewerWithPlugins('av');

        const release = state.claimCanvas(CANVAS, 'av');

        expect(state.isCanvasClaimed(CANVAS)).toBe(true);
        expect(state.claimedCanvases.get(CANVAS)).toBe('av');
        expect(state.isCanvasClaimed('https://example.test/canvas/other')).toBe(
            false,
        );
        release();
    });

    it('releases on dispose, idempotently', () => {
        const state = viewerWithPlugins('av');
        const release = state.claimCanvas(CANVAS, 'av');

        release();
        expect(state.isCanvasClaimed(CANVAS)).toBe(false);

        // A plugin that releases from its own cleanup AND is unregistered must
        // not be punished for doing both.
        expect(() => release()).not.toThrow();
        expect(state.claimedCanvases.size).toBe(0);
    });

    it('refuses a second claimant, reports it, and keeps the first', () => {
        const records: string[] = [];
        configureLogging({
            debug: true,
            sink: (_level, args) => records.push(args.join(' ')),
        });
        try {
            const state = viewerWithPlugins('av', 'latecomer');
            const reported = reporting(state);
            state.claimCanvas(CANVAS, 'av');

            const refused = state.claimCanvas(CANVAS, 'latecomer');

            // Not last-writer-wins: the first claimant keeps the canvas.
            expect(state.claimedCanvases.get(CANVAS)).toBe('av');
            expect(records.join('\n')).toContain(CANVAS);
            expect(reported).toHaveLength(1);
            expect(reported[0].severity).toBe('warning');
            expect(reported[0].scope).toBe('plugin');
            expect(reported[0].code).toBe('canvas-claim-refused');
            expect(reported[0].message).toContain(CANVAS);

            // A refused caller gets a dispose back like any other, so it never
            // has to branch on whether its claim was accepted — and calling it
            // must not release the claim somebody else holds.
            expect(() => refused()).not.toThrow();
            expect(state.claimedCanvases.get(CANVAS)).toBe('av');
        } finally {
            configureLogging({ debug: false, sink: null });
        }
    });

    it('refuses an unusable claim with a no-op dispose rather than throwing', () => {
        const state = viewerWithPlugins('av');
        const reported = reporting(state);

        expect(() => state.claimCanvas('', 'av')()).not.toThrow();
        expect(() => state.claimCanvas(CANVAS, '')()).not.toThrow();

        expect(state.claimedCanvases.size).toBe(0);
        expect(reported.map((error) => error.code)).toEqual([
            'canvas-claim-refused',
            'canvas-claim-refused',
        ]);
    });

    /**
     * The claim is keyed on the id the VIEWER knows the plugin by, and a claim
     * naming anything else is refused rather than accepted and then orphaned.
     *
     * Without this check the failure is silent and permanent: the claim is
     * taken, the activation ends, `unregisterPlugin` matches nothing, and the
     * canvas keeps its suppression for the rest of the session — a blank box
     * with no placard and nothing rendering into it.
     */
    it('refuses a claim from an id this viewer knows no plugin by', () => {
        const state = viewerWithPlugins('triiiceratops-plugin-av');
        const reported = reporting(state);

        const release = state.claimCanvas(CANVAS, 'plugin-av');

        expect(state.isCanvasClaimed(CANVAS)).toBe(false);
        expect(reported.map((error) => error.code)).toEqual([
            'canvas-claim-refused',
        ]);
        expect(reported[0].message).toContain('plugin-av');
        expect(() => release()).not.toThrow();
    });

    /**
     * The same failure as the test above, from the other end: what the reader
     * would see. A claim under a name the viewer cannot attribute outlives the
     * activation that took it, because unregistration has nothing to match.
     */
    it('has released every claim once the claimant is unregistered', () => {
        const state = viewerWithPlugins('p');

        state.claimCanvas(CANVAS, 'wrong-id');
        state.unregisterPlugin('p');

        expect(state.isCanvasClaimed(CANVAS)).toBe(false);
    });

    it('re-claims a canvas once the first claim is released', () => {
        const state = viewerWithPlugins('av', 'other');
        const reported = reporting(state);

        const first = state.claimCanvas(CANVAS, 'av');
        first();
        state.claimCanvas(CANVAS, 'other');

        expect(state.claimedCanvases.get(CANVAS)).toBe('other');
        expect(reported).toEqual([]);

        // The dead dispose belongs to a claim that is already gone; firing it
        // again must not evict the plugin that claimed afterwards.
        first();
        expect(state.claimedCanvases.get(CANVAS)).toBe('other');
    });

    /**
     * The interleaving the dispose's identity check exists for, and the only one
     * that reaches it: the first claim is dropped by the BACKSTOP rather than by
     * its own dispose, so that dispose is still live when the canvas is claimed
     * afresh. A dispose keyed on nothing but "have I run yet" would evict a
     * plugin that never asked to be evicted.
     */
    it('cannot evict a later claimant with a dispose left over from an unregistered plugin', () => {
        const state = viewerWithPlugins('av', 'other');

        const staleRelease = state.claimCanvas(CANVAS, 'av');
        state.unregisterPlugin('av');
        state.claimCanvas(CANVAS, 'other');

        staleRelease();

        expect(state.claimedCanvases.get(CANVAS)).toBe('other');
    });

    it('releases every claim a plugin holds when it is unregistered', () => {
        const state = viewerWithPlugins('av', 'threed');
        state.claimCanvas(CANVAS, 'av');
        state.claimCanvas('https://example.test/canvas/audio', 'av');
        state.claimCanvas('https://example.test/canvas/model', 'threed');

        // The backstop for a plugin whose own cleanup missed its release —
        // the path a failed mount, a retry, and a deactivation all take.
        state.unregisterPlugin('av');

        expect([...state.claimedCanvases.keys()]).toEqual([
            'https://example.test/canvas/model',
        ]);
    });

    it('releases every claim when all plugins are destroyed', () => {
        const state = viewerWithPlugins('av', 'threed');
        state.claimCanvas(CANVAS, 'av');
        state.claimCanvas('https://example.test/canvas/model', 'threed');

        state.destroyAllPlugins();

        expect(state.claimedCanvases.size).toBe(0);
    });

    /**
     * The claim set is a plugin's to read and core's to write: one claimant per
     * canvas is an invariant, so the collection is not reachable for a plugin
     * holding `context.state` to `set` itself over somebody else's canvas.
     */
    it('exposes the claim set through a getter with no setter', () => {
        const state = viewerWithPlugins('av');
        state.claimCanvas(CANVAS, 'av');

        const descriptor = Object.getOwnPropertyDescriptor(
            Object.getPrototypeOf(state),
            'claimedCanvases',
        );
        expect(typeof descriptor?.get).toBe('function');
        expect(descriptor?.set).toBeUndefined();

        // The collection is the viewer's, so swapping it out — which would
        // evict every claimant at once, refusal channel and all — is a
        // TypeError rather than an assignment.
        expect(() => {
            (state as unknown as Record<string, unknown>).claimedCanvases =
                new Map();
        }).toThrow(TypeError);
        expect(state.claimedCanvases.get(CANVAS)).toBe('av');
    });

    it('keeps a claim against a canvas id no manifest carries, and applies it when the id appears', async () => {
        // Inert, but kept: a plugin claims from its `view.mount`, which may run
        // before the manifest it is interested in is loaded, and a claim that
        // evaporated because the id was not there yet would be a race the
        // plugin cannot win.
        const state = viewerWithPlugins('av');
        const canvasId = 'https://example.test/canvas/not-yet';
        state.claimCanvas(canvasId, 'av');

        expect(state.isCanvasClaimed(canvasId)).toBe(true);

        // A canvas with a video body: one that WOULD get the unsupported
        // presentation, so the claim has something to suppress when it arrives.
        const canvas = {
            id: canvasId,
            type: 'Canvas',
            width: 640,
            height: 360,
            items: [
                {
                    id: `${canvasId}/page`,
                    type: 'AnnotationPage',
                    items: [
                        {
                            id: `${canvasId}/annotation`,
                            type: 'Annotation',
                            motivation: 'painting',
                            target: canvasId,
                            body: {
                                id: 'https://example.test/media/film.mp4',
                                type: 'Video',
                                format: 'video/mp4',
                                width: 640,
                                height: 360,
                                duration: 12,
                            },
                        },
                    ],
                },
            ],
        };

        await state.setManifestData('https://example.test/manifest', {
            id: 'https://example.test/manifest',
            type: 'Manifest',
            items: [canvas],
        });

        expect(state.isCanvasClaimed(canvasId)).toBe(true);
        // The claim now applies: the canvas is one core cannot render, and the
        // presentation it would have got is suppressed.
        expect(isUnsupportedCanvas(state.canvases[0])).toBe(true);
        expect(
            unsupportedPresentationIds(toPlannerCanvases(state.canvases)),
        ).toEqual(new Set([canvasId]));
        expect(
            unsupportedPresentationIds(
                toPlannerCanvases(state.canvases),
                (id) => state.isCanvasClaimed(id),
            ).size,
        ).toBe(0);
    });

    it('leaves the viewport and its coordinate queries untouched', () => {
        const state = viewerWithPlugins('av');
        state.attachRenderer(createRendererStub());

        const before = {
            scale: state.viewportScale,
            centre: state.viewportCentre,
            bounds: state.viewportBounds,
            containerSize: state.containerSize,
            projected: state.canvasToScreen({ x: 10, y: 20 }, CANVAS),
        };

        state.claimCanvas(CANVAS, 'av');

        // A claim owns the canvas's non-image CONTENT. Layout, projection, and
        // the viewport are core's and stay core's.
        expect(state.viewportScale).toEqual(before.scale);
        expect(state.viewportCentre).toEqual(before.centre);
        expect(state.viewportBounds).toEqual(before.bounds);
        expect(state.containerSize).toEqual(before.containerSize);
        expect(state.canvasToScreen({ x: 10, y: 20 }, CANVAS)).toEqual(
            before.projected,
        );
    });
});
