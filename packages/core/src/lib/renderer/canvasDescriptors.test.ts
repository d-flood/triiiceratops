/**
 * Fixtures here are raw manifest/Canvas JSON, not accessor-bearing wrapper
 * objects — this module's only contract is raw JSON in, plain data out.
 */

import { describe, expect, it } from 'vitest';

import {
    getDeclaredThumbnailUrl,
    toPlannerCanvas,
    toPlannerCanvases,
} from './canvasDescriptors';

function v3Canvas(body: Record<string, unknown>, canvas: object = {}) {
    return {
        id: 'https://example.test/canvas/1',
        type: 'Canvas',
        width: 1000,
        height: 750,
        items: [
            {
                id: 'https://example.test/page/1',
                type: 'AnnotationPage',
                items: [
                    {
                        id: 'https://example.test/anno/1',
                        type: 'Annotation',
                        motivation: 'painting',
                        body,
                        target: 'https://example.test/canvas/1',
                    },
                ],
            },
        ],
        ...canvas,
    };
}

const STATIC_BODY = {
    id: 'https://example.test/image.jpg',
    type: 'Image',
    format: 'image/jpeg',
    width: 4000,
    height: 3000,
};

describe('toPlannerCanvas', () => {
    it('reads geometry from the manifest Canvas, not the image resource', () => {
        // The image is 4000x3000; the Canvas declares 1000x750. Manifest
        // dimensions win permanently for geometry.
        const result = toPlannerCanvas(v3Canvas(STATIC_BODY));

        expect(result).toEqual({
            id: 'https://example.test/canvas/1',
            width: 1000,
            height: 750,
            images: [
                {
                    key: 'https://example.test/canvas/1#0',
                    source: {
                        kind: 'static',
                        url: 'https://example.test/image.jpg',
                    },
                    // Canvas-filling: the whole box, in units of the Canvas's
                    // own width, so `height` is the aspect ratio 750/1000.
                    x: 0,
                    y: 0,
                    width: 1,
                    height: 0.75,
                },
            ],
            thumbnailUrl: null,
        });
    });

    it('describes a canvas with no image service as a static source', () => {
        expect(
            toPlannerCanvas(v3Canvas(STATIC_BODY))?.images[0].source,
        ).toEqual({ kind: 'static', url: 'https://example.test/image.jpg' });
    });

    it('describes a canvas with an image service as a service source', () => {
        const result = toPlannerCanvas(
            v3Canvas({
                ...STATIC_BODY,
                service: [
                    {
                        id: 'https://example.test/iiif/abc',
                        type: 'ImageService3',
                        profile: 'level2',
                    },
                ],
            }),
        );

        expect(result?.images[0].source).toEqual({
            kind: 'service',
            serviceId: 'https://example.test/iiif/abc',
            profile: 'level2',
        });
    });

    it('reads a v2 canvas as readily as a v3 one', () => {
        const v2 = {
            '@id': 'https://example.test/canvas/2',
            '@type': 'sc:Canvas',
            width: 800,
            height: 600,
            images: [
                {
                    '@type': 'oa:Annotation',
                    motivation: 'sc:painting',
                    resource: {
                        '@id': 'https://example.test/v2.jpg',
                        '@type': 'dctypes:Image',
                        width: 800,
                        height: 600,
                    },
                    on: 'https://example.test/canvas/2',
                },
            ],
        };

        expect(toPlannerCanvas(v2)).toEqual({
            id: 'https://example.test/canvas/2',
            width: 800,
            height: 600,
            images: [
                {
                    key: 'https://example.test/canvas/2#0',
                    source: {
                        kind: 'static',
                        url: 'https://example.test/v2.jpg',
                    },
                    x: 0,
                    y: 0,
                    width: 1,
                    height: 0.75,
                },
            ],
            thumbnailUrl: null,
        });
    });

    it('returns null for a canvas that paints nothing', () => {
        expect(
            toPlannerCanvas({
                id: 'https://example.test/canvas/empty',
                type: 'Canvas',
                width: 100,
                height: 100,
                items: [],
            }),
        ).toBeNull();
    });

    it('reports null geometry for a Canvas that declares no dimensions', () => {
        // A spec violation the viewer still has to render (user story 32).
        // Reported as "unknown" rather than guessed HERE, because the guess is
        // a median of the canvas's siblings and a reflow when an image service
        // answers — neither of which this function can see.
        const unsized = v3Canvas(STATIC_BODY, {
            width: undefined,
            height: undefined,
        });

        expect(toPlannerCanvas(unsized)).toMatchObject({
            id: 'https://example.test/canvas/1',
            width: null,
            height: null,
            images: [{ source: { kind: 'static' } }],
        });
    });

    it('reports null geometry for a Canvas whose dimensions are unusable', () => {
        expect(
            toPlannerCanvas(v3Canvas(STATIC_BODY, { width: 0, height: 750 })),
        ).toMatchObject({ width: null, height: null });
    });

    it('keeps an unsized canvas in the list rather than dropping it', () => {
        const canvases = toPlannerCanvases([
            v3Canvas(STATIC_BODY),
            v3Canvas(STATIC_BODY, {
                id: 'https://example.test/canvas/2',
                width: undefined,
                height: undefined,
            }),
        ]);

        expect(canvases).toHaveLength(2);
    });

    it('drops unusable canvases rather than emitting holes', () => {
        expect(
            toPlannerCanvases([v3Canvas(STATIC_BODY), { type: 'Canvas' }]),
        ).toHaveLength(1);
    });
});

