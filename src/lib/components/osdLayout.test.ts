import { describe, expect, it } from 'vitest';

import { getCanvasDisplayLayouts } from './osdLayout';

const gap = 0.0125;

function source(canvasId: string, width: number, height: number) {
    return {
        canvasId,
        x: 0,
        y: 0,
        width: 1,
        tileSource: { width, height },
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
                tileSource: { width: 1000, height: 2000 },
                x: 0.2,
                y: 0.3,
                width: 0.5,
                canvasId: 'a',
            },
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

    it('normalizes continuous canvases with different heights', () => {
        const result = getCanvasDisplayLayouts(
            [source('a', 1000, 1000), source('b', 1000, 4000)],
            {
                mode: 'continuous',
                direction: 'left-to-right',
                gap,
            },
        );

        expect(result.layouts.map((layout) => layout.height)).toEqual([2.5, 2.5]);
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
            [source('a', 1000, 1000), { canvasId: 'b', tileSource: {}, x: 0, y: 0, width: 1 }],
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
});
