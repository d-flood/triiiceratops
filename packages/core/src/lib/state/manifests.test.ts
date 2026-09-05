import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ManifestsState } from './manifests.svelte';
import { getCanvasId } from '../utils/iiifIds';

/**
 * The manifest cache, against REAL parsing.
 *
 * This file used to `vi.mock` the module that loads `manifesto.js` and hand
 * `parseManifest` a stub returning hand-built objects with `getSequences`,
 * `getCanvases` and `getCanvasById`. That made every assertion below an
 * assertion about the stub: "registration parsed the JSON" was checked by
 * spying on the stub, and "getCanvases returns the canvases" was checked
 * against a list the stub was told to return. Neither could survive the
 * library's removal, and neither could show that the cache reads the raw JSON
 * a consumer actually has (`remove-manifesto` ticket 08).
 *
 * Everything here now goes in as raw IIIF JSON and comes out as the cache's
 * observable result. Only `fetch` is stubbed.
 *
 * Canvas identity is read with core's exported `getCanvasId` rather than
 * `canvas.id`. The cache hands back raw Canvas JSON as of ticket 07, and a raw
 * IIIF v2 canvas spells its identifier `@id` — the library object papered over
 * that difference, and the version-neutral helper is what a consumer is told to
 * use in its place.
 */

const MANIFEST_ID = 'http://example.org/manifest';
const CANVAS_1 = 'http://example.org/canvas/1';
const CANVAS_2 = 'http://example.org/canvas/2';

function v2Canvas(id: string, extra: Record<string, unknown> = {}) {
    return {
        '@id': id,
        '@type': 'sc:Canvas',
        label: id,
        width: 800,
        height: 600,
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

function v2Manifest(id: string, canvases: unknown[]) {
    return {
        '@context': 'http://iiif.io/api/presentation/2/context.json',
        '@id': id,
        '@type': 'sc:Manifest',
        label: 'Manifest cache fixture',
        sequences: [
            {
                '@id': `${id}/sequence/normal`,
                '@type': 'sc:Sequence',
                canvases,
            },
        ],
    };
}

function v3Canvas(id: string, extra: Record<string, unknown> = {}) {
    return {
        id,
        type: 'Canvas',
        label: { en: [id] },
        width: 800,
        height: 600,
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
                        body: { id: `${id}/image`, type: 'Image' },
                    },
                ],
            },
        ],
    };
}

function v3Manifest(
    id: string,
    canvases: unknown[],
    root: Record<string, unknown> = {},
) {
    return {
        '@context': 'http://iiif.io/api/presentation/3/context.json',
        id,
        type: 'Manifest',
        label: { en: ['Manifest cache fixture'] },
        ...root,
        items: canvases,
    };
}

