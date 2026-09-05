// ViewerState — published plugin state (ADR 0018, CONTEXT.md **Published state**).
//
// An activation may publish ONE state object; hosts reach it only through
// `getPluginState(pluginId)`, which answers `null` whenever the activation is
// absent. The set of published ids is an inventoried notifying member, so a
// wrapper observes availability through the ordinary batched notification.
//
// Everything here asserts through the public seam: `publishPluginState`, the
// retire handle it returns, `getPluginState`, and `subscribe`. The SDK-side
// half — publishing from an activation and retiring on deactivation — is
// asserted in the plugin SDK's own tests.

import { tick } from 'svelte';
import { describe, expect, it, vi } from 'vitest';

import { ViewerState } from './viewer.svelte';
import type { ViewerError } from '../types/viewerError';

vi.mock('./manifests.svelte', () => ({
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

/** A minimal object of the shape a plugin publishes. */
function publishedState(): { subscribe: () => () => void } {
    return { subscribe: () => () => {} };
}

describe('ViewerState published plugin state', () => {
    it('answers null for a plugin that has published nothing', () => {
        const state = new ViewerState();
        expect(state.getPluginState('av')).toBeNull();
        state.destroy();
    });

    it('hands back exactly the object the plugin published', () => {
        const state = new ViewerState();
        const published = publishedState();

        state.publishPluginState('av', published);

        expect(state.getPluginState('av')).toBe(published);
        // Isolated per plugin id.
        expect(state.getPluginState('other')).toBeNull();
        state.destroy();
    });

    it('retires the publication through the returned handle, idempotently', () => {
        const state = new ViewerState();
        const retire = state.publishPluginState('av', publishedState());

        retire();
        expect(state.getPluginState('av')).toBeNull();

        retire();
        expect(state.getPluginState('av')).toBeNull();
        state.destroy();
    });

    // The id is first come. Letting a second publication win would silently
    // orphan the first: its retire handle is identity-checked, so it would
    // no-op forever while its object stayed reachable under an id it no longer
    // owned — and a host commanding "the av plugin" would reach the wrong one.
    it('refuses a second publication under a live id and reports it', () => {
        const state = new ViewerState();
        const first = publishedState();
        const second = publishedState();
        const refusals: ViewerError[] = [];
        state.setErrorReporter((error) => refusals.push(error));

        const retireFirst = state.publishPluginState('av', first);
        const retireSecond = state.publishPluginState('av', second);

        expect(state.getPluginState('av')).toBe(first);
        expect(refusals.map((r) => r.code)).toEqual(['plugin-state-refused']);
        expect(refusals[0].scope).toBe('plugin');
        expect(refusals[0].severity).toBe('warning');

        // The refused caller's handle is inert: it must not retire the
        // publication it lost to.
        retireSecond();
        expect(state.getPluginState('av')).toBe(first);

        // Retiring is what frees the id — which is why the SDK retires before
        // it re-publishes, and so gets "publishing again replaces" for free.
        retireFirst();
        state.publishPluginState('av', second);
        expect(state.getPluginState('av')).toBe(second);
        expect(refusals).toHaveLength(1);

        state.destroy();
    });

    it('lets a plugin publish the same object again', () => {
        const state = new ViewerState();
        const published = publishedState();
        const refusals: ViewerError[] = [];
        state.setErrorReporter((error) => refusals.push(error));

        state.publishPluginState('av', published);
        const retire = state.publishPluginState('av', published);

        expect(refusals).toEqual([]);
        retire();
        expect(state.getPluginState('av')).toBeNull();
        state.destroy();
    });

    it('retires a plugin publication when the plugin is unregistered', () => {
        const state = new ViewerState();
        state.publishPluginState('av', publishedState());

        state.unregisterPlugin('av');

        expect(state.getPluginState('av')).toBeNull();
        state.destroy();
    });

    it('retires every publication when all plugins are destroyed', () => {
        const state = new ViewerState();
        state.publishPluginState('av', publishedState());
        state.publishPluginState('other', publishedState());

        state.destroyAllPlugins();

        expect(state.getPluginState('av')).toBeNull();
        expect(state.getPluginState('other')).toBeNull();
        state.destroy();
    });

    // `destroy()` is what a viewer teardown actually calls; `destroyAllPlugins`
    // above is only the half of it a test can reach directly.
    it('retires every publication when the viewer state is destroyed', () => {
        const state = new ViewerState();
        state.publishPluginState('av', publishedState());

        state.destroy();

        expect(state.getPluginState('av')).toBeNull();
    });

    it('notifies subscribers on publish and on retire', async () => {
        const state = new ViewerState();
        const listener = vi.fn();
        state.subscribe(listener);

        const retire = state.publishPluginState('av', publishedState());
        await tick();
        expect(listener).toHaveBeenCalledTimes(1);

        retire();
        await tick();
        expect(listener).toHaveBeenCalledTimes(2);

        state.destroy();
    });

    it('batches several publications in one tick into a single notification', async () => {
        const state = new ViewerState();
        const listener = vi.fn();
        state.subscribe(listener);

        state.publishPluginState('av', publishedState());
        state.publishPluginState('other', publishedState());
        await tick();

        expect(listener).toHaveBeenCalledTimes(1);
        state.destroy();
    });
});
