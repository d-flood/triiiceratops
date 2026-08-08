// @vitest-environment node
/**
 * Seam 1 — the tile pyramid's geometry and URLs.
 *
 * Pinned to the **node** environment for the same reason as the planner's own
 * tests: nothing in this graph may touch a DOM global, and under happy-dom a
 * stray one would pass unnoticed.
 */

import { describe, expect, it } from 'vitest';

import {
    buildPyramid,
    chooseLevel,
    tileCanvasRect,
    tileKey,
    tileRegion,
    tilesIntersecting,
    tileUrl,
} from './tilePyramid';
import type { ImageServiceFacts, LayoutRect } from './types';

const SERVICE = 'https://images.test/abc';

function facts(overrides: Partial<ImageServiceFacts> = {}): ImageServiceFacts {
    return {
        width: 4096,
        height: 4096,
        tileSize: 512,
        scaleFactors: [1, 2, 4, 8],
        version: 3,
        ...overrides,
    };
}

const RECT: LayoutRect = {
    canvasId: 'c1',
    x: 0,
    y: 0,
    width: 1000,
    height: 1000,
};

describe('buildPyramid', () => {
    it('orders levels coarsest first, with level 0 the base', () => {
        const pyramid = buildPyramid(SERVICE, facts())!;

        expect(pyramid.levels.map((level) => level.scaleFactor)).toEqual([
            8, 4, 2, 1,
        ]);
        expect(pyramid.levels[0]).toMatchObject({
            level: 0,
            columns: 1,
            rows: 1,
        });
    });

    it('gives the base level a single tile: that is what makes the viewer never blank', () => {
        const pyramid = buildPyramid(SERVICE, facts())!;
        const base = pyramid.levels[0];

        expect(base.columns * base.rows).toBe(1);
    });

    it('computes the tile grid on the full-resolution image, not on the level', () => {
        // 4097 wide at scale factor 2 is a 2049-pixel level: dividing THAT by
        // the tile size claims a fifth column containing one source pixel's
        // worth of nothing.
        const pyramid = buildPyramid(
            SERVICE,
            facts({ width: 4096, height: 4096, scaleFactors: [1, 2] }),
        )!;

        const coarse = pyramid.levels[0];
        expect(coarse.scaleFactor).toBe(2);
        expect(coarse.columns).toBe(4);
        expect(coarse.width).toBe(2048);
    });

    it('derives a power-of-two chain when the service advertises tiles but no scale factors', () => {
        const pyramid = buildPyramid(
            SERVICE,
            facts({ width: 2000, height: 1000, scaleFactors: undefined }),
        )!;

        expect(pyramid.levels.map((level) => level.scaleFactor)).toEqual([
            4, 2, 1,
        ]);
        expect(pyramid.levels[0].columns * pyramid.levels[0].rows).toBe(1);
    });

    it('has no pyramid for a service advertising no tiling', () => {
        // A level0 service offering only fixed whole-image sizes is a
        // size-ladder source; inventing a tile grid would mint URLs it cannot
        // serve.
        expect(
            buildPyramid(SERVICE, facts({ tileSize: undefined })),
        ).toBeNull();
        expect(buildPyramid(SERVICE, facts({ tileSize: null }))).toBeNull();
    });

    it('has no pyramid for a service with no usable dimensions', () => {
        expect(buildPyramid(SERVICE, facts({ width: 0 }))).toBeNull();
    });

    it('derives a grid for a tile-less service the caller says is not level0', () => {
        // `tiles` is optional at every compliance level. A level 1/2 service
        // that omits it still answers arbitrary regions, so the renderer picks
        // the grid — the alternative is treating it as a size ladder whose only
        // rung is the whole master.
        const pyramid = buildPyramid(
            SERVICE,
            facts({ tileSize: undefined, scaleFactors: undefined }),
            512,
        )!;

        expect(pyramid.tileSize).toBe(512);
        expect(pyramid.levels.map((level) => level.scaleFactor)).toEqual([
            8, 4, 2, 1,
        ]);
        expect(pyramid.levels[0].columns * pyramid.levels[0].rows).toBe(1);
    });

    it('refuses to derive a grid for a level0 service, whatever the caller offers', () => {
        // For level0 the missing `tiles` key IS the meaning: there are no
        // region derivatives on disk, so every URL a derived grid minted would
        // 404 into the permanent negative cache.
        expect(
            buildPyramid(
                SERVICE,
                facts({ tileSize: undefined, level0: true }),
                512,
            ),
        ).toBeNull();
    });
});

