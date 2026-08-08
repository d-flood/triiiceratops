import { describe, expect, it } from 'vitest';

import { GestureRecogniser, type GestureConfig } from './gestureArbiter';

// Test values, deliberately NOT the shipped defaults: every threshold in
// `rendererDefaults` is provisional, and asserting against them would let a
// tuning change silently rewrite what these tests prove.
const CONFIG: GestureConfig = {
    tapSlop: 5,
    doubleTapMs: 300,
    doubleTapSlop: 20,
    velocityWindowMs: 100,
    minVelocitySpanMs: 10,
    minFlickSpeed: 50,
};

function recogniser(overrides: Partial<GestureConfig> = {}) {
    return new GestureRecogniser({ ...CONFIG, ...overrides });
}

describe('gesture ownership', () => {
    it('owns nothing until a pointer is down', () => {
        expect(recogniser().owner).toBe('none');
    });

    it('gives one pointer to pan', () => {
        const gestures = recogniser();
        gestures.down({ id: 1, x: 0, y: 0, time: 0 });
        expect(gestures.owner).toBe('pan');
    });

    it('promotes to pinch on the second pointer and demotes on its release', () => {
        const gestures = recogniser();
        gestures.down({ id: 1, x: 0, y: 0, time: 0 });
        gestures.down({ id: 2, x: 100, y: 0, time: 10 });
        expect(gestures.owner).toBe('pinch');

        gestures.up({ id: 2, x: 100, y: 0, time: 20 });
        expect(gestures.owner).toBe('pan');

        gestures.up({ id: 1, x: 0, y: 0, time: 30 });
        expect(gestures.owner).toBe('none');
    });

    it('releases ownership when a pointer is cancelled', () => {
        const gestures = recogniser();
        gestures.down({ id: 1, x: 0, y: 0, time: 0 });
        gestures.cancel({ id: 1, x: 0, y: 0, time: 5 });
        expect(gestures.owner).toBe('none');
    });

    it('ignores a duplicate down for a pointer already tracked', () => {
        const gestures = recogniser();
        gestures.down({ id: 1, x: 0, y: 0, time: 0 });
        gestures.down({ id: 1, x: 50, y: 50, time: 5 });
        expect(gestures.owner).toBe('pan');

        // The duplicate did not move the reference point, so the first move
        // still reports the delta from the original down.
        expect(gestures.move({ id: 1, x: 10, y: 0, time: 10 })).toEqual({
            kind: 'pan',
            dx: 10,
            dy: 0,
        });
    });

    it('ignores a move for an untracked pointer', () => {
        const gestures = recogniser();
        gestures.down({ id: 1, x: 0, y: 0, time: 0 });
        expect(gestures.move({ id: 9, x: 500, y: 500, time: 10 })).toEqual({
            kind: 'none',
        });
    });
});

describe('pan', () => {
    it('reports the pointer delta, 1:1, with no smoothing', () => {
        const gestures = recogniser();
        gestures.down({ id: 1, x: 100, y: 100, time: 0 });

        expect(gestures.move({ id: 1, x: 130, y: 80, time: 16 })).toEqual({
            kind: 'pan',
            dx: 30,
            dy: -20,
        });
        // Deltas are incremental, not cumulative.
        expect(gestures.move({ id: 1, x: 135, y: 80, time: 32 })).toEqual({
            kind: 'pan',
            dx: 5,
            dy: 0,
        });
    });
});

