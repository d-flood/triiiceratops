import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
    buildIiifImageRequestUrl,
    resolveAllCanvasImages,
    resolveCanvasImage,
    toImageSource,
} from './resolveCanvasImage';

/**
 * Wrap painting annotations in an `AnnotationPage`, the way a IIIF v3 canvas
 * carries them: `canvas.items[].items[]`. The v2 canvases below use
 * `canvas.images[]` instead, with the painting resource under `resource`
 * rather than `body`.
 */
function annotationPages(...annotations: any[]) {
    return [
        {
            id: 'https://example.org/annotation-page/1',
            type: 'AnnotationPage',
            items: annotations,
        },
    ];
}

const NATURAL = 'https://example.org/image/natural.jpg';
const XRAY = 'https://example.org/image/xray.jpg';

/**
 * A raw IIIF v3 Choice canvas, shaped like IIIF Cookbook recipe 0033 — see
 * `../test/fixtures/manifests/cookbook/0033-choice.json`.
 *
 * The two alternatives differ in every observable (id, service, dimensions,
 * label) so that "the selection was honored" cannot pass by accident.
 */
function v3ChoiceCanvas(
    options: { bodyType?: string; itemsKey?: 'items' | 'item' } = {},
): any {
    const { bodyType = 'Choice', itemsKey = 'items' } = options;

    return {
        id: 'canvas-v3-choice',
        type: 'Canvas',
        width: 2000,
        height: 1271,
        items: annotationPages({
            id: 'canvas-v3-choice/annotation/1',
            type: 'Annotation',
            motivation: 'painting',
            target: 'canvas-v3-choice',
            body: {
                type: bodyType,
                [itemsKey]: [
                    {
                        id: NATURAL,
                        type: 'Image',
                        label: { en: ['Natural Light'] },
                        width: 2000,
                        height: 1271,
                        service: [
                            {
                                id: 'https://example.org/iiif/natural',
                                type: 'ImageService3',
                                profile: 'level1',
                            },
                        ],
                    },
                    {
                        id: XRAY,
                        type: 'Image',
                        label: { en: ['X-Ray'] },
                        width: 1000,
                        height: 636,
                        service: [
                            {
                                id: 'https://example.org/iiif/xray',
                                type: 'ImageService3',
                                profile: 'level1',
                            },
                        ],
                    },
                ],
            },
        }),
    };
}