/**
 * **A canvas is a composition of placed images, not one image.**
 *
 * Both halves of that were dropped by reading `resolveAllCanvasImages()[0]` and
 * discarding its placement: a composite canvas painted only its first picture,
 * and a region-targeted one was stretched across the whole canvas instead of
 * into its rectangle. `resolveAllCanvasImages` has always returned both facts —
 * the image-export plugin composes correctly on them today — so what is
 * asserted here is that the renderer consumes them.
 *
 * Shaped on IIIF Cookbook recipe 0036, whose folio and miniature are the
 * canonical case; the real fixture is at
 * `test/fixtures/manifests/cookbook/0036-composition-from-multiple-images.json`.
 */
describe('toPlannerCanvas — composite canvases', () => {
    const FOLIO = 'https://example.test/folio.jpg';
    const MINIATURE = 'https://example.test/miniature.jpg';

    /** 7216x5412, painted by a full-canvas folio and a targeted miniature. */
    function compositeCanvas() {
        return {
            id: 'https://example.test/canvas/0036',
            type: 'Canvas',
            width: 7216,
            height: 5412,
            items: [
                {
                    id: 'https://example.test/page/1',
                    type: 'AnnotationPage',
                    items: [
                        {
                            type: 'Annotation',
                            motivation: 'painting',
                            body: { id: FOLIO, type: 'Image' },
                            target: 'https://example.test/canvas/0036',
                        },
                        {
                            type: 'Annotation',
                            motivation: 'painting',
                            body: { id: MINIATURE, type: 'Image' },
                            target:
                                'https://example.test/canvas/0036' +
                                '#xywh=3949,994,1091,1232',
                        },
                    ],
                },
            ],
        };
    }

    it('carries every painting annotation, not just the first', () => {
        const result = toPlannerCanvas(compositeCanvas());

        expect(result?.images.map((image) => image.source)).toEqual([
            { kind: 'static', url: FOLIO },
            { kind: 'static', url: MINIATURE },
        ]);
    });

    it('keys each placement by its position on the canvas', () => {
        // Stable across frames and across a Choice switch, and distinct between
        // the two pictures — which is what lets the host hold both decoded at
        // once instead of letting the second evict the first.
        expect(
            toPlannerCanvas(compositeCanvas())?.images.map((i) => i.key),
        ).toEqual([
            'https://example.test/canvas/0036#0',
            'https://example.test/canvas/0036#1',
        ]);
    });

    it('places a region-targeted image in its own box, not across the canvas', () => {
        const [folio, miniature] = toPlannerCanvas(compositeCanvas())!.images;

        // The folio fills the canvas: one unit wide, and as many tall as the
        // aspect ratio.
        expect(folio).toMatchObject({ x: 0, y: 0, width: 1 });
        expect(folio.height).toBeCloseTo(5412 / 7216, 10);

        // The miniature gets its target's box, every component divided by the
        // Canvas's WIDTH — the vertical ones included, so one vertical unit
        // equals one horizontal unit and the region is not squashed.
        expect(miniature.x).toBeCloseTo(3949 / 7216, 10);
        expect(miniature.y).toBeCloseTo(994 / 7216, 10);
        expect(miniature.width).toBeCloseTo(1091 / 7216, 10);
        expect(miniature.height).toBeCloseTo(1232 / 7216, 10);

        // The regression this pins: the miniature must not be canvas-filling.
        expect(miniature.width).toBeLessThan(1);
    });

    it('places a region target on a v2 canvas too, where it is spelled `on`', () => {
        const v2 = {
            '@id': 'https://example.test/canvas/v2composite',
            '@type': 'sc:Canvas',
            width: 1000,
            height: 1000,
            images: [
                {
                    '@type': 'oa:Annotation',
                    motivation: 'sc:painting',
                    resource: { '@id': FOLIO, '@type': 'dctypes:Image' },
                    on: 'https://example.test/canvas/v2composite',
                },
                {
                    '@type': 'oa:Annotation',
                    motivation: 'sc:painting',
                    resource: { '@id': MINIATURE, '@type': 'dctypes:Image' },
                    on: 'https://example.test/canvas/v2composite#xywh=100,200,300,400',
                },
            ],
        };

        expect(toPlannerCanvas(v2)?.images).toHaveLength(2);
        expect(toPlannerCanvas(v2)?.images[1]).toMatchObject({
            x: 0.1,
            y: 0.2,
            width: 0.3,
            height: 0.4,
        });
    });
});

