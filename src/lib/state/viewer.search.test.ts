import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ViewerState } from './viewer.svelte';
import * as manifesto from 'manifesto.js';
import {
    searchResponseWithHits,
    searchResponseWithResourcesOnly,
    searchResponseEmpty,
    searchResponseMultiCanvas,
} from '../test/fixtures/searchResponses';

// Mock manifesto.js
vi.mock('manifesto.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('manifesto.js')>();
    return {
        ...actual,
        parseManifest: vi.fn((json) => {
            // Create mock manifest with search service
            const mockCanvases = [
                {
                    id: 'http://example.org/canvas/1',
                    getLabel: () => [{ value: 'Page 1' }],
                },
                {
                    id: 'http://example.org/canvas/2',
                    getLabel: () => [{ value: 'Page 2' }],
                },
            ];

            // Handle both single service and service array
            let services = [];
            if (json.service) {
                services = Array.isArray(json.service) ? json.service : [json.service];
            }

            const searchService = services.find(
                (s: any) =>
                    s.profile === 'http://iiif.io/api/search/1/search' ||
                    s.profile === 'http://iiif.io/api/search/0/search'
            );

            return {
                getSequences: () => [
                    {
                        getCanvases: () => mockCanvases,
                        getCanvasById: (id: string) =>
                            mockCanvases.find((c) => c.id === id) || null,
                    },
                ],
                getService: (profile: string) => {
                    if (
                        searchService &&
                        (profile === searchService.profile ||
                            profile === 'http://iiif.io/api/search/1/search' ||
                            profile === 'http://iiif.io/api/search/0/search')
                    ) {
                        return {
                            id: searchService.id || searchService['@id'],
                            '@id': searchService.id || searchService['@id'],
                            profile: searchService.profile,
                        };
                    }
                    return null;
                },
                __jsonld: json,
            };
        }),
    };
});

// Import manifests state for mocking
import { manifestsState } from './manifests.svelte';

// Mock manifests state
vi.mock('./manifests.svelte', () => ({
    manifestsState: {
        fetchManifest: vi.fn(),
        getManifest: vi.fn(),
        getManifestEntry: vi.fn(),
        getCanvases: vi.fn(() => []),
    },
}));

