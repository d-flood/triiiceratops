import { afterEach, describe, expect, it } from 'vitest';

import { manifestsState } from '../state/manifests.svelte';
import { ViewerState } from '../state/viewer.svelte';
import { getThumbnailSrc } from '../utils/getThumbnailSrc';

/**
 * The thumbnail the gallery shows for a canvas.
 *
 * This file used to hold a LOCAL COPY of the gallery's old extraction logic
 * (`canvas.getThumbnail()`, then `canvas.getImages()`, then
 * `canvas.getContent()`, then `annotation.getResource()` / `.getBody()`) and
 * test the copy rather than the product. The copy also truncated to the first
 * annotation page — the exact data-loss bug `remove-manifesto` ticket 03 fixed
 * — so it stayed green against a regression, and the test names promising
 * "v3 getContent" coverage described a code path that no longer exists.
 *
 * It now enters through the epic's one seam: a real `ViewerState` loaded with
 * raw manifest JSON, backed by the real manifest cache, with no mocks and no
 * hand-built canvases (`remove-manifesto` SPEC → "The seam", ticket 08). The
 * function under test is `getThumbnailSrc`, which is what
 * `ThumbnailGallery.svelte` actually calls.
 */

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 1000;

let manifestCounter = 0;
const registeredIds: string[] = [];

/** Load a one-canvas IIIF v3 manifest and hand back the canvas from state. */
async function v3Canvas(canvasBody: Record<string, unknown>): Promise<any> {
    const id = `http://example.org/v3/manifest/${++manifestCounter}`;
    registeredIds.push(id);

    const state = new ViewerState();
    await state.setManifestData(id, {
        '@context': 'http://iiif.io/api/presentation/3/context.json',
        id,
        type: 'Manifest',
        label: { en: ['Thumbnail fixture'] },
        items: [
            {
                id: `${id}/canvas/1`,
                type: 'Canvas',
                label: { en: ['Page 1'] },
                width: CANVAS_WIDTH,
                height: CANVAS_HEIGHT,
                ...canvasBody,
            },
        ],
    });

    return state.canvases[0];
}

/** Load a one-canvas IIIF v2 manifest and hand back the canvas from state. */
async function v2Canvas(canvasBody: Record<string, unknown>): Promise<any> {
    const id = `http://example.org/v2/manifest/${++manifestCounter}`;
    registeredIds.push(id);

    const state = new ViewerState();
    await state.setManifestData(id, {
        '@context': 'http://iiif.io/api/presentation/2/context.json',
        '@id': id,
        '@type': 'sc:Manifest',
        label: 'Thumbnail fixture v2',
        sequences: [
            {
                '@id': `${id}/sequence/normal`,
                '@type': 'sc:Sequence',
                canvases: [
                    {
                        '@id': `${id}/canvas/1`,
                        '@type': 'sc:Canvas',
                        label: 'Page 1',
                        width: CANVAS_WIDTH,
                        height: CANVAS_HEIGHT,
                        ...canvasBody,
                    },
                ],
            },
        ],
    });

    return state.canvases[0];
}

/** IIIF v3 painting annotations in one AnnotationPage. */
function paintingPage(...bodies: unknown[]) {
    return {
        items: [
            {
                id: 'http://example.org/page/1',
                type: 'AnnotationPage',
                items: bodies.map((body, index) => ({
                    id: `http://example.org/annotation/${index + 1}`,
                    type: 'Annotation',
                    motivation: 'painting',
                    body,
                })),
            },
        ],
    };
}

/** IIIF v2 painting annotations, one per resource. */
function paintingImages(...resources: unknown[]) {
    return {
        images: resources.map((resource, index) => ({
            '@id': `http://example.org/annotation/${index + 1}`,
            '@type': 'oa:Annotation',
            motivation: 'sc:painting',
            resource,
        })),
    };
}

