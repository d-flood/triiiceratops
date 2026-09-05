import { describe, expect, it } from 'vitest';

import { configureLogging } from '../logging/logger';
import { createRendererStub } from '../testing/rendererStub';
import {
    NEUTRAL_IMAGE_ADJUSTMENTS,
    ZERO_VIEWPORT_INSET,
} from '../types/viewport';
import type { ViewerError } from '../types/viewerError';
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
            getVisibleCanvasIds: () => ['impostor'],
            getCentre: () => ({ x: 999, y: 999 }),
            getVisibleBounds: () => null,
            getCanvasSize: () => null,
            getContainerSize: () => ({ width: 999, height: 999 }),
            canvasToScreen: () => null,
            screenToCanvas: () => null,
            applyImageAdjustments: () => {},
            onFrame: () => () => {},
            onTap: () => () => {},
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
            getVisibleCanvasIds: () => [],
            getCentre: () => null,
            getVisibleBounds: () => null,
            getCanvasSize: () => null,
            getContainerSize: () => ({ width: 1, height: 1 }),
            canvasToScreen: () => null,
            screenToCanvas: () => null,
            applyImageAdjustments: () => {},
            onFrame: () => () => {},
            onTap: () => () => {},
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
        expect(state.canvasSize()).toBeNull();
    });

    /*
        A canvas that declares no width or height is still laid out, and
        `canvasSize` is the only way anything outside the renderer can learn
        the box it was laid out at. Without it a claimant placing DOM over a
        duration-only audio canvas has nothing to project but invented
        dimensions, which `canvasToScreen` would then disagree with.
    */
    it('reports a canvas-space extent, and null for a canvas it does not lay out', () => {
        const state = new ViewerState();
        state.attachRenderer(
            createRendererStub({
                canvasIds: ['canvas-1'],
                canvasSize: { width: 640, height: 360 },
            }),
        );

        expect(state.canvasSize('canvas-1')).toEqual({
            width: 640,
            height: 360,
        });
        expect(state.canvasSize('canvas-9')).toBeNull();
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

/**
 * The **viewport inset** — edges a plugin reserves so that fits frame into the
 * space the reader can actually see.
 *
 * What is asserted here is the COMMAND: the merge, the reset, the refusal, and
 * that nothing is pushed at the renderer. That an inset changes where a fit
 * lands is arithmetic, and it is asserted where the arithmetic lives
 * (`renderer/viewportMath.test.ts` — `insetFitScale`) plus one browser
 * assertion in `tests/canvas-renderer.spec.ts`. Teaching the renderer stand-in
 * enough fit maths to assert against here would create a second implementation
 * that drifts from the real one.
 */
describe('viewport inset', () => {
    it('starts at zero and merges partial changes over the current inset', () => {
        const state = new ViewerState();
        expect(state.viewportInset).toEqual(ZERO_VIEWPORT_INSET);

        state.setViewportInset({ bottom: 200 });
        state.setViewportInset({ left: 40 });

        expect(state.viewportInset).toEqual({
            top: 0,
            right: 0,
            bottom: 200,
            left: 40,
        });
    });

    it('resets every edge to zero', () => {
        const state = new ViewerState();
        state.setViewportInset({ top: 10, bottom: 200, left: 40, right: 5 });

        state.resetViewportInset();

        expect(state.viewportInset).toEqual(ZERO_VIEWPORT_INSET);
    });

    // An author error at any surface size, refused whole rather than obeyed —
    // the same rule `zoomTo` and `fitBounds` apply to an unusable number. The
    // per-axis fallback for an inset that merely does not FIT the window is a
    // different thing entirely, is silent, and lives in the fit arithmetic.
    it('refuses a negative or non-finite edge, logs it, and keeps the stored inset', () => {
        const records: string[] = [];
        configureLogging({
            debug: true,
            sink: (_level, args) => records.push(args.join(' ')),
        });
        try {
            const state = new ViewerState();
            state.setViewportInset({ bottom: 120 });

            for (const inset of [
                { bottom: -1 },
                { top: Number.NaN },
                { left: Infinity },
                { right: -Infinity },
            ]) {
                state.setViewportInset(inset);
                expect(state.viewportInset, JSON.stringify(inset)).toEqual({
                    ...ZERO_VIEWPORT_INSET,
                    bottom: 120,
                });
            }

            expect(records).toHaveLength(4);
            expect(records.join('\n')).toContain('setViewportInset');
        } finally {
            configureLogging({ debug: false, sink: null });
        }
    });

    /**
     * An explicit `undefined` edge means "leave this edge alone", exactly as an
     * omitted one does.
     *
     * Not a nicety: `exactOptionalPropertyTypes` is off across this repo, so
     * `setViewportInset({ bottom: open ? 200 : undefined })` is a well-typed
     * call, and it is the shape an author reaches for first when a panel
     * toggles. Validating the spread naively makes that call fail
     * `Number.isFinite`, refuse the WHOLE inset, and warn about "a negative or
     * non-finite edge" — so the panel's own reserved strip silently never
     * clears, with a log that names the wrong problem. A genuine `-1`, `NaN` or
     * `Infinity` is still an author error and still refused.
     */
    it('treats an explicitly undefined edge as omitted', () => {
        const records: string[] = [];
        configureLogging({
            debug: true,
            sink: (_level, args) => records.push(args.join(' ')),
        });
        try {
            const state = new ViewerState();
            state.setViewportInset({ top: 10, bottom: 200 });

            state.setViewportInset({ bottom: undefined, left: 40 });

            expect(state.viewportInset).toEqual({
                top: 10,
                right: 0,
                bottom: 200,
                left: 40,
            });
            expect(records).toEqual([]);

            // …and the whole set is still refused when a real edge is unusable,
            // even alongside an undefined one.
            state.setViewportInset({ bottom: undefined, right: -1 });
            expect(state.viewportInset).toEqual({
                top: 10,
                right: 0,
                bottom: 200,
                left: 40,
            });
            expect(records).toHaveLength(1);
        } finally {
            configureLogging({ debug: false, sink: null });
        }
    });

    // The inset is a number the fit arithmetic CONSULTS, not something applied to
    // a surface: there is no port method, so nothing replays and nothing can be
    // lost. Setting one with no renderer attached is ordinary, and the renderer
    // that mounts next reads the stored value on its first fit.
    it('needs no renderer, pushes nothing at one, and survives a remount', () => {
        const state = new ViewerState();
        expect(() => state.setViewportInset({ bottom: 200 })).not.toThrow();

        const first = createRendererStub();
        const detach = state.attachRenderer(first);
        // Attaching replays image adjustments; the inset is deliberately not
        // replayed, because there is nothing to replay it to.
        expect(
            first.calls.filter(([name]) => name !== 'applyImageAdjustments'),
        ).toEqual([]);

        state.setViewportInset({ top: 10 });
        expect(
            first.calls.filter(([name]) => name !== 'applyImageAdjustments'),
        ).toEqual([]);

        detach();
        state.attachRenderer(createRendererStub());

        expect(state.viewportInset).toEqual({
            ...ZERO_VIEWPORT_INSET,
            bottom: 200,
            top: 10,
        });
    });

    /**
     * Setting an inset is not a viewport command: the reader may have zoomed in
     * deliberately, and core moving the image because a plugin panel opened
     * would be surprising (ADR 0015's spirit). The next fit uses it; a plugin
     * that wants to be re-framed now issues a fit itself.
     *
     * **What this proves and what it does not.** It proves that
     * `setViewportInset` itself issues no port command and writes no viewport
     * state — which is all this seam can see. It does **not** prove the
     * no-reactivity rule: the stand-in has no fit arithmetic and no scene
     * effect, so it could not re-fit if the renderer wanted it to. That the real
     * renderer does not re-fit — the `untrack` read in `CanvasHost.currentInset`
     * — is asserted in the browser, in `tests/canvas-renderer.spec.ts`.
     */
    it('issues nothing at the renderer that could move the current view', () => {
        const state = new ViewerState();
        const renderer = createRendererStub({
            scale: 2,
            centre: { x: 300, y: 400 },
        });
        state.attachRenderer(renderer);

        const before = renderer.calls.length;
        state.setViewportInset({ bottom: 200 });

        expect(renderer.calls.slice(before)).toEqual([]);
        expect(state.viewportScale).toBe(2);
        expect(state.viewportCentre).toEqual({ x: 300, y: 400 });
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

/**
 * The paint hook, as viewer state owns it: registration, ordering, and teardown.
 *
 * What a layer is HANDED — the context and the transform the tiles were drawn
 * with — is the renderer host's, and is asserted in the browser
 * (`tests/canvas-renderer-paint-hook.spec.ts`) because a claim about which matrix
 * a layer received can only be made against a real frame with real tiles in it.
 */
describe('the paint hook', () => {
    const draw = () => {};

    it('registers a layer before any renderer has mounted, and keeps it', () => {
        const state = new ViewerState();
        state.registerPaintLayer({ id: 'early', draw });

        // A plugin activating during mount must not have to wait for a renderer,
        // and a renderer arriving later must find the layer already there.
        expect(state.paintLayers.map((layer) => layer.id)).toEqual(['early']);
        state.attachRenderer(createRendererStub());
        expect(state.paintLayers.map((layer) => layer.id)).toEqual(['early']);
    });

    it('orders layers by order, then by registration', () => {
        const state = new ViewerState();
        state.registerPaintLayer({ id: 'top', order: 5, draw });
        state.registerPaintLayer({ id: 'first', draw });
        state.registerPaintLayer({ id: 'second', draw });

        expect(state.paintLayers.map((layer) => layer.id)).toEqual([
            'first',
            'second',
            'top',
        ]);
    });

    it('removes a layer on release, idempotently, and announces both', () => {
        const state = new ViewerState();
        const before = state.paintLayerRevision;
        const release = state.registerPaintLayer({ id: 'one', draw });
        expect(state.paintLayerRevision).toBe(before + 1);

        release();
        expect(state.paintLayers).toEqual([]);
        expect(state.paintLayerRevision).toBe(before + 2);

        release();
        expect(state.paintLayerRevision).toBe(before + 2);
    });

    it('refuses an unusable layer with a no-op release rather than throwing', () => {
        const state = new ViewerState();

        // Every caller gets a release function back, so a plugin's teardown never
        // has to know whether its registration was accepted.
        expect(() =>
            state.registerPaintLayer({ id: '', draw })(),
        ).not.toThrow();
        expect(() =>
            state.registerPaintLayer({ id: 'no-draw' } as never)(),
        ).not.toThrow();
        expect(state.paintLayers).toEqual([]);
    });
});

/**
 * Overlay layers, as viewer state owns them: registration, order, and teardown.
 *
 * Everything about the CONTAINER — that it exists in the stage, that its origin
 * is `canvasToScreen`'s, and that it is the same node across a manifest change —
 * is the render site's and is asserted in the browser
 * (`tests/canvas-renderer-overlay-layer.spec.ts`), because those are claims about
 * real DOM in a real tree.
 */
describe('overlay layers', () => {
    const mount = () => () => {};

    /**
     * A viewer that knows the given plugin ids.
     *
     * A layer id must name a plugin of this viewer, and `ensurePluginUiState` is
     * exactly what a plugin's activation calls before its `view.mount` runs — so
     * this is the real precondition, not a test shortcut.
     */
    function withPlugins(...pluginIds: string[]): ViewerState {
        const state = new ViewerState();
        for (const pluginId of pluginIds) state.ensurePluginUiState(pluginId);
        return state;
    }

    it('registers a layer before any renderer has mounted, and keeps it', () => {
        const state = withPlugins('a');
        state.registerOverlayLayer({ id: 'a:early', mount });

        // Registering before a renderer exists is valid: the container is placed
        // beside the renderer, not inside it, so it needs no readiness gate.
        expect(state.overlayLayers.map((layer) => layer.id)).toEqual([
            'a:early',
        ]);
        state.attachRenderer(createRendererStub());
        expect(state.overlayLayers.map((layer) => layer.id)).toEqual([
            'a:early',
        ]);
    });

    it('keeps layers in registration order', () => {
        const state = withPlugins('a', 'b');
        state.registerOverlayLayer({ id: 'a:one', mount });
        state.registerOverlayLayer({ id: 'b:two', mount });

        expect(state.overlayLayers.map((layer) => layer.id)).toEqual([
            'a:one',
            'b:two',
        ]);
    });

    it('removes a layer on dispose, idempotently, and announces both', () => {
        const state = withPlugins('a');
        const before = state.overlayLayerRevision;
        const dispose = state.registerOverlayLayer({ id: 'a:one', mount });
        expect(state.overlayLayerRevision).toBe(before + 1);

        dispose();
        expect(state.overlayLayers).toEqual([]);
        expect(state.overlayLayerRevision).toBe(before + 2);

        dispose();
        expect(state.overlayLayerRevision).toBe(before + 2);
    });

    it('refuses an unusable layer with a no-op dispose rather than throwing', () => {
        const state = withPlugins('a');

        // Every caller gets a dispose back, so a plugin's teardown never has to
        // know whether its registration was accepted.
        expect(() =>
            state.registerOverlayLayer({ id: '', mount })(),
        ).not.toThrow();
        expect(() =>
            state.registerOverlayLayer({ id: 'a:no-mount' } as never)(),
        ).not.toThrow();
        expect(state.overlayLayers).toEqual([]);
    });

    /**
     * An id must be `<pluginId>:<name>` naming a plugin of the viewer, which is
     * what lets `unregisterPlugin` release a layer its plugin forgot.
     *
     * The trap this guards: core mounts a plugin's view BEFORE registering its
     * chrome, so validating against `pluginMenuButtons`/`pluginPanels`/
     * `pluginFlyouts` would refuse every layer a plugin registers from inside its
     * own `view.mount` — which is all of them.
     */
    describe('id ownership', () => {
        it('accepts a layer registered before the plugin’s chrome exists', () => {
            const state = withPlugins('notes');

            const dispose = state.registerOverlayLayer({
                id: 'notes:markers',
                mount,
            });

            // No chrome at all yet — this is the state of the world inside
            // `view.mount`.
            expect(state.pluginMenuButtons).toEqual([]);
            expect(state.pluginPanels).toEqual([]);
            expect(state.pluginFlyouts).toEqual([]);
            expect(state.overlayLayers.map((layer) => layer.id)).toEqual([
                'notes:markers',
            ]);
            dispose();
        });

        it('refuses an id naming no known plugin, reports it, and registers nothing', () => {
            const records: string[] = [];
            configureLogging({
                debug: true,
                sink: (_level, args) => records.push(args.join(' ')),
            });
            try {
                const state = withPlugins('notes');
                // The log is the DEBUG half. `logger` is a no-op unless
                // `ViewerConfig.debug` is on, so a refusal that only logged would
                // be invisible in every default viewer — and the symptom is a
                // layer that renders nothing, with no error to go on. The
                // structured channel is what a host actually receives.
                const reported: ViewerError[] = [];
                state.setErrorReporter((error) => reported.push(error));

                const dispose = state.registerOverlayLayer({
                    id: 'ghost:markers',
                    mount,
                });

                expect(state.overlayLayers).toEqual([]);
                expect(records.join('\n')).toContain('ghost:markers');
                expect(reported).toHaveLength(1);
                expect(reported[0].severity).toBe('warning');
                expect(reported[0].scope).toBe('plugin');
                expect(reported[0].code).toBe('overlay-layer-refused');
                expect(reported[0].message).toContain('ghost:markers');
                // A caller that stored the dispose and calls it later must not
                // be punished for a refusal it never had to check for.
                expect(() => dispose()).not.toThrow();
                expect(state.overlayLayerRevision).toBe(0);
            } finally {
                configureLogging({ debug: false, sink: null });
            }
        });
    });
});
