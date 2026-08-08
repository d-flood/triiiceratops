import { describe, expect, it } from 'vitest';

import type { Viewport } from './types';
import {
    anchoredZoomCentre,
    approach,
    approachScale,
    canvasToScreen,
    constrainCentre,
    fitBounds,
    normalizeWheelDelta,
    screenToCanvas,
    zoomRange,
} from './viewportMath';

const VIEWPORT: Viewport = {
    width: 800,
    height: 600,
    centre: { x: 500, y: 375 },
    scale: 0.4,
};

describe('canvas ↔ screen conversion', () => {
    it('puts the viewport centre at the middle of the viewport', () => {
        expect(canvasToScreen(VIEWPORT.centre, VIEWPORT)).toEqual({
            x: 400,
            y: 300,
        });
    });

    it('scales offsets from the centre by the viewport scale', () => {
        expect(canvasToScreen({ x: 600, y: 375 }, VIEWPORT)).toEqual({
            x: 440,
            y: 300,
        });
    });

    it('round-trips exactly', () => {
        const point = { x: 123.5, y: 987.25 };
        const roundTripped = screenToCanvas(
            canvasToScreen(point, VIEWPORT),
            VIEWPORT,
        );

        expect(roundTripped.x).toBeCloseTo(point.x, 10);
        expect(roundTripped.y).toBeCloseTo(point.y, 10);
    });
});

describe('fitBounds', () => {
    it('fits by the constraining axis and centres the box', () => {
        // 1000x750 into 800x600: both axes give 0.8.
        expect(
            fitBounds({ x: 0, y: 0, width: 1000, height: 750 }, VIEWPORT),
        ).toEqual({ centre: { x: 500, y: 375 }, scale: 0.8 });
    });

    it('is limited by the tighter axis for a mismatched aspect ratio', () => {
        // 1000x1000 into 800x600 → 0.6, the height-limited fit.
        const fit = fitBounds(
            { x: 0, y: 0, width: 1000, height: 1000 },
            VIEWPORT,
        );

        expect(fit.scale).toBeCloseTo(0.6, 10);
    });

    it('does not divide by zero for a degenerate box', () => {
        expect(
            fitBounds({ x: 0, y: 0, width: 0, height: 0 }, VIEWPORT).scale,
        ).toBe(1);
    });
});

describe('zoomRange', () => {
    it('puts the ceiling a fixed factor above the fit', () => {
        expect(zoomRange(0.5, 0.01, 128)).toEqual({ min: 0.01, max: 64 });
    });

    it('RAISES the ceiling when the derived floor lands above it', () => {
        // The two are derived from different things — the floor from the median
        // canvas reaching the box threshold, the ceiling from the fit of one
        // canvas — so the floor really can come out higher. Taking the lower of
        // the two collapses the range to a single legal scale, and the viewer
        // can then neither zoom in nor out, silently. The reader keeps the same
        // factor of zoom from wherever the floor is instead.
        const { min, max } = zoomRange(0.001, 0.02, 128);

        expect(min).toBe(0.02);
        expect(max).toBe(0.02 * 128);
        expect(max).toBeGreaterThan(min);
    });

    it('treats a floor of zero as no floor at all', () => {
        // An empty world derives none. A nominal floor far below the ceiling,
        // rather than a real bound of zero that a scale could be clamped to.
        const { min, max } = zoomRange(2, 0, 128);

        expect(max).toBe(256);
        expect(min).toBeCloseTo(256e-6, 12);
    });
});

describe('anchoredZoomCentre', () => {
    it('keeps the canvas-space point under the anchor under the anchor', () => {
        const anchor = { x: 137, y: 512 };
        const before = screenToCanvas(anchor, VIEWPORT);

        for (const nextScale of [0.05, 0.4, 1, 4, 32]) {
            const centre = anchoredZoomCentre(VIEWPORT, anchor, nextScale);
            const after = canvasToScreen(before, {
                ...VIEWPORT,
                centre,
                scale: nextScale,
            });

            expect(after.x).toBeCloseTo(anchor.x, 8);
            expect(after.y).toBeCloseTo(anchor.y, 8);
        }
    });

    it('leaves the centre alone when the anchor is the viewport centre', () => {
        const centre = anchoredZoomCentre(
            VIEWPORT,
            { x: 400, y: 300 },
            VIEWPORT.scale * 3,
        );

        expect(centre.x).toBeCloseTo(VIEWPORT.centre.x, 10);
        expect(centre.y).toBeCloseTo(VIEWPORT.centre.y, 10);
    });
});

