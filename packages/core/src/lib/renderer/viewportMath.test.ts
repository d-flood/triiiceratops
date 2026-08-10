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
        // A derived floor far below the readable one, so this is the ceiling's
        // test and nothing else.
        expect(zoomRange(0.5, 1e-9, 128, 1 / 2)).toEqual({
            min: 0.25,
            max: 64,
        });
    });

    it('stops zooming out at a fraction of the fit, not at the derived floor', () => {
        // The bug this exists for. The derived floor is where the renderer runs
        // out of things to draw — a page a couple of dozen pixels across — and a
        // reader clamped there is looking at a speck and calling it blank.
        // Zooming out stops while there is still a picture.
        const fit = 0.8;
        const { min } = zoomRange(fit, 0.001, 128, 1 / 2);

        expect(min).toBe(0.4);
        // …which really is a bound on the reader: the canvas can shrink to half
        // its fitted size and no further.
        expect(fit / min).toBe(2);
    });

    it('is one number for "half the width or half the height, whichever is less"', () => {
        // The two spellings of the rule collapse, because `fitBounds` has already
        // taken the constraining axis: a fraction of the fit IS a fraction of
        // whichever axis binds. Asserted on both orientations, so a change that
        // started measuring one axis would fail here.
        const viewport = { width: 1000, height: 1000 };
        for (const canvas of [
            { x: 0, y: 0, width: 2000, height: 1000 },
            { x: 0, y: 0, width: 1000, height: 2000 },
        ]) {
            const fit = fitBounds(canvas, viewport).scale;
            const perAxis = Math.min(
                (0.5 * viewport.width) / canvas.width,
                (0.5 * viewport.height) / canvas.height,
            );

            expect(zoomRange(fit, 1e-9, 128, 1 / 2).min).toBeCloseTo(
                perAxis,
                12,
            );
        }
    });

    it('keeps the DERIVED floor when it is the higher of the two', () => {
        // A world of tiny canvases: half the fit is still below the point where
        // there is anything to draw, so the renderer's own floor is what stops
        // it. The backstop, not the usual case.
        expect(zoomRange(0.1, 0.06, 128, 1 / 2).min).toBe(0.06);
    });

    it('never puts the floor above the fit, whatever the derived floor says', () => {
        // Seeing an entire canvas is a GUARANTEE, and no threshold may take it
        // away: a floor above the fit makes the home view itself illegal, so the
        // clamp would drag a reader who pressed `0` back in and strand them.
        // This is the small-viewport case — shrink the window far enough and the
        // derived floor, which knows nothing about the viewport, overtakes it.
        const fit = 0.001;
        const { min, max } = zoomRange(fit, 0.02, 128, 1 / 2);

        expect(min).toBe(fit);
        // …and the range cannot collapse: capped at the fit, with a ceiling a
        // factor above it, there is always room to zoom in.
        expect(max).toBe(fit * 128);
        expect(max).toBeGreaterThan(min);
    });

    it('treats a DERIVED floor of zero as no derived floor at all', () => {
        // An empty world derives none, and the readable floor answers instead:
        // a real bound rather than the nominal one, which is harmless here
        // because an empty world has nothing to zoom.
        const { min, max } = zoomRange(2, 0, 128, 1 / 2);

        expect(max).toBe(256);
        expect(min).toBe(1);
    });

    it('invents no floor from an unmeasured surface', () => {
        // A fit scale of zero is a surface with no extent yet. A floor derived
        // from it would be zero, and clamping the first real frame to zero is
        // the one outcome worse than no floor.
        const { min } = zoomRange(0, 0.01, 128, 1 / 2);

        expect(min).toBe(0.01);
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
