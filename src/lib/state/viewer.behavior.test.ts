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
        getAnnotations: vi.fn(() => []),
        getCanvases: vi.fn(() => []),
        getSequenceCount: vi.fn(() => 0),
    },
}));

describe('ViewerState manifest behavior', () => {
    let state: ViewerState;

    beforeEach(() => {
        vi.resetAllMocks();
        vi.mocked(manifestsState.getAnnotations).mockReturnValue([]);
        vi.mocked(manifestsState.getCanvases).mockReturnValue([]);
        vi.mocked(manifestsState.getSequenceCount).mockReturnValue(0);
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

    it('keeps annotation edit bus requests and active ids scoped per viewer', () => {
        const first = new ViewerState();
        const second = new ViewerState();
        const firstRequests: string[] = [];
        const secondRequests: string[] = [];

        first.annotationEditBus.requestEdit = (annotationId) => {
            firstRequests.push(annotationId);
        };
        second.annotationEditBus.requestEdit = (annotationId) => {
            secondRequests.push(annotationId);
        };

        first.annotationEditBus.requestEdit('anno-a');
        first.annotationEditBus.activeEditAnnotationId = 'anno-a';

        expect(firstRequests).toEqual(['anno-a']);
        expect(secondRequests).toEqual([]);
        expect(first.annotationEditBus.activeEditAnnotationId).toBe('anno-a');
        expect(second.annotationEditBus.activeEditAnnotationId).toBeNull();
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

    it('prefers raw manifest viewing direction over accessor defaults', async () => {
        const manifest = {
            __jsonld: {
                viewingDirection: 'right-to-left',
                behavior: ['individuals'],
            },
            getViewingDirection: () => 'left-to-right',
            getBehavior: () => ['individuals'],
            getSequences: () => [],
        };

        vi.mocked(manifestsState.getManifest).mockReturnValue(manifest);
        vi.mocked(manifestsState.getCanvases).mockReturnValue([
            { id: 'canvas-1' },
        ]);

        await state.setManifestData('manifest-1', { id: 'manifest-1' });

        expect(state.viewingDirection).toBe('right-to-left');
    });

    it('uses raw manifest entry viewing direction for fetched v3 manifests', async () => {
        const manifest = {
            getViewingDirection: () => 'left-to-right',
            getBehavior: () => ['individuals'],
            getSequences: () => [],
        };

        vi.mocked(manifestsState.getManifest).mockReturnValue(manifest);
        vi.mocked(manifestsState.getManifestEntry).mockReturnValue({
            json: {
                id: 'manifest-1',
                type: 'Manifest',
                viewingDirection: 'right-to-left',
            },
            manifesto: manifest,
            isFetching: false,
        });
        vi.mocked(manifestsState.getCanvases).mockReturnValue([
            { id: 'canvas-1' },
        ]);

        await state.setManifestData('manifest-1', { id: 'manifest-1' });

        expect(state.viewingDirection).toBe('right-to-left');
    });

    it('applies the manifest start canvas after fetch-based loading', async () => {
        const canvases = [{ id: 'canvas-1' }, { id: 'canvas-2' }];
        const manifest = {
            __jsonld: {
                start: { id: 'canvas-2', type: 'Canvas' },
            },
            getBehavior: () => ['individuals'],
            getSequences: () => [
                {
                    __jsonld: {},
                },
            ],
        };

        vi.mocked(manifestsState.fetchResource).mockResolvedValue({
            id: 'manifest-1',
            type: 'Manifest',
        });
        vi.mocked(manifestsState.getManifest).mockReturnValue(manifest);
        vi.mocked(manifestsState.getCanvases).mockReturnValue(canvases);

        await state.setManifest('manifest-1');

        expect(state.startCanvasId).toBe('canvas-2');
        expect(state.canvasId).toBe('canvas-2');
    });

    it('keeps a canvas requested before the manifest loads when the manifest contains it', async () => {
        const canvases = [
            { id: 'canvas-1' },
            { id: 'canvas-2' },
            { id: 'canvas-3' },
        ];
        const manifest = {
            __jsonld: {},
            getBehavior: () => ['individuals'],
            getSequences: () => [{ __jsonld: {} }],
        };

        vi.mocked(manifestsState.fetchResource).mockResolvedValue({
            id: 'manifest-1',
            type: 'Manifest',
        });
        vi.mocked(manifestsState.getManifest).mockReturnValue(manifest);
        vi.mocked(manifestsState.getCanvases).mockReturnValue(canvases);

        // Consumer requests a canvas while the manifest is still loading
        state.setCanvas('canvas-2');
        await state.setManifest('manifest-1');

        expect(state.canvasId).toBe('canvas-2');
    });

    it('keeps a pre-requested canvas when loading manifest data directly', async () => {
        const canvases = [{ id: 'canvas-1' }, { id: 'canvas-2' }];
        const manifest = {
            __jsonld: {},
            getBehavior: () => ['individuals'],
            getSequences: () => [{ __jsonld: {} }],
        };

        vi.mocked(manifestsState.getManifest).mockReturnValue(manifest);
        vi.mocked(manifestsState.getCanvases).mockReturnValue(canvases);

        state.setCanvas('canvas-2');
        await state.setManifestData('manifest-1', { id: 'manifest-1' });

        expect(state.canvasId).toBe('canvas-2');
    });

    it('keeps a pre-requested canvas when the manifest loads via the fetch fallback', async () => {
        const canvases = [{ id: 'canvas-1' }, { id: 'canvas-2' }];
        const manifest = {
            __jsonld: {},
            getBehavior: () => ['individuals'],
            getSequences: () => [{ __jsonld: {} }],
        };

        vi.mocked(manifestsState.fetchResource).mockRejectedValue(
            new Error('network error'),
        );
        vi.mocked(manifestsState.getManifest).mockReturnValue(manifest);
        vi.mocked(manifestsState.getCanvases).mockReturnValue(canvases);

        state.setCanvas('canvas-2');
        await state.setManifest('manifest-1');

        expect(state.canvasId).toBe('canvas-2');
    });

    it('keeps a pre-requested canvas when a collection auto-loads its first manifest', async () => {
        const canvases = [{ id: 'canvas-1' }, { id: 'canvas-2' }];
        const manifest = {
            __jsonld: {},
            getBehavior: () => ['individuals'],
            getSequences: () => [{ __jsonld: {} }],
        };

        vi.mocked(manifestsState.fetchResource).mockResolvedValue(
            collectionV3WithNavDates,
        );
        vi.mocked(manifestsState.getManifest).mockReturnValue(manifest);
        vi.mocked(manifestsState.getCanvases).mockReturnValue(canvases);

        state.setCanvas('canvas-2');
        await state.setManifest('http://example.org/collection/navdate');

        expect(state.manifestId).toBe('http://example.org/manifest/1986');
        expect(state.canvasId).toBe('canvas-2');
    });

    it('selects the canvas requested via setManifest options over the current one', async () => {
        const canvases = [
            { id: 'canvas-1' },
            { id: 'canvas-2' },
            { id: 'canvas-3' },
        ];
        const manifest = {
            __jsonld: {},
            getBehavior: () => ['individuals'],
            getSequences: () => [{ __jsonld: {} }],
        };

        vi.mocked(manifestsState.fetchResource).mockResolvedValue({
            id: 'manifest-2',
            type: 'Manifest',
        });
        vi.mocked(manifestsState.getManifest).mockReturnValue(manifest);
        vi.mocked(manifestsState.getCanvases).mockReturnValue(canvases);

        // Simulates switching manifests with a target canvas: the previous
        // canvas is stale, the requested one must win over the first canvas.
        state.canvasId = 'stale-canvas-from-previous-manifest';
        await state.setManifest('manifest-2', { canvasId: 'canvas-3' });

        expect(state.canvasId).toBe('canvas-3');
    });

    it('honors the requested canvas when the manifest id resolves to a collection', async () => {
        const canvases = [{ id: 'canvas-1' }, { id: 'canvas-2' }];
        const manifest = {
            __jsonld: {},
            getBehavior: () => ['individuals'],
            getSequences: () => [{ __jsonld: {} }],
        };

        vi.mocked(manifestsState.fetchResource).mockResolvedValue(
            collectionV3WithNavDates,
        );
        vi.mocked(manifestsState.getManifest).mockReturnValue(manifest);
        vi.mocked(manifestsState.getCanvases).mockReturnValue(canvases);

        await state.setManifest('http://example.org/collection/navdate', {
            canvasId: 'canvas-2',
        });

        expect(state.canvasId).toBe('canvas-2');
    });

    it('honors the requested canvas when the manifest loads via the fetch fallback', async () => {
        const canvases = [{ id: 'canvas-1' }, { id: 'canvas-2' }];
        const manifest = {
            __jsonld: {},
            getBehavior: () => ['individuals'],
            getSequences: () => [{ __jsonld: {} }],
        };

        vi.mocked(manifestsState.fetchResource).mockRejectedValue(
            new Error('network error'),
        );
        vi.mocked(manifestsState.getManifest).mockReturnValue(manifest);
        vi.mocked(manifestsState.getCanvases).mockReturnValue(canvases);

        await state.setManifest('manifest-1', { canvasId: 'canvas-2' });

        expect(state.canvasId).toBe('canvas-2');
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

    it('does not report a current canvas index until a canvas is selected', () => {
        vi.mocked(manifestsState.getCanvases).mockReturnValue([
            { id: 'canvas-1' },
            { id: 'canvas-2' },
        ]);

        state.manifestId = 'manifest-1';

        expect(state.currentCanvasIndex).toBe(-1);
        expect(state.hasNext).toBe(false);
        expect(state.hasPrevious).toBe(false);
    });

    it('repairs stale initial canvas selection to the first available canvas', () => {
        vi.mocked(manifestsState.getCanvases).mockReturnValue([
            { id: 'canvas-1' },
            { id: 'canvas-2' },
        ]);

        state.manifestId = 'manifest-1';
        state.canvasId = 'stale-canvas';

        (state as any).ensureInitialCanvasSelection();

        expect(state.canvasId).toBe('canvas-1');
        expect(state.currentCanvasIndex).toBe(0);
    });

    it('keeps annotations hidden by default and shows manifest annotations when the panel opens', () => {
        vi.mocked(manifestsState.getAnnotations).mockReturnValue([
            { id: 'anno-1' },
            { '@id': 'anno-2' },
        ]);

        state.manifestId = 'manifest-1';
        state.canvasId = 'canvas-1';
        state.searchAnnotations = [{ id: 'search-1', canvasId: 'canvas-1' }];

        expect(state.showAnnotations).toBe(false);
        expect([...state.visibleAnnotationIds]).toEqual([]);

        state.toggleAnnotations();

        expect(state.showAnnotations).toBe(true);
        expect([...state.visibleAnnotationIds]).toEqual(['anno-1', 'anno-2']);
    });

    it('restores all manifest annotations after closing and reopening the panel', () => {
        vi.mocked(manifestsState.getAnnotations).mockReturnValue([
            { id: 'anno-1' },
            { id: 'anno-2' },
        ]);

        state.manifestId = 'manifest-1';
        state.canvasId = 'canvas-1';

        state.toggleAnnotations();
        state.visibleAnnotationIds.delete('anno-2');
        state.annotationVisibilityTouched = true;

        state.toggleAnnotations();

        expect(state.showAnnotations).toBe(false);
        expect([...state.visibleAnnotationIds]).toEqual([]);
        expect(state.annotationVisibilityTouched).toBe(false);

        state.toggleAnnotations();

        expect(state.showAnnotations).toBe(true);
        expect([...state.visibleAnnotationIds]).toEqual(['anno-1', 'anno-2']);
        expect(state.annotationVisibilityTouched).toBe(false);
    });

    it('only resets visibility on config-driven annotation open and close transitions', () => {
        vi.mocked(manifestsState.getAnnotations).mockReturnValue([
            { id: 'anno-1' },
            { id: 'anno-2' },
        ]);

        state.manifestId = 'manifest-1';
        state.canvasId = 'canvas-1';

        state.updateConfig({ annotations: { open: true } });

        expect(state.showAnnotations).toBe(true);
        expect([...state.visibleAnnotationIds]).toEqual(['anno-1', 'anno-2']);

        state.visibleAnnotationIds.delete('anno-2');
        state.annotationVisibilityTouched = true;

        state.updateConfig({ annotations: { open: true } });

        expect([...state.visibleAnnotationIds]).toEqual(['anno-1']);
        expect(state.annotationVisibilityTouched).toBe(true);

        state.updateConfig({ annotations: { open: false } });

        expect(state.showAnnotations).toBe(false);
        expect([...state.visibleAnnotationIds]).toEqual([]);
        expect(state.annotationVisibilityTouched).toBe(false);

        state.updateConfig({ annotations: { open: true } });

        expect([...state.visibleAnnotationIds]).toEqual(['anno-1', 'anno-2']);
    });

    it('clears manual visibility when the canvas changes while the panel is open', () => {
        vi.mocked(manifestsState.getAnnotations).mockImplementation(
            (_manifestId, canvasId) => {
                if (canvasId === 'canvas-1') {
                    return [{ id: 'anno-1' }, { id: 'anno-2' }];
                }

                if (canvasId === 'canvas-2') {
                    return [{ id: 'anno-3' }];
                }

                return [];
            },
        );

        state.manifestId = 'manifest-1';
        state.canvasId = 'canvas-1';
        state.toggleAnnotations();
        state.visibleAnnotationIds.delete('anno-2');
        state.annotationVisibilityTouched = true;

        state.setCanvas('canvas-2');

        expect(state.canvasId).toBe('canvas-2');
        expect([...state.visibleAnnotationIds]).toEqual([]);
        expect(state.annotationVisibilityTouched).toBe(false);
    });

    it('defaults preserveCanvasScale to false in getter and snapshot', () => {
        expect(state.preserveCanvasScale).toBe(false);
        expect(state.getSnapshot().preserveCanvasScale).toBe(false);
    });

    it('reflects preserveCanvasScale config updates in getter and snapshot', () => {
        state.updateConfig({ preserveCanvasScale: true });

        expect(state.preserveCanvasScale).toBe(true);
        expect(state.getSnapshot().preserveCanvasScale).toBe(true);
    });
});