describe('animation', () => {
    it('approaches the target and reaches it in the limit', () => {
        expect(approach(0, 10, 0.1, 0.1)).toBeCloseTo(10 - 10 / Math.E, 10);
        expect(approach(0, 10, 0.1, 10)).toBeCloseTo(10, 6);
    });

    it('is frame-rate independent: two half-steps equal one whole step', () => {
        const whole = approach(0, 10, 0.1, 0.032);
        const half = approach(approach(0, 10, 0.1, 0.016), 10, 0.1, 0.016);

        expect(half).toBeCloseTo(whole, 10);
    });

    it('interpolates scale in log space', () => {
        // After one half-life the remaining LOG distance has halved, so 1 → 16
        // lands on the geometric mean, 4 — not the arithmetic mean, 8.5.
        const halfway = approachScale(1, 16, 1, Math.LN2);

        expect(halfway).toBeCloseTo(4, 8);
        expect(approachScale(1, 16, 0.1, 10)).toBeCloseTo(16, 3);
    });

    it('covers equal log distance in equal time regardless of magnitude', () => {
        const low = approachScale(1, 2, 0.1, 0.05);
        const high = approachScale(8, 16, 0.1, 0.05);

        expect(Math.log(low / 1)).toBeCloseTo(Math.log(high / 8), 10);
    });

    it('feels uniform across a 100x range: one doubling costs the same everywhere', () => {
        // The whole point of easing in log space. Linear interpolation makes
        // the same gesture lurch at one end of the range and crawl at the
        // other; here every doubling in a 100x span takes the same fraction of
        // its journey in the same time.
        const covered = [0.05, 0.2, 1, 4].map((from) =>
            Math.log2(approachScale(from, from * 2, 0.1, 0.05) / from),
        );

        for (const fraction of covered) {
            expect(fraction).toBeCloseTo(covered[0], 12);
        }
        // …and it is a real fraction of the doubling, not zero or all of it.
        expect(covered[0]).toBeGreaterThan(0.1);
        expect(covered[0]).toBeLessThan(0.9);
    });

    /*
     * The first frame of a wheel animation routinely arrives with a
     * non-positive elapsed: the rAF callback is scheduled from the input
     * handler but is given the timestamp of the frame already in flight, which
     * can predate the `performance.now()` the handler read. Snapping to the
     * target there would skip the easing entirely — the animation would be
     * instant on exactly the input that is supposed to be smoothed.
     */
    it('is a no-op when no time has passed', () => {
        expect(approach(3, 10, 0.1, 0)).toBe(3);
        expect(approach(3, 10, 0.1, -0.004)).toBe(3);
        expect(approachScale(0.4, 2, 0.1, 0)).toBeCloseTo(0.4, 12);
    });

    it('still arrives immediately when there is no smoothing at all', () => {
        // A zero time constant means "no easing", for which snapping IS the
        // right answer — the distinction the elapsed guard must not blur.
        expect(approach(3, 10, 0, 0.016)).toBe(10);
        expect(approachScale(0.4, 2, 0, 0.016)).toBeCloseTo(2, 12);
    });
});

describe('normalizeWheelDelta', () => {
    // Stand-in units: the shipped ones are provisional, so the conversion is
    // asserted, never the constants.
    const LINE = 30;
    const PAGE = 600;

    it('passes pixel deltas through unchanged', () => {
        expect(normalizeWheelDelta(-100, 0, LINE, PAGE)).toBe(-100);
        expect(normalizeWheelDelta(53.5, 0, LINE, PAGE)).toBe(53.5);
    });

    it('converts line deltas, so a Firefox wheel notch zooms like any other', () => {
        // The same notch: ~100 px in pixel mode, 3 lines in line mode. Consumed
        // raw, the line-mode notch would zoom a fortieth as far.
        expect(normalizeWheelDelta(3, 1, LINE, PAGE)).toBe(90);
        expect(normalizeWheelDelta(-3, 1, LINE, PAGE)).toBe(-90);
    });

    it('converts page deltas', () => {
        expect(normalizeWheelDelta(1, 2, LINE, PAGE)).toBe(600);
    });

    it('treats an unknown delta mode as pixels', () => {
        expect(normalizeWheelDelta(120, 7, LINE, PAGE)).toBe(120);
    });

    it('ignores a non-finite delta rather than producing a NaN scale', () => {
        expect(normalizeWheelDelta(Number.NaN, 0, LINE, PAGE)).toBe(0);
        expect(
            normalizeWheelDelta(Number.POSITIVE_INFINITY, 1, LINE, PAGE),
        ).toBe(0);
    });
});

