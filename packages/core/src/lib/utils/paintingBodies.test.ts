import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import * as publicApi from '../index';
import { toPlannerCanvas } from '../renderer/canvasDescriptors';
import { getPaintingAnnotations } from './iiifParsing';
import {
    findImageBody,
    isImageBody,
    isUnsupportedCanvas,
    paintingBodyAlternatives,
} from './paintingBodies';

const AV_DIR = join(import.meta.dirname, '../test/fixtures/manifests/av');

/**
 * The painting-body classifier — the rule that keeps a video URL out of the
 * image pipeline (ADR 0017), and the body-array/Choice ordering fix that rides
 * with it (user story 40).
 */

function v3Canvas(...bodies: unknown[]) {
    return {
        id: 'https://example.test/canvas/1',
        type: 'Canvas',
        items: [
            {
                type: 'AnnotationPage',
                items: bodies.map((body) => ({
                    type: 'Annotation',
                    motivation: 'painting',
                    body,
                    target: 'https://example.test/canvas/1',
                })),
            },
        ],
    };
}

const VIDEO_BODY = {
    id: 'https://example.test/movie.mp4',
    type: 'Video',
    format: 'video/mp4',
    width: 640,
    height: 360,
    duration: 60,
};

describe('isImageBody', () => {
    it('accepts a body typed Image in either IIIF version', () => {
        expect(isImageBody({ id: 'a', type: 'Image' })).toBe(true);
        expect(isImageBody({ '@id': 'a', '@type': 'dctypes:Image' })).toBe(
            true,
        );
    });

    it('accepts an image `format` where the type is absent', () => {
        expect(isImageBody({ id: 'a', format: 'image/jpeg' })).toBe(true);
    });

    it('accepts a body carrying an Image API service and nothing else', () => {
        expect(
            isImageBody({
                id: 'a',
                service: { id: 'https://images.test/a', type: 'ImageService3' },
            }),
        ).toBe(true);
        expect(
            isImageBody({
                '@id': 'a',
                service: { '@id': 'https://images.test/a', profile: 'level1' },
            }),
        ).toBe(true);
    });

    it('rejects time-based media however it is spelled', () => {
        expect(isImageBody(VIDEO_BODY)).toBe(false);
        expect(
            isImageBody({
                id: 'https://example.test/track.mp3',
                type: 'Sound',
                format: 'audio/mpeg',
            }),
        ).toBe(false);
    });

    it('rejects a body whose type and format disagree but neither is an image', () => {
        // `av/0014-accompanyingcanvas`, verbatim in shape: typed `Sound`,
        // formatted `video/mp4`. It needs no tie-break between the two.
        expect(
            isImageBody({
                id: 'https://example.test/a.mp4',
                type: 'Sound',
                format: 'video/mp4',
            }),
        ).toBe(false);
    });

    it('rejects a Choice, which is alternatives rather than a resource', () => {
        expect(isImageBody({ type: 'Choice', items: [VIDEO_BODY] })).toBe(
            false,
        );
    });

    it('accepts a body that declares nothing about itself', () => {
        // The deliberate widening of the rule: an untyped, unformatted,
        // serviceless body is the shape a sloppy manifest writes for an image,
        // and calling it unsupported would black out pages that render today.
        // Nothing here says "video" — a body that says so is rejected above.
        expect(isImageBody({ id: 'https://example.test/photo.jpg' })).toBe(
            true,
        );
    });

    it('accepts an untyped body whose only service is not an image service', () => {
        // An auth service, or the `physdim` annex, sits beside the image
        // service on plenty of real v2 resources and can be the only one a
        // body carries. It says nothing about the medium, so the rung above
        // still applies and the picture still paints.
        expect(
            isImageBody({
                '@id': 'https://example.test/full.jpg',
                service: {
                    '@context': 'http://iiif.io/api/auth/1/context.json',
                    '@id': 'https://example.test/auth/login',
                    profile: 'http://iiif.io/api/auth/1/login',
                },
            }),
        ).toBe(true);
    });

    it('accepts an untyped v2 body whose service uses a compliance-URL profile', () => {
        // Image API 1.1 named its levels with a compliance document URL rather
        // than an `iiif.io/api/image/` one, so `getImageService` does not
        // recognise this service — and rejecting the body for carrying it
        // would black out a page that loads today.
        expect(
            isImageBody({
                '@id': 'https://example.test/full.jpg',
                service: {
                    '@id': 'https://example.test/iiif/img',
                    profile:
                        'http://library.stanford.edu/iiif/image-api/1.1/compliance.html#level1',
                },
            }),
        ).toBe(true);
    });

    it('classifies through a SpecificResource wrapper', () => {
        expect(
            isImageBody({ type: 'SpecificResource', source: VIDEO_BODY }),
        ).toBe(false);
        expect(
            isImageBody({
                type: 'SpecificResource',
                source: { id: 'a', type: 'Image' },
            }),
        ).toBe(true);
    });
});

