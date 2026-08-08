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
    fitTargetBounds,
    navigationTargetBounds,
    nearestRect,
    reflowShift,
    worldBounds,
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
