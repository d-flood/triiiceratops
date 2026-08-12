import { describe, expect, it } from 'vitest';

import {
    getThumbnailSrc,
    resolveThumbnailResourceSrc,
} from './getThumbnailSrc';

describe('resolveThumbnailResourceSrc', () => {
    it('prefers a IIIF Image Service URL for manifest thumbnails', () => {
        const thumbnail = [
            {
                id: 'https://iiif.example.org/image/full/max/0/default.jpg',
                type: 'Image',
                service: [
                    {
                        id: 'https://iiif.example.org/image',
                        type: 'ImageService3',
                        profile: 'level1',
                    },
                ],
            },
        ];

        expect(resolveThumbnailResourceSrc(thumbnail)).toBe(
            'https://iiif.example.org/image/full/200,/0/default.jpg',
        );
    });

    it('falls back to the declared thumbnail id for level 0 services', () => {
        const thumbnail = {
            id: 'https://iiif.example.org/image/full/max/0/default.jpg',
            type: 'Image',
            service: [
                {
                    id: 'https://iiif.example.org/image',
                    type: 'ImageService3',
                    profile: 'level0',
                },
            ],
        };

        expect(resolveThumbnailResourceSrc(thumbnail)).toBe(
            'https://iiif.example.org/image/full/max/0/default.jpg',
        );
    });

    it('normalizes service ids that include info.json', () => {
        const thumbnail = {
            id: 'https://iiif.example.org/image/full/max/0/default.jpg',
            type: 'Image',
            service: [
                {
                    '@id': 'https://iiif.example.org/image/info.json',
                    profile: 'http://iiif.io/api/image/2/level1.json',
                },
            ],
        };

        expect(resolveThumbnailResourceSrc(thumbnail, 120)).toBe(
            'https://iiif.example.org/image/full/120,/0/default.jpg',
        );
    });
});

/**
 * Thumbnail resolution from a canvas's painting annotations — the second rung
 * of the fallback ladder, reached when the canvas declares no `thumbnail`.
 *
 * The v2 cases are the point: reading only the v3 `body` spelling of an
 * annotation's painting resource and never the v2 `resource` one would
 * produce a blank thumbnail for every v2 canvas — silently, with nothing but
 * a `logger.debug` line. The v3 case is here as the control.
 */
describe('getThumbnailSrc', () => {
    const V2_CANVAS = 'https://example.org/v2/canvas/1';

    function v2Canvas(resource: any) {
        return {
            '@id': V2_CANVAS,
            '@type': 'sc:Canvas',
            width: 800,
            height: 1000,
            images: [
                {
                    '@id': `${V2_CANVAS}/annotation/1`,
                    '@type': 'oa:Annotation',
                    motivation: 'sc:painting',
                    on: V2_CANVAS,
                    resource,
                },
            ],
        };
    }

    it('builds a service URL from a IIIF v2 annotation resource', () => {
        const canvas = v2Canvas({
            '@id': `${V2_CANVAS}/image/full/full/0/default.jpg`,
            '@type': 'dctypes:Image',
            service: {
                '@id': 'https://iiif.example.org/v2-image',
                profile: 'http://iiif.io/api/image/2/level2.json',
            },
        });

        expect(getThumbnailSrc(canvas, 120)).toBe(
            'https://iiif.example.org/v2-image/full/120,/0/default.jpg',
        );
    });

    it('falls back to the IIIF v2 resource id when it has no service', () => {
        const canvas = v2Canvas({
            '@id': 'https://example.org/static/image.png',
            '@type': 'dctypes:Image',
        });

        expect(getThumbnailSrc(canvas)).toBe(
            'https://example.org/static/image.png',
        );
    });

    it('keeps a IIIF v2 resource that carries only `@id` and no service', () => {
        // A v2 resource carries `@id` and never `id`; a guard checking only
        // the v3 spelling would null it out.
        const canvas = v2Canvas({
            '@id': 'https://example.org/v2-only-at-id.jpg',
            '@type': 'dctypes:Image',
        });

        expect(getThumbnailSrc(canvas)).toBe(
            'https://example.org/v2-only-at-id.jpg',
        );
    });

    it('uses the default alternative of a IIIF v2 oa:Choice', () => {
        const canvas = v2Canvas({
            '@type': 'oa:Choice',
            default: { '@id': 'https://example.org/image/natural.jpg' },
            item: [{ '@id': 'https://example.org/image/x-ray.jpg' }],
        });

        expect(getThumbnailSrc(canvas)).toBe(
            'https://example.org/image/natural.jpg',
        );
    });

    it('still reads the IIIF v3 body spelling', () => {
        const canvas = {
            id: 'https://example.org/v3/canvas/1',
            type: 'Canvas',
            width: 800,
            height: 1000,
            items: [
                {
                    id: 'https://example.org/v3/canvas/1/page/1',
                    type: 'AnnotationPage',
                    items: [
                        {
                            id: 'https://example.org/v3/canvas/1/annotation/1',
                            type: 'Annotation',
                            motivation: 'painting',
                            target: 'https://example.org/v3/canvas/1',
                            body: {
                                id: 'https://example.org/v3/image.jpg',
                                type: 'Image',
                                service: [
                                    {
                                        id: 'https://iiif.example.org/v3-image',
                                        type: 'ImageService3',
                                        profile: 'level1',
                                    },
                                ],
                            },
                        },
                    ],
                },
            ],
        };

        expect(getThumbnailSrc(canvas, 120)).toBe(
            'https://iiif.example.org/v3-image/full/120,/0/default.jpg',
        );
    });
});
