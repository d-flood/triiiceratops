import { describe, expect, it, vi } from 'vitest';

import {
    buildIiifImageRequestUrl,
    getCanvasTileSource,
    resolveCanvasImage,
} from './resolveCanvasImage';

describe('resolveCanvasImage', () => {
    it('resolves an IIIF image service from a v3 body', () => {
        const canvas = {
            id: 'canvas-1',
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
});
