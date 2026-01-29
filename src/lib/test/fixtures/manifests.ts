/**
 * Sample IIIF manifest fixtures for testing
 */

export const manifestV2WithSearch = {
    "@context": "http://iiif.io/api/presentation/2/context.json",
    "@id": "http://example.org/manifest/v2-search",
    "@type": "sc:Manifest",
    "label": "Test Manifest v2 with Search",
    "service": {
        "@id": "http://example.org/search",
        "profile": "http://iiif.io/api/search/1/search"
    },
    "sequences": [
        {
            "@type": "sc:Sequence",
            "canvases": [
                {
                    "@id": "http://example.org/canvas/1",
                    "@type": "sc:Canvas",
                    "label": "Page 1",
                    "height": 1000,
                    "width": 800,
                    "images": [
                        {
                            "@type": "oa:Annotation",
                            "motivation": "sc:painting",
                            "resource": {
                                "@id": "http://example.org/image/1",
                                "@type": "dctypes:Image",
                                "service": {
                                    "@id": "http://example.org/iiif/image1",
                                    "profile": "http://iiif.io/api/image/2/level1.json"
                                }
                            },
                            "on": "http://example.org/canvas/1"
                        }
                    ],
                    "otherContent": [
                        {
                            "@id": "http://example.org/list1",
                            "@type": "sc:AnnotationList"
                        }
                    ]
                },
                {
                    "@id": "http://example.org/canvas/2",
                    "@type": "sc:Canvas",
                    "label": "Page 2",
                    "height": 1000,
                    "width": 800,
                    "images": [
                        {
                            "@type": "oa:Annotation",
                            "motivation": "sc:painting",
                            "resource": {
                                "@id": "http://example.org/image/2",
                                "@type": "dctypes:Image",
                                "service": {
                                    "@id": "http://example.org/iiif/image2",
                                    "profile": "http://iiif.io/api/image/2/level1.json"
                                }
                            },
                            "on": "http://example.org/canvas/2"
                        }
                    ]
                }
            ]
        }
    ]
};

export const manifestV3WithSearch = {
    "@context": "http://iiif.io/api/presentation/3/context.json",
    "id": "http://example.org/manifest/v3-search",
    "type": "Manifest",
    "label": { "en": ["Test Manifest v3 with Search"] },
    "service": [
        {
            "id": "http://example.org/search",
            "type": "SearchService1",
            "profile": "http://iiif.io/api/search/1/search"
        }
    ],
    "items": [
        {
            "id": "http://example.org/canvas/1",
            "type": "Canvas",
            "label": { "en": ["Page 1"] },
            "height": 1000,
            "width": 800,
            "items": [
                {
                    "id": "http://example.org/page/1",
                    "type": "AnnotationPage",
                    "items": [
                        {
                            "id": "http://example.org/annotation/1",
                            "type": "Annotation",
                            "motivation": "painting",
                            "body": {
                                "id": "http://example.org/image/1",
                                "type": "Image",
                                "format": "image/jpeg",
                                "service": [
                                    {
                                        "id": "http://example.org/iiif/image1",
                                        "type": "ImageService3",
                                        "profile": "level1"
                                    }
                                ]
                            },
                            "target": "http://example.org/canvas/1"
                        }
                    ]
                }
            ],
            "annotations": [
                {
                    "id": "http://example.org/annopage/1",
                    "type": "AnnotationPage"
                }
            ]
        },
        {
            "id": "http://example.org/canvas/2",
            "type": "Canvas",
            "label": { "en": ["Page 2"] },
            "height": 1000,
            "width": 800,
            "items": [
                {
                    "id": "http://example.org/page/2",
                    "type": "AnnotationPage",
                    "items": [
                        {
                            "id": "http://example.org/annotation/2",
                            "type": "Annotation",
                            "motivation": "painting",
                            "body": {
                                "id": "http://example.org/image/2",
                                "type": "Image",
                                "format": "image/jpeg",
                                "service": [
                                    {
                                        "id": "http://example.org/iiif/image2",
                                        "type": "ImageService3",
                                        "profile": "level1"
                                    }
                                ]
                            },
                            "target": "http://example.org/canvas/2"
                        }
                    ]
                }
            ]
        }
    ]
};