describe('tileRegion', () => {
    it('clips the last column and row to the image', () => {
        const pyramid = buildPyramid(
            SERVICE,
            facts({ width: 1100, height: 600, scaleFactors: [1, 2] }),
        )!;
        const full = pyramid.levels[1];

        expect(tileRegion(pyramid, full, 0, 0)).toEqual({
            x: 0,
            y: 0,
            width: 512,
            height: 512,
        });
        expect(tileRegion(pyramid, full, 2, 1)).toEqual({
            x: 1024,
            y: 512,
            width: 76,
            height: 88,
        });
    });
});

describe('tileUrl', () => {
    it('asks for the whole image by the canonical `full` region at the base level', () => {
        const pyramid = buildPyramid(SERVICE, facts())!;

        expect(tileUrl(pyramid, pyramid.levels[0], 0, 0)).toBe(
            `${SERVICE}/full/512,/0/default.jpg`,
        );
    });

    it('asks for a full-resolution region scaled down by the level factor', () => {
        const pyramid = buildPyramid(SERVICE, facts())!;
        const level = pyramid.levels[1]; // scale factor 4

        expect(tileUrl(pyramid, level, 1, 0)).toBe(
            `${SERVICE}/2048,0,2048,2048/512,/0/default.jpg`,
        );
    });

    it('asks a version 2 service for default quality, never the deprecated native', () => {
        // 2.1 deprecated `native` and requires `default` from compliance level 1
        // upwards, and a 2.0 document is indistinguishable from a 2.1 one — so
        // `native` here would 404 every tile of a strictly-2.1 service, spend
        // its one retry, and land in the permanent negative cache.
        const pyramid = buildPyramid(SERVICE, facts({ version: 2 }))!;

        expect(tileUrl(pyramid, pyramid.levels[0], 0, 0)).toContain(
            '/0/default.jpg',
        );
    });

    it('honours a preferred format', () => {
        const pyramid = buildPyramid(SERVICE, facts({ format: 'png' }))!;

        expect(tileUrl(pyramid, pyramid.levels[0], 0, 0)).toMatch(/\.png$/);
    });

    it('snaps a level0 whole-image request to a width the service actually generated', () => {
        // A level0 tree writes whole-image derivatives only for the entries in
        // `sizes[]`. 1201 wide over factors [1,2,4,8] puts the base level at
        // `ceil(1201/8) = 151,` — while the generator, rounding down, wrote
        // `150,`. Unsnapped that is a permanent 404 behind the negative cache:
        // no base level, so no blur-up, on every canvas of the manifest.
        const pyramid = buildPyramid(
            SERVICE,
            facts({
                width: 1201,
                height: 901,
                tileSize: 256,
                level0: true,
                sizes: [
                    { width: 150, height: 112 },
                    { width: 300, height: 225 },
                    { width: 600, height: 450 },
                    { width: 1201, height: 901 },
                ],
            }),
        )!;

        expect(tileUrl(pyramid, pyramid.levels[0], 0, 0)).toBe(
            `${SERVICE}/full/150,/0/default.jpg`,
        );
        // Only WHOLE-IMAGE requests snap: a region has no `sizes[]` entry to
        // snap to, and the level's own scaling is what the server applies.
        expect(tileUrl(pyramid, pyramid.levels[1], 0, 0)).toBe(
            `${SERVICE}/0,0,1024,901/256,/0/default.jpg`,
        );
    });

    it('does not snap a level 1/2 service, which can answer any width exactly', () => {
        const pyramid = buildPyramid(
            SERVICE,
            facts({
                width: 1201,
                height: 901,
                tileSize: 256,
                sizes: [{ width: 150, height: 112 }],
            }),
        )!;

        expect(tileUrl(pyramid, pyramid.levels[0], 0, 0)).toBe(
            `${SERVICE}/full/151,/0/default.jpg`,
        );
    });
});

/**
 * `imageScale` is DEVICE pixels per full-resolution image pixel throughout — not
 * CSS pixels. The distinction is the whole reason these numbers are what they
 * are: a level chosen from CSS pixels carries a quarter of the detail a 2×
 * screen can resolve.
 */