/**
 * The **thumbnail tier**'s first rung, read from raw IIIF JSON.
 *
 * These fixtures are written out here rather than taken from the parser corpus
 * deliberately: that corpus has exactly one canvas-level thumbnail in it, so
 * "the Cookbook fixtures cover this" is an assumption rather than a fact. The
 * shapes below are the four a Canvas is allowed to declare a thumbnail in, and
 * the branch they feed must never be replaced by a discovery fetch merely
 * because a canvas is raw JSON now (spec §Thumbnail resolution, rung 1).
 */
describe('getDeclaredThumbnailUrl', () => {
    it('reads a v3 canvas thumbnail — an array of resources with `id`', () => {
        const canvas = v3Canvas(STATIC_BODY, {
            thumbnail: [
                {
                    id: 'https://example.test/thumb/v3.jpg',
                    type: 'Image',
                    format: 'image/jpeg',
                    width: 200,
                    height: 150,
                },
            ],
        });

        expect(getDeclaredThumbnailUrl(canvas)).toBe(
            'https://example.test/thumb/v3.jpg',
        );
        expect(toPlannerCanvas(canvas)?.thumbnailUrl).toBe(
            'https://example.test/thumb/v3.jpg',
        );
    });

    it('reads a v2 canvas thumbnail — a single resource with `@id`', () => {
        const v2 = {
            '@id': 'https://example.test/canvas/2',
            '@type': 'sc:Canvas',
            width: 800,
            height: 600,
            thumbnail: {
                '@id': 'https://example.test/thumb/v2.jpg',
                '@type': 'dctypes:Image',
            },
            images: [
                {
                    '@type': 'oa:Annotation',
                    motivation: 'sc:painting',
                    resource: {
                        '@id': 'https://example.test/v2.jpg',
                        '@type': 'dctypes:Image',
                        width: 800,
                        height: 600,
                    },
                    on: 'https://example.test/canvas/2',
                },
            ],
        };

        expect(getDeclaredThumbnailUrl(v2)).toBe(
            'https://example.test/thumb/v2.jpg',
        );
        expect(toPlannerCanvas(v2)?.thumbnailUrl).toBe(
            'https://example.test/thumb/v2.jpg',
        );
    });

    it('reads a bare string thumbnail', () => {
        expect(
            getDeclaredThumbnailUrl({
                thumbnail: 'https://example.test/thumb/bare.jpg',
            }),
        ).toBe('https://example.test/thumb/bare.jpg');
    });

    it('takes the resource id even when the thumbnail declares its own service', () => {
        // Rung 1 is "used AS-IS, the ladder ignored". A thumbnail resource may
        // carry an image service, and the gallery's helper prefers a URL built
        // from it at a size baked into the call — but the published id is the
        // publisher's own answer, it costs no discovery, and it is what makes
        // this rung work for a level0 service.
        expect(
            getDeclaredThumbnailUrl({
                thumbnail: [
                    {
                        id: 'https://example.test/thumb/with-service.jpg',
                        service: [
                            {
                                id: 'https://example.test/iiif/thumb',
                                profile: 'level2',
                            },
                        ],
                    },
                ],
            }),
        ).toBe('https://example.test/thumb/with-service.jpg');
    });

    it('reports null where a canvas declares no usable thumbnail', () => {
        expect(getDeclaredThumbnailUrl({})).toBeNull();
        expect(getDeclaredThumbnailUrl({ thumbnail: [] })).toBeNull();
        expect(getDeclaredThumbnailUrl({ thumbnail: '' })).toBeNull();
        expect(getDeclaredThumbnailUrl({ thumbnail: [{}] })).toBeNull();
        expect(getDeclaredThumbnailUrl(null)).toBeNull();
    });
});