describe('resolveCanvasImage', () => {
    it('resolves an IIIF image service from a v3 body', () => {
        const canvas = {
            id: 'canvas-1',
            width: 1600,
            height: 2400,
            items: annotationPages({
                body: {
                    id: 'https://example.org/image/full.jpg',
                    width: 1600,
                    height: 2400,
                    service: {
                        id: 'https://example.org/iiif/image-1',
                        type: 'ImageService3',
                    },
                },
            }),
        };

        expect(resolveCanvasImage(canvas)).toEqual(
            expect.objectContaining({
                canvasId: 'canvas-1',
                resourceId: 'https://example.org/image/full.jpg',
                resourceWidth: 1600,
                resourceHeight: 2400,
                serviceId: 'https://example.org/iiif/image-1',
                serviceProfile: null,
            }),
        );

        expect(toImageSource(resolveCanvasImage(canvas)!)).toEqual({
            kind: 'service',
            serviceId: 'https://example.org/iiif/image-1',
            profile: null,
        });
    });

    it('uses the selected Choice item when provided, on a raw IIIF v2 canvas', () => {
        // The v2 Choice spelling: `oa:Choice` with `default` plus `item`,
        // under the annotation's `resource`.
        const canvas = {
            '@id': 'canvas-2',
            '@type': 'sc:Canvas',
            width: 1200,
            height: 1800,
            images: [
                {
                    '@id': 'canvas-2/annotation/1',
                    '@type': 'oa:Annotation',
                    motivation: 'sc:painting',
                    on: 'canvas-2',
                    resource: {
                        '@type': 'oa:Choice',
                        default: {
                            '@id': 'choice-default',
                            width: 1200,
                            height: 1800,
                            service: {
                                '@id': 'https://example.org/iiif/default',
                                profile:
                                    'http://iiif.io/api/image/2/level2.json',
                            },
                        },
                        item: [
                            {
                                '@id': 'choice-infrared',
                                width: 800,
                                height: 1100,
                                service: {
                                    '@id': 'https://example.org/iiif/infrared',
                                    profile:
                                        'http://iiif.io/api/image/2/level2.json',
                                },
                            },
                        ],
                    },
                },
            ],
        };

        // Nothing selected: the v2 `default` is what renders.
        expect(resolveCanvasImage(canvas)?.serviceId).toBe(
            'https://example.org/iiif/default',
        );

        const getSelectedChoice = vi.fn(() => 'choice-infrared');
        const resolved = resolveCanvasImage(canvas, { getSelectedChoice });

        expect(getSelectedChoice).toHaveBeenCalledWith('canvas-2');
        expect(resolved?.serviceId).toBe('https://example.org/iiif/infrared');
        expect(resolved?.resourceWidth).toBe(800);
        expect(resolved?.resourceHeight).toBe(1100);
    });

    it('resolves the first Choice item on a raw IIIF v3 canvas when nothing is selected', () => {
        const canvas = v3ChoiceCanvas();

        expect(resolveCanvasImage(canvas)).toEqual(
            expect.objectContaining({
                canvasId: 'canvas-v3-choice',
                resourceId: NATURAL,
                resourceWidth: 2000,
                resourceHeight: 1271,
                serviceId: 'https://example.org/iiif/natural',
                serviceProfile: 'level1',
                label: 'Natural Light',
            }),
        );

        expect(toImageSource(resolveCanvasImage(canvas)!)).toEqual({
            kind: 'service',
            serviceId: 'https://example.org/iiif/natural',
            profile: 'level1',
        });
    });

    it('uses the selected Choice item on a raw IIIF v3 canvas', () => {
        const canvas = v3ChoiceCanvas();
        const getSelectedChoice = vi.fn(() => XRAY);

        const resolved = resolveCanvasImage(canvas, { getSelectedChoice });

        expect(getSelectedChoice).toHaveBeenCalledWith('canvas-v3-choice');
        expect(resolved?.resourceId).toBe(XRAY);
        expect(resolved?.serviceId).toBe('https://example.org/iiif/xray');
        expect(resolved?.resourceWidth).toBe(1000);
        expect(resolved?.resourceHeight).toBe(636);
        expect(resolved?.label).toBe('X-Ray');

        // A Choice contributes exactly ONE image to the canvas, not one per
        // alternative — otherwise every alternative would be tiled at once.
        expect(
            resolveAllCanvasImages(canvas, { getSelectedChoice }).map(
                toImageSource,
            ),
        ).toEqual([
            {
                kind: 'service',
                serviceId: 'https://example.org/iiif/xray',
                profile: 'level1',
            },
        ]);
    });

    it('falls back to the first Choice item when the selected id is not among them', () => {
        const canvas = v3ChoiceCanvas();

        const resolved = resolveCanvasImage(canvas, {
            getSelectedChoice: () => 'https://example.org/image/not-here.jpg',
        });

        expect(resolved?.resourceId).toBe(NATURAL);
    });

    it('accepts the oa:Choice spelling on a raw IIIF v3 body', () => {
        const canvas = v3ChoiceCanvas({ bodyType: 'oa:Choice' });

        expect(
            resolveCanvasImage(canvas, { getSelectedChoice: () => XRAY })
                ?.resourceId,
        ).toBe(XRAY);
    });

    it('accepts the singular item alias on a raw IIIF v3 Choice body', () => {
        const canvas = v3ChoiceCanvas({ itemsKey: 'item' });

        expect(resolveCanvasImage(canvas)?.resourceId).toBe(NATURAL);
        expect(
            resolveCanvasImage(canvas, { getSelectedChoice: () => XRAY })
                ?.resourceId,
        ).toBe(XRAY);
    });

    it('resolves both alternatives of the IIIF Cookbook 0033 Choice manifest', () => {
        // Entered through real manifest JSON rather than a hand-built canvas:
        // this is the exact bytes a publisher serves, and it stays valid when
        // the canvas representation changes. Read with `fs` rather than
        // imported — a Vite-transformed JSON module is shared across the
        // module graph, and manifest registration mutates whatever JSON it
        // is handed.
        const manifest = JSON.parse(
            readFileSync(
                join(
                    import.meta.dirname,
                    '../test/fixtures/manifests/cookbook/0033-choice.json',
                ),
                'utf8',
            ),
        );
        const canvas = manifest.items[0];
        const natural =
            'https://iiif.io/api/image/3.0/example/reference/421e65be2ce95439b3ad6ef1f2ab87a9-dee-natural';
        const xray =
            'https://iiif.io/api/image/3.0/example/reference/421e65be2ce95439b3ad6ef1f2ab87a9-dee-xray';

        expect(resolveCanvasImage(canvas)).toEqual(
            expect.objectContaining({
                canvasId:
                    'https://iiif.io/api/cookbook/recipe/0033-choice/canvas/p1',
                resourceId: `${natural}/full/max/0/default.jpg`,
                serviceId: natural,
                resourceWidth: 2000,
                resourceHeight: 1271,
                label: 'Natural Light',
            }),
        );

        expect(
            toImageSource(
                resolveCanvasImage(canvas, {
                    getSelectedChoice: () => `${xray}/full/max/0/default.jpg`,
                })!,
            ),
        ).toEqual({ kind: 'service', serviceId: xray, profile: 'level1' });
    });

    it('falls back to a direct image URL when no IIIF service exists', () => {
        const canvas = {
            '@id': 'canvas-3',
            '@type': 'sc:Canvas',
            width: 1000,
            height: 1000,
            images: [
                {
                    '@id': 'canvas-3/annotation/1',
                    '@type': 'oa:Annotation',
                    motivation: 'sc:painting',
                    on: 'canvas-3',
                    resource: {
                        '@id': 'https://example.org/static/image.png',
                        '@type': 'dctypes:Image',
                    },
                },
            ],
        };

        expect(toImageSource(resolveCanvasImage(canvas)!)).toEqual({
            kind: 'static',
            url: 'https://example.org/static/image.png',
        });
    });

    it('captures level0 service profiles for export fallbacks', () => {
        const canvas = {
            id: 'canvas-4',
            width: 2000,
            height: 3000,
            items: annotationPages({
                body: {
                    id: 'https://example.org/static/level0.jpg',
                    width: 2000,
                    height: 3000,
                    service: {
                        id: 'https://example.org/iiif/level0-image',
                        type: 'ImageService3',
                        profile: 'level0',
                    },
                },
            }),
        };

        expect(resolveCanvasImage(canvas)).toEqual(
            expect.objectContaining({
                resourceId: 'https://example.org/static/level0.jpg',
                resourceWidth: 2000,
                resourceHeight: 3000,
                serviceId: 'https://example.org/iiif/level0-image',
                serviceProfile: 'level0',
            }),
        );
    });

    it('gives a canvas-filling image the manifest canvas box, not the image one', () => {
        const canvas = {
            id: 'canvas-mismatched',
            width: 1000,
            height: 2000,
            items: annotationPages({
                body: {
                    id: 'https://example.org/image/mismatched.jpg',
                    // Deliberately a different aspect ratio from the canvas:
                    // manifest Canvas dimensions are the placement geometry.
                    width: 800,
                    height: 800,
                },
            }),
        };

        expect(resolveCanvasImage(canvas)).toEqual(
            expect.objectContaining({ x: 0, y: 0, width: 1, height: 2 }),
        );
    });

    it('preserves crop positioning alongside export dimensions', () => {
        const canvas = {
            id: 'canvas-5',
            width: 1000,
            height: 2000,
            items: annotationPages({
                target: 'https://example.org/canvas/5#xywh=100,250,400,800',
                body: {
                    id: 'https://example.org/image/crop.jpg',
                    width: 400,
                    height: 800,
                    service: {
                        id: 'https://example.org/iiif/crop-image',
                        type: 'ImageService3',
                    },
                },
            }),
        };

        expect(resolveCanvasImage(canvas)).toEqual(
            expect.objectContaining({
                resourceWidth: 400,
                resourceHeight: 800,
                x: 0.1,
                y: 0.25,
                width: 0.4,
                // Both axes normalize by canvas width, like x/y/width.
                height: 0.8,
            }),
        );

        expect(
            resolveAllCanvasImages(canvas).map((resolved) => ({
                source: toImageSource(resolved),
                x: resolved.x,
                y: resolved.y,
                width: resolved.width,
            })),
        ).toEqual([
            {
                source: {
                    kind: 'service',
                    serviceId: 'https://example.org/iiif/crop-image',
                    profile: null,
                },
                x: 0.1,
                y: 0.25,
                width: 0.4,
            },
        ]);
    });

    it('unwraps SpecificResource bodies and applies ImageApiSelector regions', () => {
        const canvas = {
            id: 'canvas-6',
            width: 1768,
            height: 2080,
            items: annotationPages({
                body: {
                    id: 'https://example.org/body/1',
                    type: 'SpecificResource',
                    source: {
                        id: 'https://example.org/image/full/max/0/default.jpg',
                        width: 3536,
                        height: 4999,
                        service: {
                            id: 'https://example.org/iiif/newspaper',
                            type: 'ImageService3',
                        },
                    },
                    selector: {
                        type: 'ImageApiSelector',
                        region: '1768,2423,1768,2080',
                    },
                },
            }),
        };

        expect(resolveCanvasImage(canvas)).toEqual(
            expect.objectContaining({
                resourceId: 'https://example.org/image/full/max/0/default.jpg',
                resourceWidth: 1768,
                resourceHeight: 2080,
                serviceId: 'https://example.org/iiif/newspaper',
                imageApiRegion: {
                    x: 1768,
                    y: 2423,
                    width: 1768,
                    height: 2080,
                },
            }),
        );

        expect(toImageSource(resolveCanvasImage(canvas)!)).toEqual({
            kind: 'static',
            url: 'https://example.org/iiif/newspaper/1768,2423,1768,2080/max/0/default.jpg',
        });
    });

    it('supports percentage-based ImageApiSelector regions', () => {
        const canvas = {
            id: 'canvas-7',
            width: 200,
            height: 100,
            items: annotationPages({
                body: {
                    type: 'SpecificResource',
                    source: {
                        id: 'https://example.org/image/full/max/0/default.jpg',
                        width: 1000,
                        height: 500,
                        service: {
                            id: 'https://example.org/iiif/percent-region',
                            type: 'ImageService3',
                        },
                    },
                    selector: {
                        type: 'ImageApiSelector',
                        region: 'pct:10,20,30,40',
                    },
                },
            }),
        };

        expect(resolveCanvasImage(canvas)).toEqual(
            expect.objectContaining({
                resourceWidth: 300,
                resourceHeight: 200,
                imageApiRegion: {
                    x: 100,
                    y: 100,
                    width: 300,
                    height: 200,
                },
            }),
        );
    });
});

