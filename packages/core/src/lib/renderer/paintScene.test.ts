// @vitest-environment node
/**
 * Device-pixel snapping — the one thing about the painter that no geometric
 * assertion can see.
 *
 * The spec deliberately leaves the painter untested in isolation: its
 * correctness is the geometric assertions' job, and a screenshot diff of
 * resampled pixels asserts nothing. That holds for *placement*, which a centroid
 * measures directly. It does not hold for **seams**: a hairline between two
 * tiles is a sub-pixel property of adjacent draw calls, and blur-up means the
 * coarse level is painted underneath, so a seam is a one-pixel line of the
 * coarse tile's colour rather than a hole. Nothing that reads the finished
 * canvas back can distinguish that from the picture.
 *
 * What the mechanism guarantees is checkable exactly, though, and this is where:
 * every tile's destination rectangle lands on whole device pixels, and two tiles
 * sharing an edge compute the same coordinate for it. Node environment, against
 * a recording context — the painter takes a `CanvasRenderingContext2D` and
 * touches no other DOM.
 */

import { describe, expect, it } from 'vitest';

import { paintScene } from './paintScene';
import type { ScenePlan, TileDraw, Viewport } from './types';

interface DrawCall {
    x: number;
    y: number;
    width: number;
    height: number;
}

/** A context that records destination rectangles and does nothing else. */
function recordingContext() {
    const calls: DrawCall[] = [];

    const ctx = {
        canvas: { width: 1600, height: 1200 },
        setTransform: () => {},
        clearRect: () => {},
        drawImage: (
            _image: unknown,
            x: number,
            y: number,
            width: number,
            height: number,
        ) => {
            calls.push({ x, y, width, height });
        },
    };

    return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

/** The tile grid of a 1000-unit canvas at `level`, as canvas-space boxes. */
function tileDraws(columns: number, level = 1): TileDraw[] {
    const span = 1000 / columns;

    return Array.from({ length: columns }, (_, column) => ({
        key: `c1#${level}/${column},0`,
        level,
        x: column * span,
        y: 0,
        width: span,
        height: span,
    }));
}

function plan(draws: TileDraw[]): ScenePlan {
    return {
        layout: [{ canvasId: 'c1', x: 0, y: 0, width: 1000, height: 1000 }],
        tiers: { c1: 'pyramid' },
        tileRequests: [],
        tileDraws: draws,
        thumbnailRequests: [],
        metadataRequests: [],
        evictable: [],
        minZoom: 0.01,
    };
}

/**
 * A deliberately awkward viewport: whole-numbered scales and centres snap tile
 * edges onto device pixels for free and would hide the bug entirely.
 */
const VIEWPORT: Viewport = {
    width: 800,
    height: 600,
    centre: { x: 613.37, y: 451.19 },
    scale: 1.7321,
};

function paint(draws: TileDraw[], dpr: number) {
    const { ctx, calls } = recordingContext();
    const tile = { width: 256, height: 256 } as unknown as CanvasImageSource;

    paintScene(
        ctx,
        plan(draws),
        VIEWPORT,
        { images: {}, tiles: () => tile },
        dpr,
    );

    return calls;
}

describe('paintScene — tile snapping', () => {
    it('lands every tile edge on a whole device pixel at fractional scale', () => {
        for (const dpr of [1, 1.5, 2]) {
            const calls = paint(tileDraws(8), dpr);
            expect(calls.length).toBeGreaterThan(1);

            for (const call of calls) {
                expect(Number.isInteger(call.x), `x ${call.x}`).toBe(true);
                expect(Number.isInteger(call.y), `y ${call.y}`).toBe(true);
                expect(
                    Number.isInteger(call.width),
                    `width ${call.width}`,
                ).toBe(true);
                expect(
                    Number.isInteger(call.height),
                    `height ${call.height}`,
                ).toBe(true);
            }
        }
    });

    it('gives two adjacent tiles the same edge: no gap, no double-drawn column', () => {
        // The property a seam violates. Left to fractional coordinates the
        // resampler blends each edge against transparent black and a hairline
        // appears down every tile boundary; rounded independently but
        // consistently, both tiles send the shared edge to the same device
        // pixel.
        for (const dpr of [1, 1.5, 2]) {
            const calls = paint(tileDraws(8), dpr);

            for (let index = 1; index < calls.length; index += 1) {
                const left = calls[index - 1];
                const right = calls[index];
                expect(left.x + left.width, `at dpr ${dpr}`).toBe(right.x);
            }
        }
    });

    it('drops a tile that rounds away to nothing rather than drawing an empty rect', () => {
        // Far enough out that a whole tile is sub-pixel. `drawImage` with a zero
        // or negative destination is not a no-op everywhere.
        const calls = paint(tileDraws(8), 1);
        const tiny = paint(tileDraws(8), 0.0001);

        expect(calls.length).toBe(8);
        expect(tiny.length).toBe(0);
    });
});
