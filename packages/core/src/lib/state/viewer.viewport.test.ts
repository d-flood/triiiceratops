import { describe, expect, it } from 'vitest';

import { createRendererStub } from '../testing/rendererStub';
import { NEUTRAL_IMAGE_ADJUSTMENTS } from '../types/viewport';
import { ViewerState } from './viewer.svelte';

/**
 * The public viewport API — commands, query-only reads, coordinate helpers, and
 * image adjustments (SPEC.md §Public API).
 *
 * Asserted against the headless renderer stand-in through the real
 * `attachRenderer` seam, which is the same seam a mounted host uses. What this
 * file is for is the WIRING and the state's own rules: that a command reaches
 * the renderer, that a query reads through to it, that the state answers
 * honestly with no renderer, and that the adjustment set outlives a renderer.
 *
 * It deliberately asserts nothing about clamping, easing, or layout. Those are
 * the real renderer's, and the stand-in does not implement them precisely so
 * that a test here cannot accidentally become the specification for behaviour
 * that lives somewhere else.
 */
describe('viewport commands', () => {
    function mounted(view?: Parameters<typeof createRendererStub>[0]) {
        const state = new ViewerState();
        const renderer = createRendererStub(view);
        const detach = state.attachRenderer(renderer);
        return { state, renderer, detach };
    }

    const commandNames = (
        renderer: ReturnType<typeof createRendererStub>,
    ): string[] =>
        renderer.calls
            .map(([name]) => name)
            .filter((name) => name !== 'applyImageAdjustments');

    it('routes each command to the mounted renderer', () => {
        const { state, renderer } = mounted();

        state.zoomIn();
        state.zoomOut();
        state.zoomTo(3);
        state.panTo({ x: 10, y: 20 });
        state.fitBounds({ x: 0, y: 0, width: 100, height: 100 });
        state.fitCanvas();

        expect(commandNames(renderer)).toEqual([
            'zoomBy',
            'zoomBy',
            'zoomTo',
            'panTo',
            'fitBounds',
            'fitCanvas',
        ]);
    });

    // The old toolbar zoomed in by 1.2 and out by 0.8, which are not each
    // other's inverse — so a zoom in followed by a zoom out did not return to
    // where it started. One factor applied in both directions fixes that.
    it('zooms out by the exact reciprocal of zooming in', () => {
        const { state, renderer } = mounted({ scale: 1 });

        state.zoomIn();
        const zoomedIn = state.viewportScale;
        state.zoomOut();

        expect(zoomedIn).toBeGreaterThan(1);
        expect(state.viewportScale).toBeCloseTo(1, 10);
        expect(renderer.calls[1][1]).toBeCloseTo(
            1 / (renderer.calls[2][1] as number),
            10,
        );
    });

    it('takes the zoom step from the closed renderer config', () => {
        const { state, renderer } = mounted({ scale: 1 });
        state.config = { renderer: { zoomPerClick: 4 } };

        state.zoomIn();

        expect(renderer.calls.at(-1)).toEqual(['zoomBy', 4, undefined]);
        expect(state.viewportScale).toBe(4);
    });

    // A config can arrive from JSON, from a custom-element attribute, or from a
    // framework prop, and can carry a value that would silently break the
    // viewport rather than fail loudly.
    it('ignores an unusable configured zoom step', () => {
        for (const zoomPerClick of [0, 1, -2, Number.NaN, Infinity]) {
            const { state, renderer } = mounted({ scale: 1 });
            state.config = { renderer: { zoomPerClick } };

            state.zoomIn();

            expect(
                renderer.calls.at(-1)?.[1],
                `zoomPerClick: ${zoomPerClick}`,
            ).toBeGreaterThan(1);
        }
    });

    // The same rule `zoomTo` states, on the sibling command: a box with no
    // extent has no scale that frames it, and `viewportMath.fitBounds` falls
    // through to a nominal scale of 1 for one — which teleports the viewport
    // instead of failing.
    it('refuses a fit box that is not a usable rectangle', () => {
        const { state, renderer } = mounted();

        for (const bounds of [
            { x: 0, y: 0, width: 0, height: 100 },
            { x: 0, y: 0, width: 100, height: 0 },
            { x: 0, y: 0, width: -10, height: 10 },
            { x: 0, y: 0, width: Number.NaN, height: 10 },
            { x: 0, y: 0, width: Infinity, height: 10 },
            { x: Number.NaN, y: 0, width: 10, height: 10 },
        ]) {
            state.fitBounds(bounds);
        }

        expect(commandNames(renderer)).toEqual([]);

        // A usable one still goes through.
        state.fitBounds({ x: 0, y: 0, width: 10, height: 10 });
        expect(commandNames(renderer)).toEqual(['fitBounds']);
    });

    it('refuses a zoom target that is not a usable scale', () => {
        const { state, renderer } = mounted();

        for (const scale of [0, -1, Number.NaN, Infinity]) {
            state.zoomTo(scale);
        }

        expect(commandNames(renderer)).toEqual([]);
    });

    // A plugin activating during mount would otherwise have to guard every
    // call, and "the surface is not sized yet" is a timing fact, not a caller
    // error. `rendererReady` is how a caller that cares waits.
    it('is a no-op before a renderer mounts, never a throw', () => {
        const state = new ViewerState();

        expect(state.rendererReady).toBe(false);
        expect(() => {
            state.zoomIn();
            state.zoomTo(2);
            state.panTo({ x: 1, y: 1 });
            state.fitBounds({ x: 0, y: 0, width: 1, height: 1 });
            state.fitCanvas();
        }).not.toThrow();
    });

    it('stops routing commands once the renderer detaches', () => {
        const { state, renderer, detach } = mounted();
        detach();

        state.zoomIn();

        expect(commandNames(renderer)).toEqual([]);
        expect(state.rendererReady).toBe(false);
    });

    // Detaching is per-attachment: a host that unmounts AFTER its replacement
    // has already attached must not tear the live renderer out from under it.
    it('ignores a stale detach from a superseded renderer', () => {
        const { state, detach } = mounted();
        const replacement = createRendererStub({ scale: 7 });
        state.attachRenderer(replacement);

        detach();

        expect(state.rendererReady).toBe(true);
        expect(state.viewportScale).toBe(7);
    });
});