describe('pinch', () => {
    it('anchors at the midpoint the pointers were at, and scales by their separation', () => {
        const gestures = recogniser();
        gestures.down({ id: 1, x: 100, y: 200, time: 0 });
        gestures.down({ id: 2, x: 300, y: 200, time: 10 });

        // Pointer events arrive one at a time, so a two-finger spread is two
        // updates. Each is anchored at the midpoint BEFORE that move, which is
        // what lets the host apply it as "zoom about the anchor, then
        // translate by the midpoint's own movement".
        const first = gestures.move({ id: 1, x: 50, y: 200, time: 20 });
        expect(first).toEqual({
            kind: 'pinch',
            anchor: { x: 200, y: 200 },
            scaleBy: 250 / 200,
            dx: -25,
            dy: 0,
        });

        const second = gestures.move({ id: 2, x: 350, y: 200, time: 30 });
        expect(second).toEqual({
            kind: 'pinch',
            anchor: { x: 175, y: 200 },
            scaleBy: 300 / 250,
            dx: 25,
            dy: 0,
        });

        // Composed: separation 200 → 300 and the midpoint back where it began.
        expect((250 / 200) * (300 / 250)).toBeCloseTo(1.5, 10);
    });

    it('reports midpoint translation with no scale change for a rigid two-finger drag', () => {
        const gestures = recogniser();
        gestures.down({ id: 1, x: 100, y: 100, time: 0 });
        gestures.down({ id: 2, x: 300, y: 100, time: 10 });

        // Both fingers translate by (40, 50); separation is unchanged.
        gestures.move({ id: 1, x: 140, y: 150, time: 20 });
        const update = gestures.move({ id: 2, x: 340, y: 150, time: 30 });

        expect(update.kind).toBe('pinch');
        if (update.kind !== 'pinch') throw new Error('expected a pinch');

        // Separation dipped and recovered as the fingers moved one at a time,
        // so the two scale factors compose back to 1.
        const midSeparation = Math.hypot(300 - 140, 100 - 150);
        expect(update.scaleBy).toBeCloseTo(200 / midSeparation, 10);
        expect((midSeparation / 200) * update.scaleBy).toBeCloseTo(1, 10);

        // …and the midpoint translations compose to the full (40, 50).
        expect(update.dx + 20).toBeCloseTo(40, 10);
        expect(update.dy + 25).toBeCloseTo(50, 10);
    });

    it('does not jump when the second pointer lands mid-drag', () => {
        const gestures = recogniser();
        gestures.down({ id: 1, x: 100, y: 100, time: 0 });
        gestures.move({ id: 1, x: 400, y: 400, time: 10 });
        gestures.down({ id: 2, x: 500, y: 400, time: 20 });

        // The first pinch move must measure from where the pointers ARE, not
        // from where the pan gesture started.
        const update = gestures.move({ id: 2, x: 500, y: 400, time: 30 });
        expect(update.kind).toBe('pinch');
        if (update.kind !== 'pinch') throw new Error('expected a pinch');
        expect(update.scaleBy).toBeCloseTo(1, 10);
        expect(update.dx).toBeCloseTo(0, 10);
        expect(update.dy).toBeCloseTo(0, 10);
    });

    it('treats a degenerate zero separation as no scale change', () => {
        const gestures = recogniser();
        gestures.down({ id: 1, x: 100, y: 100, time: 0 });
        gestures.down({ id: 2, x: 100, y: 100, time: 10 });

        const update = gestures.move({ id: 2, x: 140, y: 100, time: 20 });
        expect(update.kind).toBe('pinch');
        if (update.kind !== 'pinch') throw new Error('expected a pinch');
        expect(update.scaleBy).toBe(1);
    });

    it('resumes panning from the surviving pointer after one lifts', () => {
        const gestures = recogniser();
        gestures.down({ id: 1, x: 100, y: 100, time: 0 });
        gestures.down({ id: 2, x: 300, y: 100, time: 10 });
        gestures.move({ id: 1, x: 50, y: 100, time: 20 });
        gestures.up({ id: 2, x: 300, y: 100, time: 30 });

        // The remaining pointer is at (50, 100); the next move must be measured
        // from there, not from its original down at (100, 100).
        expect(gestures.move({ id: 1, x: 60, y: 100, time: 40 })).toEqual({
            kind: 'pan',
            dx: 10,
            dy: 0,
        });
    });
});

describe('flick momentum', () => {
    it('reports the velocity of the recent samples on release', () => {
        const gestures = recogniser();
        gestures.down({ id: 1, x: 0, y: 0, time: 0 });
        for (let i = 1; i <= 5; i += 1) {
            gestures.move({ id: 1, x: i * 20, y: i * -10, time: i * 16 });
        }

        const update = gestures.up({ id: 1, x: 100, y: -50, time: 80 });
        expect(update.kind).toBe('flick');
        if (update.kind !== 'flick') throw new Error('expected a flick');
        // 20px per 16ms → 1250 px/s.
        expect(update.velocity.x).toBeCloseTo(1250, 6);
        expect(update.velocity.y).toBeCloseTo(-625, 6);
    });

    it('measures velocity only over the recent window, ignoring a long pause', () => {
        const gestures = recogniser({ velocityWindowMs: 100 });
        gestures.down({ id: 1, x: 0, y: 0, time: 0 });
        gestures.move({ id: 1, x: 400, y: 0, time: 50 });
        // A long, still hold: the earlier fast movement must not count.
        gestures.move({ id: 1, x: 400, y: 0, time: 2000 });
        gestures.move({ id: 1, x: 400, y: 0, time: 2050 });

        expect(gestures.up({ id: 1, x: 400, y: 0, time: 2060 })).toEqual({
            kind: 'none',
        });
    });

    it('does not flick below the minimum speed', () => {
        const gestures = recogniser({ minFlickSpeed: 500 });
        gestures.down({ id: 1, x: 0, y: 0, time: 0 });
        gestures.move({ id: 1, x: 10, y: 0, time: 50 });

        // 200 px/s, well under the 500 px/s floor.
        expect(gestures.up({ id: 1, x: 10, y: 0, time: 50 })).toEqual({
            kind: 'none',
        });
    });

    it('reports no flick when the samples carry no usable timing', () => {
        // A whole gesture inside one task — coalesced moves, or a synthesized
        // sequence. Real distance over a near-zero interval would otherwise
        // read as tens of thousands of px/s and fling the viewport away.
        const gestures = recogniser({ minVelocitySpanMs: 10 });
        gestures.down({ id: 1, x: 0, y: 0, time: 1000 });
        gestures.move({ id: 1, x: 90, y: 0, time: 1000.05 });
        gestures.move({ id: 1, x: 180, y: 0, time: 1000.1 });

        expect(gestures.up({ id: 1, x: 180, y: 0, time: 1000.12 })).toEqual({
            kind: 'none',
        });
    });

    it('reports no flick when a pointer is cancelled', () => {
        const gestures = recogniser();
        gestures.down({ id: 1, x: 0, y: 0, time: 0 });
        gestures.move({ id: 1, x: 200, y: 0, time: 16 });

        expect(gestures.cancel({ id: 1, x: 200, y: 0, time: 20 })).toEqual({
            kind: 'none',
        });
    });

    it('flicks from the surviving pointer of a pinch, on the final release', () => {
        const gestures = recogniser();
        gestures.down({ id: 1, x: 0, y: 0, time: 0 });
        gestures.down({ id: 2, x: 200, y: 0, time: 10 });
        gestures.up({ id: 2, x: 200, y: 0, time: 20 });
        // Lifting the second pointer alone carries no momentum…
        gestures.move({ id: 1, x: 40, y: 0, time: 36 });
        gestures.move({ id: 1, x: 80, y: 0, time: 52 });

        // …but the last pointer's release does.
        const update = gestures.up({ id: 1, x: 80, y: 0, time: 52 });
        expect(update.kind).toBe('flick');
    });
});

