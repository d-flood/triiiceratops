/**
 * Mock IIIF Search API responses for testing
 */

export const searchResponseWithHits = {
    '@context': 'http://iiif.io/api/search/1/context.json',
    '@id': 'http://example.org/search?q=test',
    '@type': 'sc:AnnotationList',
    within: {
        '@type': 'sc:Layer',
        total: 2,
    },
    hits: [
        {
            '@type': 'search:Hit',
            annotations: ['http://example.org/anno/hit1'],
            match: '&lt;mark&gt;test&lt;/mark&gt;',
            before: 'This is a ',
            after: ' result on page one',
        },
        {
            '@type': 'search:Hit',
            annotations: [
                'http://example.org/anno/hit2',
                'http://example.org/anno/hit3',
            ],
            match: '&lt;mark&gt;test&lt;/mark&gt;',
            before: 'Another ',
            after: ' result on page two',
        },
    ],
    resources: [
        {
            '@id': 'http://example.org/anno/hit1',
            '@type': 'oa:Annotation',
            motivation: 'sc:painting',
            resource: {
                '@type': 'cnt:ContentAsText',
                chars: 'test',
            },
            on: 'http://example.org/canvas/1#xywh=100,100,50,20',
        },
        {
            '@id': 'http://example.org/anno/hit2',
            '@type': 'oa:Annotation',
            motivation: 'sc:painting',
            resource: {
                '@type': 'cnt:ContentAsText',
                chars: 'test',
            },
            on: 'http://example.org/canvas/2#xywh=200,150,50,20',
        },
        {
            '@id': 'http://example.org/anno/hit3',
            '@type': 'oa:Annotation',
            motivation: 'sc:painting',
            resource: {
                '@type': 'cnt:ContentAsText',
                chars: 'test',
            },
            on: 'http://example.org/canvas/2#xywh=300,200,50,20',
        },
    ],
};

export const searchResponseWithResourcesOnly = {
    '@context': 'http://iiif.io/api/search/0/context.json',
    '@id': 'http://example.org/search?q=word',
    '@type': 'sc:AnnotationList',
    resources: [
        {
            '@id': 'http://example.org/anno/res1',
            '@type': 'oa:Annotation',
            motivation: 'sc:painting',
            resource: {
                '@type': 'cnt:ContentAsText',
                chars: '&lt;mark&gt;word&lt;/mark&gt;',
            },
            on: 'http://example.org/canvas/1#xywh=50,50,100,25',
        },
        {
            '@id': 'http://example.org/anno/res2',
            '@type': 'oa:Annotation',
            motivation: 'sc:painting',
            resource: {
                '@type': 'cnt:ContentAsText',
                chars: '&lt;mark&gt;word&lt;/mark&gt;',
            },
            on: 'http://example.org/canvas/1#xywh=50,100,100,25',
        },
    ],
};

export const searchResponseEmpty = {
    '@context': 'http://iiif.io/api/search/1/context.json',
    '@id': 'http://example.org/search?q=notfound',
    '@type': 'sc:AnnotationList',
    within: {
        '@type': 'sc:Layer',
        total: 0,
    },
    hits: [],
    resources: [],
};