export const manifestV2WithoutSearch = {
    "@context": "http://iiif.io/api/presentation/2/context.json",
    "@id": "http://example.org/manifest/v2-no-search",
    "@type": "sc:Manifest",
    "label": "Test Manifest v2 without Search",
    "sequences": [
        {
            "@type": "sc:Sequence",
            "canvases": [
                {
                    "@id": "http://example.org/canvas/1",
                    "@type": "sc:Canvas",
                    "label": "Page 1",
                    "height": 1000,
                    "width": 800,
                    "images": [
                        {
                            "@type": "oa:Annotation",
                            "motivation": "sc:painting",
                            "resource": {
                                "@id": "http://example.org/image/1",
                                "@type": "dctypes:Image"
                            },
                            "on": "http://example.org/canvas/1"
                        }
                    ]
                }
            ]
        }
    ]
};

export const manifestV2WithMultipleImages = {
    "@context": "http://iiif.io/api/presentation/2/context.json",
    "@id": "http://example.org/manifest/v2-multi-images",
    "@type": "sc:Manifest",
    "label": "Test Manifest v2 with Multiple Images per Canvas",
    "sequences": [
        {
            "@type": "sc:Sequence",
            "canvases": [
                {
                    "@id": "http://example.org/canvas/1",
                    "@type": "sc:Canvas",
                    "label": "Multi-image Canvas",
                    "height": 1000,
                    "width": 800,
                    "images": [
                        {
                            "@type": "oa:Annotation",
                            "motivation": "sc:painting",
                            "resource": {
                                "@id": "http://example.org/image/1a",
                                "@type": "dctypes:Image",
                                "service": {
                                    "@id": "http://example.org/iiif/image1a",
                                    "profile": "http://iiif.io/api/image/2/level1.json"
                                }
                            },
                            "on": "http://example.org/canvas/1#xywh=0,0,400,1000"
                        },
                        {
                            "@type": "oa:Annotation",
                            "motivation": "sc:painting",
                            "resource": {
                                "@id": "http://example.org/image/1b",
                                "@type": "dctypes:Image",
                                "service": {
                                    "@id": "http://example.org/iiif/image1b",
                                    "profile": "http://iiif.io/api/image/2/level1.json"
                                }
                            },
                            "on": "http://example.org/canvas/1#xywh=400,0,400,1000"
                        }
                    ]
                }
            ]
        }
    ]
};

export const manifestWithThumbnails = {
    "@context": "http://iiif.io/api/presentation/3/context.json",
    "id": "http://example.org/manifest/thumbs",
    "type": "Manifest",
    "label": { "en": ["Test Manifest with Thumbnails"] },
    "items": [
        {
            "id": "http://example.org/canvas/1",
            "type": "Canvas",
            "label": { "en": ["Page 1"] },
            "height": 1000,
            "width": 800,
            "thumbnail": [
                {
                    "id": "http://example.org/thumb/1.jpg",
                    "type": "Image",
                    "format": "image/jpeg"
                }
            ],
            "items": [
                {
                    "id": "http://example.org/page/1",
                    "type": "AnnotationPage",
                    "items": [
                        {
                            "id": "http://example.org/annotation/1",
                            "type": "Annotation",
                            "motivation": "painting",
                            "body": {
                                "id": "http://example.org/image/1",
                                "type": "Image",
                                "service": [
                                    {
                                        "id": "http://example.org/iiif/image1",
                                        "type": "ImageService3",
                                        "profile": "level1"
                                    }
                                ]
                            },
                            "target": "http://example.org/canvas/1"
                        }
                    ]
                }
            ]
        },
        {
            "id": "http://example.org/canvas/2",
            "type": "Canvas",
            "label": { "en": ["Page 2"] },
            "height": 1000,
            "width": 800,
            "items": [
                {
                    "id": "http://example.org/page/2",
                    "type": "AnnotationPage",
                    "items": [
                        {
                            "id": "http://example.org/annotation/2",
                            "type": "Annotation",
                            "motivation": "painting",
                            "body": {
                                "id": "http://example.org/image/2",
                                "type": "Image",
                                "service": [
                                    {
                                        "id": "http://example.org/iiif/image2",
                                        "type": "ImageService3",
                                        "profile": "level1"
                                    }
                                ]
                            },
                            "target": "http://example.org/canvas/2"
                        }
                    ]
                }
            ]
        }
    ]
};
