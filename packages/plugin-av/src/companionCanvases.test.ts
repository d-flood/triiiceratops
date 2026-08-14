/**
 * `placeholderCanvas` and `accompanyingCanvas` resolution, from raw canvas JSON
 * in the shapes the Cookbook actually publishes.
 */

import { describe, expect, it } from 'vitest';

import {
    resolveAccompanyingImage,
    resolvePlaceholderImage,
} from './companionCanvases';

/** A companion Canvas painting one image body, with an optional service. */
function companion(body: Record<string, unknown>): Record<string, unknown> {
    return {
        id: 'https://example.org/companion',
        type: 'Canvas',
        width: 772,
        height: 998,
        items: [
            {
                id: 'https://example.org/companion/page',
                type: 'AnnotationPage',
                items: [
                    {
                        id: 'https://example.org/companion/annotation',
                        type: 'Annotation',
                        motivation: 'painting',
                        body,
                        target: 'https://example.org/companion',
                    },
                ],
            },
        ],
    };
}

const PLAIN_IMAGE = {
    id: 'https://example.org/score.png',
    type: 'Image',
    format: 'image/png',
    width: 772,
    height: 998,
};

const SERVED_IMAGE = {
    ...PLAIN_IMAGE,
    id: 'https://example.org/iiif/score/full/,998/0/default.jpg',
    service: [
        {
            id: 'https://example.org/iiif/score',
            type: 'ImageService3',
            profile: 'level1',
        },
    ],
};

describe('accompanyingCanvas', () => {
    it('asks the image service for the lane width it is given', () => {
        const image = resolveAccompanyingImage({
            accompanyingCanvas: companion(SERVED_IMAGE),
        });

        expect(image?.plain).toBe(false);
        expect(image?.urlFor(410.4)).toBe(
            'https://example.org/iiif/score/full/410,/0/default.jpg',
        );
    });

    /*
        The width belongs to the request, not to the reading. A canvas is
        scanned before the renderer has laid it out — and in `individuals` mode
        every canvas but the current one is never laid out at all — so a URL
        fixed at scan time is a full-resolution image bought for a lane a
        fraction of that size.
    */
    it('sizes each request when it is made, not when the canvas is read', () => {
        const image = resolveAccompanyingImage({
            accompanyingCanvas: companion(SERVED_IMAGE),
        });

        expect(image?.urlFor(220)).toBe(
            'https://example.org/iiif/score/full/220,/0/default.jpg',
        );
    });

    // No service, nothing to size against: the authored URL is the only image
    // there is, and it is taken verbatim rather than guessed at.
    it('takes a plain image body’s own URL', () => {
        expect(
            resolveAccompanyingImage({
                accompanyingCanvas: companion(PLAIN_IMAGE),
            })?.urlFor(400),
        ).toBe('https://example.org/score.png');
    });

    /*
        A level0 service serves only the sizes it advertises, so a `full/{w},`
        request against one is a 404 where the body's own URL is an image.
    */
    it('does not build a sized request against a level0 service', () => {
        const level0 = {
            ...SERVED_IMAGE,
            service: [
                {
                    id: 'https://example.org/iiif/score',
                    type: 'ImageService3',
                    profile: 'level0',
                },
            ],
        };

        const image = resolveAccompanyingImage({
            accompanyingCanvas: companion(level0),
        });

        expect(image?.plain).toBe(true);
        expect(image?.urlFor(400)).toBe(SERVED_IMAGE.id);
    });

    // Nothing measurable to ask for: the body's own width is the largest thing
    // it could sensibly be asked for, and is what the request falls back to.
    it('falls back to the body’s declared width for an unmeasured lane', () => {
        expect(
            resolveAccompanyingImage({
                accompanyingCanvas: companion(SERVED_IMAGE),
            })?.urlFor(0),
        ).toBe('https://example.org/iiif/score/full/772,/0/default.jpg');
    });

    it('is null for a canvas that has none, and for a companion painting no image', () => {
        expect(resolveAccompanyingImage({ id: 'canvas' })).toBeNull();
        expect(
            resolveAccompanyingImage({
                accompanyingCanvas: companion({
                    id: 'https://example.org/notes.vtt',
                    type: 'Text',
                    format: 'text/vtt',
                }),
            }),
        ).toBeNull();
    });
});

describe('placeholderCanvas', () => {
    it('reads the same shape from its own property', () => {
        expect(
            resolvePlaceholderImage({
                placeholderCanvas: companion(PLAIN_IMAGE),
            })?.urlFor(640),
        ).toBe('https://example.org/score.png');
    });

    // `plain` is what decides poster vs overlay, so a serviced placeholder must
    // come back as NOT plain even though the URL it produces is an image too.
    it('reports a service-built URL as not plain', () => {
        expect(
            resolvePlaceholderImage({
                placeholderCanvas: companion(SERVED_IMAGE),
            }),
        ).toMatchObject({ plain: false });
    });

    it('is null for a canvas that has none', () => {
        expect(resolvePlaceholderImage({ id: 'canvas' })).toBeNull();
    });
});
