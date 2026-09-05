// Selector cadence (ADR 0011 / CONTEXT.md **Selector cadence**).
//
// `frame` cadence is how the query-only viewport values become reactively
// readable without being mirrored into notifying viewer state: the projection,
// memoization, equality gate, and disposal are identical to `state` cadence —
// only the wake-up differs. The ticker is the RENDERER's own animation events,
// reached through `ViewerState.subscribeFrame`, attached lazily and detached on
// teardown or renderer replacement, so an idle viewer costs nothing and no
// `requestAnimationFrame` loop exists.
//
// The cadence survived the renderer replacement unchanged as a concept; what
// moved is where the tick comes from — core's own signal rather than a third
// party's event names. No renderer is instantiated here: the seam is the
// injectable renderer stub (`testing/rendererStub`), and the `ViewerState` and
// its notifications are real.

import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { configureLogging, type LogLevel } from '../../logging/logger';
import { createRendererStub } from '../../testing/rendererStub';
import { ViewerState } from '../viewer.svelte';
import { createSelectorRuntime } from './runtime';

vi.mock('../manifests.svelte', () => ({
    manifestsState: {
        fetchManifest: vi.fn(),
        fetchResource: vi.fn(),
        registerManifest: vi.fn(),
        getManifest: vi.fn(),
        getManifestEntry: vi.fn(),
        getAnnotations: vi.fn(() => []),
        getCanvases: vi.fn(() => []),
        getSequenceCount: vi.fn(() => 0),
    },
}));

