import { describe, expect, it, vi } from 'vitest';

import {
    buildIiifImageRequestUrl,
    getCanvasTileSources,
    getCanvasTileSource,
    resolveCanvasImage,
} from './resolveCanvasImage';

describe('resolveCanvasImage', () => {
    it('resolves an IIIF image service from a v3 body', () => {
        const canvas = {
            id: 'canvas-1',
            width: 1600,
            height: 2400,
            getContent: () => [
                {
                    getBody: () => ({
                        id: 'https://example.org/image/full.jpg',
                        width: 1600,
                        height: 2400,
                        service: {
                            id: 'https://example.org/iiif/image-1',
                            type: 'ImageService3',
                        },
                    }),
                },
            ],
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

        expect(getCanvasTileSource(canvas)).toBe(
            'https://example.org/iiif/image-1/info.json',
        );
    });

    it('uses the selected Choice item when provided', () => {
        const canvas = {
            id: 'canvas-2',
            width: 1200,
            height: 1800,
            getImages: () => [
                {
                    getBody: () => [
                        {
                            id: 'https://example.org/image/default.jpg',
                            width: 1200,
                            height: 1800,
                            service: {
                                id: 'https://example.org/iiif/default',
                                type: 'ImageService3',
                            },
                        },
                        {
                            id: 'https://example.org/image/infrared.jpg',
                            width: 800,
                            height: 1100,
                            service: {
                                id: 'https://example.org/iiif/infrared',
                                type: 'ImageService3',
                            },
                        },
                    ],
                    __jsonld: {
                        body: {
                            type: 'Choice',
                            items: [
                                {
                                    id: 'choice-default',
                                    service: {
                                        id: 'https://example.org/iiif/default',
                                        type: 'ImageService3',
                                    },
                                },
                                {
                                    id: 'choice-infrared',
                                    service: {
                                        id: 'https://example.org/iiif/infrared',
                                        type: 'ImageService3',
                                    },
                                },
                            ],
                        },
                    },
                },
            ],
        };

        const getSelectedChoice = vi.fn(() => 'choice-infrared');
        const resolved = resolveCanvasImage(canvas, { getSelectedChoice });

        expect(getSelectedChoice).toHaveBeenCalledWith('canvas-2');
        expect(resolved?.serviceId).toBe('https://example.org/iiif/infrared');
        expect(resolved?.resourceWidth).toBe(800);
        expect(resolved?.resourceHeight).toBe(1100);
    });

    it('falls back to a direct image URL when no IIIF service exists', () => {
        const canvas = {
            id: 'canvas-3',
            width: 1000,
            height: 1000,
            getImages: () => [
                {
                    getResource: () => ({
                        id: 'https://example.org/static/image.png',
                    }),
                },
            ],
        };

        expect(getCanvasTileSource(canvas)).toEqual({
            type: 'image',
            url: 'https://example.org/static/image.png',
        });
    });

    it('captures level0 service profiles for export fallbacks', () => {
        const canvas = {
            id: 'canvas-4',
            width: 2000,
            height: 3000,
            getContent: () => [
                {
                    getBody: () => ({
                        id: 'https://example.org/static/level0.jpg',
                        width: 2000,
                        height: 3000,
                        service: {
                            id: 'https://example.org/iiif/level0-image',
                            type: 'ImageService3',
                            profile: 'level0',
                        },
                    }),
                },
            ],
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

    it('preserves crop positioning alongside export dimensions', () => {
        const canvas = {
            id: 'canvas-5',
            width: 1000,
            height: 2000,
            getContent: () => [
                {
                    target: 'https://example.org/canvas/5#xywh=100,250,400,800',
                    getBody: () => ({
                        id: 'https://example.org/image/crop.jpg',
                        width: 400,
                        height: 800,
                        service: {
                            id: 'https://example.org/iiif/crop-image',
                            type: 'ImageService3',
                        },
                    }),
                },
            ],
        };

        expect(resolveCanvasImage(canvas)).toEqual(
            expect.objectContaining({
                resourceWidth: 400,
                resourceHeight: 800,
                x: 0.1,
                y: 0.25,
                width: 0.4,
            }),
        );

        expect(getCanvasTileSources(canvas)).toEqual([
            expect.objectContaining({
                tileSource: 'https://example.org/iiif/crop-image/info.json',
                x: 0.1,
                y: 0.25,
                width: 0.4,
            }),
        ]);
    });

    it('unwraps SpecificResource bodies and applies ImageApiSelector regions', () => {
        const canvas = {
            id: 'canvas-6',
            width: 1768,
            height: 2080,
            getContent: () => [
                {
                    getBody: () => ({
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
                    }),
                },
            ],
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

        expect(getCanvasTileSource(canvas)).toEqual({
            type: 'image',
            url: 'https://example.org/iiif/newspaper/1768,2423,1768,2080/max/0/default.jpg',
        });
    });

    it('supports percentage-based ImageApiSelector regions', () => {
        const canvas = {
            id: 'canvas-7',
            width: 200,
            height: 100,
            getContent: () => [
                {
                    getBody: () => ({
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
                    }),
                },
            ],
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
