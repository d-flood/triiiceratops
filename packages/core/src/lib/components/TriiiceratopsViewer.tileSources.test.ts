import { afterEach, describe, expect, it, vi } from 'vitest';

import { manifestsState } from '../state/manifests.svelte';
import { ViewerState } from '../state/viewer.svelte';
import {
    canvasPaintsImage,
    getVisibleViewerCanvases,
    resolveAllCanvasImages,
    toImageSource,
} from '../utils/resolveCanvasImage';

/**
 * Where a canvas's painted pixels are decided to come from — service detection,
 * the IIIF-URL heuristic, and the direct-image fallback.
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
 * functions under test are the product's own `resolveAllCanvasImages` and
 * `toImageSource` — the decision the renderer's descriptors paint from and the
 * viewer's renderability gate asks — reached the same way each of them is in
 * production.
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

/**
 * Load a manifest of `count` canvases and hand back the canvas list from state.
 *
 * `paints` decides whether each canvas carries a painting body core can
 * request, which is the difference between the renderability gate stopping at
 * the first canvas and having to ask every one of them.
 */
async function continuousManifest(
    count: number,
    paints: boolean,
): Promise<any[]> {
    const id = `http://example.org/v3/long/${++manifestCounter}`;
    registeredIds.push(id);

    const state = new ViewerState();
    await state.setManifestData(id, {
        '@context': 'http://iiif.io/api/presentation/3/context.json',
        id,
        type: 'Manifest',
        label: { en: ['A long manifest'] },
        items: Array.from({ length: count }, (_unused, index) => ({
            id: `${id}/canvas/${index}`,
            type: 'Canvas',
            label: { en: [`Folio ${index}`] },
            width: CANVAS_WIDTH,
            height: CANVAS_HEIGHT,
            ...paintingPage(
                paints
                    ? {
                          id: `${id}/image/${index}.jpg`,
                          type: 'Image',
                      }
                    : {
                          id: `${id}/audio/${index}.mp3`,
                          type: 'Sound',
                      },
            ),
        })),
    });

    return state.canvases;
}

/**
 * Where each of a canvas's painting images comes from, in document order.
 *
 * A body that names no source at all is dropped rather than recorded as
 * `null`, which is what every consumer of the decision does with it: the
 * renderer's descriptors skip it, and the viewer's gate does not count it as
 * something that paints.
 */
function imageSources(canvas: any) {
    return resolveAllCanvasImages(canvas)
        .map(toImageSource)
        .filter((source) => source !== null);
}

/** The first image's source, or `null` where the canvas resolves none. */
function firstImageSource(canvas: any) {
    const resolved = resolveAllCanvasImages(canvas)[0];
    return resolved ? toImageSource(resolved) : null;
}

/** A service source, as this suite spells one. */
function service(serviceId: string, profile: string | null = null) {
    return { kind: 'service', serviceId, profile };
}

/** A static-image source, as this suite spells one. */
function image(url: string) {
    return { kind: 'static', url };
}

