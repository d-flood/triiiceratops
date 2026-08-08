// @vitest-environment node
/**
 * The questions the host asks about a laid-out world.
 *
 * These used to be private to `CanvasHost.svelte`, where the only way to
 * exercise them was a browser and a real manifest — which is how a fit target
 * keyed on the wrong thing, and a fallback to the whole world, both went
 * unnoticed. Node environment for the same reason the planner's tests are:
 * nothing in this graph may reach for a DOM global.
 */

import { describe, expect, it } from 'vitest';

import {
    boxContains,
    canvasBoxToWorld,
    canvasPointToWorld,
    canvasScaleFactor,
    fitTargetBounds,
    navigationTargetBounds,
    nearestRect,
    reflowShift,
    worldBounds,
    worldBoxToCanvas,
    worldPointToCanvas,
} from './layoutQueries';
import type { LayoutRect } from './types';

/** A left-to-right world of `count` 1200x900 folios with a 12-unit gutter. */
const PAGE = { width: 1200, height: 900 };
const GAP = 12;
const PITCH = PAGE.width + GAP;

function world(count: number): LayoutRect[] {
    return Array.from({ length: count }, (_, index) => ({
        canvasId: `f${index}`,
        x: index * PITCH,
        y: 0,
        ...PAGE,
    }));
}

/** The centre of folio `index`. */
function centreOf(index: number) {
    return { x: index * PITCH + PAGE.width / 2, y: PAGE.height / 2 };
}

describe('worldBounds', () => {
    it('spans every canvas, and answers null for an empty world', () => {
        expect(worldBounds(world(3))).toEqual({
            x: 0,
            y: 0,
            width: 2 * PITCH + PAGE.width,
            height: PAGE.height,
        });
        expect(worldBounds([])).toBeNull();
    });
});

describe('nearestRect', () => {
    it('answers the canvas the point is standing on', () => {
        expect(nearestRect(world(800), centreOf(400))?.canvasId).toBe('f400');
    });

    it('answers the nearest canvas when the point is on none', () => {
        // In the gutter, a hair past the end of folio 5.
        const gutter = { x: 5 * PITCH + PAGE.width + 1, y: 100 };
        expect(nearestRect(world(800), gutter)?.canvasId).toBe('f5');

        // And off the end of the world entirely.
        const beyond = { x: 800 * PITCH, y: 100 };
        expect(nearestRect(world(800), beyond)?.canvasId).toBe('f799');
    });

    it('breaks a tie by layout order, so the answer is reproducible', () => {
        // Exactly halfway across the gutter between folios 0 and 1.
        const middle = { x: PAGE.width + GAP / 2, y: PAGE.height / 2 };
        expect(nearestRect(world(4), middle)?.canvasId).toBe('f0');
    });

    it('has no answer for an empty world', () => {
        expect(nearestRect([], { x: 0, y: 0 })).toBeNull();
    });
});

describe('boxContains', () => {
    it('is true exactly where the distance is zero', () => {
        const rect = world(1)[0];

        expect(boxContains(rect, centreOf(0))).toBe(true);
        expect(boxContains(rect, { x: PAGE.width + 1, y: 0 })).toBe(false);
    });
});

describe('fitTargetBounds', () => {
    it('follows the VIEWPORT in continuous mode, not the current canvas', () => {
        // The finding this function exists for: a drag, a flick, and a scroll
        // change only the viewport, so a fit keyed on the viewer's "current
        // canvas" — still folio 1 after a hand-scroll to folio 400 — travels
        // 399 folios backwards, and the zoom ceiling it feeds is measured from
        // a page nobody can see.
        const layout = world(800);

        expect(fitTargetBounds(layout, centreOf(400), true)).toMatchObject({
            canvasId: 'f400',
        });
    });

    it('is the whole world in every other mode', () => {
        // Where the world IS the spread on screen, which is why paged and
        // individuals behaviour is untouched by the distinction.
        expect(fitTargetBounds(world(2), centreOf(0), false)).toEqual(
            worldBounds(world(2)),
        );
    });

    it('never widens to the whole world in continuous mode', () => {
        // The collapse this replaces: `fit(whole 800-folio world)` is a
        // thousandth of the fit of one page, so a ceiling of
        // `MAX_ZOOM_FACTOR x` it lands below any readable scale — and below
        // the derived zoom floor, which is the pathology that made the viewer
        // unable to zoom at all.
        const layout = world(800);
        const whole = worldBounds(layout)!;
        const gutter = { x: 400 * PITCH - GAP / 2, y: PAGE.height / 2 };

        const target = fitTargetBounds(layout, gutter, true)!;
        expect(target.width).toBe(PAGE.width);
        expect(target.width).toBeLessThan(whole.width / 100);
    });

    it('has no answer for an empty world', () => {
        expect(fitTargetBounds([], { x: 0, y: 0 }, true)).toBeNull();
    });
});

