import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { collectionV3WithNavDates } from '../test/fixtures/manifests';
import { manifestsState } from './manifests.svelte';
import { ViewerState } from './viewer.svelte';

/**
 * `ViewerState`'s manifest-driven behavior through the epic's one seam — a real
 * `ViewerState` loaded with raw manifest JSON, backed by the real manifest
 * cache, with no mocks and no hand-built canvases (`remove-manifesto` SPEC →
 * "The seam").
 *
 * This file used to `vi.mock` the whole manifest cache and feed it manifest
 * doubles carrying `__jsonld`, `getBehavior` and `getSequences`, plus canvas
 * doubles that were bare `{ id }` objects. It could not serve as an oracle for
 * this epic: every assertion below about start canvas, viewing direction and
 * viewing mode was really an assertion about the double's accessors, and the
 * doubles would have kept passing against code that reads nothing at all from a
 * real manifest (`remove-manifesto` ticket 08).
 *
 * Where a test loads by URL it stubs `fetch` and nothing else, so
 * `setManifest`'s own collection detection, registration and fallback paths run
 * for real.
 */

const CANVAS_1 = 'http://example.org/canvas/1';
const CANVAS_2 = 'http://example.org/canvas/2';
const CANVAS_3 = 'http://example.org/canvas/3';
const CANVAS_4 = 'http://example.org/canvas/4';

function v3Canvas(id: string, extra: Record<string, unknown> = {}) {
    return {
        id,
        type: 'Canvas',
        label: { en: [id] },
        height: 1000,
        width: 800,
        ...extra,
        items: [
            {
                id: `${id}/page`,
                type: 'AnnotationPage',
                items: [
                    {
                        id: `${id}/annotation`,
                        type: 'Annotation',
                        motivation: 'painting',
                        target: id,
                        body: {
                            id: `${id}/image`,
                            type: 'Image',
                            format: 'image/jpeg',
                        },
                    },
                ],
            },
        ],
    };
}

function v3Manifest(
    id: string,
    {
        root = {},
        canvases = [v3Canvas(CANVAS_1), v3Canvas(CANVAS_2)],
    }: { root?: Record<string, unknown>; canvases?: unknown[] } = {},
) {
    return {
        '@context': 'http://iiif.io/api/presentation/3/context.json',
        id,
        type: 'Manifest',
        label: { en: ['Behavior fixture'] },
        ...root,
        items: canvases,
    };
}

function v2Canvas(id: string, extra: Record<string, unknown> = {}) {
    return {
        '@id': id,
        '@type': 'sc:Canvas',
        label: id,
        height: 1000,
        width: 800,
        ...extra,
        images: [
            {
                '@type': 'oa:Annotation',
                motivation: 'sc:painting',
                on: id,
                resource: { '@id': `${id}/image`, '@type': 'dctypes:Image' },
            },
        ],
    };
}

function v2Manifest(
    id: string,
    {
        root = {},
        sequence = {},
        canvases = [v2Canvas(CANVAS_1), v2Canvas(CANVAS_2)],
    }: {
        root?: Record<string, unknown>;
        sequence?: Record<string, unknown>;
        canvases?: unknown[];
    } = {},
) {
    return {
        '@context': 'http://iiif.io/api/presentation/2/context.json',
        '@id': id,
        '@type': 'sc:Manifest',
        label: 'Behavior fixture v2',
        ...root,
        sequences: [
            {
                '@id': `${id}/sequence/normal`,
                '@type': 'sc:Sequence',
                ...sequence,
                canvases,
            },
        ],
    };
}

