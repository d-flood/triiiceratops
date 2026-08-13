// The selector runtime over a NON-`ViewerState` source (ADR 0018).
//
// The runtime's only dependency on its source was always `subscribe`, an
// optional finer-cadence subscribe, and synchronous reads — so a plugin's
// published state is a selector source like any other, and hosts select over it
// with the ONE runtime the framework adapters already share. This file asserts
// that generalization on a published-state stand-in: the equality gate,
// version memoization, the two read entry points, and both cadences behave
// exactly as they do over viewer state (`runtime.test.ts`, `cadence.test.ts`).

import { describe, expect, it, vi } from 'vitest';

import { createSelectorRuntime, type SelectorSource } from './runtime';

/**
 * A stand-in for a plugin's published state: a batched `subscribe` (the
 * inventoried, payload-free notification) plus a finer-cadence `subscribeFrame`
 * for its query-only member. Both fan out manually so a test drives the exact
 * notification it means.
 */
class PublishedStub implements SelectorSource {
    paused = true;
    currentTime = 0;

    private readonly stateListeners = new Set<() => void>();
    private readonly frameListeners = new Set<() => void>();

    subscribe(listener: () => void): () => void {
        this.stateListeners.add(listener);
        return () => this.stateListeners.delete(listener);
    }

    subscribeFrame(listener: () => void): () => void {
        this.frameListeners.add(listener);
        return () => this.frameListeners.delete(listener);
    }

    /** Deliver the batched notification (what a command's flush would do). */
    notify(): void {
        for (const listener of [...this.stateListeners]) listener();
    }

    /** Deliver one finer-cadence tick. */
    tick(): void {
        for (const listener of [...this.frameListeners]) listener();
    }
}

describe('selector runtime over published plugin state', () => {
    it('memoizes a projection until the source notifies', () => {
        const source = new PublishedStub();
        const runtime = createSelectorRuntime(source);
        const projection = vi.fn((s: PublishedStub) => s.paused);
        const selected = runtime.createProjection(projection);

        expect(selected.read()).toBe(true);
        expect(selected.read()).toBe(true);
        expect(projection).toHaveBeenCalledTimes(1);

        source.paused = false;
        source.notify();

        expect(selected.read()).toBe(false);
        expect(projection).toHaveBeenCalledTimes(2);

        runtime.dispose();
    });

    it('gates the cached value, keeping the previous reference across an equal recompute', () => {
        const source = new PublishedStub();
        const runtime = createSelectorRuntime(source);
        const selected = runtime.createProjection(
            (s: PublishedStub): { paused: boolean } => ({ paused: s.paused }),
            { equals: (a, b) => a.paused === b.paused },
        );

        const first = selected.read();
        source.notify();
        expect(selected.read()).toBe(first);

        source.paused = false;
        source.notify();
        expect(selected.read()).not.toBe(first);
        expect(selected.read()).toEqual({ paused: false });

        runtime.dispose();
    });

    it('recompute bypasses the version memo but still applies the gate', () => {
        const source = new PublishedStub();
        const runtime = createSelectorRuntime(source);
        const projection = vi.fn((s: PublishedStub) => s.paused);
        const selected = runtime.createProjection(projection);

        expect(selected.read()).toBe(true);
        expect(selected.recompute()).toBe(true);
        expect(projection).toHaveBeenCalledTimes(2);

        runtime.dispose();
    });

    it('wakes a state-cadence subscriber on the source notification only', () => {
        const source = new PublishedStub();
        const runtime = createSelectorRuntime(source);
        const selected = runtime.createProjection(
            (s: PublishedStub) => s.paused,
        );
        const listener = vi.fn();
        selected.subscribe(listener);

        source.tick();
        expect(listener).not.toHaveBeenCalled();

        source.notify();
        expect(listener).toHaveBeenCalledTimes(1);

        runtime.dispose();
    });

    it('reads a query-only member reactively at the finer cadence', () => {
        const source = new PublishedStub();
        const runtime = createSelectorRuntime(source);
        const selected = runtime.createProjection(
            (s: PublishedStub) => s.currentTime,
            { cadence: 'frame' },
        );
        const listener = vi.fn();
        selected.subscribe(listener);

        expect(selected.cadence).toBe('frame');
        expect(selected.read()).toBe(0);

        source.currentTime = 1.5;
        source.tick();

        expect(listener).toHaveBeenCalledTimes(1);
        expect(selected.read()).toBe(1.5);

        // Frame is the FINER cadence: it also wakes on the batched notification,
        // so it never serves a stale notifying member between ticks.
        source.notify();
        expect(listener).toHaveBeenCalledTimes(2);

        runtime.dispose();
    });

    it('serves a source with no finer-cadence subscribe at state cadence', () => {
        const source: SelectorSource & { paused: boolean } = {
            paused: true,
            subscribe: () => () => {},
        };
        const runtime = createSelectorRuntime(source);
        const selected = runtime.createProjection((s) => s.paused, {
            cadence: 'frame',
        });

        // No `subscribeFrame` on the source: subscribing must not throw, and the
        // projection still reads.
        expect(() => selected.subscribe(() => {})).not.toThrow();
        expect(selected.read()).toBe(true);

        runtime.dispose();
    });

    // Over `ViewerState` this was covered for free: its own listener guard
    // catches a throw and keeps delivering. A published state has no such guard
    // — its `subscribe` is a plain Set walk written by a plugin author — so an
    // unguarded fan-out here would kill the sibling projections of the runtime
    // and then escape into the plugin's own notify loop.
    it('isolates a throwing subscriber so sibling projections still wake', () => {
        const boom = new Error('published state listener boom');
        const onListenerError = vi.fn();
        const source = new PublishedStub();
        const runtime = createSelectorRuntime(source, { onListenerError });

        const survivor = vi.fn();
        runtime
            .createProjection((s: PublishedStub) => s.paused)
            .subscribe(() => {
                throw boom;
            });
        runtime
            .createProjection((s: PublishedStub) => s.paused)
            .subscribe(survivor);
        // A frame-cadence projection wakes on the batched notification too, so
        // it is part of the same fan-out the throw would have aborted.
        const frameSurvivor = vi.fn();
        runtime
            .createProjection((s: PublishedStub) => s.currentTime, {
                cadence: 'frame',
            })
            .subscribe(frameSurvivor);

        source.paused = false;
        expect(() => source.notify()).not.toThrow();

        expect(onListenerError).toHaveBeenCalledWith(boom);
        expect(survivor).toHaveBeenCalledTimes(1);
        expect(frameSurvivor).toHaveBeenCalledTimes(1);

        runtime.dispose();
    });

    it('drops the source subscription on dispose', () => {
        const source = new PublishedStub();
        const runtime = createSelectorRuntime(source);
        const selected = runtime.createProjection(
            (s: PublishedStub) => s.paused,
        );
        const listener = vi.fn();
        selected.subscribe(listener);

        runtime.dispose();
        source.paused = false;
        source.notify();

        expect(listener).not.toHaveBeenCalled();
    });

    it('exposes a `select` factory typed to the source', () => {
        const source = new PublishedStub();
        const runtime = createSelectorRuntime(source);
        const selector = runtime.selectors.select((s) => s.paused);
        const seen: boolean[] = [];
        const unsubscribe = selector.subscribe((value) => seen.push(value));

        expect(selector.get()).toBe(true);

        source.paused = false;
        source.notify();

        expect(seen).toEqual([false]);
        unsubscribe();
        runtime.dispose();
    });
});
