// Selector cadence (ADR 0011 / CONTEXT.md **Selector cadence**).
//
// `frame` cadence is how continuous OpenSeadragon viewport values become
// reactively readable without being mirrored into viewer state: the projection,
// memoization, equality gate, and disposal are identical to `state` cadence —
// only the wake-up differs. The ticker is the live OSD instance's OWN animation
// events, attached lazily and detached on teardown or replacement, so an idle
// viewer costs nothing and no `requestAnimationFrame` loop exists.
//
// OSD itself is not instantiated here: a real OpenSeadragon viewer needs a
// browser canvas, and the kit's established seam is an injectable OSD stub
// (`TestViewerContext.setOsdViewer`). The `ViewerState` and its notifications
// are real.

import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { configureLogging, type LogLevel } from '../../logging/logger';
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

/** The three OSD events a frame-cadence projection is woken by. */
const FRAME_EVENTS = ['animation', 'viewport-change', 'animation-finish'];

/** A minimal OpenSeadragon stand-in exposing the event source and a zoom. */
class OsdStub {
    zoom = 1;
    readonly handlers = new Map<string, Set<() => void>>();

    readonly viewport = {
        getZoom: (): number => this.zoom,
    };

    addHandler(event: string, handler: () => void): void {
        const set = this.handlers.get(event) ?? new Set<() => void>();
        set.add(handler);
        this.handlers.set(event, set);
    }

    removeHandler(event: string, handler: () => void): void {
        this.handlers.get(event)?.delete(handler);
    }

    /** Number of handlers currently attached across every frame event. */
    get attached(): number {
        let total = 0;
        for (const set of this.handlers.values()) total += set.size;
        return total;
    }

    /** Fire one OSD event, as the real viewer does during an animation. */
    raise(event: string): void {
        for (const handler of [...(this.handlers.get(event) ?? [])]) handler();
    }
}

/** Publish an OSD stub through the real readiness path. */
function readyOsd(state: ViewerState, stub: OsdStub): void {
    state.notifyOSDReady(
        stub as unknown as NonNullable<ViewerState['osdViewer']>,
    );
}

