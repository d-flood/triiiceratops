// The core selector runtime, exercised against a LIVE `ViewerState` (real
// commands, real batched notifications — ADR 0008).
//
// This is the one implementation plugin activations and the framework wrappers
// share, so the properties asserted here are the ones neither may drift on:
// version memoization, the default and custom equality gate, equality gating of
// the CACHED VALUE (a stable reference across equal recomputes), the two read
// entry points, per-consumer projection replacement, retained consumer failures,
// one `ViewerState.subscribe` registration fanning out to every projection, and
// idempotent disposal.

import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ViewerState } from '../viewer.svelte';
import { createSelectorRuntime, type SelectorRuntime } from './runtime';

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

describe('selector runtime', () => {
    let state: ViewerState;
    let runtime: SelectorRuntime;

    beforeEach(() => {
        state = new ViewerState();
        runtime = createSelectorRuntime(state);
    });

    afterEach(() => {
        runtime.dispose();
        state.destroy();
        vi.restoreAllMocks();
    });

    it('memoizes a read until the state notification version advances', async () => {
        const projection = vi.fn((s: ViewerState) => s.toolbarOpen);
        const selected = runtime.createProjection(projection);

        expect(selected.read()).toBe(false);
        expect(selected.read()).toBe(false);
        expect(projection).toHaveBeenCalledTimes(1);

        state.toggleToolbar();
        await tick();

        expect(selected.read()).toBe(true);
        expect(selected.read()).toBe(true);
        expect(projection).toHaveBeenCalledTimes(2);
    });

    it('exposes the notification version its cadence wakes on', async () => {
        const selected = runtime.createProjection(
            (s: ViewerState) => s.toolbarOpen,
        );
        const before = selected.version;

        state.toggleToolbar();
        await tick();

        // A framework reactive read of `version` re-evaluates exactly when the
        // projection could have changed (Vue's `computed` depends on it).
        expect(selected.version).toBeGreaterThan(before);
        expect(selected.cadence).toBe('state');
    });

    it('gates the cached value with Object.is by default: an equal recompute returns the previous reference', async () => {
        const selected = runtime.createProjection(
            (s: ViewerState): { open: boolean } => ({ open: s.toolbarOpen }),
            { equals: (a, b) => a.open === b.open },
        );

        const first = selected.read();
        // An unrelated command bumps the version; the projection builds a fresh
        // object that the gate rejects, so the CACHED value survives.
        state.activeLocale = 'de';
        await tick();

        expect(selected.read()).toBe(first);

        state.toggleToolbar();
        await tick();

        const second = selected.read();
        expect(second).not.toBe(first);
        expect(second).toEqual({ open: true });
    });

    it('defaults equality to Object.is', async () => {
        const selected = runtime.createProjection((s: ViewerState) => ({
            open: s.toolbarOpen,
        }));

        const first = selected.read();
        state.activeLocale = 'de';
        await tick();

        // No custom gate: a fresh object is a new value under `Object.is`.
        expect(selected.read()).not.toBe(first);
    });

    it('recompute() bypasses the version memo but still applies the gate', () => {
        let ticket = 0;
        const projection = vi.fn(() => ({ ticket }));
        const selected = runtime.createProjection(projection, {
            equals: (a, b) => a.ticket === b.ticket,
        });

        const first = selected.recompute();
        expect(projection).toHaveBeenCalledTimes(1);

        // No viewer notification happened, so `read()` is memoized...
        expect(selected.read()).toBe(first);
        expect(projection).toHaveBeenCalledTimes(1);

        // ...while `recompute()` re-runs the projection (Vue's `computed`, whose
        // own reactive dependency may have changed) and still returns the cached
        // reference because the result is equal.
        expect(selected.recompute()).toBe(first);
        expect(projection).toHaveBeenCalledTimes(2);

        ticket = 1;
        const next = selected.recompute();
        expect(next).not.toBe(first);
        expect(next).toEqual({ ticket: 1 });
        // The gated cache is shared: `read()` sees what `recompute()` published.
        expect(selected.read()).toBe(next);
    });

    it('serves a replacement projection immediately without disturbing the previous one', async () => {
        const first = runtime.createProjection(
            (s: ViewerState) => s.toolbarOpen,
        );
        const firstListener = vi.fn();
        first.subscribe(firstListener);
        expect(first.read()).toBe(false);

        // A framework helper whose inputs changed mints a NEW projection object
        // rather than mutating the live one.
        const second = runtime.createProjection(
            (s: ViewerState) => !s.toolbarOpen,
        );
        expect(second.read()).toBe(true);

        state.toggleToolbar();
        await tick();

        expect(first.read()).toBe(true);
        expect(second.read()).toBe(false);
        expect(firstListener).toHaveBeenCalledTimes(1);
    });

    it('retains a projection failure and rethrows it from every read', async () => {
        const boom = new Error('projection boom');
        const projection = vi.fn((s: ViewerState) => {
            if (s.toolbarOpen) throw boom;
            return s.toolbarOpen;
        });
        const selected = runtime.createProjection(projection);

        expect(selected.read()).toBe(false);

        state.toggleToolbar();
        await tick();

        expect(() => selected.read()).toThrow(boom);
        // Retained, not recomputed: the failure is not re-run per read, and it
        // is never quietly replaced by the last good value.
        expect(() => selected.read()).toThrow(boom);
        expect(projection).toHaveBeenCalledTimes(2);

        state.toggleToolbar();
        await tick();

        expect(selected.read()).toBe(false);
    });

    it('retains an equality failure the same way', async () => {
        const boom = new Error('equals boom');
        const selected = runtime.createProjection(
            (s: ViewerState) => ({ open: s.toolbarOpen }),
            {
                equals: () => {
                    throw boom;
                },
            },
        );

        expect(selected.read()).toEqual({ open: false });

        state.toggleToolbar();
        await tick();

        expect(() => selected.read()).toThrow(boom);
        expect(() => selected.read()).toThrow(boom);
    });

    it('owns exactly one ViewerState subscription and fans out to every projection', async () => {
        const subscribe = vi.spyOn(state, 'subscribe');
        const fanned = createSelectorRuntime(state);

        const listeners = [vi.fn(), vi.fn(), vi.fn()];
        for (const listener of listeners) {
            fanned
                .createProjection((s: ViewerState) => s.toolbarOpen)
                .subscribe(listener);
        }

        expect(subscribe).toHaveBeenCalledTimes(1);

        state.toggleToolbar();
        await tick();

        for (const listener of listeners) {
            expect(listener).toHaveBeenCalledTimes(1);
        }

        fanned.dispose();
    });

    it('unsubscribes one projection listener without disturbing the others', async () => {
        const kept = vi.fn();
        const dropped = vi.fn();
        runtime
            .createProjection((s: ViewerState) => s.toolbarOpen)
            .subscribe(kept);
        const off = runtime
            .createProjection((s: ViewerState) => s.toolbarOpen)
            .subscribe(dropped);

        off();
        // Releasing twice is safe.
        off();

        state.toggleToolbar();
        await tick();

        expect(kept).toHaveBeenCalledTimes(1);
        expect(dropped).not.toHaveBeenCalled();
    });

    it('disposes idempotently: fan-out stops and the state subscription is removed once', async () => {
        let released = 0;
        const realSubscribe = state.subscribe.bind(state);
        vi.spyOn(state, 'subscribe').mockImplementation((listener, onError) => {
            const unsubscribe = realSubscribe(listener, onError);
            return () => {
                released++;
                unsubscribe();
            };
        });

        const disposable = createSelectorRuntime(state);
        const listener = vi.fn();
        disposable
            .createProjection((s: ViewerState) => s.toolbarOpen)
            .subscribe(listener);

        disposable.dispose();
        disposable.dispose();
        expect(released).toBe(1);

        state.toggleToolbar();
        await tick();
        expect(listener).not.toHaveBeenCalled();

        // A projection created after disposal reads, but never subscribes.
        const late = disposable.createProjection(
            (s: ViewerState) => s.toolbarOpen,
        );
        expect(late.read()).toBe(true);
        const lateListener = vi.fn();
        late.subscribe(lateListener);
        state.toggleToolbar();
        await tick();
        expect(lateListener).not.toHaveBeenCalled();
    });
});

