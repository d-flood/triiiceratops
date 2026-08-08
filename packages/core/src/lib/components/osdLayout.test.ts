import { describe, expect, it } from 'vitest';

import { getCanvasDisplayLayouts } from './osdLayout';

const gap = 0.0125;

function source(canvasId: string, width: number, height: number) {
    return {
        canvasId,
        x: 0,
        y: 0,
        width: 1,
        sourceWidth: width,
        sourceHeight: height,
        tileSource: `${canvasId}-source`,
    };
}

describe('getCanvasDisplayLayouts', () => {
    it('preserves source-local positions in individuals mode', () => {
        const result = getCanvasDisplayLayouts(
            [{ ...source('a', 1000, 2000), x: 0.2, y: 0.3, width: 0.5 }],
            {
                mode: 'individuals',
                direction: 'left-to-right',
                gap,
            },
        );

        expect(result.sources).toEqual([
            {
                tileSource: 'a-source',
                x: 0.2,
                y: 0.3,
                width: 0.5,
                canvasId: 'a',
            },
        ]);
    });

    it('lays out from the dimensions passed in, not from the tile source', () => {
        const result = getCanvasDisplayLayouts(
            [
                {
                    ...source('a', 1000, 1000),
                    tileSource: { width: 9, height: 1 },
                },
                {
                    ...source('b', 1000, 4000),
                    tileSource: { width: 9, height: 1 },
                },
            ],
            {
                mode: 'continuous',
                direction: 'left-to-right',
                gap,
            },
        );

        expect(result.layouts.map((layout) => layout.height)).toEqual([
            2.5, 2.5,
        ]);
    });

    it('preserves authored scale in continuous mode when requested', () => {
        const result = getCanvasDisplayLayouts(
            [source('a', 1000, 1000), source('b', 1000, 4000)],
            {
                mode: 'continuous',
                direction: 'left-to-right',
                preserveCanvasScale: true,
                gap,
            },
        );

        expect(result.sources[0]).toMatchObject({ x: 0, width: 1 });
        expect(result.sources[1]).toMatchObject({ x: 1 + gap, width: 1 });
    });

    describe('advancing by each canvas’s real extent', () => {
        // The regression suite for the one layout bug this epic fixes: with
        // normalization off, the offset used to advance a fixed ONE WORLD UNIT
        // per canvas regardless of the canvas's extent. Every case below fails
        // against that behaviour.
        function wide(canvasId: string, width: number, height: number) {
            return {
                canvasId,
                x: 0,
                y: 0,
                // A caller laying out in its own space — canvas space, where a
                // page is thousands of units across — rather than in the
                // normalized world where a canvas happens to be one unit.
                width,
                sourceWidth: width,
                sourceHeight: height,
                tileSource: `${canvasId}-source`,
            };
        }

        it('does not overlap wide canvases in continuous mode with preserveCanvasScale', () => {
            const result = getCanvasDisplayLayouts(
                [wide('a', 1200, 900), wide('b', 1000, 1500)],
                {
                    mode: 'continuous',
                    direction: 'left-to-right',
                    preserveCanvasScale: true,
                    gap,
                },
            );

            // The old behaviour put `b` at x = 1 + gap, i.e. 1199 units inside
            // `a`.
            expect(result.layouts[1].x).toBeCloseTo(1200 + gap);
            expect(result.layouts[1].x).toBeGreaterThanOrEqual(
                result.layouts[0].x + result.layouts[0].width,
            );
        });

        it('does not overlap tall canvases in a vertical continuous world', () => {
            const result = getCanvasDisplayLayouts(
                [wide('a', 1200, 900), wide('b', 1000, 1500)],
                {
                    mode: 'continuous',
                    direction: 'top-to-bottom',
                    preserveCanvasScale: true,
                    gap,
                },
            );

            expect(result.layouts[1].y).toBeCloseTo(900 + gap);
            expect(result.layouts[1].y).toBeGreaterThanOrEqual(
                result.layouts[0].y + result.layouts[0].height,
            );
        });

        it('does not overlap paged canvases with mixed aspect ratios', () => {
            const result = getCanvasDisplayLayouts(
                [
                    wide('a', 1200, 900),
                    wide('b', 1000, 1500),
                    wide('c', 800, 800),
                ],
                {
                    mode: 'paged',
                    direction: 'left-to-right',
                    preserveCanvasScale: true,
                    gap,
                },
            );

            expect(result.layouts.map((layout) => layout.x)).toEqual([
                0,
                1200 + gap,
                1200 + gap + 1000 + gap,
            ]);
        });

        it('does not overlap paged canvases with mixed aspect ratios in RTL', () => {
            const result = getCanvasDisplayLayouts(
                [wide('a', 1200, 900), wide('b', 1000, 1500)],
                {
                    mode: 'paged',
                    direction: 'right-to-left',
                    preserveCanvasScale: true,
                    gap,
                },
            );

            // Reading order is right to left, so the FIRST canvas sits to the
            // right of the second — and clear of it.
            expect(result.layouts[1].x).toBe(0);
            expect(result.layouts[0].x).toBeCloseTo(1000 + gap);
        });

        it('advances by real extents when a sibling has no dimensions at all', () => {
            // Normalization is off here not because the caller asked but
            // because one canvas cannot be measured — the same branch, and the
            // same overlap.
            const result = getCanvasDisplayLayouts(
                [
                    wide('a', 1200, 900),
                    {
                        canvasId: 'b',
                        tileSource: 'b-source',
                        x: 0,
                        y: 0,
                        width: 1000,
                    },
                ],
                {
                    mode: 'continuous',
                    direction: 'left-to-right',
                    gap,
                },
            );

            expect(result.layouts[1].x).toBeCloseTo(1200 + gap);
        });
    });

    it('normalizes continuous canvases with different heights', () => {
        const result = getCanvasDisplayLayouts(
            [source('a', 1000, 1000), source('b', 1000, 4000)],
            {
                mode: 'continuous',
                direction: 'left-to-right',
                gap,
            },
        );

        expect(result.layouts.map((layout) => layout.height)).toEqual([
            2.5, 2.5,
        ]);
        expect(result.sources[0]).toMatchObject({ width: 2.5 });
        expect(result.sources[1]).toMatchObject({ width: 0.625 });
    });

    it('uses normalized widths plus gap for horizontal continuous offsets', () => {
        const result = getCanvasDisplayLayouts(
            [source('a', 1000, 1000), source('b', 1000, 4000)],
            {
                mode: 'continuous',
                direction: 'left-to-right',
                gap,
            },
        );

        expect(result.layouts[1].x).toBeCloseTo(2.5 + gap);
    });

    it('uses normalized heights plus gap for vertical continuous offsets', () => {
        const result = getCanvasDisplayLayouts(
            [source('a', 1000, 1000), source('b', 1000, 4000)],
            {
                mode: 'continuous',
                direction: 'bottom-to-top',
                gap,
            },
        );

        expect(result.layouts[1].y).toBeCloseTo(-(2.5 + gap));
    });

    it('uses normalized widths for paged placement and preserves RTL ordering', () => {
        const result = getCanvasDisplayLayouts(
            [source('a', 1000, 1000), source('b', 1000, 4000)],
            {
                mode: 'paged',
                direction: 'right-to-left',
                gap,
            },
        );

        expect(result.layouts[1].x).toBe(0);
        expect(result.layouts[0].x).toBeCloseTo(0.625 + gap);
    });

    it('falls back to current fixed offsets when dimensions are missing', () => {
        const result = getCanvasDisplayLayouts(
            [
                source('a', 1000, 1000),
                {
                    canvasId: 'b',
                    tileSource: 'b-source',
                    x: 0,
                    y: 0,
                    width: 1,
                },
            ],
            {
                mode: 'continuous',
                direction: 'left-to-right',
                gap,
            },
        );

        expect(result.sources[1]).toMatchObject({ x: 1 + gap, width: 1 });
    });

    it('clamps extreme height normalization', () => {
        const result = getCanvasDisplayLayouts(
            [
                source('a', 1000, 10),
                source('b', 1000, 1000),
                source('c', 1000, 10000),
            ],
            {
                mode: 'continuous',
                direction: 'left-to-right',
                gap,
            },
        );

        expect(result.sources[0]).toMatchObject({ width: 4 });
        expect(result.sources[2]).toMatchObject({ width: 0.25 });
    });

    it('falls back to the defaults when geometry is null', () => {
        const result = getCanvasDisplayLayouts(
            [
                {
                    canvasId: null,
                    x: null,
                    y: null,
                    width: null,
                    sourceWidth: null,
                    sourceHeight: null,
                    tileSource: 'a-source',
                },
            ],
            {
                mode: 'individuals',
                direction: 'left-to-right',
                gap,
            },
        );

        expect(result.sources).toEqual([
            {
                tileSource: 'a-source',
                x: 0,
                y: 0,
                width: 1,
                canvasId: 'canvas-0',
            },
        ]);
        expect(result.layouts).toEqual([
            { canvasId: 'canvas-0', x: 0, y: 0, width: 1, height: 1 },
        ]);
    });

    it('carries the tile source through without leaking other caller keys', () => {
        const result = getCanvasDisplayLayouts(
            [
                {
                    ...source('a', 1000, 1000),
                    secret: 'do-not-leak',
                } as never,
                source('b', 1000, 1000),
            ],
            {
                mode: 'continuous',
                direction: 'left-to-right',
                gap,
            },
        );

        expect(result.sources[0]).toEqual({
            tileSource: 'a-source',
            canvasId: 'a',
            x: 0,
            y: 0,
            width: 1,
        });
    });

    it('falls back to the viewer spacing when no gap is passed', () => {
        const result = getCanvasDisplayLayouts(
            [source('a', 1000, 1000), source('b', 1000, 1000)],
            {
                mode: 'continuous',
                direction: 'left-to-right',
            },
        );

        expect(result.layouts[1].x).toBeCloseTo(1 + gap);
    });

    it('uses the gap the caller passes', () => {
        const result = getCanvasDisplayLayouts(
            [source('a', 1000, 1000), source('b', 1000, 1000)],
            {
                mode: 'continuous',
                direction: 'left-to-right',
                gap: 0.5,
            },
        );

        expect(result.layouts[1].x).toBeCloseTo(1.5);
    });
});