describe('constrainCentre', () => {
    const WORLD = { x: 0, y: 0, width: 1000, height: 800 };
    const SIZE = { width: 800, height: 600 };

    it('leaves a centre that is already legal untouched', () => {
        // scale 1: the 800x600 window sits wholly inside the 1000x800 world.
        expect(
            constrainCentre({ x: 500, y: 400 }, 1, WORLD, SIZE, 0.5),
        ).toEqual({ x: 500, y: 400 });
    });

    it('stops the world being dragged off screen entirely', () => {
        const far = constrainCentre(
            { x: 999_999, y: -999_999 },
            1,
            WORLD,
            SIZE,
            0.5,
        );

        // With the viewport (800 wide) smaller than the world (1000), half the
        // viewport must stay covered: the centre may not pass 400px beyond
        // either world edge.
        expect(far.x).toBeCloseTo(1000 - 400 + 400, 10);
        expect(far.y).toBeCloseTo(0 + 300 - 300, 10);
    });

    it('measures the requirement against the world when the world is smaller', () => {
        // scale 0.2: the window is 4000x3000 canvas units, dwarfing the world.
        const constrained = constrainCentre(
            { x: 999_999, y: 0 },
            0.2,
            WORLD,
            SIZE,
            1,
        );

        // At ratio 1 with a smaller world, the whole world must stay inside the
        // window: the centre may go no further than half a window past the
        // world's near edge.
        expect(constrained.x).toBeCloseTo(0 + 4000 / 2, 10);
    });

    it('pins the world to the viewport edge at a visibility ratio of 1', () => {
        // World larger than the window (scale 1 → 800x600 window): the window
        // may not leave the world at all.
        const left = constrainCentre({ x: -500, y: 400 }, 1, WORLD, SIZE, 1);
        expect(left.x).toBeCloseTo(400, 10);

        const right = constrainCentre({ x: 5000, y: 400 }, 1, WORLD, SIZE, 1);
        expect(right.x).toBeCloseTo(600, 10);
    });

    it('never produces an empty range, whatever the zoom', () => {
        for (const scale of [0.01, 0.1, 0.5, 1, 4, 40]) {
            for (const ratio of [0, 0.25, 0.5, 1]) {
                const low = constrainCentre(
                    { x: -1e9, y: -1e9 },
                    scale,
                    WORLD,
                    SIZE,
                    ratio,
                );
                const high = constrainCentre(
                    { x: 1e9, y: 1e9 },
                    scale,
                    WORLD,
                    SIZE,
                    ratio,
                );
                expect(low.x).toBeLessThanOrEqual(high.x);
                expect(low.y).toBeLessThanOrEqual(high.y);
                // …and the world centre is always reachable.
                expect(
                    constrainCentre(
                        { x: 500, y: 400 },
                        scale,
                        WORLD,
                        SIZE,
                        ratio,
                    ),
                ).toEqual({ x: 500, y: 400 });
            }
        }
    });

    it('is a no-op for a degenerate world or scale rather than returning NaN', () => {
        const centre = { x: 12, y: 34 };
        expect(constrainCentre(centre, 0, WORLD, SIZE, 0.5)).toEqual(centre);
        expect(
            constrainCentre(
                centre,
                1,
                { x: 0, y: 0, width: 0, height: 0 },
                SIZE,
                0.5,
            ),
        ).toEqual(centre);
        expect(
            constrainCentre(centre, 1, WORLD, { width: 0, height: 0 }, 0.5),
        ).toEqual(centre);
    });
});