describe('taps', () => {
    it('produces nothing at all for a single tap', () => {
        const gestures = recogniser();
        gestures.down({ id: 1, x: 200, y: 200, time: 0 });
        expect(gestures.up({ id: 1, x: 201, y: 200, time: 40 })).toEqual({
            kind: 'none',
        });
    });

    it('reports a double tap for a second quick tap in the same place', () => {
        const gestures = recogniser();
        gestures.down({ id: 1, x: 200, y: 200, time: 0 });
        gestures.up({ id: 1, x: 200, y: 200, time: 40 });
        gestures.down({ id: 2, x: 203, y: 198, time: 180 });

        expect(gestures.up({ id: 2, x: 203, y: 198, time: 210 })).toEqual({
            kind: 'doubleTap',
            point: { x: 203, y: 198 },
        });
    });

    it('does not double-tap when the second tap is too late', () => {
        const gestures = recogniser({ doubleTapMs: 300 });
        gestures.down({ id: 1, x: 200, y: 200, time: 0 });
        gestures.up({ id: 1, x: 200, y: 200, time: 40 });
        gestures.down({ id: 2, x: 200, y: 200, time: 400 });

        expect(gestures.up({ id: 2, x: 200, y: 200, time: 430 })).toEqual({
            kind: 'none',
        });
    });

    it('does not double-tap when the second tap is too far away', () => {
        const gestures = recogniser({ doubleTapSlop: 20 });
        gestures.down({ id: 1, x: 200, y: 200, time: 0 });
        gestures.up({ id: 1, x: 200, y: 200, time: 40 });
        gestures.down({ id: 2, x: 260, y: 200, time: 100 });

        expect(gestures.up({ id: 2, x: 260, y: 200, time: 130 })).toEqual({
            kind: 'none',
        });
    });

    it('does not treat a drag as a tap, however short', () => {
        const gestures = recogniser({ tapSlop: 5 });
        gestures.down({ id: 1, x: 200, y: 200, time: 0 });
        gestures.up({ id: 1, x: 200, y: 200, time: 30 });

        // Second press wanders well past the slop before releasing back at the
        // start: distance travelled is what disqualifies it, not end position.
        gestures.down({ id: 2, x: 200, y: 200, time: 100 });
        gestures.move({ id: 2, x: 260, y: 200, time: 120 });
        gestures.move({ id: 2, x: 200, y: 200, time: 140 });

        const update = gestures.up({ id: 2, x: 200, y: 200, time: 150 });
        expect(update.kind).not.toBe('doubleTap');
    });

    it('does not chain a third tap off the second', () => {
        const gestures = recogniser();
        gestures.down({ id: 1, x: 200, y: 200, time: 0 });
        gestures.up({ id: 1, x: 200, y: 200, time: 20 });
        gestures.down({ id: 2, x: 200, y: 200, time: 100 });
        expect(gestures.up({ id: 2, x: 200, y: 200, time: 120 }).kind).toBe(
            'doubleTap',
        );

        gestures.down({ id: 3, x: 200, y: 200, time: 200 });
        expect(gestures.up({ id: 3, x: 200, y: 200, time: 220 }).kind).toBe(
            'none',
        );
    });

    it('does not report a double tap after a pinch', () => {
        const gestures = recogniser();
        gestures.down({ id: 1, x: 200, y: 200, time: 0 });
        gestures.up({ id: 1, x: 200, y: 200, time: 20 });

        gestures.down({ id: 2, x: 200, y: 200, time: 100 });
        gestures.down({ id: 3, x: 240, y: 200, time: 110 });
        gestures.up({ id: 3, x: 240, y: 200, time: 120 });

        expect(gestures.up({ id: 2, x: 200, y: 200, time: 130 }).kind).toBe(
            'none',
        );
    });
});
