import { describe, expect, it } from 'vitest';

import type { Viewport } from './types';
import {
    anchoredZoomCentre,
    approach,
    approachScale,
    canvasToScreen,
    clamp,
    compensatedScale,
    constrainCentre,
    fitBounds,
    insetFitScale,
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

describe('insetFitScale', () => {
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
        const scale = insetFitScale(bounds, size, inset);
        const viewport: Viewport = {
            ...size,
            scale,
            centre: insetFitCentre(bounds, size, inset, scale),
        };
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
            const fit = fitBounds(bounds, VIEWPORT);
            const scale = insetFitScale(bounds, VIEWPORT, NONE);
            expect(scale).toBe(fit.scale);
            expect(insetFitCentre(bounds, VIEWPORT, NONE, scale)).toEqual(
                fit.centre,
            );
        }
    });

    it('takes the scale from the inset extent and leaves a symmetric inset centred', () => {
        // 1000x1000 into the 800x400 left by 100 top and bottom → 0.4, and the
        // reserved edges are equal, so the centre does not move.
        const inset = { ...NONE, top: 100, bottom: 100 };
        const scale = insetFitScale(BOX, VIEWPORT, inset);

        expect(scale).toBeCloseTo(0.4, 10);
        expect(insetFitCentre(BOX, VIEWPORT, inset, scale)).toEqual({
            x: 500,
            y: 500,
        });
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
        const inset = { top: 500, bottom: 500, left: 500, right: 500 };
        const fit = fitBounds(BOX, VIEWPORT);
        const scale = insetFitScale(BOX, VIEWPORT, inset);
        expect(scale).toBe(fit.scale);
        expect(insetFitCentre(BOX, VIEWPORT, inset, scale)).toEqual(fit.centre);
    });

    // Set-time validation refuses these, but the arithmetic stays total: a bad
    // number must not produce a NaN scale or centre for the painter.
    it('stays total for a non-finite edge and a degenerate box', () => {
        const fit = fitBounds(BOX, VIEWPORT);
        for (const inset of [
            { ...NONE, bottom: Number.NaN },
            { ...NONE, top: Infinity },
        ]) {
            const scale = insetFitScale(BOX, VIEWPORT, inset);
            expect(scale).toBe(fit.scale);
            expect(insetFitCentre(BOX, VIEWPORT, inset, scale)).toEqual(
                fit.centre,
            );
        }

        const box = { x: 10, y: 20, width: 0, height: 0 };
        const inset = { ...NONE, bottom: 200 };
        const scale = insetFitScale(box, VIEWPORT, inset);
        expect(scale).toBe(1);
        const centre = insetFitCentre(box, VIEWPORT, inset, scale);
        expect(Number.isFinite(centre.x)).toBe(true);
        expect(Number.isFinite(centre.y)).toBe(true);
    });

    // An unmeasured surface has no extent to reserve part of, and the fit
    // arithmetic must not invent one.
    it('does not shift the centre when there is no fit to shift', () => {
        const size = { width: 0, height: 0 };
        const inset = { ...NONE, left: 40 };
        const scale = insetFitScale(BOX, size, inset);
        expect(scale).toBe(0);
        expect(insetFitCentre(BOX, size, inset, scale)).toEqual({
            x: 500,
            y: 500,
        });
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
 * `CanvasHost.applyFit` composes three of these functions — `insetFitScale` for
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
 * an axis is documented as unsupported (`/docs/plugin-authoring/`).
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
        const wanted = insetFitScale(CANVAS, SURFACE, inset);
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
        const scale = clamp(insetFitScale(last, SURFACE, inset), min, max);
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
            insetFitScale(last, SURFACE, modest),
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

describe('surface compensation', () => {
    /**
     * The rule's bounds are about the relationship between the axis that changed
     * and the axis the fit is constrained by, so the table spans both regimes: a
     * portrait canvas is height-constrained in every surface below, so its fit
     * does not move when width does; a landscape one is width-constrained in the
     * three surfaces a panel column narrows (FULL, NARROW, BOTH), so there its
     * fit moves with exactly the axis the column takes, and height-constrained
     * in the two that are short relative to their width (SHORT, MIXED); a square
     * one changes which axis binds partway through the table.
     */
    const PORTRAIT = { x: 0, y: 0, width: 1200, height: 1800 };
    const LANDSCAPE = { x: 0, y: 0, width: 3000, height: 2000 };
    const SQUARE = { x: 0, y: 0, width: 1000, height: 1000 };
    const CANVASES = [PORTRAIT, LANDSCAPE, SQUARE];

    /** The whole surface, and what core's docked chrome leaves of it. */
    const FULL = { width: 800, height: 600 };
    const NARROW = { width: 500, height: 600 }; // a panel column's width
    const SHORT = { width: 800, height: 480 }; // a gallery band's height
    const BOTH = { width: 500, height: 480 }; // a column and a band at once
    const MIXED = { width: 1200, height: 480 }; // one axis each way
    const SIZES = [FULL, NARROW, SHORT, BOTH, MIXED];

    /** Every ordered pair of distinct surfaces: narrowing and widening alike. */
    const CHANGES = SIZES.flatMap((previous) =>
        SIZES.filter((next) => next !== previous).map(
            (next) => [previous, next] as const,
        ),
    );

    function changedAxes(
        previous: { width: number; height: number },
        next: { width: number; height: number },
    ) {
        return (
            (previous.width === next.width ? 0 : 1) +
            (previous.height === next.height ? 0 : 1)
        );
    }

    const SINGLE_AXIS = CHANGES.filter(
        ([previous, next]) => changedAxes(previous, next) === 1,
    );
    const BOTH_AXES = CHANGES.filter(
        ([previous, next]) => changedAxes(previous, next) === 2,
    );
    /** No axis widens: docked chrome only ever taking surface away. */
    const NARROWING = CHANGES.filter(
        ([previous, next]) =>
            next.width <= previous.width && next.height <= previous.height,
    );

    // Each subset is asserted over by a spec below, and a spec that loops over
    // nothing passes. Guards, so that an edit to SIZES cannot empty one silently.
    it('has a table that covers each shape of change', () => {
        expect(CHANGES).toHaveLength(20);
        expect(SINGLE_AXIS).toHaveLength(12);
        expect(BOTH_AXES).toHaveLength(8);
        expect(NARROWING).toHaveLength(7);
    });

    function fitIn(
        canvas: typeof PORTRAIT,
        size: { width: number; height: number },
    ) {
        return fitBounds(canvas, size).scale;
    }

    /**
     * `compensatedScale` with both fit scales measured the way the renderer
     * measures them: the same fit target, once in the surface arriving and once
     * in the surface being left.
     */
    function compensate(
        canvas: typeof PORTRAIT,
        scale: number,
        previous: { width: number; height: number },
        next: { width: number; height: number },
    ) {
        return compensatedScale(
            scale,
            previous,
            next,
            fitIn(canvas, next),
            fitIn(canvas, previous),
        );
    }

    it('introduces no overhang: a reader who had the whole canvas still has it', () => {
        // The guarantee the old absolute re-fit existed to provide, and the
        // reason it can be dropped. A projection larger than the fit hangs off
        // the edges of its own surface and the overhanging part is clipped away,
        // taking canvas-anchored chrome out of both the picture and the hit test.
        let cases = 0;
        for (const canvas of CANVASES) {
            for (const [previous, next] of CHANGES) {
                const previousFit = fitIn(canvas, previous);
                const fit = fitIn(canvas, next);
                // The antecedent is "the whole canvas was visible" — at or under
                // the fit of the surface being left.
                for (const fraction of [0.25, 0.5, 0.9, 1]) {
                    const result = compensate(
                        canvas,
                        previousFit * fraction,
                        previous,
                        next,
                    );
                    expect(result).toBeLessThanOrEqual(fit * (1 + 1e-12));
                    cases += 1;
                }
            }
        }
        // Not vacuous: three canvases, twenty ordered surface pairs, four scales.
        expect(cases).toBe(240);
    });

    it('introduces no overhang while narrowing, on the ratio and the floor alone', () => {
        // The spec above cannot fail on its narrowing half. Every scale it tries
        // is at or under the fit of the departing surface, so the ceiling is
        // armed on every row and `clamp(…, floor, fitScale) <= fitScale` holds
        // whatever the ratio and the floor do. The narrowing half of the
        // guarantee is the half that does not need the ceiling — there
        // `scale * ratio < scale`, and the proof is a case split on which axis
        // binds the fit — so it is asserted here with the ceiling disabled from
        // the caller, by passing a previous fit scale of 0.
        let cases = 0;
        for (const canvas of CANVASES) {
            for (const [previous, next] of NARROWING) {
                const previousFit = fitIn(canvas, previous);
                const fit = fitIn(canvas, next);
                for (const fraction of [0.25, 0.5, 0.9, 1]) {
                    const result = compensatedScale(
                        previousFit * fraction,
                        previous,
                        next,
                        fit,
                        0,
                    );
                    expect(result).toBeLessThanOrEqual(fit * (1 + 1e-12));
                    cases += 1;
                }
            }
        }
        // Three canvases, seven narrowing pairs, four scales.
        expect(cases).toBe(84);
    });

    it('is exactly invertible on a single axis while neither bound is active', () => {
        // Opening a panel and closing it again costs the reader nothing, so
        // repeated toggling cannot drift them outward.
        for (const canvas of CANVASES) {
            for (const [previous, next] of SINGLE_AXIS) {
                // Well clear of both fits. The floor is what makes a round trip
                // lossy and it engages as soon as a narrowing would take the
                // reader past the whole canvas; the widest single-axis ratio in
                // the table is 500/1200, so anything under ~2.4x the fit reaches
                // it.
                const zoomedIn =
                    3 * Math.max(fitIn(canvas, previous), fitIn(canvas, next));
                for (const scale of [zoomedIn, zoomedIn * 4, zoomedIn * 40]) {
                    const there = compensate(canvas, scale, previous, next);
                    // The forward leg genuinely moved, so the round trip is not
                    // being satisfied by a rule that does nothing.
                    expect(there).not.toBe(scale);
                    expect(
                        compensate(canvas, there, next, previous),
                    ).toBeCloseTo(scale, 8);
                }
            }
        }
    });

    it('drifts inward, never outward, on a both-axis round trip', () => {
        // Accepted residual, pinned rather than fixed: `min` over two ratios
        // need not pick the same axis as `min` over their reciprocals, so
        // docking a column and a band in one frame and undocking them again does
        // not return the reader's exact scale. What holds is the direction — the
        // round trip can only end at or below where it started, so it reveals
        // more of the canvas rather than cropping it. A per-axis scale would be
        // the only real fix and there is one scale, by design.
        for (const canvas of CANVASES) {
            for (const [previous, next] of BOTH_AXES) {
                const zoomedIn =
                    3 * Math.max(fitIn(canvas, previous), fitIn(canvas, next));
                const there = compensate(canvas, zoomedIn, previous, next);
                const back = compensate(canvas, there, next, previous);

                expect(back).toBeLessThanOrEqual(zoomedIn * (1 + 1e-12));
            }
        }

        // And the size of it: FULL → BOTH takes min(500/800, 480/600) = 0.625,
        // where the reverse takes min(800/500, 600/480) = 1.25.
        const scale = 4;
        const there = compensate(SQUARE, scale, FULL, BOTH);
        expect(compensate(SQUARE, there, BOTH, FULL)).toBeCloseTo(
            scale * 0.625 * 1.25,
            10,
        );
    });

    it('takes the smallest ratio among the axes that changed, and only those', () => {
        // A reader far above the fit, so neither bound is in play and the
        // region-preserving term stands alone.
        const scale = 100;
        const table: Array<[typeof FULL, typeof FULL, number]> = [
            [FULL, NARROW, 500 / 800], // width alone
            [FULL, SHORT, 480 / 600], // height alone
            [FULL, BOTH, 500 / 800], // both narrowing: the smaller
            [BOTH, FULL, 600 / 480], // both widening: the smaller
            [FULL, MIXED, 480 / 600], // one each way: the narrowing one
            [MIXED, FULL, 800 / 1200], // and its reverse
        ];

        for (const [previous, next, ratio] of table) {
            expect(compensate(SQUARE, scale, previous, next)).toBeCloseTo(
                scale * ratio,
                10,
            );
        }
    });

    it('is the identity when no axis changed', () => {
        for (const canvas of CANVASES) {
            for (const size of SIZES) {
                for (const scale of [1e-4, fitIn(canvas, size), 0.9, 400]) {
                    // A distinct object with the same extents: the rule is about
                    // the numbers, not about the caller reusing a reference.
                    expect(compensate(canvas, scale, size, { ...size })).toBe(
                        scale,
                    );
                }
            }
        }
    });

    it('stops the zoom-out at the whole canvas rather than past it', () => {
        // A portrait canvas is fitted by its HEIGHT in an 800x600 surface, so a
        // panel column taking width moves the ratio and not the fit. Without the
        // floor the reader would be shrunk by the width ratio for no reason —
        // there is no more image to reveal — which is also what would open a
        // viewer configured with a panel already docked needlessly small.
        const fit = fitIn(PORTRAIT, FULL);
        expect(fitIn(PORTRAIT, NARROW)).toBeCloseTo(fit, 12);
        expect(compensate(PORTRAIT, fit, FULL, NARROW)).toBeCloseTo(fit, 12);

        // Below the fit the floor is the reader's own scale: they already see the
        // whole canvas, and a narrowing on a non-binding axis leaves them exactly
        // where they are.
        expect(compensate(PORTRAIT, fit / 2, FULL, NARROW)).toBeCloseTo(
            fit / 2,
            12,
        );

        // On the axis that DOES bind, the ratio term and the floor agree: the fit
        // falls by the same factor the surface did.
        const short = fitIn(PORTRAIT, SHORT);
        expect(short).toBeCloseTo(fit * 0.8, 12);
        expect(compensate(PORTRAIT, fit, FULL, SHORT)).toBeCloseTo(short, 12);

        // …and a width-constrained canvas narrowed in width is the same story
        // with the axes swapped.
        expect(
            compensate(LANDSCAPE, fitIn(LANDSCAPE, FULL), FULL, NARROW),
        ).toBeCloseTo(fitIn(LANDSCAPE, NARROW), 12);
    });

    it('ratchets a reader below the fit up to the fit, and no further', () => {
        // Accepted residual, pinned rather than fixed: the floor's narrowing
        // no-op above is what story 19 depends on, and composing it with the
        // ceiling walks a reader who was below the fit up to it. Narrowing does
        // nothing (the floor is their own scale); widening applies the whole
        // ratio and the ceiling stops it at the fit. So repeated toggling adds
        // scale a step at a time until the fit, where it stops.
        //
        // Bounded, terminating, and inward — it only ever reveals MORE of the
        // canvas and never passes the whole of it, so both headline invariants
        // hold at every step. Fixing it means compensating from the reader's
        // pre-change scale rather than the running one, which is a different
        // rule.
        const fit = fitIn(PORTRAIT, FULL);
        const trace: number[] = [];
        let scale = fit / 2;
        for (let toggle = 0; toggle < 4; toggle += 1) {
            scale = compensate(PORTRAIT, scale, FULL, NARROW);
            trace.push(scale);
            scale = compensate(PORTRAIT, scale, NARROW, FULL);
            trace.push(scale);
        }

        // Open, close, open, close, …: half the fit, then 0.8 of the way to it,
        // then the fit, and fixed from there.
        expect(trace.map((step) => Number(step.toFixed(6)))).toEqual([
            0.166667, 0.266667, 0.266667, 0.333333, 0.333333, 0.333333,
            0.333333, 0.333333,
        ]);
        expect(scale).toBeCloseTo(fit, 12);
    });

    it('gates the ceiling on the fit of the surface the reader is leaving', () => {
        // The two candidate gates are only distinguishable where the two fit
        // scales differ, which needs a canvas the changed axis actually
        // constrains. LANDSCAPE is width-constrained in both of the surfaces
        // below, so a panel column moves its fit; every portrait fixture in the
        // mounted suite has `fitScale === previousFitScale` and cannot see this
        // at all.
        //
        // Note what the `compensatedScale(…, wide, wide)` lines are, since they
        // are the only calls in this file that bypass `compensate`: they state
        // what a WRONG implementation would return, so that swapping the gate is
        // shown to change the answer. They are not coverage of the shipped rule
        // — every assertion about that goes through `compensate`, which measures
        // each fit in its own surface.
        const wide = fitIn(LANDSCAPE, FULL);
        const narrow = fitIn(LANDSCAPE, NARROW);
        expect(narrow).toBeLessThan(wide);

        // A reader zoomed in on the NARROW surface — above its fit, so already
        // overhanging by choice — but still under what the wide surface fits.
        for (const scale of [narrow * 1.05, (narrow + wide) / 2, wide * 0.99]) {
            // Giving the width back multiplies their scale, untouched by the
            // ceiling: they chose that zoom and nothing was taken from them.
            expect(compensate(LANDSCAPE, scale, NARROW, FULL)).toBeCloseTo(
                scale * (800 / 500),
                10,
            );

            // Gating on the ARRIVING fit instead reads them as "at the fit" and
            // drags them down to it, so a widening surface would lose the zoom a
            // narrowing one preserved. Spelled by passing the arriving fit as
            // both arguments, which is what a caller that read
            // `previousFitScale` after the viewport had adopted the new size
            // would compute.
            expect(
                compensatedScale(scale, NARROW, FULL, wide, wide),
            ).toBeCloseTo(wide, 10);
        }

        // The same mutation breaks the round trip, which is the reader-facing
        // shape of it: open the panel, close it, and be somewhere else.
        const scale = wide * 1.125;
        const opened = compensate(LANDSCAPE, scale, FULL, NARROW);
        expect(compensate(LANDSCAPE, opened, NARROW, FULL)).toBeCloseTo(
            scale,
            10,
        );
        expect(compensatedScale(opened, NARROW, FULL, wide, wide)).toBeCloseTo(
            wide,
            10,
        );
    });

    it('returns the scale untouched for inputs with no ratio to take', () => {
        // An unmeasured or non-finite surface being left, and a non-finite one
        // arriving: there is no ratio against either.
        expect(compensate(SQUARE, 2, { width: 0, height: 600 }, FULL)).toBe(2);
        expect(compensate(SQUARE, 2, { width: NaN, height: 600 }, FULL)).toBe(
            2,
        );
        expect(
            compensate(SQUARE, 2, { width: Infinity, height: 600 }, FULL),
        ).toBe(2);
        expect(compensate(SQUARE, 2, FULL, { width: NaN, height: 600 })).toBe(
            2,
        );

        // No region to preserve.
        for (const scale of [0, -1, NaN, Infinity]) {
            expect(compensate(SQUARE, scale, FULL, NARROW)).toBe(scale);
        }

        // An unmeasured FIT is no bound at all, leaving the ratio term alone.
        expect(compensatedScale(2, FULL, NARROW, 0, 0)).toBeCloseTo(1.25, 10);
        expect(compensatedScale(2, FULL, NARROW, NaN, NaN)).toBeCloseTo(
            1.25,
            10,
        );

        // A zero extent ARRIVING is deliberately not among the guards: the ratio
        // is 0 and there is no usable fit to floor it, so the answer is 0.
        // Callers never present one — a surface with no width has nothing to
        // compensate for.
        expect(compensate(SQUARE, 2, FULL, { width: 0, height: 600 })).toBe(0);
    });

    it('pins what the empty-world fit sentinel does, unreachable though it is', () => {
        // `homeScale()` answers a sentinel 1 when there is no fit target, and
        // `compensatedScale` cannot tell that from a genuine fit scale of 1.0.
        // Unreachable through the renderer's `measure()` — nothing is laid out,
        // so no surface change is compensated — but a table over the function
        // reaches it. Pinned rather than given a sentinel-detection argument.
        const EMPTY = 1;

        // Narrowing: the floor is the reader's own scale, so it is a no-op.
        expect(compensatedScale(0.5, FULL, NARROW, EMPTY, EMPTY)).toBe(0.5);
        // Widening: the ceiling caps them at the sentinel.
        expect(compensatedScale(0.8, NARROW, FULL, EMPTY, EMPTY)).toBe(1);
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
