import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { manifestsState } from './manifests.svelte';
import { ViewerState } from './viewer.svelte';
import {
    searchResponseEmpty,
    searchResponseV2Empty,
} from '../test/fixtures/searchResponses';
import { syntheticV2ViewingHints } from '../test/fixtures/syntheticManifests';
import type { ViewerError } from '../types/viewerError';

/**
 * The four manifest-level scalar reads — start canvas, viewing direction,
 * viewing behavior, and search-service discovery — against REAL parsing.
 *
 * Same seam as `viewer.startCanvas.test.ts` and the behavioral baseline: raw
 * manifest JSON goes in through `setManifestData`, backed by the real manifest
 * cache, with no mocks of `manifests.svelte` and no hand-built canvases. That
 * matters here specifically: `viewer.behavior.test.ts` (viewing direction and
 * mode) and `viewer.search.test.ts` (search discovery) both mock the manifest
 * cache and feed library-shaped doubles, so neither can show that these reads
 * work on the raw JSON a consumer actually has. This file can.
 *
 * The v2 and v3 spellings diverge per behavior with no consistent rule — start
 * canvas is on the manifest in v3 and on the sequence in v2, viewing direction
 * is the other way round — so each is exercised in both spellings separately
 * (`remove-manifesto` ticket 05).
 *
 * Where a v2 manifest declares a scalar at BOTH the root and the sequence, the
 * SEQUENCE wins. Presentation 2.1 says so in as many words for
 * `viewingDirection` — a manifest's direction "applies to all of its sequences
 * unless the sequence specifies its own viewing direction" — and `manifesto.js`
 * implemented that cascade; it was this call site that overrode it by asking
 * the manifest first. `viewingHint` has no stated precedence, so it follows the
 * rule the spec does state rather than inventing a second one. No manifest in
 * the corpus declares the same scalar at both levels with differing values, so
 * settling this moved no golden record.
 */

const CORPUS_DIR = join(import.meta.dirname, '../test/fixtures/manifests');

/**
 * Parsed fresh on every call. `manifesto.js` writes `__jsonld` back-references
 * onto whatever JSON it is handed, so a module-level parse would leak state
 * between tests and, worse, could make a raw-JSON read look like it worked when
 * it was the library object answering.
 */
function corpusManifest(path: string): any {
    return JSON.parse(readFileSync(join(CORPUS_DIR, path), 'utf8'));
}

const V2_BASE = 'http://example.org/v2-scalars';
const V3_BASE = 'http://example.org/v3-scalars';

