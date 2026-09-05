import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { manifestsState } from './manifests.svelte';
import { ViewerState } from './viewer.svelte';
import {
    manifestV2WithSearch,
    manifestV2WithoutSearch,
    manifestV3WithSearchV2,
} from '../test/fixtures/manifests';
import {
    searchResponseWithHits,
    searchResponseWithResourcesOnly,
    searchResponseEmpty,
    searchResponseMultiCanvas,
    searchResponseV2WithContext,
    searchResponseV2ItemsOnly,
    searchResponseV2ItemsWithTargetArray,
    searchResponseV2MultiCanvas,
    searchResponseV2Empty,
} from '../test/fixtures/searchResponses';
import type { ViewerError } from '../types/viewerError';

/**
 * IIIF Content Search through the epic's one seam — a real `ViewerState` loaded
 * with raw manifest JSON, backed by the real manifest cache, with no mocks and
 * no hand-built canvases (`remove-manifesto` SPEC → "The seam").
 *
 * This file used to `vi.mock` BOTH `manifesto.js`'s parse entry point and the
 * manifest cache, and fed a hand-built manifest double carrying `getSequences`,
 * `getCanvasById` and `getService`. It could not serve as an oracle for this
 * epic — it asserted on the abstraction being removed, and the search-service
 * lookup it exercised was the double's `getService`, not the product's
 * (`remove-manifesto` ticket 08).
 *
 * Everything the network sees is still observed the same way: the exact URL the
 * viewer fetches, and the results and annotations it derives from the response.
 * The only thing stubbed is `fetch` itself.
 */

const MANIFEST_ID = 'http://example.org/manifest';
const CANVAS_1 = 'http://example.org/canvas/1';
const CANVAS_2 = 'http://example.org/canvas/2';

const V1_SERVICE = {
    '@id': 'http://example.org/search',
    profile: 'http://iiif.io/api/search/1/search',
};

const V0_SERVICE = {
    '@id': 'http://example.org/search-v0',
    profile: 'http://iiif.io/api/search/0/search',
};

const V2_SERVICE = {
    id: 'http://example.org/search-v2',
    type: 'SearchService2',
};

/**
 * A two-canvas manifest carrying the given search service declaration.
 *
 * Both canvases are the ones every search fixture targets, so the response
 * parsing below groups against real canvases from real state rather than
 * against a list handed to a mocked cache.
 */
function manifestWithService(service: unknown, suffix: string) {
    const base = structuredClone(manifestV2WithSearch) as any;
    base['@id'] = `${MANIFEST_ID}/${suffix}`;
    if (service === undefined) {
        delete base.service;
    } else {
        base.service = service;
    }
    return base;
}