describe('ViewerState - IIIF Search', () => {
    let state: ViewerState;
    const mockFetch = vi.fn();

    beforeEach(() => {
        vi.stubGlobal('fetch', mockFetch);
        state = new ViewerState();
        mockFetch.mockReset();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    /**
     * Helper to setup a mock manifest with canvases
     */
    function setupMockManifest(manifestJson: any) {
        const mockManifest = manifesto.parseManifest(manifestJson);
        const mockCanvases = mockManifest.getSequences()[0].getCanvases();

        vi.mocked(manifestsState.getManifest).mockReturnValue(mockManifest);
        vi.mocked(manifestsState.getCanvases).mockReturnValue(mockCanvases);

        return { mockManifest, mockCanvases };
    }

    describe('Search service detection', () => {
        it('should detect IIIF Search API v1 service', async () => {
            const mockManifestJson = {
                '@id': 'http://example.org/manifest',
                service: {
                    '@id': 'http://example.org/search',
                    profile: 'http://iiif.io/api/search/1/search',
                },
            };

            setupMockManifest(mockManifestJson);
            state.manifestId = 'http://example.org/manifest';

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => searchResponseEmpty,
            });

            await state.search('test');

            expect(mockFetch).toHaveBeenCalledWith(
                'http://example.org/search?q=test',
            );
        });

        it('should detect IIIF Search API v0 service', async () => {
            const mockManifestJson = {
                '@id': 'http://example.org/manifest',
                service: {
                    '@id': 'http://example.org/search-v0',
                    profile: 'http://iiif.io/api/search/0/search',
                },
            };

            setupMockManifest(mockManifestJson);
            state.manifestId = 'http://example.org/manifest';

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => searchResponseEmpty,
            });

            await state.search('query');

            expect(mockFetch).toHaveBeenCalledWith(
                'http://example.org/search-v0?q=query',
            );
        });

        it('should fallback to raw JSON when manifesto getService fails', async () => {
            const mockManifestJson = {
                '@id': 'http://example.org/manifest',
                service: [
                    {
                        '@id': 'http://example.org/other-service',
                        profile: 'http://other.org/service',
                    },
                    {
                        '@id': 'http://example.org/search',
                        profile: 'http://iiif.io/api/search/1/search',
                    },
                ],
            };

            setupMockManifest(mockManifestJson);
            state.manifestId = 'http://example.org/manifest';

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => searchResponseEmpty,
            });

            await state.search('test');

            // Should still find the service in the raw JSON
            expect(mockFetch).toHaveBeenCalledWith(
                'http://example.org/search?q=test',
            );
        });

        it('should handle missing search service gracefully', async () => {
            const mockManifestJson = {
                '@id': 'http://example.org/manifest',
            };

            setupMockManifest(mockManifestJson);
            state.manifestId = 'http://example.org/manifest';

            const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            await state.search('test');

            expect(mockFetch).not.toHaveBeenCalled();
            expect(consoleSpy).toHaveBeenCalledWith(
                'No IIIF search service found in manifest',
            );
            expect(state.isSearching).toBe(false);

            consoleSpy.mockRestore();
        });
    });

    describe('Query execution', () => {
        beforeEach(() => {
            const mockManifestJson = {
                '@id': 'http://example.org/manifest',
                service: {
                    '@id': 'http://example.org/search',
                    profile: 'http://iiif.io/api/search/1/search',
                },
            };

            setupMockManifest(mockManifestJson);
            state.manifestId = 'http://example.org/manifest';
        });

        it('should URL encode search query', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => searchResponseEmpty,
            });

            await state.search('test query with spaces');

            expect(mockFetch).toHaveBeenCalledWith(
                'http://example.org/search?q=test%20query%20with%20spaces',
            );
        });

        it('should handle special characters in query', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => searchResponseEmpty,
            });

            await state.search('test&query=special');

            expect(mockFetch).toHaveBeenCalledWith(
                'http://example.org/search?q=test%26query%3Dspecial',
            );
        });

        it('should not search with empty query', async () => {
            await state.search('');
            expect(mockFetch).not.toHaveBeenCalled();

            await state.search('   ');
            expect(mockFetch).not.toHaveBeenCalled();
        });

        it('should update searchQuery state', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => searchResponseEmpty,
            });

            await state.search('my query');

            expect(state.searchQuery).toBe('my query');
        });
    });

    describe('Parse "hits" format', () => {
        beforeEach(() => {
            const mockManifestJson = {
                '@id': 'http://example.org/manifest',
                service: {
                    '@id': 'http://example.org/search',
                    profile: 'http://iiif.io/api/search/1/search',
                },
            };

            setupMockManifest(mockManifestJson);
            state.manifestId = 'http://example.org/manifest';
        });

        it('should parse hits with before/match/after text', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => searchResponseWithHits,
            });

            await state.search('test');

            expect(state.searchResults).toHaveLength(2); // 2 canvases
            expect(state.searchResults[0].hits[0]).toMatchObject({
                type: 'hit',
                before: 'This is a ',
                match: '<mark>test</mark>',
                after: ' result on page one',
            });
        });

        it('should decode HTML entities in match text', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => searchResponseWithHits,
            });

            await state.search('test');

            const firstHit = state.searchResults[0].hits[0];
            // The fixture has &lt;mark&gt; which should be decoded to <mark>
            expect(firstHit.match).toContain('<mark>');
            expect(firstHit.match).not.toContain('&lt;');
        });

        it('should extract xywh coordinates from annotations', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => searchResponseWithHits,
            });

            await state.search('test');

            const firstHit = state.searchResults[0].hits[0];
            expect(firstHit.bounds).toEqual([100, 100, 50, 20]);
        });

        it('should collect all bounds when hit has multiple annotations', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => searchResponseWithHits,
            });

            await state.search('test');

            // Second hit has 2 annotations
            const secondCanvasHit = state.searchResults[1].hits[0];
            expect(secondCanvasHit.allBounds).toHaveLength(2);
            expect(secondCanvasHit.allBounds).toEqual([
                [200, 150, 50, 20],
                [300, 200, 50, 20],
            ]);
        });
    });

    describe('Parse "resources" format (Basic level)', () => {
        beforeEach(() => {
            const mockManifestJson = {
                '@id': 'http://example.org/manifest',
                service: {
                    '@id': 'http://example.org/search',
                    profile: 'http://iiif.io/api/search/0/search',
                },
            };

            setupMockManifest(mockManifestJson);
            state.manifestId = 'http://example.org/manifest';
        });

        it('should parse resources-only response', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => searchResponseWithResourcesOnly,
            });

            await state.search('word');

            expect(state.searchResults).toHaveLength(1);
            expect(state.searchResults[0].hits).toHaveLength(2);
            expect(state.searchResults[0].hits[0]).toMatchObject({
                type: 'resource',
                match: '<mark>word</mark>',
            });
        });

        it('should extract bounds from resource annotations', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => searchResponseWithResourcesOnly,
            });

            await state.search('word');

            const firstHit = state.searchResults[0].hits[0];
            expect(firstHit.bounds).toEqual([50, 50, 100, 25]);
        });

        it('should extract text from resource.chars', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => searchResponseWithResourcesOnly,
            });

            await state.search('word');

            const firstHit = state.searchResults[0].hits[0];
            expect(firstHit.match).toBe('<mark>word</mark>');
        });
    });

    describe('Group results by canvas', () => {
        beforeEach(() => {
            const mockManifestJson = {
                '@id': 'http://example.org/manifest',
                service: {
                    '@id': 'http://example.org/search',
                    profile: 'http://iiif.io/api/search/1/search',
                },
            };

            setupMockManifest(mockManifestJson);
            state.manifestId = 'http://example.org/manifest';
        });

        it('should group results by canvas index', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => searchResponseMultiCanvas,
            });

            await state.search('common');

            expect(state.searchResults).toHaveLength(2);
            expect(state.searchResults[0].canvasIndex).toBe(0);
            expect(state.searchResults[0].hits).toHaveLength(2);
            expect(state.searchResults[1].canvasIndex).toBe(1);
            expect(state.searchResults[1].hits).toHaveLength(2);
        });

        it('should extract canvas labels', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => searchResponseMultiCanvas,
            });

            await state.search('common');

            expect(state.searchResults[0].canvasLabel).toBe('Page 1');
            expect(state.searchResults[1].canvasLabel).toBe('Page 2');
        });

        it('should sort results by canvas index', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => searchResponseMultiCanvas,
            });

            await state.search('common');

            const indices = state.searchResults.map((r) => r.canvasIndex);
            expect(indices).toEqual([0, 1]);
        });
    });

    describe('Generate search annotations', () => {
        beforeEach(() => {
            const mockManifestJson = {
                '@id': 'http://example.org/manifest',
                service: {
                    '@id': 'http://example.org/search',
                    profile: 'http://iiif.io/api/search/1/search',
                },
            };

            setupMockManifest(mockManifestJson);
            state.manifestId = 'http://example.org/manifest';
        });

        it('should generate search annotations with isSearchHit flag', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => searchResponseWithHits,
            });

            await state.search('test');

            expect(state.searchAnnotations.length).toBeGreaterThan(0);
            expect(state.searchAnnotations[0]).toMatchObject({
                isSearchHit: true,
                '@type': 'oa:Annotation',
                motivation: 'sc:painting',
            });
        });

        it('should generate annotations with xywh fragments', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => searchResponseWithHits,
            });

            await state.search('test');

            const anno = state.searchAnnotations[0];
            expect(anno.on).toMatch(/xywh=\d+,\d+,\d+,\d+/);
            expect(anno.on).toBe('http://example.org/canvas/1#xywh=100,100,50,20');
        });

        it('should set canvasId on annotations', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => searchResponseWithHits,
            });

            await state.search('test');

            const anno = state.searchAnnotations[0];
            expect(anno.canvasId).toBe('http://example.org/canvas/1');
        });

        it('should include match text in annotation resource', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => searchResponseWithHits,
            });

            await state.search('test');

            const anno = state.searchAnnotations[0];
            expect(anno.resource.chars).toBe('<mark>test</mark>');
        });

        it('should create multiple annotations for hits with multiple bounds', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => searchResponseWithHits,
            });

            await state.search('test');

            // Second canvas hit has 2 bounds, should create 2 annotations
            const canvas2Annos = state.searchAnnotations.filter(
                (a) => a.canvasId === 'http://example.org/canvas/2',
            );
            expect(canvas2Annos).toHaveLength(2);
        });
    });

    describe('Deferred search', () => {
        it('should defer search when manifest not loaded', async () => {
            state.manifestId = null;
            vi.mocked(manifestsState.getManifest).mockReturnValue(null);

            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

            await state.search('deferred query');

            expect(mockFetch).not.toHaveBeenCalled();
            expect(state.pendingSearchQuery).toBe('deferred query');
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('deferring search'),
                'deferred query',
            );

            consoleSpy.mockRestore();
        });
    });

    describe('Error handling', () => {
        beforeEach(() => {
            const mockManifestJson = {
                '@id': 'http://example.org/manifest',
                service: {
                    '@id': 'http://example.org/search',
                    profile: 'http://iiif.io/api/search/1/search',
                },
            };

            setupMockManifest(mockManifestJson);
            state.manifestId = 'http://example.org/manifest';
        });

        it('should handle network failures', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Network error'));

            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

            await state.search('test');

            expect(consoleSpy).toHaveBeenCalledWith(
                'Search error:',
                expect.any(Error),
            );
            expect(state.isSearching).toBe(false);

            consoleSpy.mockRestore();
        });

        it('should handle non-OK responses', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 500,
            });

            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

            await state.search('test');

            expect(consoleSpy).toHaveBeenCalledWith(
                'Search error:',
                expect.any(Error),
            );
            expect(state.isSearching).toBe(false);

            consoleSpy.mockRestore();
        });

        it('should reset isSearching flag on error', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Test error'));

            vi.spyOn(console, 'error').mockImplementation(() => {});

            await state.search('test');

            expect(state.isSearching).toBe(false);
        });
    });

    describe('Empty results', () => {
        beforeEach(() => {
            const mockManifestJson = {
                '@id': 'http://example.org/manifest',
                service: {
                    '@id': 'http://example.org/search',
                    profile: 'http://iiif.io/api/search/1/search',
                },
            };

            setupMockManifest(mockManifestJson);
            state.manifestId = 'http://example.org/manifest';
        });

        it('should handle empty search results', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => searchResponseEmpty,
            });

            await state.search('notfound');

            expect(state.searchResults).toEqual([]);
            expect(state.searchAnnotations).toEqual([]);
            expect(state.isSearching).toBe(false);
        });
    });
});