describe('ManifestsState', () => {
    let state: ManifestsState;
    const mockFetch = vi.fn();

    beforeEach(() => {
        vi.stubGlobal('fetch', mockFetch);
        state = new ManifestsState();
        mockFetch.mockReset();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    describe('fetchManifest', () => {
        it('should fetch and store a manifest', async () => {
            const manifest = v2Manifest(MANIFEST_ID, [v2Canvas(CANVAS_1)]);
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => manifest,
            } as Response);

            await state.fetchManifest(MANIFEST_ID);

            expect(mockFetch).toHaveBeenCalledWith(MANIFEST_ID, {
                headers: undefined,
                credentials: 'same-origin',
            });
            expect(state.manifests[MANIFEST_ID]).toBeDefined();
            expect(state.manifests[MANIFEST_ID].json).toEqual(manifest);
            expect(state.manifests[MANIFEST_ID].isFetching).toBe(false);
            // The fetched JSON was registered, not merely stored: the cache can
            // enumerate its canvases.
            expect(state.getCanvases(MANIFEST_ID).map(getCanvasId)).toEqual([
                CANVAS_1,
            ]);
        });

        it('should handle fetch errors', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Network Error'));

            await state.fetchManifest('http://example.org/error');

            expect(state.manifests['http://example.org/error'].error).toBe(
                'Network Error',
            );
            expect(state.manifests['http://example.org/error'].isFetching).toBe(
                false,
            );
        });

        it('should not fetch if already fetched', async () => {
            // Prime the state
            state.manifests['http://example.org/cached'] = {
                isFetching: false,
                json: {},
            };

            await state.fetchManifest('http://example.org/cached');

            expect(mockFetch).not.toHaveBeenCalled();
        });

        it('should wait for an in-flight fetch for the same manifest', async () => {
            const manifest = v3Manifest(MANIFEST_ID, [v3Canvas(CANVAS_1)], {
                viewingDirection: 'right-to-left',
            });
            let resolveResponse: (response: Response) => void = () => {};
            mockFetch.mockReturnValueOnce(
                new Promise((resolve) => {
                    resolveResponse = resolve;
                }),
            );

            const firstFetch = state.fetchManifest(MANIFEST_ID);
            const secondFetch = state.fetchManifest(MANIFEST_ID);

            resolveResponse({
                ok: true,
                json: async () => manifest,
            } as Response);

            await Promise.all([firstFetch, secondFetch]);

            expect(mockFetch).toHaveBeenCalledTimes(1);
            expect(state.manifests[MANIFEST_ID].json).toEqual(manifest);
            // One fetch, one registration: the single stored entry enumerates.
            expect(state.getCanvases(MANIFEST_ID).map(getCanvasId)).toEqual([
                CANVAS_1,
            ]);
        });
    });

    describe('getCanvases', () => {
        it('should return canvases from a registered manifest', async () => {
            await state.registerManifest(
                MANIFEST_ID,
                v3Manifest(MANIFEST_ID, [
                    v3Canvas(CANVAS_1),
                    v3Canvas(CANVAS_2),
                ]),
            );

            expect(state.getCanvases(MANIFEST_ID).map(getCanvasId)).toEqual([
                CANVAS_1,
                CANVAS_2,
            ]);
        });

        it('returns canvases in structure sequence order when sequence ranges are present', async () => {
            await state.registerManifest(
                MANIFEST_ID,
                v3Manifest(
                    MANIFEST_ID,
                    [v3Canvas(CANVAS_1), v3Canvas(CANVAS_2)],
                    {
                        structures: [
                            {
                                id: 'range-physical',
                                type: 'Range',
                                behavior: ['sequence'],
                                items: [
                                    { id: CANVAS_1, type: 'Canvas' },
                                    { id: CANVAS_2, type: 'Canvas' },
                                ],
                            },
                            {
                                id: 'range-author',
                                type: 'Range',
                                behavior: ['sequence'],
                                items: [
                                    { id: CANVAS_2, type: 'Canvas' },
                                    { id: CANVAS_1, type: 'Canvas' },
                                ],
                            },
                        ],
                    },
                ),
            );

            expect(state.getSequenceCount(MANIFEST_ID)).toBe(2);
            expect(state.getCanvases(MANIFEST_ID, 0).map(getCanvasId)).toEqual([
                CANVAS_1,
                CANVAS_2,
            ]);
            expect(state.getCanvases(MANIFEST_ID, 1).map(getCanvasId)).toEqual([
                CANVAS_2,
                CANVAS_1,
            ]);
        });

        it('should return empty array if manifest not found', () => {
            const canvases = state.getCanvases('http://example.org/missing');
            expect(canvases).toEqual([]);
        });
    });

    describe('getAnnotations', () => {
        it('should extract annotations and trigger fetch for external lists', async () => {
            await state.registerManifest(
                MANIFEST_ID,
                v2Manifest(MANIFEST_ID, [
                    v2Canvas(CANVAS_1, {
                        otherContent: [{ '@id': 'http://example.org/list1' }],
                    }),
                ]),
            );

            // Mock the fetch for the annotation list
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({ resources: [{ '@id': 'anno1' }] }),
            } as Response);

            // First call triggers fetch. `getAnnotations` is synchronous
            // and returns whatever is already cached, so the list arrives on a
            // later call.
            state.getAnnotations(MANIFEST_ID, CANVAS_1);

            await new Promise((resolve) => setTimeout(resolve, 0));

            expect(mockFetch).toHaveBeenCalledWith('http://example.org/list1');

            // Second call should return the annotations
            const annos = state.getAnnotations(MANIFEST_ID, CANVAS_1);
            expect(annos).toHaveLength(1);
            expect(annos[0]['@id']).toBe('anno1');
            expect(annos[0].__triiiceratopsCanvas).toEqual({
                id: CANVAS_1,
                width: 800,
                height: 600,
            });
        });

        it('reads annotations from raw manifest JSON when the cache holds only JSON', () => {
            // The shape the cache holds when nothing parsed the manifest — and
            // the only shape it holds once `manifesto.js` is gone.
            state.manifests[MANIFEST_ID] = {
                isFetching: false,
                json: v3Manifest(MANIFEST_ID, [
                    v3Canvas(CANVAS_1, {
                        annotations: [
                            {
                                id: 'http://example.org/page/1',
                                type: 'AnnotationPage',
                                items: [
                                    {
                                        id: 'anno-inline',
                                        type: 'Annotation',
                                    },
                                ],
                            },
                        ],
                    }),
                ]),
            };

            const annos = state.getAnnotations(MANIFEST_ID, CANVAS_1);

            expect(annos).toHaveLength(1);
            expect(annos[0].id).toBe('anno-inline');
            expect(annos[0].__triiiceratopsCanvas).toEqual({
                id: CANVAS_1,
                width: 800,
                height: 600,
            });
        });
    });

    describe('ensureCanvasAnnotations', () => {
        it('fetches external annotation pages before returning them', async () => {
            await state.registerManifest(
                MANIFEST_ID,
                v3Manifest(MANIFEST_ID, [
                    v3Canvas(CANVAS_1, {
                        annotations: [
                            {
                                id: 'http://example.org/ocr-page',
                                type: 'AnnotationPage',
                            },
                        ],
                    }),
                ]),
            );

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    items: [
                        {
                            id: 'ocr-1',
                            motivation: 'supplementing',
                            body: {
                                type: 'TextualBody',
                                value: 'Line one',
                            },
                            target: `${CANVAS_1}#xywh=1,2,3,4`,
                        },
                    ],
                }),
            } as Response);

            const annotations = await state.ensureCanvasAnnotations(
                MANIFEST_ID,
                CANVAS_1,
            );

            expect(mockFetch).toHaveBeenCalledWith(
                'http://example.org/ocr-page',
            );
            expect(annotations).toHaveLength(1);
            expect(annotations[0].id).toBe('ocr-1');
        });

        it('filters annotations to a configured source id', async () => {
            await state.registerManifest(
                MANIFEST_ID,
                v3Manifest(MANIFEST_ID, [
                    v3Canvas(CANVAS_1, {
                        annotations: [
                            {
                                id: 'http://example.org/ocr-page',
                                type: 'AnnotationPage',
                            },
                            {
                                id: 'http://example.org/notes-page',
                                type: 'AnnotationPage',
                            },
                        ],
                    }),
                ]),
            );

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    items: [
                        {
                            id: 'ocr-1',
                            motivation: 'supplementing',
                            body: {
                                type: 'TextualBody',
                                value: 'Line one',
                            },
                            target: `${CANVAS_1}#xywh=1,2,3,4`,
                        },
                    ],
                }),
            } as Response);

            const annotations = await state.ensureCanvasAnnotations(
                MANIFEST_ID,
                CANVAS_1,
                'http://example.org/ocr-page',
            );

            expect(mockFetch).toHaveBeenCalledTimes(1);
            expect(mockFetch).toHaveBeenCalledWith(
                'http://example.org/ocr-page',
            );
            expect(annotations).toHaveLength(1);
            expect(annotations[0].id).toBe('ocr-1');
        });
    });
});
