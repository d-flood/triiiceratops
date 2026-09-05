import { describe, expect, it } from 'vitest';

import {
    buildSearchAnnotations,
    discoverSearchService,
    parseSearchResponse,
} from './iiifSearch';

const V2_CANVASES = [
    { '@id': 'https://ex/canvas/1', '@type': 'sc:Canvas', label: 'Page 1' },
    { '@id': 'https://ex/canvas/2', '@type': 'sc:Canvas', label: 'Page 2' },
];

const V3_CANVASES = [
    { id: 'https://ex/canvas/1', type: 'Canvas', label: { en: ['Page 1'] } },
];

describe('discoverSearchService', () => {
    it('returns null when the manifest declares no service', () => {
        expect(discoverSearchService({})).toBeNull();
        expect(discoverSearchService(null)).toBeNull();
        expect(
            discoverSearchService({ service: 'https://ex/bare-id' }),
        ).toBeNull();
    });

    it('reads a bare object as well as an array', () => {
        const service = {
            '@id': 'https://ex/search',
            profile: 'http://iiif.io/api/search/1/search',
        };
        expect(discoverSearchService({ service })).toEqual({
            version: 1,
            serviceId: 'https://ex/search',
        });
        expect(discoverSearchService({ services: [service] })).toEqual({
            version: 1,
            serviceId: 'https://ex/search',
        });
    });

    it('accepts dcterms:conformsTo and an array profile', () => {
        expect(
            discoverSearchService({
                service: {
                    '@id': 'https://ex/search',
                    'dcterms:conformsTo': [
                        'http://iiif.io/api/search/0/search',
                    ],
                },
            }),
        ).toEqual({ version: 0, serviceId: 'https://ex/search' });
    });

    it('prefers v2 over v1 over v0', () => {
        const manifest = {
            service: [
                {
                    '@id': 'https://ex/v0',
                    profile: 'http://iiif.io/api/search/0/search',
                },
                {
                    '@id': 'https://ex/v1',
                    profile: 'http://iiif.io/api/search/1/search',
                },
                { id: 'https://ex/v2', type: 'SearchService2' },
            ],
        };
        expect(discoverSearchService(manifest)).toEqual({
            version: 2,
            serviceId: 'https://ex/v2',
        });
    });

    it('matches SearchService1 by type when no profile is declared', () => {
        expect(
            discoverSearchService({
                service: { id: 'https://ex/search', type: 'SearchService1' },
            }),
        ).toEqual({ version: 1, serviceId: 'https://ex/search' });
    });
});

describe('parseSearchResponse — v0/v1', () => {
    it('groups hits by canvas, in canvas order', () => {
        const data = {
            resources: [
                {
                    '@id': 'https://ex/anno/2',
                    on: 'https://ex/canvas/2#xywh=1,2,3,4',
                },
                {
                    '@id': 'https://ex/anno/1',
                    on: 'https://ex/canvas/1#xywh=5,6,7,8',
                },
            ],
            hits: [
                {
                    annotations: ['https://ex/anno/2'],
                    before: 'a ',
                    match: 'two',
                    after: ' b',
                },
                {
                    annotations: ['https://ex/anno/1'],
                    before: 'c ',
                    match: 'one',
                    after: ' d',
                },
            ],
        };

        const groups = parseSearchResponse(data, 1, V2_CANVASES);

        expect(groups.map((g) => g.canvasIndex)).toEqual([0, 1]);
        expect(groups[0].canvasLabel).toBe('Page 1');
        expect(groups[0].hits[0]).toMatchObject({
            type: 'hit',
            before: 'c ',
            match: 'one',
            after: ' d',
            bounds: [5, 6, 7, 8],
        });
    });

    it('falls back to resources when there is no hits section', () => {
        const data = {
            resources: [
                {
                    '@id': 'https://ex/anno/1',
                    on: 'https://ex/canvas/1#xywh=1,2,3,4',
                    resource: { chars: 'plain excerpt' },
                },
            ],
        };

        const groups = parseSearchResponse(data, 0, V2_CANVASES);

        expect(groups[0].hits[0]).toMatchObject({
            type: 'resource',
            match: 'plain excerpt',
            bounds: [1, 2, 3, 4],
        });
    });

    it('reads a cnt:chars excerpt, not only chars', () => {
        const data = {
            resources: [
                {
                    '@id': 'https://ex/anno/1',
                    on: 'https://ex/canvas/1#xywh=1,2,3,4',
                    resource: { 'cnt:chars': 'prefixed excerpt' },
                },
            ],
        };

        const groups = parseSearchResponse(data, 1, V2_CANVASES);

        expect(groups[0].hits[0].match).toBe('prefixed excerpt');
    });

    it('drops hits targeting a canvas outside the sequence', () => {
        const data = {
            resources: [
                {
                    '@id': 'https://ex/anno/x',
                    on: 'https://ex/canvas/99#xywh=1,2,3,4',
                },
            ],
        };
        expect(parseSearchResponse(data, 1, V2_CANVASES)).toEqual([]);
    });

    it('collects every bound when one hit targets several regions', () => {
        const data = {
            resources: [
                {
                    '@id': 'https://ex/anno/1',
                    on: [
                        'https://ex/canvas/1#xywh=1,1,1,1',
                        'https://ex/canvas/1#xywh=2,2,2,2',
                    ],
                },
            ],
        };

        const groups = parseSearchResponse(data, 1, V2_CANVASES);

        expect(groups[0].hits[0].allBounds).toEqual([
            [1, 1, 1, 1],
            [2, 2, 2, 2],
        ]);
        expect(groups[0].hits[0].bounds).toEqual([1, 1, 1, 1]);
    });
});