function v2Canvas(id: string) {
    return {
        '@id': id,
        '@type': 'sc:Canvas',
        label: id,
        height: 1000,
        width: 800,
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
    { root, sequence }: { root?: object; sequence?: object } = {},
) {
    return {
        '@context': 'http://iiif.io/api/presentation/2/context.json',
        '@id': id,
        '@type': 'sc:Manifest',
        label: 'v2 manifest scalars',
        ...root,
        sequences: [
            {
                '@id': `${id}/sequence/normal`,
                '@type': 'sc:Sequence',
                ...sequence,
                canvases: [
                    v2Canvas(`${id}/canvas/1`),
                    v2Canvas(`${id}/canvas/2`),
                ],
            },
        ],
    };
}

function v3Manifest(id: string, root: object = {}) {
    const canvas = (canvasId: string) => ({
        id: canvasId,
        type: 'Canvas',
        label: { en: [canvasId] },
        height: 1000,
        width: 800,
        items: [
            {
                id: `${canvasId}/page`,
                type: 'AnnotationPage',
                items: [
                    {
                        id: `${canvasId}/annotation`,
                        type: 'Annotation',
                        motivation: 'painting',
                        target: canvasId,
                        body: {
                            id: `${canvasId}/image`,
                            type: 'Image',
                            format: 'image/jpeg',
                        },
                    },
                ],
            },
        ],
    });

    return {
        '@context': 'http://iiif.io/api/presentation/3/context.json',
        id,
        type: 'Manifest',
        label: { en: ['v3 manifest scalars'] },
        ...root,
        items: [canvas(`${id}/canvas/1`), canvas(`${id}/canvas/2`)],
    };
}

describe('ViewerState manifest-level scalars', () => {
    let state: ViewerState;
    const registeredIds: string[] = [];

    beforeEach(() => {
        state = new ViewerState();
    });

    afterEach(() => {
        for (const id of registeredIds.splice(0)) {
            manifestsState.clearManifest(id);
        }
        vi.restoreAllMocks();
    });

    async function load(json: any): Promise<ViewerState> {
        const id = json.id || json['@id'];
        registeredIds.push(id);
        await state.setManifestData(id, json);
        return state;
    }

    // ------------------------------------------------------------------
    // Start canvas
    // ------------------------------------------------------------------

    describe('start canvas', () => {
        it('resolves the IIIF v3 `start` property from a Cookbook recipe', async () => {
            await load(corpusManifest('cookbook/0202-start-canvas.json'));

            expect(state.startCanvasId).toBe(
                'https://iiif.io/api/cookbook/recipe/0202-start-canvas/canvas/p2',
            );
            expect(state.canvasId).toBe(state.startCanvasId);
        });

        it('resolves an IIIF v2 sequence `startCanvas`', async () => {
            await load(
                v2Manifest(`${V2_BASE}/start`, {
                    sequence: { startCanvas: `${V2_BASE}/start/canvas/2` },
                }),
            );

            expect(state.startCanvasId).toBe(`${V2_BASE}/start/canvas/2`);
        });
    });

    // ------------------------------------------------------------------
    // Viewing direction
    // ------------------------------------------------------------------

    describe('viewing direction', () => {
        it('reads right-to-left from the v3 manifest root (Cookbook 0010)', async () => {
            await load(
                corpusManifest(
                    'cookbook/0010-book-2-viewing-direction-manifest-rtl.json',
                ),
            );

            expect(state.viewingDirection).toBe('right-to-left');
        });

        it('reads top-to-bottom from the v3 manifest root (Cookbook 0010)', async () => {
            await load(
                corpusManifest(
                    'cookbook/0010-book-2-viewing-direction-manifest-ttb.json',
                ),
            );

            expect(state.viewingDirection).toBe('top-to-bottom');
        });

        it('reads the v2 manifest root', async () => {
            await load(
                v2Manifest(`${V2_BASE}/direction-root`, {
                    root: { viewingDirection: 'right-to-left' },
                }),
            );

            expect(state.viewingDirection).toBe('right-to-left');
        });

        it('reads a v2 SEQUENCE-level viewingDirection', async () => {
            // The spelling the spec singles out as breaking on v2: the manifest
            // root says nothing and the direction hangs off the sequence.
            await load(
                v2Manifest(`${V2_BASE}/direction-sequence`, {
                    sequence: { viewingDirection: 'right-to-left' },
                }),
            );

            expect(state.viewingDirection).toBe('right-to-left');
        });

        it('prefers the v2 sequence over the root when they disagree', async () => {
            // Presentation 2.1: a manifest's viewingDirection "applies to all
            // of its sequences unless the sequence specifies its own". The
            // fixture's root says left-to-right and its sequence says
            // right-to-left, so the sequence must win.
            await load(structuredClone(syntheticV2ViewingHints));

            expect(state.viewingDirection).toBe('right-to-left');
        });

        it('falls back to left-to-right for an unrecognized direction', async () => {
            await load(
                v2Manifest(`${V2_BASE}/direction-bogus`, {
                    sequence: { viewingDirection: 'sideways' },
                }),
            );

            expect(state.viewingDirection).toBe('left-to-right');
        });
    });

    // ------------------------------------------------------------------
    // Viewing behavior
    // ------------------------------------------------------------------

    describe('viewing behavior', () => {
        it('reads `behavior: continuous` from a v3 manifest (Cookbook 0011)', async () => {
            await load(
                corpusManifest(
                    'cookbook/0011-book-3-behavior-manifest-continuous.json',
                ),
            );

            expect(state.viewingMode).toBe('continuous');
        });

        it('reads `behavior: individuals` from a v3 manifest (Cookbook 0011)', async () => {
            await load(
                corpusManifest(
                    'cookbook/0011-book-3-behavior-manifest-individuals.json',
                ),
            );

            expect(state.viewingMode).toBe('individuals');
        });

        it('reads `behavior: paged` from a v3 manifest (Cookbook 0009)', async () => {
            await load(corpusManifest('cookbook/0009-book-1.json'));

            expect(state.viewingMode).toBe('paged');
        });

        it('accepts a bare-string v3 `behavior`', async () => {
            await load(
                v3Manifest(`${V3_BASE}/behavior-string`, {
                    behavior: 'continuous',
                }),
            );

            expect(state.viewingMode).toBe('continuous');
        });

        it('reads a v2 root `viewingHint`', async () => {
            await load(
                v2Manifest(`${V2_BASE}/hint-root`, {
                    root: { viewingHint: 'paged' },
                }),
            );

            expect(state.viewingMode).toBe('paged');
        });

        it('reads a v2 SEQUENCE-level `viewingHint`', async () => {
            await load(
                v2Manifest(`${V2_BASE}/hint-sequence`, {
                    sequence: { viewingHint: 'continuous' },
                }),
            );

            expect(state.viewingMode).toBe('continuous');
        });

        it('prefers the v2 sequence `viewingHint` over the root when they disagree', async () => {
            // Root says `paged`, sequence says `individuals`. Presentation 2.1
            // states no precedence for `viewingHint`, so this follows the
            // cascade it does state for `viewingDirection`: more specific wins.
            await load(structuredClone(syntheticV2ViewingHints));

            expect(state.viewingMode).toBe('individuals');
        });

        it('defaults to individuals when the manifest says nothing', async () => {
            await load(v2Manifest(`${V2_BASE}/no-behavior`));

            expect(state.viewingMode).toBe('individuals');
        });
    });

    // ------------------------------------------------------------------
    // Search-service discovery
    //
    // Not covered by the behavioral baseline — it is private to ViewerState and
    // only observable by performing a search — so the URL the viewer fetches is
    // the observation.
    // ------------------------------------------------------------------

    describe('search-service discovery', () => {
        let fetchMock: ReturnType<typeof vi.fn>;

        beforeEach(() => {
            fetchMock = vi.fn(async () => ({
                ok: true,
                json: async () => searchResponseEmpty,
            }));
            vi.stubGlobal('fetch', fetchMock);
        });

        async function searchWith(service: unknown, extraRoot: object = {}) {
            await load(
                v3Manifest(
                    `${V3_BASE}/search/${Math.random().toString(36).slice(2)}`,
                    { service, ...extraRoot },
                ),
            );
            await state.search('term');
        }

        function searchedUrl(): string | undefined {
            return fetchMock.mock.calls[0]?.[0] as string | undefined;
        }

        it('finds a v1 service by profile, given as a bare object', async () => {
            await searchWith({
                '@id': 'http://example.org/search-v1',
                profile: 'http://iiif.io/api/search/1/search',
            });

            expect(searchedUrl()).toBe('http://example.org/search-v1?q=term');
        });

        it('finds a v0 service by profile', async () => {
            await searchWith([
                {
                    '@id': 'http://example.org/search-v0',
                    profile: 'http://iiif.io/api/search/0/search',
                },
            ]);

            expect(searchedUrl()).toBe('http://example.org/search-v0?q=term');
        });

        it('finds a v2 service by `type: SearchService2`', async () => {
            fetchMock.mockImplementation(async () => ({
                ok: true,
                json: async () => searchResponseV2Empty,
            }));

            await searchWith([
                { id: 'http://example.org/search-v2', type: 'SearchService2' },
            ]);

            expect(searchedUrl()).toBe('http://example.org/search-v2?q=term');
        });

        it('prefers v2 over v1 when both are present', async () => {
            fetchMock.mockImplementation(async () => ({
                ok: true,
                json: async () => searchResponseV2Empty,
            }));

            await searchWith([
                {
                    '@id': 'http://example.org/search-v1',
                    profile: 'http://iiif.io/api/search/1/search',
                },
                { id: 'http://example.org/search-v2', type: 'SearchService2' },
            ]);

            expect(searchedUrl()).toBe('http://example.org/search-v2?q=term');
        });

        it('prefers v1 over v0 when both are present', async () => {
            await searchWith([
                {
                    '@id': 'http://example.org/search-v0',
                    profile: 'http://iiif.io/api/search/0/search',
                },
                {
                    '@id': 'http://example.org/search-v1',
                    profile: 'http://iiif.io/api/search/1/search',
                },
            ]);

            expect(searchedUrl()).toBe('http://example.org/search-v1?q=term');
        });

        it('finds a service typed `SearchService1` with no profile', async () => {
            await searchWith({
                id: 'http://example.org/search-typed',
                type: 'SearchService1',
            });

            expect(searchedUrl()).toBe(
                'http://example.org/search-typed?q=term',
            );
        });

        it('finds a service declared under `services`', async () => {
            await searchWith(undefined, {
                services: [
                    {
                        '@id': 'http://example.org/search-services',
                        profile: 'http://iiif.io/api/search/1/search',
                    },
                ],
            });

            expect(searchedUrl()).toBe(
                'http://example.org/search-services?q=term',
            );
        });

        it('reports a missing service rather than searching', async () => {
            const reported: ViewerError[] = [];
            state.setErrorReporter((error) => reported.push(error));

            await searchWith([
                { id: 'http://example.org/image', type: 'ImageService3' },
            ]);

            expect(fetchMock).not.toHaveBeenCalled();
            expect(reported.map((error) => error.code)).toEqual([
                'search-service-missing',
            ]);
        });

        it('does not throw on service shapes that are not objects', async () => {
            // The old implementation called a library accessor unguarded, which
            // became a TypeError the moment it was handed raw JSON. Nothing in
            // here may throw, whatever the manifest says.
            const reported: ViewerError[] = [];
            state.setErrorReporter((error) => reported.push(error));

            await searchWith([
                null,
                'http://example.org/service-by-reference',
                42,
            ]);

            expect(fetchMock).not.toHaveBeenCalled();
            expect(reported.map((error) => error.code)).toEqual([
                'search-service-missing',
            ]);
        });

        it('does not throw when the manifest has no services at all', async () => {
            const reported: ViewerError[] = [];
            state.setErrorReporter((error) => reported.push(error));

            await searchWith(undefined);

            expect(fetchMock).not.toHaveBeenCalled();
            expect(reported.map((error) => error.code)).toEqual([
                'search-service-missing',
            ]);
        });
    });
});
