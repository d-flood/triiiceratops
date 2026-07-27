// ViewerState.subscribe listener guard (ticket 09 formalizes ticket 04's seam).
//
// A throwing subscription listener is isolated: the remaining listeners and
// core's own reactions still run in the same flush. When the throwing listener
// registered an `onError`, the throw is routed there (the SDK uses this to
// attribute the failure to the owning plugin as `pluginerror` phase
// `subscription`); otherwise it falls back to a console error.

import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

describe('ViewerState.subscribe listener guard', () => {
    let state: ViewerState;

    beforeEach(() => {
        state = new ViewerState();
    });

    afterEach(() => {
        state.destroy();
        vi.restoreAllMocks();
    });

    it('routes a throwing listener to its own onError and keeps other listeners running', async () => {
        const onError = vi.fn();
        const boom = new Error('listener boom');
        const other = vi.fn();

        state.subscribe(() => {
            throw boom;
        }, onError);
        state.subscribe(other);

        state.toggleToolbar();
        await tick();

        expect(onError).toHaveBeenCalledTimes(1);
        expect(onError).toHaveBeenCalledWith(boom);
        // The unrelated listener still ran in the same flush.
        expect(other).toHaveBeenCalled();
    });

    it('falls back to console.error when a throwing listener has no onError', async () => {
        const consoleError = vi
            .spyOn(console, 'error')
            .mockImplementation(() => {});
        const other = vi.fn();

        state.subscribe(() => {
            throw new Error('unguarded boom');
        });
        state.subscribe(other);

        state.toggleToolbar();
        await tick();

        expect(consoleError).toHaveBeenCalled();
        expect(other).toHaveBeenCalled();
    });
});
