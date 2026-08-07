import { describe, expect, it } from 'vitest';

import type { Viewport } from './types';
import {
    anchoredZoomCentre,
    approach,
    approachScale,
    canvasToScreen,
    fitBounds,
    screenToCanvas,
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
});
