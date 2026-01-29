/**
 * Mock IIIF Search API responses for testing
 */

export const searchResponseWithHits = {
    "@context": "http://iiif.io/api/search/1/context.json",
    "@id": "http://example.org/search?q=test",
    "@type": "sc:AnnotationList",
    "within": {
        "@type": "sc:Layer",
        "total": 2
    },
    "hits": [
        {
            "@type": "search:Hit",
            "annotations": ["http://example.org/anno/hit1"],
            "match": "&lt;mark&gt;test&lt;/mark&gt;",
            "before": "This is a ",
            "after": " result on page one"
        },
        {
            "@type": "search:Hit",
            "annotations": ["http://example.org/anno/hit2", "http://example.org/anno/hit3"],
            "match": "&lt;mark&gt;test&lt;/mark&gt;",
            "before": "Another ",
            "after": " result on page two"
        }
    ],
    "resources": [
        {
            "@id": "http://example.org/anno/hit1",
            "@type": "oa:Annotation",
            "motivation": "sc:painting",
            "resource": {
                "@type": "cnt:ContentAsText",
                "chars": "test"
            },
            "on": "http://example.org/canvas/1#xywh=100,100,50,20"
        },
        {
            "@id": "http://example.org/anno/hit2",
            "@type": "oa:Annotation",
            "motivation": "sc:painting",
            "resource": {
                "@type": "cnt:ContentAsText",
                "chars": "test"
            },
            "on": "http://example.org/canvas/2#xywh=200,150,50,20"
        },
        {
            "@id": "http://example.org/anno/hit3",
            "@type": "oa:Annotation",
            "motivation": "sc:painting",
            "resource": {
                "@type": "cnt:ContentAsText",
                "chars": "test"
            },
            "on": "http://example.org/canvas/2#xywh=300,200,50,20"
        }
    ]
};

export const searchResponseWithResourcesOnly = {
    "@context": "http://iiif.io/api/search/0/context.json",
    "@id": "http://example.org/search?q=word",
    "@type": "sc:AnnotationList",
    "resources": [
        {
            "@id": "http://example.org/anno/res1",
            "@type": "oa:Annotation",
            "motivation": "sc:painting",
            "resource": {
                "@type": "cnt:ContentAsText",
                "chars": "&lt;mark&gt;word&lt;/mark&gt;"
            },
            "on": "http://example.org/canvas/1#xywh=50,50,100,25"
        },
        {
            "@id": "http://example.org/anno/res2",
            "@type": "oa:Annotation",
            "motivation": "sc:painting",
            "resource": {
                "@type": "cnt:ContentAsText",
                "chars": "&lt;mark&gt;word&lt;/mark&gt;"
            },
            "on": "http://example.org/canvas/1#xywh=50,100,100,25"
        }
    ]
};

export const searchResponseEmpty = {
    "@context": "http://iiif.io/api/search/1/context.json",
    "@id": "http://example.org/search?q=notfound",
    "@type": "sc:AnnotationList",
    "within": {
        "@type": "sc:Layer",
        "total": 0
    },
    "hits": [],
    "resources": []
};

export const searchResponseMultiCanvas = {
    "@context": "http://iiif.io/api/search/1/context.json",
    "@id": "http://example.org/search?q=common",
    "@type": "sc:AnnotationList",
    "within": {
        "@type": "sc:Layer",
        "total": 4
    },
    "hits": [
        {
            "@type": "search:Hit",
            "annotations": ["http://example.org/anno/c1h1"],
            "match": "&lt;mark&gt;common&lt;/mark&gt;",
            "before": "First ",
            "after": " word"
        },
        {
            "@type": "search:Hit",
            "annotations": ["http://example.org/anno/c1h2"],
            "match": "&lt;mark&gt;common&lt;/mark&gt;",
            "before": "Second ",
            "after": " word"
        },
        {
            "@type": "search:Hit",
            "annotations": ["http://example.org/anno/c2h1"],
            "match": "&lt;mark&gt;common&lt;/mark&gt;",
            "before": "Third ",
            "after": " word"
        },
        {
            "@type": "search:Hit",
            "annotations": ["http://example.org/anno/c2h2"],
            "match": "&lt;mark&gt;common&lt;/mark&gt;",
            "before": "Fourth ",
            "after": " word"
        }
    ],
    "resources": [
        {
            "@id": "http://example.org/anno/c1h1",
            "@type": "oa:Annotation",
            "motivation": "sc:painting",
            "resource": {
                "@type": "cnt:ContentAsText",
                "chars": "common"
            },
            "on": "http://example.org/canvas/1#xywh=10,10,60,20"
        },
        {
            "@id": "http://example.org/anno/c1h2",
            "@type": "oa:Annotation",
            "motivation": "sc:painting",
            "resource": {
                "@type": "cnt:ContentAsText",
                "chars": "common"
            },
            "on": "http://example.org/canvas/1#xywh=10,50,60,20"
        },
        {
            "@id": "http://example.org/anno/c2h1",
            "@type": "oa:Annotation",
            "motivation": "sc:painting",
            "resource": {
                "@type": "cnt:ContentAsText",
                "chars": "common"
            },
            "on": "http://example.org/canvas/2#xywh=20,20,60,20"
        },
        {
            "@id": "http://example.org/anno/c2h2",
            "@type": "oa:Annotation",
            "motivation": "sc:painting",
            "resource": {
                "@type": "cnt:ContentAsText",
                "chars": "common"
            },
            "on": "http://example.org/canvas/2#xywh=20,60,60,20"
        }
    ]
};