describe('ThumbnailGallery - Thumbnail extraction', () => {
    afterEach(() => {
        for (const id of registeredIds.splice(0)) {
            manifestsState.clearManifest(id);
        }
    });

    describe('Declared canvas thumbnail', () => {
        it('should use a v3 thumbnail declared on the canvas', async () => {
            const canvas = await v3Canvas({
                thumbnail: [
                    {
                        id: 'http://example.org/thumb-v3.jpg',
                        type: 'Image',
                    },
                ],
                ...paintingPage({
                    id: 'http://example.org/image/1',
                    type: 'Image',
                }),
            });

            expect(getThumbnailSrc(canvas)).toBe(
                'http://example.org/thumb-v3.jpg',
            );
        });

        it('should use a v2 thumbnail declared with @id', async () => {
            const canvas = await v2Canvas({
                thumbnail: {
                    '@id': 'http://example.org/thumb-v2.jpg',
                    '@type': 'dctypes:Image',
                },
                ...paintingImages({
                    '@id': 'http://example.org/image/1',
                    '@type': 'dctypes:Image',
                }),
            });

            expect(getThumbnailSrc(canvas)).toBe(
                'http://example.org/thumb-v2.jpg',
            );
        });

        it('should build a service URL from a declared thumbnail service', async () => {
            const canvas = await v3Canvas({
                thumbnail: [
                    {
                        id: 'http://example.org/thumb/full/max/0/default.jpg',
                        type: 'Image',
                        service: [
                            {
                                id: 'http://example.org/iiif/thumb',
                                type: 'ImageService3',
                                profile: 'level1',
                            },
                        ],
                    },
                ],
                ...paintingPage({
                    id: 'http://example.org/image/1',
                    type: 'Image',
                }),
            });

            expect(getThumbnailSrc(canvas)).toBe(
                'http://example.org/iiif/thumb/full/200,/0/default.jpg',
            );
        });
    });

    describe('Fallback to image service (IIIF v2 canvas.images)', () => {
        it('should construct thumbnail URL from IIIF service', async () => {
            const canvas = await v2Canvas(
                paintingImages({
                    '@id': 'http://example.org/image/1',
                    '@type': 'dctypes:Image',
                    service: {
                        '@id': 'http://example.org/iiif/image1',
                        profile: 'http://iiif.io/api/image/2/level1.json',
                    },
                }),
            );

            expect(getThumbnailSrc(canvas)).toBe(
                'http://example.org/iiif/image1/full/200,/0/default.jpg',
            );
        });

        it('should handle service array', async () => {
            const canvas = await v2Canvas(
                paintingImages({
                    '@id': 'http://example.org/image/1',
                    '@type': 'dctypes:Image',
                    service: [
                        {
                            '@id': 'http://example.org/iiif/image3',
                            profile: 'http://iiif.io/api/image/2/level1.json',
                        },
                    ],
                }),
            );

            expect(getThumbnailSrc(canvas)).toBe(
                'http://example.org/iiif/image3/full/200,/0/default.jpg',
            );
        });

        it('should skip level0 services and use direct image URL', async () => {
            const canvas = await v2Canvas(
                paintingImages({
                    '@id': 'http://example.org/direct-image.jpg',
                    '@type': 'dctypes:Image',
                    service: {
                        '@id': 'http://example.org/iiif/level0',
                        profile: 'http://iiif.io/api/image/2/level0.json',
                    },
                }),
            );

            // Should use direct image URL instead of constructing IIIF URL
            expect(getThumbnailSrc(canvas)).toBe(
                'http://example.org/direct-image.jpg',
            );
        });
    });

    describe('Fallback to image content (IIIF v3 canvas.items)', () => {
        it('should build a service URL from a v3 painting body', async () => {
            const canvas = await v3Canvas(
                paintingPage({
                    id: 'http://example.org/image/v3',
                    type: 'Image',
                    service: [
                        {
                            id: 'http://example.org/iiif/v3',
                            type: 'ImageService3',
                            profile: 'level1',
                        },
                    ],
                }),
            );

            expect(getThumbnailSrc(canvas)).toBe(
                'http://example.org/iiif/v3/full/200,/0/default.jpg',
            );
        });

        it('should handle a body given as an array', async () => {
            const canvas = await v3Canvas(
                paintingPage([
                    {
                        id: 'http://example.org/image/first',
                        type: 'Image',
                        service: [
                            {
                                id: 'http://example.org/iiif/first',
                                type: 'ImageService3',
                                profile: 'level1',
                            },
                        ],
                    },
                    { id: 'http://example.org/image/second', type: 'Image' },
                ]),
            );

            // Should use first image
            expect(getThumbnailSrc(canvas)).toBe(
                'http://example.org/iiif/first/full/200,/0/default.jpg',
            );
        });
    });

    describe('Direct image URL fallback', () => {
        it('should use the v3 body id when no service is available', async () => {
            const canvas = await v3Canvas(
                paintingPage({
                    id: 'http://example.org/raw-image.jpg',
                    type: 'Image',
                }),
            );

            expect(getThumbnailSrc(canvas)).toBe(
                'http://example.org/raw-image.jpg',
            );
        });

        it('should use the v2 resource @id when no service is available', async () => {
            const canvas = await v2Canvas(
                paintingImages({
                    '@id': 'http://example.org/raw-v2-image.jpg',
                    '@type': 'dctypes:Image',
                }),
            );

            expect(getThumbnailSrc(canvas)).toBe(
                'http://example.org/raw-v2-image.jpg',
            );
        });
    });

    describe('Empty canvas handling', () => {
        it('should handle canvas with an empty images array', async () => {
            const canvas = await v2Canvas({ images: [] });

            expect(getThumbnailSrc(canvas)).toBe('');
        });

        it('should handle canvas with no painting annotations at all', async () => {
            const canvas = await v3Canvas({});

            expect(getThumbnailSrc(canvas)).toBe('');
        });
    });
});