describe('selector cadence', () => {
    let state: ViewerState;
    let runtime: ReturnType<typeof createSelectorRuntime>;
    let osd: OsdStub;

    beforeEach(() => {
        state = new ViewerState();
        runtime = createSelectorRuntime(state);
        osd = new OsdStub();
    });

    afterEach(() => {
        runtime.dispose();
        state.destroy();
        vi.restoreAllMocks();
    });

    it('never attaches a ticker for a viewer with only state-cadence projections', async () => {
        const listener = vi.fn();
        runtime
            .createProjection((s: ViewerState) => s.toolbarOpen)
            .subscribe(listener);

        readyOsd(state, osd);
        await tick();

        expect(osd.attached).toBe(0);
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it('attaches the ticker lazily and wakes a frame projection from OSD animation events', async () => {
        readyOsd(state, osd);
        await tick();

        const zoom = runtime.createProjection(
            (s: ViewerState) => s.osdViewer?.viewport.getZoom() ?? 0,
            { cadence: 'frame' },
        );

        // Creating the projection is not enough — nothing is subscribed yet.
        expect(osd.attached).toBe(0);
        expect(zoom.read()).toBe(1);

        const listener = vi.fn();
        const off = zoom.subscribe(listener);

        expect([...osd.handlers.keys()].sort()).toEqual(
            [...FRAME_EVENTS].sort(),
        );
        expect(osd.attached).toBe(FRAME_EVENTS.length);

        osd.zoom = 2;
        osd.raise('animation');
        expect(listener).toHaveBeenCalledTimes(1);
        expect(zoom.read()).toBe(2);

        osd.zoom = 3;
        osd.raise('viewport-change');
        osd.zoom = 4;
        osd.raise('animation-finish');
        expect(listener).toHaveBeenCalledTimes(3);
        expect(zoom.read()).toBe(4);

        off();
        expect(osd.attached).toBe(0);
    });

    it('attaches when OSD appears after the frame projection subscribed', async () => {
        const listener = vi.fn();
        runtime
            .createProjection(
                (s: ViewerState) => s.osdViewer?.viewport.getZoom(),
                {
                    cadence: 'frame',
                },
            )
            .subscribe(listener);

        expect(osd.attached).toBe(0);

        readyOsd(state, osd);
        await tick();

        expect(osd.attached).toBe(FRAME_EVENTS.length);
        // `osdViewer` is an inventoried member, so readiness itself was a state
        // notification the frame projection also woke on.
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it('detaches from a replaced OSD instance and follows the new one', async () => {
        readyOsd(state, osd);
        await tick();

        const listener = vi.fn();
        runtime
            .createProjection(
                (s: ViewerState) => s.osdViewer?.viewport.getZoom(),
                {
                    cadence: 'frame',
                },
            )
            .subscribe(listener);
        expect(osd.attached).toBe(FRAME_EVENTS.length);

        const replacement = new OsdStub();
        readyOsd(state, replacement);
        await tick();

        expect(osd.attached).toBe(0);
        expect(replacement.attached).toBe(FRAME_EVENTS.length);

        listener.mockClear();
        osd.raise('animation');
        expect(listener).not.toHaveBeenCalled();
        replacement.raise('animation');
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it('detaches the ticker on disposal', async () => {
        readyOsd(state, osd);
        await tick();

        const listener = vi.fn();
        runtime
            .createProjection(
                (s: ViewerState) => s.osdViewer?.viewport.getZoom(),
                {
                    cadence: 'frame',
                },
            )
            .subscribe(listener);
        expect(osd.attached).toBe(FRAME_EVENTS.length);

        runtime.dispose();

        expect(osd.attached).toBe(0);
        osd.raise('animation');
        expect(listener).not.toHaveBeenCalled();
    });

    it('isolates a throwing frame listener: no core guard sits on the OSD path', async () => {
        const boom = new Error('frame listener boom');
        const onListenerError = vi.fn();
        const attributing = createSelectorRuntime(state, { onListenerError });
        readyOsd(state, osd);
        await tick();

        const survivor = vi.fn();
        attributing
            .createProjection((s: ViewerState) => s.osdViewer, {
                cadence: 'frame',
            })
            .subscribe(() => {
                throw boom;
            });
        attributing
            .createProjection((s: ViewerState) => s.osdViewer, {
                cadence: 'frame',
            })
            .subscribe(survivor);

        expect(() => osd.raise('animation')).not.toThrow();
        expect(onListenerError).toHaveBeenCalledWith(boom);
        expect(survivor).toHaveBeenCalledTimes(1);

        attributing.dispose();

        // With no error hook the failure is logged rather than thrown into
        // OpenSeadragon's event dispatch.
        const unattributed = createSelectorRuntime(state);
        unattributed
            .createProjection((s: ViewerState) => s.osdViewer, {
                cadence: 'frame',
            })
            .subscribe(() => {
                throw boom;
            });
        expect(() => osd.raise('animation')).not.toThrow();

        unattributed.dispose();
    });

    it('wakes a frame projection on state notifications too, so inventoried members never go stale', async () => {
        readyOsd(state, osd);
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
});

describe('state-cadence projection reading the OSD pass-through', () => {
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
            (s: ViewerState) => s.osdViewer?.viewport.getZoom() ?? 0,
        );

        expect(selected.read()).toBe(0);
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain("cadence: 'frame'");

        // Every later evaluation stays quiet.
        state.toggleToolbar();
        await tick();
        selected.read();
        selected.recompute();
        expect(warnings).toHaveLength(1);
    });

    it('leaves the state it probed exactly as it found it', () => {
        const before = state.osdViewer;
        runtime.createProjection((s: ViewerState) => s.osdViewer).read();

        expect(
            Object.getOwnPropertyDescriptor(state, 'osdViewer'),
        ).toBeUndefined();
        expect(state.osdViewer).toBe(before);
    });

    it('does not warn for a frame-cadence projection', () => {
        runtime
            .createProjection(
                (s: ViewerState) => s.osdViewer?.viewport.getZoom(),
                {
                    cadence: 'frame',
                },
            )
            .read();

        expect(warnings).toEqual([]);
    });

    it('does not warn for a projection that never reads the OSD pass-through', () => {
        runtime.createProjection((s: ViewerState) => s.toolbarOpen).read();

        expect(warnings).toEqual([]);
    });

    it('stays silent outside development', () => {
        configureLogging({ debug: false });
        runtime
            .createProjection((s: ViewerState) =>
                s.osdViewer?.viewport.getZoom(),
            )
            .read();

        expect(warnings).toEqual([]);
    });

    it('runs unchanged over a state object that has no OSD pass-through', () => {
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