// The plugin-facing façade over the same projections. Its `select(fn, equals)`
// signature is frozen (cadence is a later convergence step for the SDK), so what
// is asserted here is that plugins keep the `{ get(), subscribe() }` contract —
// with `get()` now reference-stable across equal recomputes.
describe('ViewerSelectors.select (the plugin-facing façade)', () => {
    let state: ViewerState;
    let runtime: SelectorRuntime;

    beforeEach(() => {
        state = new ViewerState();
        runtime = createSelectorRuntime(state);
    });

    afterEach(() => {
        runtime.dispose();
        state.destroy();
    });

    it('returns the previously returned reference after an equal recompute', async () => {
        const selector = runtime.selectors.select(
            (s) => ({ open: s.toolbarOpen }),
            (a, b) => a.open === b.open,
        );

        const first = selector.get();
        state.activeLocale = 'de';
        await tick();

        // The intentional change from the SDK's original runtime, and what makes
        // a selector usable as a React `getSnapshot` unaided.
        expect(selector.get()).toBe(first);
    });

    it('delivers only gated changes and stops on unsubscribe', async () => {
        const seen: boolean[] = [];
        const selector = runtime.selectors.select((s) => s.toolbarOpen);
        const off = selector.subscribe((value) => seen.push(value));

        state.activeLocale = 'de';
        await tick();
        expect(seen).toEqual([]);

        state.toggleToolbar();
        await tick();
        expect(seen).toEqual([true]);

        off();
        state.toggleToolbar();
        await tick();
        expect(seen).toEqual([true]);
    });
});