describe('chooseLevel', () => {
    it('takes the base level when the whole image is small on screen', () => {
        const pyramid = buildPyramid(SERVICE, facts())!;

        expect(chooseLevel(pyramid, 0.05, 0.5).level).toBe(0);
    });

    it('takes full resolution at 1:1, where the display can resolve every pixel', () => {
        const pyramid = buildPyramid(SERVICE, facts())!;

        expect(chooseLevel(pyramid, 1, 0.5).scaleFactor).toBe(1);
        expect(chooseLevel(pyramid, 8, 0.5).scaleFactor).toBe(1);
    });

    it('reaches full resolution on a 2× screen at half the CSS-pixel scale', () => {
        // The same view: 0.4 CSS pixels per image pixel. On a 1× screen the
        // finest level is oversampled past the ratio and the next coarser one is
        // taken; on a 2× screen it is not. Fed CSS pixels, a HiDPI display would
        // never see the full-resolution level at all.
        const pyramid = buildPyramid(SERVICE, facts())!;

        expect(chooseLevel(pyramid, 0.4 * 1, 0.5).scaleFactor).toBe(2);
        expect(chooseLevel(pyramid, 0.4 * 2, 0.5).scaleFactor).toBe(1);
    });

    it('tolerates oversampling down to the minimum pixel ratio before dropping a level', () => {
        const pyramid = buildPyramid(SERVICE, facts())!;

        // 0.3 device pixels per image pixel: the full-resolution level would
        // carry 3.3 level pixels per device pixel, past the 2× that a ratio of
        // 0.5 allows, so the half-resolution level is taken instead.
        expect(chooseLevel(pyramid, 0.3, 0.5).scaleFactor).toBe(2);
        // A LOWER ratio tolerates more oversampling and keeps the finer level;
        // a higher one accepts a blurrier one. That is the previous renderer's
        // direction, carried forward with the value.
        expect(chooseLevel(pyramid, 0.3, 0.25).scaleFactor).toBe(1);
        expect(chooseLevel(pyramid, 0.3, 2).scaleFactor).toBe(8);
    });
});

describe('tilesIntersecting', () => {
    it('returns the whole grid for a null box — what the base level asks for', () => {
        const pyramid = buildPyramid(SERVICE, facts())!;
        const level = pyramid.levels[2]; // 4x4

        expect(tilesIntersecting(pyramid, level, RECT, null)).toHaveLength(16);
    });

    it('returns only the tiles a canvas-space box touches', () => {
        const pyramid = buildPyramid(SERVICE, facts())!;
        const level = pyramid.levels[3]; // 8x8, each tile 125 canvas units

        const tiles = tilesIntersecting(pyramid, level, RECT, {
            x: 10,
            y: 10,
            width: 100,
            height: 100,
        });

        expect(tiles).toEqual([{ column: 0, row: 0 }]);
    });

    it('does not claim the next tile when a box ends exactly on a boundary', () => {
        const pyramid = buildPyramid(SERVICE, facts())!;
        const level = pyramid.levels[3];

        const tiles = tilesIntersecting(pyramid, level, RECT, {
            x: 0,
            y: 0,
            width: 125,
            height: 125,
        });

        expect(tiles).toEqual([{ column: 0, row: 0 }]);
    });

    it('clamps a box running off the canvas rather than returning phantom tiles', () => {
        const pyramid = buildPyramid(SERVICE, facts())!;
        const level = pyramid.levels[1]; // 2x2

        const tiles = tilesIntersecting(pyramid, level, RECT, {
            x: -5000,
            y: -5000,
            width: 20_000,
            height: 20_000,
        });

        expect(tiles).toHaveLength(4);
    });
});

describe('tileCanvasRect', () => {
    it('fits tiles into the manifest-declared box, not the service’s dimensions', () => {
        // The service is 4096 square and the canvas 1000 square: the pyramid
        // governs sampling, the manifest governs geometry (spec §Coordinate
        // model and layout), so nothing on screen moves when tiles arrive.
        const pyramid = buildPyramid(SERVICE, facts())!;
        const level = pyramid.levels[1]; // 2x2

        expect(tileCanvasRect(pyramid, level, 1, 1, RECT)).toEqual({
            x: 500,
            y: 500,
            width: 500,
            height: 500,
        });
    });

    it('leaves no canvas-space gap between adjacent tiles', () => {
        const pyramid = buildPyramid(
            SERVICE,
            facts({ width: 1100, height: 1100, scaleFactors: [1] }),
        )!;
        const level = pyramid.levels[0];

        const left = tileCanvasRect(pyramid, level, 0, 0, RECT);
        const right = tileCanvasRect(pyramid, level, 1, 0, RECT);

        expect(left.x + left.width).toBeCloseTo(right.x, 10);
    });
});

describe('tileKey', () => {
    it('distinguishes canvas, level, column, and row', () => {
        const keys = new Set([
            tileKey('c1', 0, 0, 0),
            tileKey('c2', 0, 0, 0),
            tileKey('c1', 1, 0, 0),
            tileKey('c1', 0, 1, 0),
            tileKey('c1', 0, 0, 1),
        ]);

        expect(keys.size).toBe(5);
    });
});