describe('ViewerState manifest behavior', () => {
    let state: ViewerState;
    const registeredIds: string[] = [];
    const mockFetch = vi.fn();

    beforeEach(() => {
        vi.stubGlobal('fetch', mockFetch);
        mockFetch.mockReset();
        state = new ViewerState();
    });

    afterEach(() => {
        for (const id of registeredIds.splice(0)) {
            manifestsState.clearManifest(id);
        }
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    /** Load raw manifest JSON into the real cache through the viewer. */
    async function load(json: any): Promise<void> {
        const id = json.id || json['@id'];
        registeredIds.push(id);
        await state.setManifestData(id, json);
    }

    /**
     * Register raw manifest JSON in the real cache WITHOUT going through
     * `setManifestData`, for the two tests that need a manifest present while
     * canvas selection has not run yet.
     */
    async function register(json: any): Promise<string> {
        const id = json.id || json['@id'];
        registeredIds.push(id);
        await manifestsState.registerManifest(id, json);
        return id;
    }

    /** Serve IIIF resources by URL through the real fetch path. */
    function serve(byUrl: Record<string, unknown>) {
        for (const url of Object.keys(byUrl)) registeredIds.push(url);
        mockFetch.mockImplementation(async (url: string) => {
            const json = byUrl[url];
            if (!json) return { ok: false, status: 404 };
            return { ok: true, json: async () => structuredClone(json) };
        });
    }

    it('applies root manifest viewing direction when loading manifest data directly', async () => {
        const id = 'http://example.org/manifest/root-scalars';
        const json = v3Manifest(id, {
            root: {
                start: { id: CANVAS_2, type: 'Canvas' },
                viewingDirection: 'top-to-bottom',
                behavior: ['continuous'],
            },
        });

        await load(json);

        // The manifest reached the real cache as the JSON it was handed.
        expect(state.manifestId).toBe(id);
        expect(manifestsState.getManifestEntry(id)?.json).toEqual(json);
        expect(state.startCanvasId).toBe(CANVAS_2);
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
        await load(
            v2Manifest('http://example.org/manifest/sequence-direction', {
                sequence: {
                    startCanvas: CANVAS_1,
                    viewingDirection: 'bottom-to-top',
                },
            }),
        );

        expect(state.viewingDirection).toBe('bottom-to-top');
    });

    it('reads a right-to-left viewing direction from the manifest root', async () => {
        await load(
            v3Manifest('http://example.org/manifest/root-direction', {
                root: {
                    viewingDirection: 'right-to-left',
                    behavior: ['individuals'],
                },
            }),
        );

        expect(state.viewingDirection).toBe('right-to-left');
    });

    it('uses the manifest viewing direction for fetched v3 manifests', async () => {
        const id = 'http://example.org/manifest/fetched-direction';
        serve({
            [id]: v3Manifest(id, {
                root: {
                    viewingDirection: 'right-to-left',
                    behavior: ['individuals'],
                },
            }),
        });

        await state.setManifest(id);

        expect(state.viewingDirection).toBe('right-to-left');
    });

    it('applies the manifest start canvas after fetch-based loading', async () => {
        const id = 'http://example.org/manifest/fetched-start';
        serve({
            [id]: v3Manifest(id, {
                root: { start: { id: CANVAS_2, type: 'Canvas' } },
            }),
        });

        await state.setManifest(id);

        expect(state.startCanvasId).toBe(CANVAS_2);
        expect(state.canvasId).toBe(CANVAS_2);
    });

    it('keeps a canvas requested before the manifest loads when the manifest contains it', async () => {
        const id = 'http://example.org/manifest/pre-requested-fetch';
        serve({
            [id]: v3Manifest(id, {
                canvases: [
                    v3Canvas(CANVAS_1),
                    v3Canvas(CANVAS_2),
                    v3Canvas(CANVAS_3),
                ],
            }),
        });

        // Consumer requests a canvas while the manifest is still loading
        state.setCanvas(CANVAS_2);
        await state.setManifest(id);

        expect(state.canvasId).toBe(CANVAS_2);
    });

    it('keeps a pre-requested canvas when loading manifest data directly', async () => {
        state.setCanvas(CANVAS_2);
        await load(
            v3Manifest('http://example.org/manifest/pre-requested-data'),
        );

        expect(state.canvasId).toBe(CANVAS_2);
    });

    it('keeps a pre-requested canvas when the manifest loads via the fetch fallback', async () => {
        const id = 'http://example.org/manifest/pre-requested-fallback';
        // The Collection probe fails; `setManifest` falls back to fetching the
        // manifest itself, which succeeds.
        mockFetch.mockRejectedValueOnce(new Error('network error'));
        serve({ [id]: v3Manifest(id) });

        state.setCanvas(CANVAS_2);
        await state.setManifest(id);

        expect(state.canvasId).toBe(CANVAS_2);
    });

    it('keeps a pre-requested canvas when a collection auto-loads its first manifest', async () => {
        serve({
            'http://example.org/collection/navdate': collectionV3WithNavDates,
            'http://example.org/manifest/1986': v3Manifest(
                'http://example.org/manifest/1986',
            ),
        });

        state.setCanvas(CANVAS_2);
        await state.setManifest('http://example.org/collection/navdate');

        expect(state.manifestId).toBe('http://example.org/manifest/1986');
        expect(state.canvasId).toBe(CANVAS_2);
    });

    it('selects the canvas requested via setManifest options over the current one', async () => {
        const id = 'http://example.org/manifest/requested-canvas';
        serve({
            [id]: v3Manifest(id, {
                canvases: [
                    v3Canvas(CANVAS_1),
                    v3Canvas(CANVAS_2),
                    v3Canvas(CANVAS_3),
                ],
            }),
        });

        // Simulates switching manifests with a target canvas: the previous
        // canvas is stale, the requested one must win over the first canvas.
        state.canvasId = 'stale-canvas-from-previous-manifest';
        await state.setManifest(id, { canvasId: CANVAS_3 });

        expect(state.canvasId).toBe(CANVAS_3);
    });

    it('honors the requested canvas when the manifest id resolves to a collection', async () => {
        serve({
            'http://example.org/collection/navdate': collectionV3WithNavDates,
            'http://example.org/manifest/1986': v3Manifest(
                'http://example.org/manifest/1986',
            ),
        });

        await state.setManifest('http://example.org/collection/navdate', {
            canvasId: CANVAS_2,
        });

        expect(state.canvasId).toBe(CANVAS_2);
    });

    it('honors the requested canvas when the manifest loads via the fetch fallback', async () => {
        const id = 'http://example.org/manifest/requested-fallback';
        mockFetch.mockRejectedValueOnce(new Error('network error'));
        serve({ [id]: v3Manifest(id) });

        await state.setManifest(id, { canvasId: CANVAS_2 });

        expect(state.canvasId).toBe(CANVAS_2);
    });

    it('navigates paged spreads around non-paged canvases', async () => {
        await load(
            v3Manifest('http://example.org/manifest/paged', {
                canvases: [
                    v3Canvas(CANVAS_1),
                    v3Canvas(CANVAS_2, { behavior: ['non-paged'] }),
                    v3Canvas(CANVAS_3),
                    v3Canvas(CANVAS_4),
                ],
            }),
        );

        state.viewingMode = 'paged';
        state.canvasId = CANVAS_1;

        state.nextCanvas();
        expect(state.canvasId).toBe(CANVAS_2);

        state.nextCanvas();
        expect(state.canvasId).toBe(CANVAS_3);

        state.previousCanvas();
        expect(state.canvasId).toBe(CANVAS_2);
    });

    it('auto-loads the earliest manifest when opening a chronology collection', async () => {
        serve({
            'http://example.org/collection/navdate': collectionV3WithNavDates,
            'http://example.org/manifest/1986': v3Manifest(
                'http://example.org/manifest/1986',
            ),
        });

        await state.setManifest('http://example.org/collection/navdate');

        expect(state.collectionItems.map((item) => item.id)).toEqual([
            'http://example.org/manifest/1986',
            'http://example.org/manifest/1987',
            'http://example.org/collection/subcollection',
            'http://example.org/manifest/undated',
        ]);
        expect(mockFetch).toHaveBeenCalledWith(
            'http://example.org/manifest/1986',
            { headers: undefined, credentials: 'same-origin' },
        );
        expect(state.manifestId).toBe('http://example.org/manifest/1986');
    });

    it('does not report a current canvas index until a canvas is selected', async () => {
        state.manifestId = await register(
            v3Manifest('http://example.org/manifest/no-selection'),
        );

        expect(state.currentCanvasIndex).toBe(-1);
        expect(state.hasNext).toBe(false);
        expect(state.hasPrevious).toBe(false);
    });

    it('repairs stale initial canvas selection to the first available canvas', async () => {
        state.manifestId = await register(
            v3Manifest('http://example.org/manifest/stale-selection'),
        );
        state.canvasId = 'stale-canvas';

        (state as any).ensureInitialCanvasSelection();

        expect(state.canvasId).toBe(CANVAS_1);
        expect(state.currentCanvasIndex).toBe(0);
    });

    /**
     * Manifest annotations, read from raw canvas JSON by the real cache. The
     * two spellings are both exercised on purpose: IIIF v3 puts inline
     * annotations in an `AnnotationPage`'s `items` under `annotations`, and
     * IIIF v2 puts them in an AnnotationList's `resources` under `otherContent`
     * with `@id` rather than `id`.
     */
    function annotatedManifest(
        id: string,
        annotationsByCanvas: Record<string, unknown[]>,
    ) {
        return v2Manifest(id, {
            canvases: Object.entries(annotationsByCanvas).map(
                ([canvasId, resources]) =>
                    v2Canvas(canvasId, {
                        otherContent: [
                            {
                                '@id': `${canvasId}/list`,
                                '@type': 'sc:AnnotationList',
                                resources,
                            },
                        ],
                    }),
            ),
        });
    }

    it('keeps annotations hidden by default and shows manifest annotations when the panel opens', async () => {
        await load(
            annotatedManifest('http://example.org/manifest/annotations-open', {
                [CANVAS_1]: [{ id: 'anno-1' }, { '@id': 'anno-2' }],
            }),
        );
        state.searchAnnotations = [{ id: 'search-1', canvasId: CANVAS_1 }];

        expect(state.showAnnotations).toBe(false);
        expect([...state.visibleAnnotationIds]).toEqual([]);

        state.toggleAnnotations();

        expect(state.showAnnotations).toBe(true);
        expect([...state.visibleAnnotationIds]).toEqual(['anno-1', 'anno-2']);
    });

    it('restores all manifest annotations after closing and reopening the panel', async () => {
        await load(
            annotatedManifest(
                'http://example.org/manifest/annotations-restore',
                { [CANVAS_1]: [{ id: 'anno-1' }, { id: 'anno-2' }] },
            ),
        );

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

    it('only resets visibility on config-driven annotation open and close transitions', async () => {
        await load(
            annotatedManifest(
                'http://example.org/manifest/annotations-config',
                {
                    [CANVAS_1]: [{ id: 'anno-1' }, { id: 'anno-2' }],
                },
            ),
        );

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

    it('clears manual visibility when the canvas changes while the panel is open', async () => {
        await load(
            annotatedManifest(
                'http://example.org/manifest/annotations-canvas-change',
                {
                    [CANVAS_1]: [{ id: 'anno-1' }, { id: 'anno-2' }],
                    [CANVAS_2]: [{ id: 'anno-3' }],
                },
            ),
        );

        state.toggleAnnotations();
        state.visibleAnnotationIds.delete('anno-2');
        state.annotationVisibilityTouched = true;

        state.setCanvas(CANVAS_2);

        expect(state.canvasId).toBe(CANVAS_2);
        expect([...state.visibleAnnotationIds]).toEqual([]);
        expect(state.annotationVisibilityTouched).toBe(false);
    });

    it('setHoveredAnnotationId sets and clears the hovered annotation id', () => {
        state.setHoveredAnnotationId('anno-1');
        expect(state.hoveredAnnotationId).toBe('anno-1');

        state.setHoveredAnnotationId(null);
        expect(state.hoveredAnnotationId).toBeNull();
    });

    it('setAnnotationVisible toggles a single id and marks visibility touched', () => {
        expect(state.annotationVisibilityTouched).toBe(false);

        state.setAnnotationVisible('anno-1', true);
        expect([...state.visibleAnnotationIds]).toEqual(['anno-1']);
        expect(state.annotationVisibilityTouched).toBe(true);

        state.setAnnotationVisible('anno-1', false);
        expect([...state.visibleAnnotationIds]).toEqual([]);
        expect(state.annotationVisibilityTouched).toBe(true);
    });

    it('setAllAnnotationsVisible(true) shows every current-canvas annotation', async () => {
        await load(
            annotatedManifest('http://example.org/manifest/annotations-all', {
                [CANVAS_1]: [{ id: 'anno-1' }, { '@id': 'anno-2' }],
            }),
        );

        state.setAllAnnotationsVisible(true);

        expect([...state.visibleAnnotationIds]).toEqual(['anno-1', 'anno-2']);
        expect(state.annotationVisibilityTouched).toBe(true);
    });

    it('setAllAnnotationsVisible(false) hides all annotations', async () => {
        await load(
            annotatedManifest('http://example.org/manifest/annotations-none', {
                [CANVAS_1]: [{ id: 'anno-1' }],
            }),
        );
        state.setAnnotationVisible('anno-1', true);

        state.setAllAnnotationsVisible(false);

        expect([...state.visibleAnnotationIds]).toEqual([]);
        expect(state.annotationVisibilityTouched).toBe(true);
    });

    it('setAllAnnotationsVisible(true) reaches the whole spread, not just the current canvas', async () => {
        await load(
            annotatedManifest('http://example.org/manifest/annotations-paged', {
                [CANVAS_1]: [{ id: 'anno-1' }],
                [CANVAS_2]: [{ id: 'anno-2' }],
            }),
        );
        state.viewingMode = 'paged';
        // What the renderer publishes once the spread is on screen; without it
        // `annotatableCanvasIds` falls back to the current canvas alone.
        state.visibleCanvasIds = [CANVAS_1, CANVAS_2];

        state.setAllAnnotationsVisible(true);

        // The facing page's annotation is toggleable in the panel, so "all"
        // has to include it — reading only `canvasId` left it behind.
        expect([...state.visibleAnnotationIds].sort()).toEqual([
            'anno-1',
            'anno-2',
        ]);
    });

    it('setAllAnnotationsVisible(true) leaves search hits out of the visibility set', async () => {
        await load(
            annotatedManifest('http://example.org/manifest/annotations-hits', {
                [CANVAS_1]: [{ id: 'anno-1' }],
            }),
        );
        await state.search('anything');

        state.setAllAnnotationsVisible(true);

        // A search hit is always drawn and never toggled.
        for (const hit of state.searchAnnotations) {
            expect(state.visibleAnnotationIds.has(hit['@id'])).toBe(false);
        }
    });

    it('setDockSide keeps the derived docked flags in step', () => {
        state.setDockSide('bottom');
        expect(state.isGalleryDockedBottom).toBe(true);
        expect(state.isGalleryDockedRight).toBe(false);

        state.setDockSide('right');
        expect(state.isGalleryDockedBottom).toBe(false);
        expect(state.isGalleryDockedRight).toBe(true);

        state.setDockSide('none');
        expect(state.isGalleryDockedBottom).toBe(false);
        expect(state.isGalleryDockedRight).toBe(false);
    });

    it('setGalleryPosition and setGallerySize replace their values', () => {
        state.setGalleryPosition({ x: 42, y: 84 });
        expect(state.galleryPosition).toEqual({ x: 42, y: 84 });

        state.setGallerySize({ width: 500, height: 600 });
        expect(state.gallerySize).toEqual({ width: 500, height: 600 });
    });

    it('setDockSide keeps the derived docked flags in sync', () => {
        state.setDockSide('right');
        expect(state.dockSide).toBe('right');
        expect(state.isGalleryDockedRight).toBe(true);
        expect(state.isGalleryDockedBottom).toBe(false);

        state.setDockSide('bottom');
        expect(state.dockSide).toBe('bottom');
        expect(state.isGalleryDockedBottom).toBe(true);
        expect(state.isGalleryDockedRight).toBe(false);

        state.setDockSide('none');
        expect(state.isGalleryDockedBottom).toBe(false);
        expect(state.isGalleryDockedRight).toBe(false);
    });

    it('setGalleryExpanded opens the gallery, since expanded-but-hidden is unreachable', () => {
        expect(state.galleryExpanded).toBe(false);
        expect(state.showThumbnailGallery).toBe(false);

        state.setGalleryExpanded(true);

        expect(state.galleryExpanded).toBe(true);
        expect(state.showThumbnailGallery).toBe(true);
    });

    it('setGalleryExpanded(false) collapses without closing the gallery', () => {
        state.setGalleryExpanded(true);

        state.setGalleryExpanded(false);

        expect(state.galleryExpanded).toBe(false);
        expect(state.showThumbnailGallery).toBe(true);
    });

    it('toggleGalleryExpanded flips the expanded state', () => {
        state.toggleGalleryExpanded();
        expect(state.galleryExpanded).toBe(true);

        state.toggleGalleryExpanded();
        expect(state.galleryExpanded).toBe(false);
    });

    it('setGalleryExpanded leaves dockSide untouched so collapsing restores the strip', () => {
        state.setDockSide('left');

        state.setGalleryExpanded(true);
        expect(state.dockSide).toBe('left');

        state.setGalleryExpanded(false);
        expect(state.dockSide).toBe('left');
    });

    it('closing the gallery clears the expanded state', () => {
        state.setGalleryExpanded(true);

        state.toggleThumbnailGallery();

        expect(state.showThumbnailGallery).toBe(false);
        expect(state.galleryExpanded).toBe(false);
    });

    it('reports galleryExpanded in the snapshot', () => {
        expect(state.getSnapshot().galleryExpanded).toBe(false);

        state.setGalleryExpanded(true);

        expect(state.getSnapshot().galleryExpanded).toBe(true);
    });

    it('applies gallery.expanded config and implies open regardless of key order', () => {
        state.updateConfig({ gallery: { expanded: true, open: false } });

        expect(state.galleryExpanded).toBe(true);
        expect(state.showThumbnailGallery).toBe(true);
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