export const searchResponseMultiCanvas = {
    '@context': 'http://iiif.io/api/search/1/context.json',
    '@id': 'http://example.org/search?q=common',
    '@type': 'sc:AnnotationList',
    within: {
        '@type': 'sc:Layer',
        total: 4,
    },
    hits: [
        {
            '@type': 'search:Hit',
            annotations: ['http://example.org/anno/c1h1'],
            match: '&lt;mark&gt;common&lt;/mark&gt;',
            before: 'First ',
            after: ' word',
        },
        {
            '@type': 'search:Hit',
            annotations: ['http://example.org/anno/c1h2'],
            match: '&lt;mark&gt;common&lt;/mark&gt;',
            before: 'Second ',
            after: ' word',
        },
        {
            '@type': 'search:Hit',
            annotations: ['http://example.org/anno/c2h1'],
            match: '&lt;mark&gt;common&lt;/mark&gt;',
            before: 'Third ',
            after: ' word',
        },
        {
            '@type': 'search:Hit',
            annotations: ['http://example.org/anno/c2h2'],
            match: '&lt;mark&gt;common&lt;/mark&gt;',
            before: 'Fourth ',
            after: ' word',
        },
    ],
    resources: [
        {
            '@id': 'http://example.org/anno/c1h1',
            '@type': 'oa:Annotation',
            motivation: 'sc:painting',
            resource: {
                '@type': 'cnt:ContentAsText',
                chars: 'common',
            },
            on: 'http://example.org/canvas/1#xywh=10,10,60,20',
        },
        {
            '@id': 'http://example.org/anno/c1h2',
            '@type': 'oa:Annotation',
            motivation: 'sc:painting',
            resource: {
                '@type': 'cnt:ContentAsText',
                chars: 'common',
            },
            on: 'http://example.org/canvas/1#xywh=10,50,60,20',
        },
        {
            '@id': 'http://example.org/anno/c2h1',
            '@type': 'oa:Annotation',
            motivation: 'sc:painting',
            resource: {
                '@type': 'cnt:ContentAsText',
                chars: 'common',
            },
            on: 'http://example.org/canvas/2#xywh=20,20,60,20',
        },
        {
            '@id': 'http://example.org/anno/c2h2',
            '@type': 'oa:Annotation',
            motivation: 'sc:painting',
            resource: {
                '@type': 'cnt:ContentAsText',
                chars: 'common',
            },
            on: 'http://example.org/canvas/2#xywh=20,60,60,20',
        },
    ],
};

/**
 * IIIF Content Search API 2.0 responses
 */

/** v2 response with contextualizing annotations (prefix/exact/suffix via TextQuoteSelector) */
export const searchResponseV2WithContext = {
    '@context': 'http://iiif.io/api/search/2/context.json',
    id: 'http://example.org/search?q=test',
    type: 'AnnotationPage',

    items: [
        {
            id: 'http://example.org/anno/v2-hit1',
            type: 'Annotation',
            motivation: 'painting',
            body: {
                type: 'TextualBody',
                value: 'test',
                format: 'text/plain',
            },
            target: 'http://example.org/canvas/1#xywh=100,100,50,20',
        },
        {
            id: 'http://example.org/anno/v2-hit2',
            type: 'Annotation',
            motivation: 'painting',
            body: {
                type: 'TextualBody',
                value: 'test',
                format: 'text/plain',
            },
            target: 'http://example.org/canvas/2#xywh=200,150,50,20',
        },
    ],

    annotations: [
        {
            type: 'AnnotationPage',
            items: [
                {
                    id: 'http://example.org/anno/match-1',
                    type: 'Annotation',
                    motivation: 'contextualizing',
                    target: {
                        type: 'SpecificResource',
                        source: 'http://example.org/anno/v2-hit1',
                        selector: [
                            {
                                type: 'TextQuoteSelector',
                                prefix: 'This is a ',
                                exact: '&lt;mark&gt;test&lt;/mark&gt;',
                                suffix: ' result on page one',
                            },
                        ],
                    },
                },
                {
                    id: 'http://example.org/anno/match-2',
                    type: 'Annotation',
                    motivation: 'contextualizing',
                    target: {
                        type: 'SpecificResource',
                        source: 'http://example.org/anno/v2-hit2',
                        selector: [
                            {
                                type: 'TextQuoteSelector',
                                prefix: 'Another ',
                                exact: '&lt;mark&gt;test&lt;/mark&gt;',
                                suffix: ' result on page two',
                            },
                        ],
                    },
                },
            ],
        },
    ],
};

/** v2 response with items only, no annotations section (basic level) */
export const searchResponseV2ItemsOnly = {
    '@context': 'http://iiif.io/api/search/2/context.json',
    id: 'http://example.org/search?q=word',
    type: 'AnnotationPage',

    items: [
        {
            id: 'http://example.org/anno/v2-res1',
            type: 'Annotation',
            motivation: 'painting',
            body: {
                type: 'TextualBody',
                value: '&lt;mark&gt;word&lt;/mark&gt;',
                format: 'text/plain',
            },
            target: 'http://example.org/canvas/1#xywh=50,50,100,25',
        },
        {
            id: 'http://example.org/anno/v2-res2',
            type: 'Annotation',
            motivation: 'painting',
            body: {
                type: 'TextualBody',
                value: '&lt;mark&gt;word&lt;/mark&gt;',
                format: 'text/plain',
            },
            target: 'http://example.org/canvas/1#xywh=50,100,100,25',
        },
    ],
};