describe('TriiiceratopsViewer - Tile Sources', () => {
    afterEach(() => {
        for (const id of registeredIds.splice(0)) {
            manifestsState.clearManifest(id);
        }
    });

    /**
     * What the viewer asks of image resolution per derivation, counted.
     *
     * The renderer resolves its own painting descriptors, so all the viewer
     * owes it is whether anything on screen paints and a key naming the world
     * under the reader. Neither answer needs every folio resolved, and on a
     * long continuous manifest the difference between stopping at the first
     * canvas that paints and resolving all of them is the whole of user story
     * 7 — so these count the work rather than assert it.
     *
     * `getSelectedChoice` is the counter: resolution consults it once per
     * painting annotation, so with one annotation per canvas the call count IS
     * the number of canvases resolved.
     */
    describe('Resolution work on a long continuous manifest', () => {
        const LONG = 800;

        it('resolves one canvas, not the whole manifest, to answer whether anything paints', async () => {
            const canvases = await continuousManifest(LONG, true);
            const getSelectedChoice = vi.fn(() => undefined);

            const visible = getVisibleViewerCanvases({
                canvases,
                currentCanvasIndex: 0,
                currentCanvasId: canvases[0].id,
                viewingMode: 'continuous',
                pagedOffset: 0,
            });
            expect(visible).toHaveLength(LONG);

            const renderable = visible.some((canvas) =>
                canvasPaintsImage(canvas, { getSelectedChoice }),
            );

            expect(renderable).toBe(true);
            // One, not 800: the gate stops at the first canvas that paints.
            expect(getSelectedChoice).toHaveBeenCalledTimes(1);
        });

        it('hands back the same canvas list whichever folio the reader is on', async () => {
            const canvases = await continuousManifest(LONG, true);
            const visibleAt = (index: number) =>
                getVisibleViewerCanvases({
                    canvases,
                    currentCanvasIndex: index,
                    currentCanvasId: canvases[index].id,
                    viewingMode: 'continuous',
                    pagedOffset: 0,
                });

            // Identity, not equality: this is what lets the viewer's derived
            // renderability and Choice key sit downstream of the visible set
            // and not re-run when the reader travels. Continuous mode shows the
            // whole manifest, so navigating changes which folio is current and
            // nothing about which canvases are on screen.
            expect(visibleAt(500)).toBe(visibleAt(0));
        });

        it('asks every canvas only when none of them paints an image', async () => {
            // The honest worst case, stated rather than hidden: a manifest core
            // cannot paint at all has no first canvas to stop at, so the gate
            // reads all of them before answering `false` and handing the
            // canvases to the unsupported presentation instead.
            const canvases = await continuousManifest(LONG, false);
            const getSelectedChoice = vi.fn(() => undefined);

            const renderable = canvases.some((canvas) =>
                canvasPaintsImage(canvas, { getSelectedChoice }),
            );

            expect(renderable).toBe(false);
            expect(getSelectedChoice).toHaveBeenCalledTimes(LONG);
        });
    });

    /**
     * The renderability gate and the renderer's descriptors are NOT the same
     * question, and this is where they part.
     *
     * `toPlannerCanvas` supplies a placeholder for a Canvas that declares no
     * dimensions, so such a canvas is laid out from a median of its siblings
     * and reflowed once an image service reports the truth. The gate has never
     * had that placeholder: an unsized canvas resolves nothing for it, and the
     * reader gets the viewer-wide "no image found" rather than a mounted
     * renderer. Pinned here because the two look interchangeable and are not —
     * swapping the gate onto planner renderability would silently change what
     * a spec-violating manifest shows.
     */
    describe('Renderability of a canvas that declares no dimensions', () => {
        it('resolves nothing for a canvas with an image body and no width or height', async () => {
            const id = `http://example.org/v3/unsized/${++manifestCounter}`;
            registeredIds.push(id);

            const state = new ViewerState();
            await state.setManifestData(id, {
                '@context': 'http://iiif.io/api/presentation/3/context.json',
                id,
                type: 'Manifest',
                label: { en: ['Unsized'] },
                items: [
                    {
                        id: `${id}/canvas/1`,
                        type: 'Canvas',
                        label: { en: ['Page 1'] },
                        ...paintingPage({
                            id: 'http://example.org/image/unsized.jpg',
                            type: 'Image',
                        }),
                    },
                ],
            });

            const canvas = state.canvases[0];

            expect(imageSources(canvas)).toEqual([]);
            expect(canvasPaintsImage(canvas)).toBe(false);
        });

        it('resolves the image once the canvas declares its dimensions', async () => {
            // The other half of the pair, so the assertion above is read as
            // "the dimensions decide it" rather than "this body is unusable".
            const canvas = await v3Canvas(
                paintingPage({
                    id: 'http://example.org/image/unsized.jpg',
                    type: 'Image',
                }),
            );

            expect(canvasPaintsImage(canvas)).toBe(true);
        });
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

            expect(imageSources(canvas)).toEqual([
                service('http://example.org/iiif/first'),
                service('http://example.org/iiif/second'),
            ]);
            // The first one is what a single-image consumer resolves.
            expect(firstImageSource(canvas)).toEqual(
                service('http://example.org/iiif/first'),
            );
        });

        it('should handle empty images array', async () => {
            const canvas = await v2Canvas({ images: [] });

            expect(imageSources(canvas)).toEqual([]);
            expect(firstImageSource(canvas)).toBeNull();
        });

        it('should handle a canvas with no images at all', async () => {
            const canvas = await v2Canvas({});

            expect(imageSources(canvas)).toEqual([]);
            expect(firstImageSource(canvas)).toBeNull();
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

            expect(firstImageSource(canvas)).toEqual(
                service(
                    'http://example.org/iiif/image1',
                    'http://iiif.io/api/image/2/level1.json',
                ),
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

            expect(firstImageSource(canvas)).toEqual(
                service('http://example.org/iiif/v2'),
            );
        });

        it('should use @id field for v2 resources', async () => {
            const canvas = await v2Canvas(
                paintingImages({
                    '@id': 'http://example.org/v2-image.jpg',
                    '@type': 'dctypes:Image',
                }),
            );

            expect(firstImageSource(canvas)).toEqual(
                image('http://example.org/v2-image.jpg'),
            );
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

            expect(firstImageSource(canvas)).toEqual(
                service('http://example.org/iiif/v3'),
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

            expect(firstImageSource(canvas)).toEqual(
                service('http://example.org/iiif/v3-service'),
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

            expect(firstImageSource(canvas)).toEqual(
                service('http://example.org/iiif/first'),
            );
        });

        it('should use id field for v3 resources', async () => {
            const canvas = await v3Canvas(
                paintingPage({
                    id: 'http://example.org/v3-image.jpg',
                    type: 'Image',
                }),
            );

            expect(firstImageSource(canvas)).toEqual(
                image('http://example.org/v3-image.jpg'),
            );
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

            expect(imageSources(canvas)).toEqual([
                image('http://example.org/image/first.jpg'),
                image('http://example.org/image/second.jpg'),
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

            expect(firstImageSource(canvas)).toEqual(
                service('http://example.org/iiif/v1'),
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

            expect(firstImageSource(canvas)).toEqual(
                service(
                    'http://example.org/iiif/byprofile',
                    'http://iiif.io/api/image/2/level2.json',
                ),
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

            expect(firstImageSource(canvas)).toEqual(
                service('http://example.org/iiif/level0', 'level0'),
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

            expect(firstImageSource(canvas)).toEqual(
                service('http://example.org/iiif/first'),
            );
        });

        it('keeps a service id that carries no info.json suffix', async () => {
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

            // The service id is the base a consumer builds its own requests
            // from — `info.json`, a tile, a size ladder — so it is carried as
            // authored rather than pre-spelled as any one of them.
            expect(firstImageSource(canvas)).toEqual(
                service('http://example.org/iiif/service'),
            );
        });

        it('trims an info.json suffix a manifest put on its service id', async () => {
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

            expect(firstImageSource(canvas)).toEqual(
                service('http://example.org/iiif/service'),
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

            expect(firstImageSource(canvas)).toEqual(
                service('http://example.org/iiif/image1'),
            );
        });

        it('should parse IIIF URL with xywh region', async () => {
            const canvas = await v3Canvas(
                paintingPage({
                    id: 'http://example.org/iiif/image2/100,200,300,400/max/0/default.jpg',
                    type: 'Image',
                }),
            );

            expect(firstImageSource(canvas)).toEqual(
                service('http://example.org/iiif/image2'),
            );
        });

        it('should not parse URLs without /iiif/ path', async () => {
            const canvas = await v3Canvas(
                paintingPage({
                    id: 'http://example.org/images/photo.jpg',
                    type: 'Image',
                }),
            );

            expect(firstImageSource(canvas)).toEqual(
                image('http://example.org/images/photo.jpg'),
            );
        });
    });

    describe('Resource validation', () => {
        it('should reject empty resource wrappers', async () => {
            const canvas = await v3Canvas(paintingPage({}));

            expect(imageSources(canvas)).toEqual([]);
            expect(firstImageSource(canvas)).toBeNull();
        });

        it('should accept resource with id', async () => {
            const canvas = await v3Canvas(
                paintingPage({ id: 'http://example.org/image.jpg' }),
            );

            expect(firstImageSource(canvas)).not.toBeNull();
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

            expect(firstImageSource(canvas)).toEqual(
                service('http://example.org/iiif/service'),
            );
        });
    });
});