describe('parseSearchResponse — v2', () => {
    it('reads a TextQuoteSelector as before/match/after', () => {
        const data = {
            items: [
                {
                    id: 'https://ex/anno/1',
                    target: 'https://ex/canvas/1#xywh=1,2,3,4',
                    body: { value: 'ignored when context exists' },
                },
            ],
            annotations: {
                items: [
                    {
                        target: {
                            source: 'https://ex/anno/1',
                            selector: {
                                type: 'TextQuoteSelector',
                                prefix: 'before ',
                                exact: 'match',
                                suffix: ' after',
                            },
                        },
                    },
                ],
            },
        };

        const groups = parseSearchResponse(data, 2, V3_CANVASES);

        expect(groups[0].hits[0]).toMatchObject({
            type: 'hit',
            before: 'before ',
            match: 'match',
            after: ' after',
        });
    });

    it('falls back to the body when no context annotation matches', () => {
        const data = {
            items: [
                {
                    id: 'https://ex/anno/1',
                    target: 'https://ex/canvas/1#xywh=1,2,3,4',
                    body: [{ value: 'body text' }],
                },
            ],
        };

        const groups = parseSearchResponse(data, 2, V3_CANVASES);

        expect(groups[0].hits[0]).toMatchObject({
            type: 'resource',
            match: 'body text',
        });
    });

    it('keeps the first context entry for a source', () => {
        const data = {
            items: [
                {
                    id: 'https://ex/anno/1',
                    target: 'https://ex/canvas/1#xywh=0,0,1,1',
                },
            ],
            annotations: [
                {
                    items: [
                        {
                            target: {
                                source: 'https://ex/anno/1',
                                selector: {
                                    type: 'TextQuoteSelector',
                                    exact: 'first',
                                },
                            },
                        },
                        {
                            target: {
                                source: 'https://ex/anno/1',
                                selector: {
                                    type: 'TextQuoteSelector',
                                    exact: 'second',
                                },
                            },
                        },
                    ],
                },
            ],
        };

        expect(parseSearchResponse(data, 2, V3_CANVASES)[0].hits[0].match).toBe(
            'first',
        );
    });

    it('survives an empty or malformed response', () => {
        expect(parseSearchResponse({}, 2, V3_CANVASES)).toEqual([]);
        expect(parseSearchResponse({ items: [] }, 2, V3_CANVASES)).toEqual([]);
        expect(parseSearchResponse({}, 1, V3_CANVASES)).toEqual([]);
    });
});

describe('buildSearchAnnotations', () => {
    it('emits one annotation per bounding box, with unique ids', () => {
        const groups = [
            {
                canvasIndex: 0,
                canvasLabel: 'Page 1',
                hits: [
                    {
                        type: 'hit' as const,
                        match: 'x',
                        bounds: [1, 2, 3, 4],
                        allBounds: [
                            [1, 2, 3, 4],
                            [5, 6, 7, 8],
                        ],
                    },
                ],
            },
        ];

        const annotations = buildSearchAnnotations(groups, V2_CANVASES);

        expect(annotations).toHaveLength(2);
        expect(annotations[0]['@id']).toBe('urn:search-hit:0');
        expect(annotations[1]['@id']).toBe('urn:search-hit:1');
        expect(annotations[0].on).toBe('https://ex/canvas/1#xywh=1,2,3,4');
        expect(annotations[0].isSearchHit).toBe(true);
    });

    it('strips mark delimiters from the excerpt', () => {
        const groups = [
            {
                canvasIndex: 0,
                canvasLabel: 'Page 1',
                hits: [
                    {
                        type: 'resource' as const,
                        match: 'a <mark>hit</mark> here',
                        bounds: [0, 0, 1, 1],
                        allBounds: [],
                    },
                ],
            },
        ];

        expect(
            buildSearchAnnotations(groups, V2_CANVASES)[0].resource.chars,
        ).toBe('a hit here');
    });

    it('skips a group whose canvas has no id', () => {
        const groups = [
            {
                canvasIndex: 0,
                canvasLabel: 'Page 1',
                hits: [
                    {
                        type: 'hit' as const,
                        match: 'x',
                        bounds: [0, 0, 1, 1],
                        allBounds: [],
                    },
                ],
            },
        ];
        expect(buildSearchAnnotations(groups, [{ label: 'no id' }])).toEqual(
            [],
        );
    });
});