/**
 * `attachRenderer` is `@internal`, but the API report is a d.ts snapshot rather
 * than an api-extractor run, so the method reaches the published declarations
 * and is typed and callable from a plugin. What stops it being a hijack point
 * is the runtime check, not the tag.
 */
describe('attachRenderer is a host seam, not a plugin API', () => {
    it('ignores a port core did not create, leaving the live renderer in place', () => {
        const state = new ViewerState();
        const real = createRendererStub({ scale: 3 });
        state.attachRenderer(real);

        const impostor = {
            zoomBy: () => {},
            zoomTo: () => {},
            panTo: () => {},
            fitBounds: () => {},
            fitCanvas: () => {},
            getScale: () => 999,
            getCentre: () => ({ x: 999, y: 999 }),
            getVisibleBounds: () => null,
            getContainerSize: () => ({ width: 999, height: 999 }),
            canvasToScreen: () => null,
            screenToCanvas: () => null,
            applyImageAdjustments: () => {},
            onFrame: () => () => {},
        };

        const detach = state.attachRenderer(impostor);

        // The real renderer still answers, and the returned detach cannot tear
        // it out either.
        expect(state.viewportScale).toBe(3);
        detach();
        expect(state.rendererReady).toBe(true);
        expect(state.viewportScale).toBe(3);
    });

    it('refuses a foreign port even before any renderer has mounted', () => {
        const state = new ViewerState();

        state.attachRenderer({
            zoomBy: () => {},
            zoomTo: () => {},
            panTo: () => {},
            fitBounds: () => {},
            fitCanvas: () => {},
            getScale: () => 42,
            getCentre: () => null,
            getVisibleBounds: () => null,
            getContainerSize: () => ({ width: 1, height: 1 }),
            canvasToScreen: () => null,
            screenToCanvas: () => null,
            applyImageAdjustments: () => {},
            onFrame: () => () => {},
        });

        expect(state.rendererReady).toBe(false);
        expect(state.viewportScale).toBe(0);
    });
});

describe('query-only viewport state', () => {
    it('reads through to the renderer', () => {
        const state = new ViewerState();
        const renderer = createRendererStub({
            scale: 2,
            centre: { x: 300, y: 400 },
            container: { width: 800, height: 600 },
        });
        state.attachRenderer(renderer);

        expect(state.viewportScale).toBe(2);
        expect(state.viewportCentre).toEqual({ x: 300, y: 400 });
        expect(state.containerSize).toEqual({ width: 800, height: 600 });
        expect(state.viewportBounds).toEqual({
            x: 300 - 200,
            y: 400 - 150,
            width: 400,
            height: 300,
        });
    });

    // Honest absence rather than a fabricated value: a plugin that places
    // something at a screen point must be able to tell "not sized yet" from
    // "the origin".
    it('answers with zeroes and nulls when no renderer is mounted', () => {
        const state = new ViewerState();

        expect(state.viewportScale).toBe(0);
        expect(state.viewportCentre).toBeNull();
        expect(state.viewportBounds).toBeNull();
        expect(state.containerSize).toEqual({ width: 0, height: 0 });
        expect(state.canvasToScreen({ x: 1, y: 1 })).toBeNull();
        expect(state.screenToCanvas({ x: 1, y: 1 })).toBeNull();
    });
});

