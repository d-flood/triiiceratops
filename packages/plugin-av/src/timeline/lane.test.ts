/**
 * The lane window: what part of a projected lane is on screen, and what span of
 * the recording that part covers. The arithmetic both timeline surfaces place
 * themselves with, and the observable half of temporal zoom.
 */

import { describe, expect, it } from 'vitest';

import { clipLaneWindow } from './lane';

const VIEWPORT = { width: 1000, height: 600 };

describe('clipLaneWindow', () => {
    it('gives a lane inside the viewport its whole self and its whole length', () => {
        const view = clipLaneWindow(
            { left: 0, top: 0, width: 1000, height: 600 },
            VIEWPORT,
            120,
        )!;
        expect(view).toMatchObject({
            left: 0,
            top: 0,
            width: 1000,
            height: 600,
        });
        expect(view.startTime).toBe(0);
        expect(view.endTime).toBe(120);
    });

    it('narrows the time window as the lane is zoomed past the viewport', () => {
        // Four times the width, centred: the viewport shows the middle quarter
        // of the recording, which is what makes the viewer's zoom temporal.
        const view = clipLaneWindow(
            { left: -1500, top: 0, width: 4000, height: 600 },
            VIEWPORT,
            120,
        )!;
        expect(view.width).toBe(1000);
        expect(view.startTime).toBe(45);
        expect(view.endTime).toBe(75);
    });

    it('reports the slice in the coordinates of the lane itself', () => {
        // A lane hanging off the left edge: the surface starts where the lane
        // enters the viewport, which is 200 px into the lane itself.
        const view = clipLaneWindow(
            { left: -200, top: 0, width: 2000, height: 600 },
            VIEWPORT,
            100,
        )!;
        expect(view.left).toBe(200);
        expect(view.width).toBe(1000);
        expect(view.startTime).toBe(10);
    });

    it('clips vertically too, so an overhanging lane draws only what shows', () => {
        const view = clipLaneWindow(
            { left: 0, top: -100, width: 1000, height: 900 },
            VIEWPORT,
            60,
        )!;
        expect(view.top).toBe(100);
        expect(view.height).toBe(600);
    });

    it('has no window for a lane that is not there to draw in', () => {
        const rect = { left: 0, top: 0, width: 1000, height: 600 };
        expect(clipLaneWindow(null, VIEWPORT, 60)).toBeNull();
        expect(clipLaneWindow(rect, VIEWPORT, null)).toBeNull();
        expect(clipLaneWindow(rect, VIEWPORT, 0)).toBeNull();
        // Panned entirely off the side, and a viewport not yet measured.
        expect(
            clipLaneWindow({ ...rect, left: -2000 }, VIEWPORT, 60),
        ).toBeNull();
        expect(clipLaneWindow(rect, { width: 0, height: 0 }, 60)).toBeNull();
    });
});
