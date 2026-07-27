// @vitest-environment node
//
// SSR safety (ticket 04 / ADR 0008): constructing `ViewerState` and calling
// `subscribe` on the server must not throw. The reactivity-driven watcher is
// browser-only and starts lazily, so on the server no effect is created and no
// notifications are delivered — while state reads stay synchronously current.

import { describe, expect, it, vi } from 'vitest';

import { ViewerState } from './viewer.svelte';

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

describe('ViewerState subscribe (SSR / non-browser environment)', () => {
    it('runs without a window global', () => {
        expect(typeof window).toBe('undefined');
    });

    it('constructs and subscribes without throwing on the server', () => {
        const state = new ViewerState();
        const listener = vi.fn();

        let unsubscribe: () => void = () => {};
        expect(() => {
            unsubscribe = state.subscribe(listener);
        }).not.toThrow();
        expect(typeof unsubscribe).toBe('function');

        // No watcher on the server: a mutation neither throws nor notifies, and
        // the read is still synchronously current.
        expect(() => {
            state.toolbarOpen = true;
        }).not.toThrow();
        expect(state.toolbarOpen).toBe(true);
        expect(listener).not.toHaveBeenCalled();

        expect(() => unsubscribe()).not.toThrow();
        expect(() => state.destroy()).not.toThrow();
    });
});