describe('navigationTargetBounds', () => {
    it('lands on the canvas the viewer says is current', () => {
        // Choosing folio 400 from the canvas list is a request to TRAVEL
        // there, so it must fit folio 400 while the viewport is still on 0.
        expect(
            navigationTargetBounds(world(800), 'f400', centreOf(0), true),
        ).toMatchObject({ canvasId: 'f400' });
    });

    it('falls back to the canvas under the centre, never to the whole world', () => {
        // The frame the finding names: the viewer's canvas has changed and the
        // planner's input has not caught up, or the canvas was dropped for
        // having no usable id, so the `find` misses. Falling back to the world
        // sets `homeScale` from an 800-folio fit for one frame, and the clamp
        // drags the live scale down to a ceiling below any readable one — the
        // reader is left stuck fully zoomed out, silently.
        const layout = world(800);

        const missed = navigationTargetBounds(
            layout,
            'not-in-this-layout',
            centreOf(400),
            true,
        );

        expect(missed).toMatchObject({ canvasId: 'f400' });
        expect(missed).not.toEqual(worldBounds(layout));
    });

    it('falls back the same way when there is no current canvas at all', () => {
        expect(
            navigationTargetBounds(world(800), null, centreOf(12), true),
        ).toMatchObject({ canvasId: 'f12' });
    });

    it('is the whole world in every other mode', () => {
        expect(
            navigationTargetBounds(world(2), 'f0', centreOf(0), false),
        ).toEqual(worldBounds(world(2)));
    });
});

