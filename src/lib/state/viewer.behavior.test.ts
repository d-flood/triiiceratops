import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { collectionV3WithNavDates } from '../test/fixtures/manifests';
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

    it('applies root manifest viewing direction when loading manifest data directly', async () => {
        const canvases = [{ id: 'canvas-1' }, { id: 'canvas-2' }];
        const manifest = {
            __jsonld: {
                start: { id: 'canvas-2' },
                viewingDirection: 'top-to-bottom',
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
        expect(state.viewingDirection).toBe('top-to-bottom');
        expect(state.viewingMode).toBe('continuous');
    });

    it('falls back to the first sequence viewing direction when the manifest root omits it', async () => {
        const manifest = {
            __jsonld: {
                start: { id: 'canvas-1' },
            },
            getBehavior: () => ['individuals'],
            getSequences: () => [
                {
                    __jsonld: {
                        viewingDirection: 'bottom-to-top',
                    },
                },
            ],
        };

        vi.mocked(manifestsState.getManifest).mockReturnValue(manifest);
        vi.mocked(manifestsState.getCanvases).mockReturnValue([
            { id: 'canvas-1' },
        ]);

        await state.setManifestData('manifest-1', { id: 'manifest-1' });

        expect(state.viewingDirection).toBe('bottom-to-top');
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

    it('auto-loads the earliest manifest when opening a chronology collection', async () => {
        vi.mocked(manifestsState.fetchResource).mockResolvedValue(
            collectionV3WithNavDates,
        );

        await state.setManifest('http://example.org/collection/navdate');

        expect(state.collectionItems.map((item) => item.id)).toEqual([
            'http://example.org/manifest/1986',
            'http://example.org/manifest/1987',
            'http://example.org/collection/subcollection',
            'http://example.org/manifest/undated',
        ]);
        expect(manifestsState.fetchManifest).toHaveBeenCalledWith(
            'http://example.org/manifest/1986',
            undefined,
        );
        expect(state.manifestId).toBe('http://example.org/manifest/1986');
    });
});