describe('paintingBodyAlternatives', () => {
    it('unwraps the body ARRAY before testing for a Choice', () => {
        // `vendored/lunchroom-manners`' real shape. Testing for a Choice first
        // saw an array, answered "not a Choice", and took `body[0]` — the
        // Choice object itself, which has no id and resolved to nothing by
        // accident.
        const alternatives = paintingBodyAlternatives({
            body: [
                { type: 'Choice', items: [VIDEO_BODY] },
                { id: 'https://example.test/c.vtt', type: 'Text' },
            ],
        });

        expect(alternatives).toEqual([
            VIDEO_BODY,
            { id: 'https://example.test/c.vtt', type: 'Text' },
        ]);
    });

    it('reads the v2 `resource` spelling and the v2 Choice spelling', () => {
        expect(
            paintingBodyAlternatives({
                resource: {
                    '@type': 'oa:Choice',
                    default: { '@id': 'a' },
                    item: [{ '@id': 'b' }],
                },
            }),
        ).toEqual([{ '@id': 'a' }, { '@id': 'b' }]);
    });
});

describe('findImageBody', () => {
    it('answers null for a Choice whose alternatives are all video', () => {
        // Not "dropped as null because the Choice object had no id" — the
        // Choice IS resolved, and its alternative is then classified.
        expect(
            findImageBody({
                body: [
                    { type: 'Choice', items: [VIDEO_BODY, VIDEO_BODY] },
                    { id: 'https://example.test/c.vtt', type: 'Text' },
                ],
            }),
        ).toBeNull();
    });

    it('finds an image sitting behind a non-image in the body array', () => {
        const image = { id: 'https://example.test/a.jpg', type: 'Image' };
        expect(
            findImageBody({
                body: [{ id: 'c.vtt', type: 'Text' }, image],
            }),
        ).toBe(image);
    });

    it('honours the selected Choice alternative', () => {
        const first = { id: 'https://example.test/a.jpg', type: 'Image' };
        const second = { id: 'https://example.test/b.jpg', type: 'Image' };
        const annotation = { body: { type: 'Choice', items: [first, second] } };

        expect(findImageBody(annotation)).toBe(first);
        expect(findImageBody(annotation, 'https://example.test/b.jpg')).toBe(
            second,
        );
    });

    it('does not search past a chosen alternative that is not an image', () => {
        // A Choice is the reader's pick between equivalents, not a fallback
        // chain: picking the video and silently painting the JPEG instead
        // would be answering a different question than the one asked.
        const annotation = {
            body: {
                type: 'Choice',
                items: [VIDEO_BODY, { id: 'b.jpg', type: 'Image' }],
            },
        };

        expect(findImageBody(annotation)).toBeNull();
    });
});