describe('reflowShift', () => {
    it('measures how far the canvas under the centre moved', () => {
        // Canvas 5 was laid out from the sibling median and its `info.json`
        // then reported something wider, so every canvas after it slid along.
        const before = world(800);
        const after = before.map((rect, index) => ({
            ...rect,
            x: index > 5 ? rect.x + 300 : rect.x,
        }));

        expect(reflowShift(before, after, centreOf(400))).toEqual({
            x: 300,
            y: 0,
        });
    });

    it('is zero for a reflow that did not move the reader', () => {
        // The canvas under the centre is BEFORE the one that reflowed, so the
        // page the reader is on has not moved and the viewport must not either.
        const before = world(800);
        const after = before.map((rect, index) => ({
            ...rect,
            x: index > 500 ? rect.x + 300 : rect.x,
        }));

        expect(reflowShift(before, after, centreOf(400))).toEqual({
            x: 0,
            y: 0,
        });
    });

    it('is zero when there is no common canvas to measure against', () => {
        expect(reflowShift([], [], { x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
        expect(
            reflowShift(world(3), [{ ...world(1)[0], canvasId: 'other' }], {
                x: 0,
                y: 0,
            }),
        ).toEqual({ x: 0, y: 0 });
    });
});

/**
 * Canvas space is what the public API speaks; the world is where layout put
 * the canvases. These are the conversion between them, and the case that
 * matters is the one where layout NORMALIZED a canvas's size — because then
 * the two spaces disagree, and a mapping that assumed a shared unit is wrong
 * in exactly the way nobody notices until an annotation lands off the page.
 */
describe('canvas space <-> world space', () => {
    /** A 1600x2000 Canvas that layout placed at (500, 40) scaled to 800x1000. */
    const normalized = {
        rect: { canvasId: 'c', x: 500, y: 40, width: 800, height: 1000 },
        width: 1600,
        height: 2000,
    };

    it('maps a canvas-space point to the same FRACTION of its layout rect', () => {
        // A quarter across and a tenth down the Canvas.
        expect(canvasPointToWorld({ x: 400, y: 200 }, normalized)).toEqual({
            x: 500 + 200,
            y: 40 + 100,
        });
    });

    it('round-trips a point through the world and back', () => {
        const point = { x: 137, y: 1893 };
        const world = canvasPointToWorld(point, normalized);
        const back = worldPointToCanvas(world, normalized);
        expect(back.x).toBeCloseTo(point.x, 9);
        expect(back.y).toBeCloseTo(point.y, 9);
    });

    it('round-trips a box through the world and back', () => {
        const box = { x: 100, y: 250, width: 640, height: 90 };
        const world = canvasBoxToWorld(box, normalized);
        const back = worldBoxToCanvas(world, normalized);
        expect(back.x).toBeCloseTo(box.x, 9);
        expect(back.y).toBeCloseTo(box.y, 9);
        expect(back.width).toBeCloseTo(box.width, 9);
        expect(back.height).toBeCloseTo(box.height, 9);
    });

    it('scales a box by the rect, not by a shared unit', () => {
        expect(
            canvasBoxToWorld(
                { x: 0, y: 0, width: 1600, height: 2000 },
                normalized,
            ),
        ).toEqual({ x: 500, y: 40, width: 800, height: 1000 });
    });

    it('is the identity for a canvas laid out at its declared size', () => {
        const asDeclared = {
            rect: { canvasId: 'c', x: 0, y: 0, width: 1200, height: 900 },
            width: 1200,
            height: 900,
        };
        expect(canvasPointToWorld({ x: 30, y: 40 }, asDeclared)).toEqual({
            x: 30,
            y: 40,
        });
    });

    // A canvas whose manifest declares no dimensions is laid out from its
    // siblings' median, and that rect is then the only statement of its extent
    // anyone has. Refusing to convert would leave the viewer unable to answer
    // for a canvas it is already drawing.
    it('falls back to the layout rect when the manifest declares no size', () => {
        const undeclared = {
            rect: { canvasId: 'c', x: 100, y: 100, width: 600, height: 800 },
            width: null,
            height: null,
        };
        expect(worldPointToCanvas({ x: 400, y: 500 }, undeclared)).toEqual({
            x: 300,
            y: 400,
        });
    });

    // A manifest can carry `"width": 0`; dividing by it produces infinities
    // that travel a long way before anything looks wrong.
    it('ignores a declared size of zero rather than dividing by it', () => {
        const zeroed = {
            rect: { canvasId: 'c', x: 0, y: 0, width: 400, height: 400 },
            width: 0,
            height: 0,
        };
        expect(canvasPointToWorld({ x: 100, y: 100 }, zeroed)).toEqual({
            x: 100,
            y: 100,
        });
    });
});

/**
 * The scale factor the public viewport API's `getScale`/`zoomTo` pair is built
 * on (`CanvasHost.currentCanvasScaleFactor`).
 *
 * The invariant worth pinning is not the arithmetic — it is that this factor is
 * the SAME one the coordinate helpers apply. `getScale` reporting screen pixels
 * per WORLD unit while `canvasToScreen` maps by the rect is the shape of the
 * bug this function exists to remove, and it is invisible in every fixture
 * where layout happens to leave the canvas at its declared size.
 */
describe('canvasScaleFactor', () => {
    /** A 1600x2000 Canvas that layout placed at (500, 40) scaled to 800x1000. */
    const normalized = {
        rect: { canvasId: 'c', x: 500, y: 40, width: 800, height: 1000 },
        width: 1600,
        height: 2000,
    };

    it('is the factor the coordinate helpers already scale distances by', () => {
        const origin = canvasPointToWorld({ x: 0, y: 0 }, normalized);
        const along = canvasPointToWorld({ x: 100, y: 0 }, normalized);

        expect(canvasScaleFactor(normalized)).toBeCloseTo(
            (along.x - origin.x) / 100,
            12,
        );
    });

    // A spread normalizes canvas sizes, so the scale the viewport holds and the
    // scale the public API reports are genuinely different numbers there. A
    // "simplification" of `getScale` back to `viewport.scale` is only visible
    // because this is not 1.
    it('differs from 1 exactly when layout resized the rect', () => {
        expect(canvasScaleFactor(normalized)).toBe(0.5);
        expect(
            canvasScaleFactor({
                rect: { canvasId: 'c', x: 0, y: 0, width: 1200, height: 900 },
                width: 1200,
                height: 900,
            }),
        ).toBe(1);
    });

    // `zoomTo(getScale())` must be a no-op: the host divides by this factor on
    // the way in and multiplies by it on the way out, so anything but an exact
    // reciprocal pair makes a plugin reading the zoom and writing it straight
    // back move the viewport.
    it('round-trips a world scale through canvas space unchanged', () => {
        for (const placement of [
            normalized,
            {
                rect: { canvasId: 'c', x: 0, y: 0, width: 600, height: 800 },
                width: null,
                height: null,
            },
            {
                rect: { canvasId: 'c', x: 0, y: 0, width: 400, height: 400 },
                width: 0,
                height: 0,
            },
        ]) {
            const factor = canvasScaleFactor(placement);
            const worldScale = 3.25;
            expect((worldScale * factor) / factor).toBeCloseTo(worldScale, 12);
            expect(factor).toBeGreaterThan(0);
        }
    });

    // A canvas the manifest gives no usable size for is laid out from its
    // siblings' median, and its rect stands in for its declared size — so the
    // two spaces coincide and the factor is 1, not a division by zero.
    it('is 1 for a canvas with no usable declared size', () => {
        expect(
            canvasScaleFactor({
                rect: { canvasId: 'c', x: 0, y: 0, width: 600, height: 800 },
                width: null,
                height: null,
            }),
        ).toBe(1);
        expect(
            canvasScaleFactor({
                rect: { canvasId: 'c', x: 0, y: 0, width: 400, height: 400 },
                width: 0,
                height: 0,
            }),
        ).toBe(1);
    });
});
