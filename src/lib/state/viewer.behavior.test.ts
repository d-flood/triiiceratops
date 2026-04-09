import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ViewerState } from './viewer.svelte';
import { manifestsState } from './manifests.svelte';

vi.mock('./manifests.svelte', () => ({
    manifestsState: {
        fetchManifest: vi.fn(),
        fetchResource: vi.fn(),
        registerManifest: vi.fn(),
        getManifest: vi.fn(),
        getManifestEntry: vi.fn(),
        getCanvases: vi.fn(() => []),
        getSequenceCount: vi.fn(() => 0),
    },
}));

describe('ViewerState manifest behavior', () => {
    let state: ViewerState;

    beforeEach(() => {
        state = new ViewerState();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('applies manifest settings when loading manifest data directly', async () => {
        const canvases = [{ id: 'canvas-1' }, { id: 'canvas-2' }];
        const manifest = {
            __jsonld: {
                start: { id: 'canvas-2' },
                viewingDirection: 'right-to-left',
            },
            getBehavior: () => ['continuous'],
            getSequences: () => [
                {
                    __jsonld: {},
                },
            ],
        };

        vi.mocked(manifestsState.getManifest).mockReturnValue(manifest);
        vi.mocked(manifestsState.getCanvases).mockReturnValue(canvases);

        await state.setManifestData('manifest-1', { id: 'manifest-1' });

        expect(manifestsState.registerManifest).toHaveBeenCalledWith(
            'manifest-1',
            { id: 'manifest-1' },
        );
        expect(state.startCanvasId).toBe('canvas-2');
        expect(state.viewingDirection).toBe('right-to-left');
        expect(state.viewingMode).toBe('continuous');
    });

    it('navigates paged spreads around non-paged canvases', () => {
        const canvases = [
            { id: 'canvas-1' },
            { id: 'canvas-2', behavior: ['non-paged'] },
            { id: 'canvas-3' },
            { id: 'canvas-4' },
        ];

        vi.mocked(manifestsState.getCanvases).mockReturnValue(canvases);

        state.manifestId = 'manifest-1';
        state.viewingMode = 'paged';
        state.canvasId = 'canvas-1';

        state.nextCanvas();
        expect(state.canvasId).toBe('canvas-2');

        state.nextCanvas();
        expect(state.canvasId).toBe('canvas-3');

        state.previousCanvas();
        expect(state.canvasId).toBe('canvas-2');
    });
});
