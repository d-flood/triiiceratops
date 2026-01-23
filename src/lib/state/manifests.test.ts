import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ManifestsState } from './manifests.svelte';
import * as manifesto from 'manifesto.js';

// Mock manifesto.js since it's an external dependency
vi.mock('manifesto.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('manifesto.js')>();
    return {
        ...actual,
        parseManifest: vi.fn((json) => {
            // Minimal mock of a manifesto object
            return {
                getSequences: () => [
                    {
                        getCanvases: () => [{ id: 'canvas1' }],
                        getCanvasById: (id: string) => {
                            if (id === 'canvas1') {
                                return {
                                    id: 'canvas1',
                                    __jsonld: {
                                        otherContent: [
                                            {
                                                '@id': 'http://example.org/list1',
                                                '@type': 'sc:AnnotationList',
                                            },
                                        ],
                                        annotations: [
                                            // v3 style
                                            {
                                                id: 'http://example.org/list2',
                                                type: 'AnnotationPage',
                                            },
                                        ],
                                    },
                                };
                            }
                            return null;
                        },
                    },
                ],
            };
        }),
    };
});

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
    });

    describe('fetchManifest', () => {
        it('should fetch and store a manifest', async () => {
            const mockManifest = {
                '@id': 'http://example.org/manifest',
                label: 'Test Manifest',
            };
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockManifest,
            } as Response);

            await state.fetchManifest('http://example.org/manifest');

            expect(mockFetch).toHaveBeenCalledWith(
                'http://example.org/manifest',
            );
            expect(
                state.manifests['http://example.org/manifest'],
            ).toBeDefined();
            expect(state.manifests['http://example.org/manifest'].json).toEqual(
                mockManifest,
            );
            expect(
                state.manifests['http://example.org/manifest'].isFetching,
            ).toBe(false);
            expect(manifesto.parseManifest).toHaveBeenCalledWith(mockManifest);
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
    });

    describe('getCanvases', () => {
        it('should return canvases from parsed manifest', async () => {
            // Mock internal state directly to avoid fetch overhead
            state.manifests['http://example.org/manifest'] = {
                manifesto: {
                    getSequences: () => [
                        {
                            getCanvases: () => ['mockCanvas1', 'mockCanvas2'],
                        },
                    ],
                },
            };

            const canvases = state.getCanvases('http://example.org/manifest');
            expect(canvases).toEqual(['mockCanvas1', 'mockCanvas2']);
        });

        it('should return empty array if manifest not found', () => {
            const canvases = state.getCanvases('http://example.org/missing');
            expect(canvases).toEqual([]);
        });
    });

    describe('manualGetAnnotations', () => {
        it('should extract annotations and trigger fetch for external lists', async () => {
            // Setup mock state with a manifest that has a canvas
            state.manifests['http://example.org/manifest'] = {
                manifesto: {
                    getSequences: () => [
                        {
                            getCanvasById: () => ({
                                __jsonld: {
                                    otherContent: [
                                        { '@id': 'http://example.org/list1' },
                                    ],
                                },
                            }),
                        },
                    ],
                },
            };

            // Mock the fetch for the annotation list
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({ resources: [{ '@id': 'anno1' }] }),
            } as Response);

            // First call triggers fetch
            // manualGetAnnotations calls fetchAnnotationList which is async, but manualGetAnnotations itself is synchronous and returns partial data
            state.manualGetAnnotations(
                'http://example.org/manifest',
                'canvas1',
            );

            // We need to wait for the async fetchAnnotationList to complete.
            // Since it's not returned, we can wait a tick or use `vi.waitFor` if available,
            // but simpler here is just to await a small delay since we are mocking.
            await new Promise((resolve) => setTimeout(resolve, 0));

            expect(mockFetch).toHaveBeenCalledWith('http://example.org/list1');

            // Simulate update after fetch (in real app this is reactive, here we manually update state)
            state.manifests['http://example.org/list1'] = {
                json: { resources: [{ '@id': 'anno1' }] },
            };

            // Second call should return the annotations
            const annos = state.manualGetAnnotations(
                'http://example.org/manifest',
                'canvas1',
            );
            expect(annos).toHaveLength(1);
            expect(annos[0]['@id']).toBe('anno1');
        });
    });
});