describe('resolveAllCanvasImages', () => {
    it('picks up a body label when present, and leaves it null otherwise (IIIF Cookbook 0036)', () => {
        const canvas = {
            id: 'https://iiif.io/api/cookbook/recipe/0036-composition-from-multiple-images/canvas/p1',
            width: 7216,
            height: 5412,
            items: annotationPages(
                {
                    target: 'https://iiif.io/api/cookbook/recipe/0036-composition-from-multiple-images/canvas/p1',
                    body: {
                        id: 'https://iiif.io/api/image/3.0/example/reference/899da506920824588764bc12b10fc800-bnf_chateauroux/full/max/0/default.jpg',
                        type: 'Image',
                        width: 7216,
                        height: 5412,
                        service: [
                            {
                                id: 'https://iiif.io/api/image/3.0/example/reference/899da506920824588764bc12b10fc800-bnf_chateauroux',
                                type: 'ImageService3',
                                profile: 'level1',
                            },
                        ],
                    },
                },
                {
                    target: 'https://iiif.io/api/cookbook/recipe/0036-composition-from-multiple-images/canvas/p1#xywh=3949,994,1091,1232',
                    body: {
                        id: 'https://iiif.io/api/image/3.0/example/reference/899da506920824588764bc12b10fc800-bnf_chateauroux_miniature/full/max/0/default.jpg',
                        type: 'Image',
                        label: {
                            fr: [
                                'Miniature [Chilpéric Ier tue Galswinthe, se remarie et est assassiné]',
                            ],
                        },
                        width: 2138,
                        height: 2414,
                        service: [
                            {
                                id: 'https://iiif.io/api/image/3.0/example/reference/899da506920824588764bc12b10fc800-bnf_chateauroux_miniature',
                                type: 'ImageService3',
                                profile: 'level1',
                            },
                        ],
                    },
                },
            ),
        };

        const resolved = resolveAllCanvasImages(canvas);
        expect(resolved).toHaveLength(2);
        expect(resolved[0].label).toBeNull();
        expect(resolved[1].label).toBe(
            'Miniature [Chilpéric Ier tue Galswinthe, se remarie et est assassiné]',
        );
    });

    it('falls back to an annotation label when the body has none', () => {
        const canvas = {
            id: 'canvas-1',
            width: 800,
            height: 1000,
            items: annotationPages({
                label: { en: ['Left page'] },
                target: 'https://example.org/canvas/1#xywh=0,0,400,1000',
                body: {
                    id: 'https://example.org/image/left.jpg',
                    width: 400,
                    height: 1000,
                    service: {
                        id: 'https://example.org/iiif/left',
                        type: 'ImageService3',
                    },
                },
            }),
        };

        expect(resolveAllCanvasImages(canvas)[0].label).toBe('Left page');
    });

    it('returns every image of a IIIF v2 composite canvas', () => {
        // Several images assembled into one page. All of them must resolve —
        // truncating to the first would be silent data loss — and each must
        // land where its `on` fragment puts it.
        const canvas = {
            '@id': 'canvas-composite',
            '@type': 'sc:Canvas',
            width: 1600,
            height: 1000,
            images: ['left', 'right'].map((side) => ({
                '@id': `canvas-composite/annotation/${side}`,
                '@type': 'oa:Annotation',
                motivation: 'sc:painting',
                on: `canvas-composite#xywh=${side === 'left' ? 0 : 800},0,800,1000`,
                resource: {
                    '@id': `https://example.org/image/${side}.jpg`,
                    '@type': 'dctypes:Image',
                    width: 800,
                    height: 1000,
                },
            })),
        };

        expect(
            resolveAllCanvasImages(canvas).map((image) => image.resourceId),
        ).toEqual([
            'https://example.org/image/left.jpg',
            'https://example.org/image/right.jpg',
        ]);

        // The v2 spelling of the fragment is `on`, not `target`. Read only from
        // `target`, both halves landed at the origin at full canvas width, one
        // on top of the other. Positions are normalized by the canvas's WIDTH
        // on both axes, so the right-hand page starts at 800/1600.
        expect(
            resolveAllCanvasImages(canvas).map(({ x, y, width, height }) => ({
                x,
                y,
                width,
                height,
            })),
        ).toEqual([
            { x: 0, y: 0, width: 0.5, height: 0.625 },
            { x: 0.5, y: 0, width: 0.5, height: 0.625 },
        ]);
    });

    it('does not throw when a Choice writes its items as a bare object', () => {
        // Invalid per the spec and the same shape the corpus already carries
        // for `sequences`. Unguarded, `items.find(...)` threw a TypeError out
        // through `resolveAllCanvasImages`, which has no try/catch anywhere on
        // its path to the viewer.
        const canvas = {
            id: 'canvas-bare-choice',
            type: 'Canvas',
            width: 800,
            height: 1000,
            items: annotationPages({
                target: 'canvas-bare-choice',
                body: {
                    type: 'Choice',
                    items: { id: 'https://example.org/image/only.jpg' },
                },
            }),
        };

        expect(
            resolveAllCanvasImages(canvas, {
                getSelectedChoice: () => 'https://example.org/image/only.jpg',
            }).map((image) => image.resourceId),
        ).toEqual(['https://example.org/image/only.jpg']);
    });

    it('still treats a zero canvas dimension as no dimensions at all', () => {
        // `0` is a valid IIIF canvas width, but `||` treats it as falsy, so
        // `getCanvasDimensions` must fall through to "no dimensions" here
        // rather than resolve a zero width, which would divide by zero in
        // the positioning arithmetic downstream.
        const canvas = {
            id: 'canvas-zero-width',
            type: 'Canvas',
            width: 0,
            height: 1000,
            items: annotationPages({
                target: 'canvas-zero-width',
                body: { id: 'https://example.org/image/zero.jpg' },
            }),
        };

        expect(resolveAllCanvasImages(canvas)).toEqual([]);
    });
});

describe('buildIiifImageRequestUrl', () => {
    it('normalizes info.json service IDs before building export URLs', () => {
        expect(
            buildIiifImageRequestUrl(
                'https://example.org/iiif/image-1/info.json',
                { width: 1400 },
            ),
        ).toBe('https://example.org/iiif/image-1/full/1400,/0/default.jpg');
    });

    it('supports height-constrained requests for wide canvas exports', () => {
        expect(
            buildIiifImageRequestUrl('https://example.org/iiif/image-1', {
                height: 1500,
            }),
        ).toBe('https://example.org/iiif/image-1/full/,1500/0/default.jpg');
    });

    it('supports region-constrained requests', () => {
        expect(
            buildIiifImageRequestUrl('https://example.org/iiif/image-1', {
                region: '10,20,300,400',
                size: 'max',
            }),
        ).toBe(
            'https://example.org/iiif/image-1/10,20,300,400/max/0/default.jpg',
        );
    });
});
