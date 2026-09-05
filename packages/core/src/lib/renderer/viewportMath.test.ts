import { describe, expect, it } from 'vitest';

import type { Viewport } from './types';
import {
    anchoredZoomCentre,
    approach,
    approachScale,
    canvasToScreen,
    clamp,
    constrainCentre,
    fitBounds,
    fitBoundsInset,
    insetFitCentre,
    normalizeWheelDelta,
    screenToCanvas,
    wheelZoomRate,
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

describe('fitBoundsInset', () => {
    const BOX = { x: 0, y: 0, width: 1000, height: 1000 };
    const NONE = { top: 0, right: 0, bottom: 0, left: 0 };

    /**
     * Where a fit puts the box on the surface, in screen pixels.
     *
     * The claim being made about an inset is a claim about the PICTURE — the box
     * lands centred in the rectangle the reader can still see — so the
     * assertions below go through the same `canvasToScreen` the painter uses
     * rather than restating the arithmetic that produced them.
     */
    function screenBox(
        bounds: typeof BOX,
        size: { width: number; height: number },
        inset: typeof NONE,
    ) {
        const fit = fitBoundsInset(bounds, size, inset);
        const viewport: Viewport = { ...size, ...fit };
        const topLeft = canvasToScreen({ x: bounds.x, y: bounds.y }, viewport);
        const bottomRight = canvasToScreen(
            { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
            viewport,
        );
        return {
            ...topLeft,
            width: bottomRight.x - topLeft.x,
            height: bottomRight.y - topLeft.y,
        };
    }

    it('is `fitBounds` exactly for a zero inset', () => {
        for (const bounds of [
            BOX,
            { x: 0, y: 0, width: 1000, height: 750 },
            { x: -200, y: 40, width: 300, height: 3000 },
        ]) {
            expect(fitBoundsInset(bounds, VIEWPORT, NONE)).toEqual(
                fitBounds(bounds, VIEWPORT),
            );
        }
    });

    it('takes the scale from the inset extent and leaves a symmetric inset centred', () => {
        // 1000x1000 into the 800x400 left by 100 top and bottom → 0.4, and the
        // reserved edges are equal, so the centre does not move.
        const fit = fitBoundsInset(BOX, VIEWPORT, {
            ...NONE,
            top: 100,
            bottom: 100,
        });

        expect(fit.scale).toBeCloseTo(0.4, 10);
        expect(fit.centre).toEqual({ x: 500, y: 500 });
    });

    it('centres the box in the visible rectangle for an asymmetric inset', () => {
        const inset = { ...NONE, bottom: 200 };
        const box = screenBox(BOX, VIEWPORT, inset);

        // 1000x1000 into 800x400: height-limited at 0.4, so 400x400 of picture.
        expect(box.width).toBeCloseTo(400, 6);
        expect(box.height).toBeCloseTo(400, 6);
        // Centred in the 800x400 rectangle above the reserved strip — which is
        // 100px higher on the surface than the middle of the surface itself.
        expect(box.x + box.width / 2).toBeCloseTo(400, 6);
        expect(box.y + box.height / 2).toBeCloseTo(200, 6);
        // Nothing of it is under the reserved strip.
        expect(box.y + box.height).toBeLessThanOrEqual(400 + 1e-6);
    });

    it('reserves both edges of an axis independently', () => {
        const box = screenBox(BOX, VIEWPORT, {
            ...NONE,
            left: 300,
            right: 100,
            top: 60,
        });

        // 400 wide x 540 tall visible: width-limited at 0.4.
        expect(box.width).toBeCloseTo(400, 6);
        // Centred in [300, 700] horizontally and [60, 600] vertically.
        expect(box.x + box.width / 2).toBeCloseTo(500, 6);
        expect(box.y + box.height / 2).toBeCloseTo(330, 6);
    });

    // The surface resizes under an inset an author chose for a taller window,
    // and a reader must still be able to see a whole canvas: the axis with no
    // room left falls back to the whole surface, silently, on its own.
    it('falls back to the full extent per axis when an inset leaves no room', () => {
        const box = screenBox(BOX, VIEWPORT, {
            ...NONE,
            top: 400,
            bottom: 400,
            left: 200,
        });

        // Vertically unusable (600 - 800 < 0) → the full 600 height. Horizontally
        // 600 remains, so that axis keeps its inset. 1000x1000 into 600x600 is
        // 0.6 either way.
        expect(box.height).toBeCloseTo(600, 6);
        expect(box.width).toBeCloseTo(600, 6);
        // The vertical axis is centred on the SURFACE, the horizontal one in
        // [200, 800].
        expect(box.y + box.height / 2).toBeCloseTo(300, 6);
        expect(box.x + box.width / 2).toBeCloseTo(500, 6);
    });

    it('is `fitBounds` again when every axis falls back', () => {
        expect(
            fitBoundsInset(BOX, VIEWPORT, {
                top: 500,
                bottom: 500,
                left: 500,
                right: 500,
            }),
        ).toEqual(fitBounds(BOX, VIEWPORT));
    });

    // Set-time validation refuses these, but the arithmetic stays total: a bad
    // number must not produce a NaN scale or centre for the painter.
    it('stays total for a non-finite edge and a degenerate box', () => {
        expect(
            fitBoundsInset(BOX, VIEWPORT, { ...NONE, bottom: Number.NaN }),
        ).toEqual(fitBounds(BOX, VIEWPORT));
        expect(
            fitBoundsInset(BOX, VIEWPORT, { ...NONE, top: Infinity }),
        ).toEqual(fitBounds(BOX, VIEWPORT));

        const degenerate = fitBoundsInset(
            { x: 10, y: 20, width: 0, height: 0 },
            VIEWPORT,
            { ...NONE, bottom: 200 },
        );
        expect(degenerate.scale).toBe(1);
        expect(Number.isFinite(degenerate.centre.x)).toBe(true);
        expect(Number.isFinite(degenerate.centre.y)).toBe(true);
    });

    // An unmeasured surface has no extent to reserve part of, and the fit
    // arithmetic must not invent one.
    it('does not shift the centre when there is no fit to shift', () => {
        expect(
            fitBoundsInset(BOX, { width: 0, height: 0 }, { ...NONE, left: 40 }),
        ).toEqual({ centre: { x: 500, y: 500 }, scale: 0 });
    });
});

/**
 * The centre half of an inset fit, at a scale the caller chose.
 *
 * Why it is a separate function at all: `CanvasHost.applyFit` puts every fitted
 * scale through `clampScale`, so the scale the viewport adopts is often not the
 * one the fit computed — and the inset's shift is a SCREEN distance, so the
 * conversion into canvas units must use the adopted scale or the realised shift
 * comes out multiplied by `adopted / wanted`.
 */
describe('insetFitCentre', () => {
    const BOX = { x: 0, y: 0, width: 1000, height: 1000 };
    const NONE = { top: 0, right: 0, bottom: 0, left: 0 };

    it('agrees with `fitBoundsInset` at the fit’s own scale', () => {
        for (const inset of [
            NONE,
            { ...NONE, bottom: 200 },
            { ...NONE, left: 300, right: 100, top: 60 },
            { ...NONE, top: 400, bottom: 400, left: 200 },
        ]) {
            const fit = fitBoundsInset(BOX, VIEWPORT, inset);
            expect(insetFitCentre(BOX, VIEWPORT, inset, fit.scale)).toEqual(
                fit.centre,
            );
        }
    });

    // The claim in screen terms: whatever scale is adopted, the box centre lands
    // in the middle of the rectangle the inset leaves visible.
    it('keeps the shift a fixed SCREEN distance across scales', () => {
        const inset = { ...NONE, bottom: 200 };

        for (const scale of [0.4, 1, 12.5, 85 + 1 / 3]) {
            const centre = insetFitCentre(BOX, VIEWPORT, inset, scale);
            const screenY = (500 - centre.y) * scale + VIEWPORT.height / 2;
            // The visible strip is [0, 400] of a 600-tall surface: its middle is
            // 100px above the middle of the surface, at every scale.
            expect(screenY, `scale ${scale}`).toBeCloseTo(200, 6);
        }
    });

    it('leaves the centre alone when there is no scale to express a shift at', () => {
        for (const scale of [0, -1, Number.NaN, Infinity]) {
            expect(
                insetFitCentre(BOX, VIEWPORT, { ...NONE, bottom: 200 }, scale),
                `scale ${scale}`,
            ).toEqual({ x: 500, y: 500 });
        }
    });
});

/**
 * Where an inset stops being fully honoured, pinned as behaviour rather than
 * fixed.
 *
 * `CanvasHost.applyFit` composes three of these functions — `fitBoundsInset` for
 * the scale, `clampScale` (`zoomRange`) for the scale it may actually adopt, and
 * `constrainCentre` for the centre an animated fit is allowed — and both clamps
 * start cutting into the inset's shift at exactly the same threshold: an inset
 * reserving **more than half** of the binding axis.
 *
 * That is not a bug in either clamp. `zoomRange`'s floor is the guarantee that a
 * reader can always zoom out far enough to see a whole canvas, and
 * `constrainCentre` is the guarantee that the world never leaves the viewport;
 * both outrank a plugin's request for space, because the alternative is a viewer
 * whose zoom range and pan bounds a plugin can collapse. Reserving more than half
 * an axis is documented as unsupported (`docs/plugin-authoring.md`).
 *
 * These numbers mirror the shipped constants and a 1200x900 canvas on an 800x600
 * surface, which is the browser fixture.
 */
describe('the limit of what an inset can ask for', () => {
    const CANVAS = { x: 0, y: 0, width: 1200, height: 900 };
    const SURFACE = { width: 800, height: 600 };
    const NONE = { top: 0, right: 0, bottom: 0, left: 0 };
    // The shipped MIN_ZOOM_FRACTION and VISIBILITY_RATIO, restated rather than
    // imported so a tuned default cannot silently redefine what this pins.
    const MIN_ZOOM_FRACTION = 1 / 2;
    const VISIBILITY_RATIO = 0.5;

    /** `CanvasHost.applyFit`'s composition, in the order it performs it. */
    function fit(inset: typeof NONE, world = CANVAS) {
        const home = fitBounds(CANVAS, SURFACE).scale;
        const { min, max } = zoomRange(home, 0, 128, MIN_ZOOM_FRACTION);
        const wanted = fitBoundsInset(CANVAS, SURFACE, inset).scale;
        const scale = clamp(wanted, min, max);
        const centre = insetFitCentre(CANVAS, SURFACE, inset, scale);
        return {
            wanted,
            scale,
            centre,
            constrained: constrainCentre(
                centre,
                scale,
                world,
                SURFACE,
                VISIBILITY_RATIO,
            ),
        };
    }

    // 300 of 600 is the boundary; a third of the axis is comfortably inside it.
    it('honours an inset within half the axis exactly', () => {
        const result = fit({ ...NONE, bottom: 200 });

        expect(result.scale).toBeCloseTo(result.wanted, 12);
        expect(result.constrained).toEqual(result.centre);
        // The canvas centre lands in the middle of the visible [0, 400] strip.
        const screenY =
            (450 - result.constrained.y) * result.scale + SURFACE.height / 2;
        expect(screenY).toBeCloseTo(200, 6);
    });

    it('clamps the SCALE up once the inset passes half the axis', () => {
        const result = fit({ ...NONE, bottom: 400 });

        // 900 canvas units into the 200px left wants 0.222; the reader's floor is
        // half the un-inset fit, 0.333, and wins.
        expect(result.wanted).toBeCloseTo(2 / 9, 6);
        expect(result.scale).toBeCloseTo(1 / 3, 6);
        // So the canvas is framed LARGER than the strip: 300px of picture in a
        // 200px strip, still lifted, but overflowing it.
        expect(CANVAS.height * result.scale).toBeCloseTo(300, 6);
    });

    /**
     * …and in continuous mode the CENTRE is clamped as well, on the strip's last
     * canvas.
     *
     * There the world is every folio, so it is always taller than the viewport
     * window and `constrainCentre`'s upper bound collapses onto the world's own
     * far edge — which the inset's shift, past the same half-axis threshold, asks
     * to cross. The first canvas has the mirror problem with a `top` inset.
     *
     * Only the ANIMATED fit path is affected: `applyFit` adopts an instant fit
     * without constraining it, so an unanimated fit keeps the full shift. That
     * asymmetry is pre-existing and is why this is pinned rather than asserted as
     * a guarantee.
     */
    it('clamps the CENTRE too on the last canvas of a continuous strip', () => {
        // Ten folios stacked; the fit target is the last one.
        const strip = { x: 0, y: 0, width: 1200, height: 9000 };
        const last = { x: 0, y: 8100, width: 1200, height: 900 };
        const inset = { ...NONE, bottom: 400 };

        const home = fitBounds(last, SURFACE).scale;
        const { min, max } = zoomRange(home, 0, 128, MIN_ZOOM_FRACTION);
        const scale = clamp(
            fitBoundsInset(last, SURFACE, inset).scale,
            min,
            max,
        );
        const wanted = insetFitCentre(last, SURFACE, inset, scale);
        const allowed = constrainCentre(
            wanted,
            scale,
            strip,
            SURFACE,
            VISIBILITY_RATIO,
        );

        // The shift asks to sit 150 canvas units past the end of the world…
        expect(wanted.y).toBeCloseTo(9150, 6);
        // …and is pulled back to it, so 150 units of the lift are lost.
        expect(allowed.y).toBeCloseTo(9000, 6);

        // Within half the axis there is nothing to clamp, on the same folio.
        const modest = { ...NONE, bottom: 200 };
        const modestScale = clamp(
            fitBoundsInset(last, SURFACE, modest).scale,
            min,
            max,
        );
        const modestCentre = insetFitCentre(last, SURFACE, modest, modestScale);
        expect(
            constrainCentre(
                modestCentre,
                modestScale,
                strip,
                SURFACE,
                VISIBILITY_RATIO,
            ),
        ).toEqual(modestCentre);
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

describe('wheelZoomRate', () => {
    // A stand-in notch, for the same reason as above: the shipped size is
    // provisional, so the conversion is asserted, never the constant.
    const NOTCH = 100;

    /*
     * The whole contract in one assertion: whatever factor is configured is the
     * factor one notch of travel actually applies, once the rate goes through
     * the handler's `exp(-delta * rate)`. Get the conversion backwards — divide
     * where it multiplies, or take a log where it should exponentiate — and
     * this is what catches it.
     */
    it('makes one notch of travel apply exactly the configured factor', () => {
        for (const zoomPerNotch of [1.15, 1.5, 2, 8]) {
            const rate = wheelZoomRate(zoomPerNotch, NOTCH);
            // Scrolling up is a negative deltaY, which is why the handler
            // negates: a notch "in" multiplies.
            expect(Math.exp(-(-NOTCH) * rate)).toBeCloseTo(zoomPerNotch, 12);
        }
    });

    it('makes a notch out the exact inverse of a notch in', () => {
        const rate = wheelZoomRate(1.15, NOTCH);
        const inThenOut = Math.exp(-(-NOTCH) * rate) * Math.exp(-+NOTCH * rate);
        // A notch in followed by a notch out returns to the starting scale —
        // the same round-trip property `zoomPerClick` documents.
        expect(inThenOut).toBeCloseTo(1, 12);
    });

    /*
     * The property that removes the need for any trackpad-versus-mouse branch:
     * the rate is per pixel, so a device that emits ten small deltas covering a
     * notch's distance zooms exactly as far as one that emits the notch whole.
     */
    it('gives the same zoom for the same travel, however it is subdivided', () => {
        const rate = wheelZoomRate(1.15, NOTCH);
        const whole = Math.exp(-(-NOTCH) * rate);
        let subdivided = 1;
        for (let i = 0; i < 10; i += 1) {
            subdivided *= Math.exp(-(-NOTCH / 10) * rate);
        }
        expect(subdivided).toBeCloseTo(whole, 12);
    });

    it('scales the rate with the notch size', () => {
        // Half the pixels per notch means twice the zoom per pixel.
        expect(wheelZoomRate(1.5, 50)).toBeCloseTo(
            wheelZoomRate(1.5, 100) * 2,
            12,
        );
    });

    /*
     * A factor at or below 1 has no meaning — 1 freezes the wheel, below 1
     * inverts it — and neither is something to configure. Returning 0 makes the
     * handler's `exp(0)` a no-op instead of a NaN or a reversed scroll. The
     * config edge rejects these before they arrive; this is the backstop.
     */
    it('refuses a factor that would freeze or invert the wheel', () => {
        for (const bad of [1, 0.9, 0, -2, Number.NaN, Number.POSITIVE_INFINITY])
            expect(wheelZoomRate(bad, NOTCH)).toBe(0);
    });

    it('refuses a nonsensical notch size rather than dividing by it', () => {
        for (const bad of [0, -100, Number.NaN, Number.POSITIVE_INFINITY])
            expect(wheelZoomRate(1.5, bad)).toBe(0);
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
