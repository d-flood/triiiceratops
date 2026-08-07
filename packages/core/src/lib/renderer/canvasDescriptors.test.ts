/**
 * Fixtures here are raw manifest/Canvas JSON, per the epic's baseline: the
 * accessor-bearing canvas doubles the `remove-manifesto` epic removed are not
 * revived.
 */

import { describe, expect, it } from 'vitest';

import { toPlannerCanvas, toPlannerCanvases } from './canvasDescriptors';

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
            source: { kind: 'static', url: 'https://example.test/image.jpg' },
        });
    });

    it('describes a canvas with no image service as a static source', () => {
        expect(toPlannerCanvas(v3Canvas(STATIC_BODY))?.source).toEqual({
            kind: 'static',
            url: 'https://example.test/image.jpg',
        });
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

        expect(result?.source).toEqual({
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
            source: { kind: 'static', url: 'https://example.test/v2.jpg' },
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

    it('drops unusable canvases rather than emitting holes', () => {
        expect(
            toPlannerCanvases([v3Canvas(STATIC_BODY), { type: 'Canvas' }]),
        ).toHaveLength(1);
    });
});