describe('ViewerState - IIIF Search', () => {
    let state: ViewerState;
    const mockFetch = vi.fn();
    const registeredIds: string[] = [];

    beforeEach(() => {
        vi.stubGlobal('fetch', mockFetch);
        state = new ViewerState();
        mockFetch.mockReset();
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

    /** Load a two-canvas manifest declaring `service`. */
    async function loadWithService(service: unknown, suffix: string) {
        await load(manifestWithService(service, suffix));
    }

    describe('Search service detection', () => {
        it('should use a custom search provider when one is set', async () => {
            await loadWithService(undefined, 'custom-provider');
            state.setSearchProvider(async () => [
                {
                    canvasIndex: 0,
                    canvasLabel: 'Page 1',
                    hits: [
                        {
                            type: 'hit',
                            before: 'before ',
                            match: 'term',
                            after: ' after',
                        },
                    ],
                },
            ]);

            await state.search('term');

            expect(mockFetch).not.toHaveBeenCalled();
            expect(state.searchResults).toHaveLength(1);
            expect(state.searchResults[0]?.canvasLabel).toBe('Page 1');
        });

        it('should detect IIIF Search API v1 service', async () => {
            await loadWithService(V1_SERVICE, 'v1');

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
            await loadWithService(V0_SERVICE, 'v0');

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => searchResponseEmpty,
            });

            await state.search('query');

            expect(mockFetch).toHaveBeenCalledWith(
                'http://example.org/search-v0?q=query',
            );
        });

        it('should find the search service among a service array', async () => {
            await loadWithService(
                [
                    {
                        '@id': 'http://example.org/other-service',
                        profile: 'http://other.org/service',
                    },
                    V1_SERVICE,
                ],
                'service-array',
            );

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => searchResponseEmpty,
            });

            await state.search('test');

            expect(mockFetch).toHaveBeenCalledWith(
                'http://example.org/search?q=test',
            );
        });

        it('should handle missing search service gracefully', async () => {
            // A real manifest that declares no search service at all.
            await load(structuredClone(manifestV2WithoutSearch));

            // Ticket 18: an unavailable search service is reported through the
            // structured `viewererror` channel, not bare console output.
            const reported: ViewerError[] = [];
            state.setErrorReporter((e) => reported.push(e));

            await state.search('test');

            expect(mockFetch).not.toHaveBeenCalled();
            expect(reported).toHaveLength(1);
            expect(reported[0].code).toBe('search-service-missing');
            expect(reported[0].scope).toBe('search');
            expect(state.isSearching).toBe(false);
        });
    });

    describe('Query execution', () => {
        beforeEach(async () => {
            await loadWithService(V1_SERVICE, 'query-execution');
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
        beforeEach(async () => {
            await loadWithService(V1_SERVICE, 'hits');
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
                match: '&lt;mark&gt;test&lt;/mark&gt;',
                after: ' result on page one',
            });
        });

        /**
         * The excerpt fields are plain text by contract, so state carries the
         * service's bytes through untouched. It used to un-escape
         * `&lt;mark&gt;` on the way to four `{@html}` sinks; the panel now
         * segments the delimiters itself and renders text nodes, so nothing
         * here rewrites what the service said.
         */
        it('carries the service text through unmodified', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => searchResponseWithHits,
            });

            await state.search('test');

            const firstHit = state.searchResults[0].hits[0];
            expect(firstHit.match).toBe('&lt;mark&gt;test&lt;/mark&gt;');
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
        beforeEach(async () => {
            await loadWithService(V0_SERVICE, 'resources');
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
                match: '&lt;mark&gt;word&lt;/mark&gt;',
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
            expect(firstHit.match).toBe('&lt;mark&gt;word&lt;/mark&gt;');
        });
    });

    describe('Group results by canvas', () => {
        beforeEach(async () => {
            await loadWithService(V1_SERVICE, 'grouping');
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
        beforeEach(async () => {
            await loadWithService(V1_SERVICE, 'annotations');
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
            expect(anno.on).toBe(`${CANVAS_1}#xywh=100,100,50,20`);
        });

        it('should set canvasId on annotations', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => searchResponseWithHits,
            });

            await state.search('test');

            const anno = state.searchAnnotations[0];
            expect(anno.canvasId).toBe(CANVAS_1);
        });

        it('should include match text, without its mark delimiters, in the annotation resource', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => searchResponseWithHits,
            });

            await state.search('test');

            // The service's match is `&lt;mark&gt;test&lt;/mark&gt;`. The
            // annotation panel shows `chars` to the reader, so the delimiters
            // come off rather than being displayed.
            const anno = state.searchAnnotations[0];
            expect(anno.resource.chars).toBe('test');
        });

        it('should create multiple annotations for hits with multiple bounds', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => searchResponseWithHits,
            });

            await state.search('test');

            // Second canvas hit has 2 bounds, should create 2 annotations
            const canvas2Annos = state.searchAnnotations.filter(
                (a) => a.canvasId === CANVAS_2,
            );
            expect(canvas2Annos).toHaveLength(2);
        });
    });

    describe('Deferred search', () => {
        it('should defer search when manifest not loaded', async () => {
            // No manifest has been loaded into the real cache at all.
            expect(state.manifestId).toBeNull();

            await state.search('deferred query');

            // Ticket 18: the deferral is a debug-only diagnostic (silent by
            // default). Assert the observable behavior instead of console output.
            expect(mockFetch).not.toHaveBeenCalled();
            expect(state.pendingSearchQuery).toBe('deferred query');
        });
    });

    describe('Error handling', () => {
        beforeEach(async () => {
            await loadWithService(V1_SERVICE, 'errors');
        });

        it('should handle network failures', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Network error'));

            // Ticket 18: a failed search is reported through the structured
            // `viewererror` channel, not bare console output.
            const reported: ViewerError[] = [];
            state.setErrorReporter((e) => reported.push(e));

            await state.search('test');

            expect(reported).toHaveLength(1);
            expect(reported[0].code).toBe('search-failed');
            expect(reported[0].severity).toBe('error');
            expect(reported[0].error).toBeInstanceOf(Error);
            expect(state.isSearching).toBe(false);
        });

        it('should handle non-OK responses', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 500,
            });

            const reported: ViewerError[] = [];
            state.setErrorReporter((e) => reported.push(e));

            await state.search('test');

            expect(reported).toHaveLength(1);
            expect(reported[0].code).toBe('search-failed');
            expect(reported[0].severity).toBe('error');
            expect(state.isSearching).toBe(false);
        });

        it('should reset isSearching flag on error', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Test error'));

            await state.search('test');

            expect(state.isSearching).toBe(false);
        });
    });

    describe('Empty results', () => {
        beforeEach(async () => {
            await loadWithService(V1_SERVICE, 'empty');
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

    // ==================== IIIF Content Search API v2 ====================

    describe('Search API v2 - Service detection', () => {
        it('should detect v2 service by type: SearchService2', async () => {
            // A real IIIF v3 manifest declaring a SearchService2.
            await load(structuredClone(manifestV3WithSearchV2));

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => searchResponseV2Empty,
            });

            await state.search('test');

            expect(mockFetch).toHaveBeenCalledWith(
                'http://example.org/search-v2?q=test',
            );
        });

        it('should detect a v2 service declared as a bare object', async () => {
            await loadWithService(V2_SERVICE, 'v2-bare-object');

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => searchResponseV2Empty,
            });

            await state.search('test');

            expect(mockFetch).toHaveBeenCalledWith(
                'http://example.org/search-v2?q=test',
            );
        });

        it('should prefer v2 over v1 when both are present', async () => {
            await loadWithService([V1_SERVICE, V2_SERVICE], 'v2-over-v1');

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => searchResponseV2Empty,
            });

            await state.search('test');

            expect(mockFetch).toHaveBeenCalledWith(
                'http://example.org/search-v2?q=test',
            );
        });
    });

    describe('Search API v2 - Parse response with context', () => {
        beforeEach(async () => {
            await loadWithService([V2_SERVICE], 'v2-context');
        });

        it('should parse v2 items with annotations context (prefix/exact/suffix)', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => searchResponseV2WithContext,
            });

            await state.search('test');

            expect(state.searchResults).toHaveLength(2); // 2 canvases
            expect(state.searchResults[0].hits[0]).toMatchObject({
                type: 'hit',
                before: 'This is a ',
                match: '&lt;mark&gt;test&lt;/mark&gt;',
                after: ' result on page one',
            });
            expect(state.searchResults[1].hits[0]).toMatchObject({
                type: 'hit',
                before: 'Another ',
                match: '&lt;mark&gt;test&lt;/mark&gt;',
                after: ' result on page two',
            });
        });

        it('carries the v2 service text through unmodified', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => searchResponseV2WithContext,
            });

            await state.search('test');

            const firstHit = state.searchResults[0].hits[0];
            expect(firstHit.match).toBe('&lt;mark&gt;test&lt;/mark&gt;');
        });

        it('should extract xywh bounds from v2 target strings', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => searchResponseV2WithContext,
            });

            await state.search('test');

            const firstHit = state.searchResults[0].hits[0];
            expect(firstHit.bounds).toEqual([100, 100, 50, 20]);
        });

        it('should generate search annotations from v2 results', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => searchResponseV2WithContext,
            });

            await state.search('test');

            expect(state.searchAnnotations.length).toBeGreaterThan(0);
            expect(state.searchAnnotations[0]).toMatchObject({
                isSearchHit: true,
                '@type': 'oa:Annotation',
                motivation: 'sc:painting',
            });
            expect(state.searchAnnotations[0].on).toBe(
                `${CANVAS_1}#xywh=100,100,50,20`,
            );
        });
    });

    describe('Search API v2 - Parse items-only response (no annotations)', () => {
        beforeEach(async () => {
            await loadWithService([V2_SERVICE], 'v2-items-only');
        });

        it('should parse v2 items-only response as resource type', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => searchResponseV2ItemsOnly,
            });

            await state.search('word');

            expect(state.searchResults).toHaveLength(1); // 1 canvas
            expect(state.searchResults[0].hits).toHaveLength(2);
            expect(state.searchResults[0].hits[0]).toMatchObject({
                type: 'resource',
                match: '&lt;mark&gt;word&lt;/mark&gt;',
            });
        });

        it('should extract text from body.value when no annotations context', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => searchResponseV2ItemsOnly,
            });

            await state.search('word');

            const firstHit = state.searchResults[0].hits[0];
            expect(firstHit.match).toBe('&lt;mark&gt;word&lt;/mark&gt;');
        });

        it('should extract bounds from v2 items-only response', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => searchResponseV2ItemsOnly,
            });

            await state.search('word');

            const firstHit = state.searchResults[0].hits[0];
            expect(firstHit.bounds).toEqual([50, 50, 100, 25]);
        });

        it('should keep v2 hits when items.target is an array', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => searchResponseV2ItemsWithTargetArray,
            });

            await state.search('alpha');

            expect(state.searchResults).toHaveLength(1);
            expect(state.searchResults[0].hits).toHaveLength(1);
            expect(state.searchResults[0].hits[0]).toMatchObject({
                type: 'resource',
                match: '&lt;mark&gt;alpha&lt;/mark&gt; foo &lt;mark&gt;beta&lt;/mark&gt;',
                bounds: [1, 2, 3, 4],
            });
            expect(state.searchResults[0].hits[0].allBounds).toEqual([
                [1, 2, 3, 4],
                [9, 10, 11, 12],
            ]);
        });
    });

    describe('Search API v2 - Multi-canvas results', () => {
        beforeEach(async () => {
            await loadWithService([V2_SERVICE], 'v2-multi-canvas');
        });

        it('should group v2 results by canvas index', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => searchResponseV2MultiCanvas,
            });

            await state.search('common');

            expect(state.searchResults).toHaveLength(2);
            expect(state.searchResults[0].canvasIndex).toBe(0);
            expect(state.searchResults[0].hits).toHaveLength(2);
            expect(state.searchResults[1].canvasIndex).toBe(1);
            expect(state.searchResults[1].hits).toHaveLength(2);
        });

        it('should extract canvas labels for v2 results', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => searchResponseV2MultiCanvas,
            });

            await state.search('common');

            expect(state.searchResults[0].canvasLabel).toBe('Page 1');
            expect(state.searchResults[1].canvasLabel).toBe('Page 2');
        });

        it('should sort v2 results by canvas index', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => searchResponseV2MultiCanvas,
            });

            await state.search('common');

            const indices = state.searchResults.map((r) => r.canvasIndex);
            expect(indices).toEqual([0, 1]);
        });

        it('should map v2 context prefix/exact/suffix to before/match/after', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => searchResponseV2MultiCanvas,
            });

            await state.search('common');

            expect(state.searchResults[0].hits[0]).toMatchObject({
                type: 'hit',
                before: 'First ',
                match: 'common',
                after: ' word',
            });
            expect(state.searchResults[1].hits[1]).toMatchObject({
                type: 'hit',
                before: 'Fourth ',
                match: 'common',
                after: ' word',
            });
        });
    });

    describe('Search API v2 - Empty results', () => {
        beforeEach(async () => {
            await loadWithService([V2_SERVICE], 'v2-empty');
        });

        it('should handle empty v2 search results', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => searchResponseV2Empty,
            });

            await state.search('notfound');

            expect(state.searchResults).toEqual([]);
            expect(state.searchAnnotations).toEqual([]);
            expect(state.isSearching).toBe(false);
        });
    });

    describe('Config updates', () => {
        /**
         * Serve IIIF resources by URL through the real fetch path, so
         * `setManifest` walks its own collection detection, registration and
         * thumbnail hydration rather than having each step handed to it.
         */
        function serveResources(byUrl: Record<string, unknown>) {
            mockFetch.mockImplementation(async (url: string) => {
                const json = byUrl[url];
                if (!json) {
                    return { ok: false, status: 404 };
                }
                registeredIds.push(url);
                return { ok: true, json: async () => structuredClone(json) };
            });
        }

        it('applies information, structures, and collection panel config without dropping plugin UI config', () => {
            state.registerSdkChrome({
                id: 'plugin-a',
                name: 'Plugin A',
                icon: { kind: 'svg', inner: '', viewBox: '0 0 1 1' },
                target: 'panel',
                dismiss: 'light',
                mount: () => () => {},
            });

            state.updateConfig({
                plugins: {
                    'plugin-a': {
                        open: true,
                        visible: false,
                    },
                },
            });

            state.updateConfig({
                information: { open: true },
                structures: { open: true },
                collection: { open: true },
                plugins: {
                    'plugin-a': {
                        open: true,
                        visible: false,
                    },
                },
            });

            expect(state.showMetadataPanel).toBe(true);
            expect(state.showStructuresPanel).toBe(true);
            expect(state.showCollectionPanel).toBe(true);
            expect(state.pluginMenuButtons[0]?.isActive?.()).toBe(true);
            expect(state.pluginMenuButtons[0]?.isVisible?.()).toBe(false);
            expect(state.pluginPanels[0]?.isVisible()).toBe(true);
        });

        it('clears collection state when switching from a collection to a plain manifest', async () => {
            serveResources({
                'http://example.org/collection': {
                    id: 'http://example.org/collection',
                    type: 'Collection',
                    label: { none: ['Test collection'] },
                    thumbnail: [
                        {
                            id: 'http://example.org/collection-thumb/full/max/0/default.jpg',
                            type: 'Image',
                            service: [
                                {
                                    id: 'http://example.org/collection-thumb',
                                    type: 'ImageService3',
                                    profile: 'level1',
                                },
                            ],
                        },
                    ],
                    items: [
                        {
                            id: 'http://example.org/manifest/in-collection',
                            type: 'Manifest',
                            label: { none: ['Manifest in collection'] },
                        },
                    ],
                },
                'http://example.org/manifest/in-collection': {
                    id: 'http://example.org/manifest/in-collection',
                    type: 'Manifest',
                    label: { none: ['Manifest in collection'] },
                    items: [],
                },
                'http://example.org/plain-manifest': {
                    id: 'http://example.org/plain-manifest',
                    type: 'Manifest',
                    label: { none: ['Plain manifest'] },
                    items: [],
                },
            });

            state.updateConfig({
                collection: { open: true },
            });

            await state.setManifest('http://example.org/collection');

            expect(state.showCollectionPanel).toBe(true);
            expect(state.collectionId).toBe('http://example.org/collection');
            expect(state.collectionLabel).toBe('Test collection');
            expect(state.collectionThumbnail).toBe(
                'http://example.org/collection-thumb/full/200,/0/default.jpg',
            );
            expect(state.collectionItems).toHaveLength(1);
            expect(state.hasCollection).toBe(true);
            expect(state.manifestId).toBe(
                'http://example.org/manifest/in-collection',
            );

            await state.setManifest('http://example.org/plain-manifest');

            expect(state.showCollectionPanel).toBe(true);
            expect(state.collectionId).toBeNull();
            expect(state.collectionLabel).toBe('');
            expect(state.collectionThumbnail).toBe('');
            expect(state.collectionItems).toEqual([]);
            expect(state.hasCollection).toBe(false);
            expect(state.manifestId).toBe('http://example.org/plain-manifest');
        });

        it('hydrates missing collection item thumbnails from the first canvas', async () => {
            serveResources({
                'http://example.org/collection': {
                    id: 'http://example.org/collection',
                    type: 'Collection',
                    label: { none: ['Test collection'] },
                    items: [
                        {
                            id: 'http://example.org/manifest/in-collection',
                            type: 'Manifest',
                            label: { none: ['Manifest in collection'] },
                        },
                    ],
                },
                'http://example.org/manifest/in-collection': {
                    id: 'http://example.org/manifest/in-collection',
                    type: 'Manifest',
                    label: { none: ['Manifest in collection'] },
                    items: [
                        {
                            id: CANVAS_1,
                            type: 'Canvas',
                            label: { none: ['Page 1'] },
                            width: 800,
                            height: 1000,
                            thumbnail: [
                                {
                                    id: 'http://example.org/thumb/full/max/0/default.jpg',
                                    type: 'Image',
                                    service: [
                                        {
                                            id: 'http://example.org/thumb',
                                            type: 'ImageService3',
                                            profile: 'level1',
                                        },
                                    ],
                                },
                            ],
                            items: [],
                        },
                    ],
                },
            });

            await state.setManifest('http://example.org/collection');

            await vi.waitFor(() => {
                expect(state.collectionItems[0]?.thumbnail).toBe(
                    'http://example.org/thumb/full/200,/0/default.jpg',
                );
            });
        });
    });
});