/** v2 response with results spanning multiple canvases */
export const searchResponseV2MultiCanvas = {
    '@context': 'http://iiif.io/api/search/2/context.json',
    id: 'http://example.org/search?q=common',
    type: 'AnnotationPage',

    partOf: {
        id: 'http://example.org/search?q=common',
        type: 'AnnotationCollection',
        total: 4,
    },

    items: [
        {
            id: 'http://example.org/anno/v2-c1h1',
            type: 'Annotation',
            motivation: 'painting',
            body: {
                type: 'TextualBody',
                value: 'common',
                format: 'text/plain',
            },
            target: 'http://example.org/canvas/1#xywh=10,10,60,20',
        },
        {
            id: 'http://example.org/anno/v2-c1h2',
            type: 'Annotation',
            motivation: 'painting',
            body: {
                type: 'TextualBody',
                value: 'common',
                format: 'text/plain',
            },
            target: 'http://example.org/canvas/1#xywh=10,50,60,20',
        },
        {
            id: 'http://example.org/anno/v2-c2h1',
            type: 'Annotation',
            motivation: 'painting',
            body: {
                type: 'TextualBody',
                value: 'common',
                format: 'text/plain',
            },
            target: 'http://example.org/canvas/2#xywh=20,20,60,20',
        },
        {
            id: 'http://example.org/anno/v2-c2h2',
            type: 'Annotation',
            motivation: 'painting',
            body: {
                type: 'TextualBody',
                value: 'common',
                format: 'text/plain',
            },
            target: 'http://example.org/canvas/2#xywh=20,60,60,20',
        },
    ],

    annotations: [
        {
            type: 'AnnotationPage',
            items: [
                {
                    id: 'http://example.org/anno/v2-match-c1h1',
                    type: 'Annotation',
                    motivation: 'contextualizing',
                    target: {
                        type: 'SpecificResource',
                        source: 'http://example.org/anno/v2-c1h1',
                        selector: [
                            {
                                type: 'TextQuoteSelector',
                                prefix: 'First ',
                                exact: 'common',
                                suffix: ' word',
                            },
                        ],
                    },
                },
                {
                    id: 'http://example.org/anno/v2-match-c1h2',
                    type: 'Annotation',
                    motivation: 'contextualizing',
                    target: {
                        type: 'SpecificResource',
                        source: 'http://example.org/anno/v2-c1h2',
                        selector: [
                            {
                                type: 'TextQuoteSelector',
                                prefix: 'Second ',
                                exact: 'common',
                                suffix: ' word',
                            },
                        ],
                    },
                },
                {
                    id: 'http://example.org/anno/v2-match-c2h1',
                    type: 'Annotation',
                    motivation: 'contextualizing',
                    target: {
                        type: 'SpecificResource',
                        source: 'http://example.org/anno/v2-c2h1',
                        selector: [
                            {
                                type: 'TextQuoteSelector',
                                prefix: 'Third ',
                                exact: 'common',
                                suffix: ' word',
                            },
                        ],
                    },
                },
                {
                    id: 'http://example.org/anno/v2-match-c2h2',
                    type: 'Annotation',
                    motivation: 'contextualizing',
                    target: {
                        type: 'SpecificResource',
                        source: 'http://example.org/anno/v2-c2h2',
                        selector: [
                            {
                                type: 'TextQuoteSelector',
                                prefix: 'Fourth ',
                                exact: 'common',
                                suffix: ' word',
                            },
                        ],
                    },
                },
            ],
        },
    ],
};

/** Empty v2 response */
export const searchResponseV2Empty = {
    '@context': 'http://iiif.io/api/search/2/context.json',
    id: 'http://example.org/search?q=notfound',
    type: 'AnnotationPage',
    items: [],
};