describe('isUnsupportedCanvas', () => {
    it('is true for a canvas whose only body is time-based media', () => {
        expect(isUnsupportedCanvas(v3Canvas(VIDEO_BODY))).toBe(true);
    });

    it('is false for a canvas that paints nothing at all', () => {
        // Cookbook recipe 0283's missing-image canvas, and every IxIF element.
        // It has nothing to be unsupported ABOUT, and the viewer drops it.
        expect(
            isUnsupportedCanvas({ id: 'c', type: 'Canvas', items: [] }),
        ).toBe(false);
    });

    it('is false where one image body sits beside non-image ones', () => {
        // `av/0489-multimedia-canvas`: an Image body, a Video body and three
        // TextualBody ones on one canvas. It paints its image and ignores the
        // rest silently.
        expect(
            isUnsupportedCanvas(
                v3Canvas(
                    { id: 'a.jpg', type: 'Image', format: 'image/jpeg' },
                    VIDEO_BODY,
                    { type: 'TextualBody', value: 'Press Play' },
                ),
            ),
        ).toBe(false);
    });

    it('is decided over every painting body, not the first one', () => {
        expect(isUnsupportedCanvas(v3Canvas(VIDEO_BODY, VIDEO_BODY))).toBe(
            true,
        );
    });
});

/**
 * The classifier crossing the package boundary (SPEC — core seam 2).
 *
 * A claimant has to answer "is this canvas mine to claim", which is this
 * module's question asked from outside. Two implementations of one
 * classification rule would drift apart silently — the exact bug the epic
 * exists to fix — so the public entry point re-exports these functions and does
 * not restate them.
 */
describe('the public classification surface', () => {
    it('is the very function core paints with, not a copy of the rule', () => {
        expect(publicApi.isImageBody).toBe(isImageBody);
        expect(publicApi.isUnsupportedCanvas).toBe(isUnsupportedCanvas);
        expect(publicApi.paintingBodyAlternatives).toBe(
            paintingBodyAlternatives,
        );
    });

    /**
     * The claimant's question is answerable in ONE public call, over every
     * canvas in the corpus — no assembling of bodies, no `some`/`length` test of
     * its own.
     *
     * That is the whole reason `isUnsupportedCanvas` is exported rather than
     * only the two rungs below it. Rebuilt from those rungs the rule comes out
     * as "some body, none of them images", and the plugin that writes it has
     * written a second copy of the collapse this function owns — one that gets
     * Cookbook 0283 (a canvas that paints nothing, which core drops from layout
     * entirely) wrong in the direction that has the plugin claiming a canvas
     * that is not on screen.
     */
    it('answers "is this canvas mine to claim" without restating the rule', () => {
        let claimable = 0;

        // The collapse the export exists for, asked exactly as a plugin asks
        // it: a canvas that paints nothing (Cookbook 0283) is nobody's to
        // claim, and the corpus has no such canvas to learn it from.
        expect(
            publicApi.isUnsupportedCanvas({
                id: 'c',
                type: 'Canvas',
                items: [],
            }),
        ).toBe(false);

        for (const file of readdirSync(AV_DIR)) {
            const manifest = JSON.parse(
                readFileSync(join(AV_DIR, file), 'utf8'),
            );
            const canvases: unknown[] =
                manifest.items ?? manifest.sequences?.[0]?.canvases ?? [];

            for (const canvas of canvases) {
                // Every judgement a claimant makes, in one public call.
                const mine = publicApi.isUnsupportedCanvas(canvas);

                if (mine) {
                    claimable += 1;
                    // And core's own painting path — the descriptor builder —
                    // reaches the same verdict, which is what makes the
                    // claimant and the viewer agree about which canvases the
                    // plugin owns.
                    expect(toPlannerCanvas(canvas)?.images).toEqual([]);
                }

                // The rungs beneath it stay available for a claimant that has to
                // look at the bodies themselves — which medium, which Choice
                // alternative — rather than merely decide the canvas.
                if (mine) {
                    const bodies = getPaintingAnnotations(canvas).flatMap(
                        (annotation: unknown) =>
                            publicApi.paintingBodyAlternatives(annotation),
                    );
                    expect(bodies.length).toBeGreaterThan(0);
                    expect(bodies.every(publicApi.isImageBody)).toBe(false);
                }
            }
        }

        // The corpus is vendored, so a loop that found no claimable canvas
        // would be a green test proving nothing at all.
        expect(claimable).toBeGreaterThan(0);
    });
});