describe('selector cadence', () => {
    let state: ViewerState;
    let runtime: ReturnType<typeof createSelectorRuntime>;
    let renderer: ReturnType<typeof createRendererStub>;
    let detach: (() => void) | null;

    /** The zoom, read exactly as a plugin or wrapper would. */
    const readZoom = (s: ViewerState): number => s.viewportScale;

    beforeEach(() => {
        state = new ViewerState();
        runtime = createSelectorRuntime(state);
        renderer = createRendererStub({ scale: 1 });
        detach = null;
    });

    afterEach(() => {
        detach?.();
        runtime.dispose();
        state.destroy();
        vi.restoreAllMocks();
    });

    function attach(stub = renderer): void {
        detach = state.attachRenderer(stub);
    }

    it('never attaches a ticker for a viewer with only state-cadence projections', async () => {
        const listener = vi.fn();
        runtime
            .createProjection((s: ViewerState) => s.toolbarOpen)
            .subscribe(listener);

        attach();
        await tick();

        expect(renderer.frameListenerCount).toBe(0);
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it("attaches the ticker lazily and wakes a frame projection from the renderer's animation events", async () => {
        attach();
        await tick();

        const zoom = runtime.createProjection(readZoom, { cadence: 'frame' });

        // Creating the projection is not enough — nothing is subscribed yet.
        expect(renderer.frameListenerCount).toBe(0);
        expect(zoom.read()).toBe(1);

        const listener = vi.fn();
        const off = zoom.subscribe(listener);

        // ONE subscription, whatever the renderer's internal event vocabulary
        // is: the viewer owns the fan-out, so a projection costs one listener
        // rather than one per event name.
        expect(renderer.frameListenerCount).toBe(1);

        renderer.setView({ scale: 2 });
        renderer.emitFrame();
        expect(listener).toHaveBeenCalledTimes(1);
        expect(zoom.read()).toBe(2);

        renderer.setView({ scale: 3 });
        renderer.emitFrame();
        renderer.setView({ scale: 4 });
        renderer.emitFrame();
        expect(listener).toHaveBeenCalledTimes(3);
        expect(zoom.read()).toBe(4);

        off();
        expect(renderer.frameListenerCount).toBe(0);
    });

    it('attaches when the renderer mounts after the frame projection subscribed', async () => {
        const listener = vi.fn();
        runtime
            .createProjection(readZoom, { cadence: 'frame' })
            .subscribe(listener);

        expect(renderer.frameListenerCount).toBe(0);

        attach();
        await tick();

        expect(renderer.frameListenerCount).toBe(1);
        // `rendererReady` is an inventoried observable member, so attaching was
        // itself a state notification the frame projection also woke on.
        expect(listener).toHaveBeenCalledTimes(1);
    });

    // A renderer swap — the development-only flag switching hosts, or a
    // remount — leaves a listener count that is non-zero on both sides. A
    // ticker left on the departed renderer reads as a viewport that silently
    // stopped moving, which is the failure this asserts against.
    it('detaches from a replaced renderer and follows the new one', async () => {
        attach();
        await tick();

        const listener = vi.fn();
        runtime
            .createProjection(readZoom, { cadence: 'frame' })
            .subscribe(listener);
        expect(renderer.frameListenerCount).toBe(1);

        const replacement = createRendererStub({ scale: 5 });
        detach = state.attachRenderer(replacement);
        await tick();

        expect(renderer.frameListenerCount).toBe(0);
        expect(replacement.frameListenerCount).toBe(1);

        listener.mockClear();
        renderer.emitFrame();
        expect(listener).not.toHaveBeenCalled();
        replacement.emitFrame();
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it('stops ticking when the renderer unmounts', async () => {
        attach();
        await tick();

        const listener = vi.fn();
        runtime
            .createProjection(readZoom, { cadence: 'frame' })
            .subscribe(listener);
        expect(renderer.frameListenerCount).toBe(1);

        detach?.();
        detach = null;
        await tick();

        expect(renderer.frameListenerCount).toBe(0);
        // A frame from a renderer that is no longer attached reaches nobody.
        listener.mockClear();
        renderer.emitFrame();
        expect(listener).not.toHaveBeenCalled();
    });

    it('detaches the ticker on disposal', async () => {
        attach();
        await tick();

        const listener = vi.fn();
        runtime
            .createProjection(readZoom, { cadence: 'frame' })
            .subscribe(listener);
        expect(renderer.frameListenerCount).toBe(1);

        runtime.dispose();

        expect(renderer.frameListenerCount).toBe(0);
        renderer.emitFrame();
        expect(listener).not.toHaveBeenCalled();
    });

    it('isolates a throwing frame listener so one consumer cannot abort the rest', async () => {
        const boom = new Error('frame listener boom');
        const onListenerError = vi.fn();
        const attributing = createSelectorRuntime(state, { onListenerError });
        attach();
        await tick();

        const survivor = vi.fn();
        attributing
            .createProjection(readZoom, { cadence: 'frame' })
            .subscribe(() => {
                throw boom;
            });
        attributing
            .createProjection(readZoom, { cadence: 'frame' })
            .subscribe(survivor);

        renderer.setView({ scale: 2 });
        expect(() => renderer.emitFrame()).not.toThrow();
        expect(onListenerError).toHaveBeenCalledWith(boom);
        expect(survivor).toHaveBeenCalledTimes(1);

        attributing.dispose();

        // With no error hook the failure is logged rather than thrown into the
        // renderer's own frame loop, which would stop the viewport dead.
        const unattributed = createSelectorRuntime(state);
        unattributed
            .createProjection(readZoom, { cadence: 'frame' })
            .subscribe(() => {
                throw boom;
            });
        renderer.setView({ scale: 3 });
        expect(() => renderer.emitFrame()).not.toThrow();

        unattributed.dispose();
    });

    it('wakes a frame projection on state notifications too, so inventoried members never go stale', async () => {
        attach();
        await tick();

        const listener = vi.fn();
        const selected = runtime.createProjection(
            (s: ViewerState) => s.toolbarOpen,
            { cadence: 'frame' },
        );
        selected.subscribe(listener);
        expect(selected.read()).toBe(false);

        state.toggleToolbar();
        await tick();

        expect(listener).toHaveBeenCalledTimes(1);
        expect(selected.read()).toBe(true);
    });

    // The whole point of query-only state: a frame tick must not reach the
    // batched watcher, or a drag would wake every `state`-cadence subscriber in
    // the page sixty times a second.
    it('does not wake state-cadence projections from a frame tick', async () => {
        attach();
        await tick();

        const stateListener = vi.fn();
        runtime
            .createProjection((s: ViewerState) => s.toolbarOpen)
            .subscribe(stateListener);
        const frameListener = vi.fn();
        runtime
            .createProjection(readZoom, { cadence: 'frame' })
            .subscribe(frameListener);

        stateListener.mockClear();
        renderer.setView({ scale: 9 });
        renderer.emitFrame();
        await tick();

        expect(frameListener).toHaveBeenCalledTimes(1);
        expect(stateListener).not.toHaveBeenCalled();
    });
});

describe('state-cadence projection reading a query-only viewport value', () => {
    let state: ViewerState;
    let runtime: ReturnType<typeof createSelectorRuntime>;
    let warnings: string[];

    beforeEach(() => {
        state = new ViewerState();
        runtime = createSelectorRuntime(state);
        warnings = [];
        configureLogging({
            debug: true,
            sink: (level: LogLevel, args: readonly unknown[]) => {
                if (level === 'warn') warnings.push(String(args[0]));
            },
        });
    });

    afterEach(() => {
        configureLogging({ debug: false, sink: null });
        runtime.dispose();
        state.destroy();
        vi.restoreAllMocks();
    });

    it('warns once in development and names the frame cadence as the fix', async () => {
        const selected = runtime.createProjection(
            (s: ViewerState) => s.viewportScale,
        );

        expect(selected.read()).toBe(0);
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain("cadence: 'frame'");
        // Names the member that was read, so the fix is obvious in a projection
        // that touches several things.
        expect(warnings[0]).toContain('viewportScale');

        // Every later evaluation stays quiet.
        state.toggleToolbar();
        await tick();
        selected.read();
        selected.recompute();
        expect(warnings).toHaveLength(1);
    });

    it('warns for the centre and bounds as well as the scale', () => {
        runtime.createProjection((s: ViewerState) => s.viewportCentre).read();
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain('viewportCentre');

        runtime.createProjection((s: ViewerState) => s.viewportBounds).read();
        expect(warnings).toHaveLength(2);
        expect(warnings[1]).toContain('viewportBounds');
    });

    // `rendererReady` is an inventoried observable member, so a `state`-cadence
    // projection over it is exactly right and must not be warned about — that
    // is how a consumer waits for the viewport to be answerable at all.
    it('does not warn for a projection that only reads renderer readiness', () => {
        runtime.createProjection((s: ViewerState) => s.rendererReady).read();
        expect(warnings).toEqual([]);
    });

    it('probes a projection that was first read before debug was enabled', () => {
        // The real order in the published package: a framework wrapper bridges
        // `config.debug` when it applies the property tier, and a consumer's
        // projection over a testing handle — or over a second viewer — can have
        // been created and read before that. Deciding "no probe" at the first
        // read and never revisiting it is what made this warning dead.
        configureLogging({ debug: false });
        const selected = runtime.createProjection(
            (s: ViewerState) => s.viewportScale,
        );

        expect(selected.read()).toBe(0);
        expect(warnings).toEqual([]);

        configureLogging({ debug: true });
        // No viewer notification in between: the version has not advanced, so
        // only the owed probe can force this re-evaluation.
        expect(selected.read()).toBe(0);

        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain("cadence: 'frame'");
    });

    it('forces at most ONE extra evaluation for the owed probe', () => {
        configureLogging({ debug: false });
        let evaluations = 0;
        const selected = runtime.createProjection((s: ViewerState) => {
            evaluations++;
            return s.toolbarOpen;
        });

        selected.read();
        expect(evaluations).toBe(1);

        configureLogging({ debug: true });
        selected.read();
        expect(evaluations).toBe(2);

        // An idle viewer costs nothing from here on: the probe has run, the
        // version has not advanced, and every further read is served from the
        // gated cache.
        for (let i = 0; i < 10; i++) selected.read();
        expect(evaluations).toBe(2);
        expect(warnings).toEqual([]);
    });

    it('leaves an idle projection untouched while debug is off', () => {
        configureLogging({ debug: false });
        let evaluations = 0;
        const selected = runtime.createProjection((s: ViewerState) => {
            evaluations++;
            return s.viewportScale;
        });

        for (let i = 0; i < 10; i++) selected.read();

        expect(evaluations).toBe(1);
        expect(
            Object.getOwnPropertyDescriptor(state, 'viewportScale'),
        ).toBeUndefined();
    });

    it('leaves the state it probed exactly as it found it', () => {
        const before = state.viewportScale;
        runtime.createProjection((s: ViewerState) => s.viewportScale).read();

        for (const member of [
            'viewportScale',
            'viewportCentre',
            'viewportBounds',
        ]) {
            expect(
                Object.getOwnPropertyDescriptor(state, member),
                `${member} must be left with no own property`,
            ).toBeUndefined();
        }
        expect(state.viewportScale).toBe(before);
    });

    it('does not warn for a frame-cadence projection', () => {
        runtime
            .createProjection((s: ViewerState) => s.viewportScale, {
                cadence: 'frame',
            })
            .read();

        expect(warnings).toEqual([]);
    });

    it('does not warn for a projection that never reads the viewport', () => {
        runtime.createProjection((s: ViewerState) => s.toolbarOpen).read();

        expect(warnings).toEqual([]);
    });

    it('stays silent outside development', () => {
        configureLogging({ debug: false });
        runtime.createProjection((s: ViewerState) => s.viewportScale).read();

        expect(warnings).toEqual([]);
    });

    it('runs unchanged over a state object that has no viewport queries', () => {
        // The runtime's only requirement is `subscribe` plus synchronous reads,
        // so a minimal `ViewerState`-shaped double (the SDK adapter tests use
        // one) must work — including under the development probe.
        const listeners = new Set<() => void>();
        const double = {
            toolbarOpen: false,
            subscribe(listener: () => void): () => void {
                listeners.add(listener);
                return () => listeners.delete(listener);
            },
            toggle(): void {
                double.toolbarOpen = !double.toolbarOpen;
                for (const listener of [...listeners]) listener();
            },
        };
        const doubled = createSelectorRuntime(double as unknown as ViewerState);
        const selected = doubled.createProjection(
            (s: ViewerState) => s.toolbarOpen,
        );

        expect(selected.read()).toBe(false);
        double.toggle();
        expect(selected.read()).toBe(true);
        expect(warnings).toEqual([]);

        doubled.dispose();
    });
});
