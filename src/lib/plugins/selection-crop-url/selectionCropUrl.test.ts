import { describe, expect, it } from 'vitest';

import { buildSelectionCropUrl } from './selectionCropUrl';

function createFakeTileSource(options: {
    profile: string;
    width?: number;
    height?: number;
    minLevel?: number;
    maxLevel?: number;
    grids: Record<number, { columns: number; rows: number }>;
    tileUrl?: (level: number, x: number, y: number) => string;
}) {
    const width = options.width ?? 1000;
    const height = options.height ?? 1000;

    return {
        _id: 'https://example.org/iiif/image-1',
        profile: options.profile,
        width,
        height,
        minLevel: options.minLevel ?? 0,
        maxLevel: options.maxLevel ?? 2,
        getNumTiles(level: number) {
            const grid = options.grids[level];
            if (!grid) {
                return { x: 0, y: 0 };
            }
            return { x: grid.columns, y: grid.rows };
        },
        getTileBounds(level: number, x: number, y: number) {
            const grid = options.grids[level];
            const tileWidth = width / grid.columns;
            const tileHeight = height / grid.rows;

            return {
                x: tileWidth * x,
                y: tileHeight * y,
                width: tileWidth,
                height: tileHeight,
            };
        },
        getTileUrl(level: number, x: number, y: number) {
            return options.tileUrl?.(level, x, y)
                ?? `https://example.org/tiles/${level}/${x}/${y}.jpg`;
        },
    };
}

describe('buildSelectionCropUrl', () => {
    it('builds an exact IIIF crop URL for non-level0 services', () => {
        const result = buildSelectionCropUrl({
            selection: {
                x: 12.2,
                y: 18.8,
                width: 115.4,
                height: 96.2,
            },
            serviceId: 'https://example.org/iiif/image-1',
            serviceProfile: 'level1',
        });

        expect(result).toEqual(
            expect.objectContaining({
                exact: true,
                mode: 'iiif-crop',
                url: 'https://example.org/iiif/image-1/12,19,115,96/max/0/default.jpg',
                region: {
                    x: 12,
                    y: 19,
                    width: 115,
                    height: 96,
                },
            }),
        );
    });

    it('composes the selection with a base image API region', () => {
        const result = buildSelectionCropUrl({
            selection: {
                x: 20,
                y: 30,
                width: 40,
                height: 50,
            },
            serviceId: 'https://example.org/iiif/image-1',
            serviceProfile: 'level1',
            baseRegion: {
                x: 100,
                y: 200,
                width: 500,
                height: 600,
            },
        });

        expect(result).toEqual(
            expect.objectContaining({
                exact: true,
                mode: 'iiif-crop',
                url: 'https://example.org/iiif/image-1/120,230,40,50/max/0/default.jpg',
                region: {
                    x: 120,
                    y: 230,
                    width: 40,
                    height: 50,
                },
            }),
        );
    });

    it('uses the deepest single containing tile for level0 selections', () => {
        const tileSource = createFakeTileSource({
            profile: 'level0',
            grids: {
                0: { columns: 1, rows: 1 },
                1: { columns: 2, rows: 2 },
                2: { columns: 4, rows: 4 },
            },
        });

        const result = buildSelectionCropUrl({
            selection: {
                x: 130,
                y: 140,
                width: 80,
                height: 70,
            },
            tileSource,
            fallbackImageUrl: 'https://example.org/full.jpg',
        });

        expect(result).toEqual(
            expect.objectContaining({
                exact: false,
                mode: 'level0-tile',
                url: 'https://example.org/tiles/2/0/0.jpg',
                tileLevel: 2,
                tileX: 0,
                tileY: 0,
            }),
        );
    });

    it('falls back to a coarser tile when the selection spans multiple fine tiles', () => {
        const tileSource = createFakeTileSource({
            profile: 'https://iiif.io/api/image/3/level0.json',
            grids: {
                0: { columns: 1, rows: 1 },
                1: { columns: 2, rows: 2 },
                2: { columns: 4, rows: 4 },
            },
        });

        const result = buildSelectionCropUrl({
            selection: {
                x: 230,
                y: 240,
                width: 120,
                height: 120,
            },
            tileSource,
            fallbackImageUrl: 'https://example.org/full.jpg',
        });

        expect(result).toEqual(
            expect.objectContaining({
                exact: false,
                mode: 'level0-tile',
                url: 'https://example.org/tiles/1/0/0.jpg',
                tileLevel: 1,
                tileX: 0,
                tileY: 0,
            }),
        );
    });

    it('falls back to the provided full image URL when no tile metadata is available', () => {
        const result = buildSelectionCropUrl({
            selection: {
                x: 10,
                y: 20,
                width: 30,
                height: 40,
            },
            serviceProfile: 'level0',
            fallbackImageUrl: 'https://example.org/full.jpg',
        });

        expect(result).toEqual(
            expect.objectContaining({
                exact: false,
                mode: 'full-image',
                url: 'https://example.org/full.jpg',
            }),
        );
    });

    it('rejects empty selections', () => {
        const result = buildSelectionCropUrl({
            selection: {
                x: 10,
                y: 20,
                width: 0,
                height: 40,
            },
            serviceId: 'https://example.org/iiif/image-1',
            serviceProfile: 'level1',
        });

        expect(result).toEqual(
            expect.objectContaining({
                url: null,
                mode: 'unsupported',
                reason: 'empty-selection',
            }),
        );
    });
});