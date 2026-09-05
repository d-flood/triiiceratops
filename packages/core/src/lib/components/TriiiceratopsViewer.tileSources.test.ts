import { afterEach, describe, expect, it } from 'vitest';

import { manifestsState } from '../state/manifests.svelte';
import { ViewerState } from '../state/viewer.svelte';
import {
    getCanvasTileSource,
    getCanvasTileSources,
} from '../utils/resolveCanvasImage';

/**
 * The tile sources the viewer builds for a canvas — service detection, the
 * IIIF-URL heuristic, and the direct-image fallback.
 *
 * This file used to hold a LOCAL COPY of an old enumeration idiom
 * (`canvas.getImages()`, then `canvas.getContent()`, then `annotation
 * .getResource()` / `.getBody()`) and test the copy rather than the product.
 * The copy also truncated to the first annotation page — the exact data-loss
 * bug `remove-manifesto` ticket 03 fixed — so it stayed green against a
 * regression, and its test names advertised coverage of a code path
 * `TriiiceratopsViewer.svelte` has not used for some time.
 *
 * It now enters through the epic's one seam: a real `ViewerState` loaded with
 * raw manifest JSON, backed by the real manifest cache, with no mocks and no
 * hand-built canvases (`remove-manifesto` SPEC → "The seam", ticket 08). The
 * function under test is the product's own `getCanvasTileSources`, which
 * `TriiiceratopsViewer` reaches through `getViewerTileSources`.
 */

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 1000;

let manifestCounter = 0;
const registeredIds: string[] = [];