describe('coordinate helpers', () => {
    it('round-trips a point between canvas space and screen space', () => {
        const state = new ViewerState();
        state.attachRenderer(
            createRendererStub({
                scale: 2,
                centre: { x: 300, y: 400 },
                container: { width: 800, height: 600 },
            }),
        );

        const canvasPoint = { x: 350, y: 380 };
        const screen = state.canvasToScreen(canvasPoint);

        // 50 canvas units right of centre at 2 px/unit = 100 px right of the
        // middle of an 800px-wide surface.
        expect(screen).toEqual({ x: 500, y: 260 });
        expect(state.screenToCanvas(screen!)).toEqual(canvasPoint);
    });

    // The port's rule: a host that cannot answer for the canvas asked about
    // answers `null` rather than answering for a different one — which is the
    // real behaviour in individuals and paged mode, where only the current
    // spread is laid out. The stand-in models it when a test asks it to.
    it('answers null for a canvas the renderer cannot place', () => {
        const state = new ViewerState();
        state.attachRenderer(
            createRendererStub({ scale: 2, canvasIds: ['canvas-1'] }),
        );

        expect(state.canvasToScreen({ x: 0, y: 0 }, 'canvas-1')).not.toBeNull();
        expect(state.canvasToScreen({ x: 0, y: 0 }, 'canvas-2')).toBeNull();
        expect(state.screenToCanvas({ x: 0, y: 0 }, 'canvas-2')).toBeNull();
        // Omitting the id always means the current canvas, which it can answer
        // for by construction.
        expect(state.canvasToScreen({ x: 0, y: 0 })).not.toBeNull();
    });

    it('passes the canvas id through, so a caller can ask about a named canvas', () => {
        const state = new ViewerState();
        const renderer = createRendererStub();
        state.attachRenderer(renderer);

        state.panTo({ x: 0, y: 0 }, 'canvas-7');

        expect(renderer.calls.at(-1)).toEqual([
            'panTo',
            { x: 0, y: 0 },
            'canvas-7',
        ]);
    });
});

describe('image adjustments', () => {
    it('starts neutral and merges partial changes over the current set', () => {
        const state = new ViewerState();
        expect(state.imageAdjustments).toEqual(NEUTRAL_IMAGE_ADJUSTMENTS);

        state.setImageAdjustments({ brightness: 130 });
        state.setImageAdjustments({ invert: true });

        expect(state.imageAdjustments).toEqual({
            ...NEUTRAL_IMAGE_ADJUSTMENTS,
            brightness: 130,
            invert: true,
        });
    });

    it('resets to exactly how the image was decoded', () => {
        const state = new ViewerState();
        state.setImageAdjustments({ brightness: 40, grayscale: true });

        state.resetImageAdjustments();

        expect(state.imageAdjustments).toEqual(NEUTRAL_IMAGE_ADJUSTMENTS);
    });

    // The whole reason this is a command rather than a reach into the
    // renderer's DOM node: the set is viewer state, so it is applied to
    // whichever renderer is mounted — including one that mounts later, and one
    // that replaces the first.
    it('replays onto a renderer that mounts after the adjustment was made', () => {
        const state = new ViewerState();
        state.setImageAdjustments({ contrast: 150 });

        const first = createRendererStub();
        const detach = state.attachRenderer(first);
        expect(first.adjustments.contrast).toBe(150);

        detach();
        const second = createRendererStub();
        state.attachRenderer(second);

        expect(second.adjustments.contrast).toBe(150);
    });

    it('pushes every later change to the live renderer', () => {
        const state = new ViewerState();
        const renderer = createRendererStub();
        state.attachRenderer(renderer);

        state.setImageAdjustments({ saturation: 0 });
        expect(renderer.adjustments.saturation).toBe(0);

        state.resetImageAdjustments();
        expect(renderer.adjustments).toEqual(NEUTRAL_IMAGE_ADJUSTMENTS);
    });
});

describe('frame notification', () => {
    it('reaches subscribers and does not need a renderer to subscribe', () => {
        const state = new ViewerState();
        let woke = 0;
        const off = state.subscribeFrame(() => {
            woke++;
        });

        const renderer = createRendererStub();
        state.attachRenderer(renderer);
        renderer.emitFrame();
        expect(woke).toBe(1);

        off();
        renderer.emitFrame();
        expect(woke).toBe(1);
    });

    it('attaches to the renderer only while somebody is listening', () => {
        const state = new ViewerState();
        const renderer = createRendererStub();
        state.attachRenderer(renderer);

        // An idle viewer costs nothing: no listener, no subscription.
        expect(renderer.frameListenerCount).toBe(0);

        const off = state.subscribeFrame(() => {});
        expect(renderer.frameListenerCount).toBe(1);

        // A second listener shares the ONE subscription to the renderer.
        const off2 = state.subscribeFrame(() => {});
        expect(renderer.frameListenerCount).toBe(1);

        off();
        expect(renderer.frameListenerCount).toBe(1);
        off2();
        expect(renderer.frameListenerCount).toBe(0);
    });

    // One consumer's throw must not abort the rest, or land inside the
    // renderer's own frame loop — which would stop the viewport dead.
    it('isolates a throwing listener from the others and from the renderer', () => {
        const state = new ViewerState();
        const renderer = createRendererStub();
        state.attachRenderer(renderer);

        let survived = 0;
        state.subscribeFrame(() => {
            throw new Error('frame listener boom');
        });
        state.subscribeFrame(() => {
            survived++;
        });

        expect(() => renderer.emitFrame()).not.toThrow();
        expect(survived).toBe(1);
    });
});