/** Load a one-canvas IIIF v3 manifest and hand back the canvas from state. */
async function v3Canvas(canvasBody: Record<string, unknown>): Promise<any> {
    const id = `http://example.org/v3/manifest/${++manifestCounter}`;
    const canvasId = `${id}/canvas/1`;
    registeredIds.push(id);

    const state = new ViewerState();
    await state.setManifestData(id, {
        '@context': 'http://iiif.io/api/presentation/3/context.json',
        id,
        type: 'Manifest',
        label: { en: ['Tile source fixture'] },
        items: [
            {
                id: canvasId,
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
    const canvasId = `${id}/canvas/1`;
    registeredIds.push(id);

    const state = new ViewerState();
    await state.setManifestData(id, {
        '@context': 'http://iiif.io/api/presentation/2/context.json',
        '@id': id,
        '@type': 'sc:Manifest',
        label: 'Tile source fixture v2',
        sequences: [
            {
                '@id': `${id}/sequence/normal`,
                '@type': 'sc:Sequence',
                canvases: [
                    {
                        '@id': canvasId,
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

/** IIIF v3 painting annotations, one AnnotationPage per argument list. */
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

/** The tile sources of a canvas, as bare `TileSource` values. */
function tileSources(canvas: any) {
    return getCanvasTileSources(canvas).map((source) => source.tileSource);
}

describe('TriiiceratopsViewer - Tile Sources', () => {
    afterEach(() => {
        for (const id of registeredIds.splice(0)) {
            manifestsState.clearManifest(id);
        }
    });

    describe('Multiple images per canvas', () => {
        it('returns every image of a multi-image canvas, in document order', async () => {
            // The old local copy took `images[0]` and stopped. Composite
            // canvases are assembled from several images and all of them must
            // reach the viewer.
            const canvas = await v3Canvas(
                paintingPage(
                    {
                        id: 'http://example.org/image/first',
                        type: 'Image',
                        service: {
                            id: 'http://example.org/iiif/first',
                            type: 'ImageService3',
                        },
                    },
                    {
                        id: 'http://example.org/image/second',
                        type: 'Image',
                        service: {
                            id: 'http://example.org/iiif/second',
                            type: 'ImageService3',
                        },
                    },
                ),
            );

            expect(tileSources(canvas)).toEqual([
                'http://example.org/iiif/first/info.json',
                'http://example.org/iiif/second/info.json',
            ]);
            // The single-image accessor still answers with the first.
            expect(getCanvasTileSource(canvas)).toBe(
                'http://example.org/iiif/first/info.json',
            );
        });

        it('should handle empty images array', async () => {
            const canvas = await v2Canvas({ images: [] });

            expect(tileSources(canvas)).toEqual([]);
            expect(getCanvasTileSource(canvas)).toBeNull();
        });

        it('should handle a canvas with no images at all', async () => {
            const canvas = await v2Canvas({});

            expect(tileSources(canvas)).toEqual([]);
            expect(getCanvasTileSource(canvas)).toBeNull();
        });
    });

    describe('IIIF v2 compatibility (canvas.images)', () => {
        it('should extract service from v2 annotation resource', async () => {
            const canvas = await v2Canvas(
                paintingImages({
                    '@id': 'http://example.org/image/1',
                    '@type': 'dctypes:Image',
                    service: {
                        '@id': 'http://example.org/iiif/image1',
                        '@type': 'ImageService2',
                        profile: 'http://iiif.io/api/image/2/level1.json',
                    },
                }),
            );

            expect(getCanvasTileSource(canvas)).toBe(
                'http://example.org/iiif/image1/info.json',
            );
        });

        it('should detect v2 ImageService2 type', async () => {
            const canvas = await v2Canvas(
                paintingImages({
                    '@id': 'http://example.org/image/v2',
                    '@type': 'dctypes:Image',
                    service: {
                        '@id': 'http://example.org/iiif/v2',
                        '@type': 'ImageService2',
                    },
                }),
            );

            expect(getCanvasTileSource(canvas)).toBe(
                'http://example.org/iiif/v2/info.json',
            );
        });

        it('should use @id field for v2 resources', async () => {
            const canvas = await v2Canvas(
                paintingImages({
                    '@id': 'http://example.org/v2-image.jpg',
                    '@type': 'dctypes:Image',
                }),
            );

            expect(getCanvasTileSource(canvas)).toEqual({
                type: 'image',
                url: 'http://example.org/v2-image.jpg',
            });
        });
    });

    describe('IIIF v3 compatibility (canvas.items)', () => {
        it('should read painting annotations from a v3 canvas with no images key', async () => {
            const canvas = await v3Canvas(
                paintingPage({
                    id: 'http://example.org/image/v3',
                    type: 'Image',
                    service: {
                        id: 'http://example.org/iiif/v3',
                        type: 'ImageService3',
                    },
                }),
            );

            expect(getCanvasTileSource(canvas)).toBe(
                'http://example.org/iiif/v3/info.json',
            );
        });

        it('should detect v3 ImageService3 type', async () => {
            const canvas = await v3Canvas(
                paintingPage({
                    id: 'http://example.org/image/v3',
                    type: 'Image',
                    service: {
                        id: 'http://example.org/iiif/v3-service',
                        type: 'ImageService3',
                    },
                }),
            );

            expect(getCanvasTileSource(canvas)).toBe(
                'http://example.org/iiif/v3-service/info.json',
            );
        });

        it('should handle a body given as an array', async () => {
            const canvas = await v3Canvas(
                paintingPage([
                    {
                        id: 'http://example.org/image/first',
                        type: 'Image',
                        service: {
                            id: 'http://example.org/iiif/first',
                            type: 'ImageService3',
                        },
                    },
                ]),
            );

            expect(getCanvasTileSource(canvas)).toBe(
                'http://example.org/iiif/first/info.json',
            );
        });

        it('should use id field for v3 resources', async () => {
            const canvas = await v3Canvas(
                paintingPage({
                    id: 'http://example.org/v3-image.jpg',
                    type: 'Image',
                }),
            );

            expect(getCanvasTileSource(canvas)).toEqual({
                type: 'image',
                url: 'http://example.org/v3-image.jpg',
            });
        });

        it('should read EVERY annotation page of a v3 canvas', async () => {
            // `manifesto.js`'s `getContent()` read `items[0]` and stopped, so a
            // canvas splitting its painting annotations across pages lost all
            // but the first (`remove-manifesto` ticket 03).
            const canvas = await v3Canvas({
                items: ['first', 'second'].map((page) => ({
                    id: `http://example.org/page/${page}`,
                    type: 'AnnotationPage',
                    items: [
                        {
                            id: `http://example.org/annotation/${page}`,
                            type: 'Annotation',
                            motivation: 'painting',
                            body: {
                                id: `http://example.org/image/${page}.jpg`,
                                type: 'Image',
                            },
                        },
                    ],
                })),
            });

            expect(tileSources(canvas)).toEqual([
                { type: 'image', url: 'http://example.org/image/first.jpg' },
                { type: 'image', url: 'http://example.org/image/second.jpg' },
            ]);
        });
    });

    describe('Service detection', () => {
        it('should detect ImageService1 type', async () => {
            const canvas = await v3Canvas(
                paintingPage({
                    id: 'http://example.org/image/1',
                    type: 'Image',
                    service: {
                        id: 'http://example.org/iiif/v1',
                        type: 'ImageService1',
                    },
                }),
            );

            expect(getCanvasTileSource(canvas)).toBe(
                'http://example.org/iiif/v1/info.json',
            );
        });

        it('should detect service by profile URL', async () => {
            const canvas = await v3Canvas(
                paintingPage({
                    id: 'http://example.org/image/1',
                    type: 'Image',
                    service: {
                        id: 'http://example.org/iiif/byprofile',
                        profile: 'http://iiif.io/api/image/2/level2.json',
                    },
                }),
            );

            expect(getCanvasTileSource(canvas)).toBe(
                'http://example.org/iiif/byprofile/info.json',
            );
        });

        it('should detect level0 profile', async () => {
            const canvas = await v3Canvas(
                paintingPage({
                    id: 'http://example.org/image/1',
                    type: 'Image',
                    service: {
                        id: 'http://example.org/iiif/level0',
                        profile: 'level0',
                    },
                }),
            );

            expect(getCanvasTileSource(canvas)).toBe(
                'http://example.org/iiif/level0/info.json',
            );
        });

        it('should handle service arrays', async () => {
            const canvas = await v3Canvas(
                paintingPage({
                    id: 'http://example.org/image/1',
                    type: 'Image',
                    service: [
                        {
                            id: 'http://example.org/iiif/first',
                            type: 'ImageService3',
                        },
                        {
                            id: 'http://example.org/iiif/second',
                            type: 'OtherService',
                        },
                    ],
                }),
            );

            expect(getCanvasTileSource(canvas)).toBe(
                'http://example.org/iiif/first/info.json',
            );
        });

        it('should append info.json if not present', async () => {
            const canvas = await v3Canvas(
                paintingPage({
                    id: 'http://example.org/image/1',
                    type: 'Image',
                    service: {
                        id: 'http://example.org/iiif/service',
                        type: 'ImageService3',
                    },
                }),
            );

            const tileSource = getCanvasTileSource(canvas);
            expect(tileSource).toContain('/info.json');
            expect(tileSource).toBe(
                'http://example.org/iiif/service/info.json',
            );
        });

        it('should not append info.json if already present', async () => {
            const canvas = await v3Canvas(
                paintingPage({
                    id: 'http://example.org/image/1',
                    type: 'Image',
                    service: {
                        id: 'http://example.org/iiif/service/info.json',
                        type: 'ImageService3',
                    },
                }),
            );

            expect(getCanvasTileSource(canvas)).toBe(
                'http://example.org/iiif/service/info.json',
            );
        });
    });

    describe('IIIF URL heuristics', () => {
        it('should parse IIIF URL with /full/ region', async () => {
            const canvas = await v3Canvas(
                paintingPage({
                    id: 'http://example.org/iiif/image1/full/max/0/default.jpg',
                    type: 'Image',
                }),
            );

            expect(getCanvasTileSource(canvas)).toBe(
                'http://example.org/iiif/image1/info.json',
            );
        });

        it('should parse IIIF URL with xywh region', async () => {
            const canvas = await v3Canvas(
                paintingPage({
                    id: 'http://example.org/iiif/image2/100,200,300,400/max/0/default.jpg',
                    type: 'Image',
                }),
            );

            expect(getCanvasTileSource(canvas)).toBe(
                'http://example.org/iiif/image2/info.json',
            );
        });

        it('should not parse URLs without /iiif/ path', async () => {
            const canvas = await v3Canvas(
                paintingPage({
                    id: 'http://example.org/images/photo.jpg',
                    type: 'Image',
                }),
            );

            expect(getCanvasTileSource(canvas)).toEqual({
                type: 'image',
                url: 'http://example.org/images/photo.jpg',
            });
        });
    });

    describe('Resource validation', () => {
        it('should reject empty resource wrappers', async () => {
            const canvas = await v3Canvas(paintingPage({}));

            expect(tileSources(canvas)).toEqual([]);
            expect(getCanvasTileSource(canvas)).toBeNull();
        });

        it('should accept resource with id', async () => {
            const canvas = await v3Canvas(
                paintingPage({ id: 'http://example.org/image.jpg' }),
            );

            expect(getCanvasTileSource(canvas)).not.toBeNull();
        });

        it('should accept a resource carrying only a service', async () => {
            const canvas = await v3Canvas(
                paintingPage({
                    type: 'Image',
                    service: {
                        id: 'http://example.org/iiif/service',
                        type: 'ImageService3',
                    },
                }),
            );

            expect(getCanvasTileSource(canvas)).toBe(
                'http://example.org/iiif/service/info.json',
            );
        });
    });
});
