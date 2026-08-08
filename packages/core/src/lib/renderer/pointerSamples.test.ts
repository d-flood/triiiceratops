import { describe, expect, it } from 'vitest';

import { GestureRecogniser, type GestureConfig } from './gestureArbiter';
import { pointerSample, type SampledPointerEvent } from './pointerSamples';

const CONFIG: GestureConfig = {
    tapSlop: 5,
    doubleTapMs: 300,
    doubleTapSlop: 20,
    velocityWindowMs: 100,
    minVelocitySpanMs: 10,
    minFlickSpeed: 50,
};

const ORIGIN = { x: 40, y: 25 };

function event(
    x: number,
    timeStamp: number,
    pointerId = 1,
): SampledPointerEvent {
    return { pointerId, clientX: ORIGIN.x + x, clientY: ORIGIN.y, timeStamp };
}

describe('pointerSample', () => {
    it('is surface-local', () => {
        expect(
            pointerSample(
                { pointerId: 7, clientX: 340, clientY: 225, timeStamp: 5 },
                ORIGIN,
            ),
        ).toEqual({ id: 7, x: 300, y: 200, time: 5 });
    });

    it('carries the time the input happened, not the time it was handled', () => {
        // A backlog delivered in one burst: the moves were paced 16 ms apart —
        // which is what their own timestamps say — but the whole sequence is
        // handled inside a single janked task. Stamping at dispatch would divide
        // the same 100 px of travel by roughly a fifth of the interval and
        // report a flick several times faster than the finger ever moved.
        const paced = [0, 16, 32, 48, 64, 80];
        const handled = [0, 3, 7, 11, 15, 18];

        const gestures = new GestureRecogniser(CONFIG);
        gestures.down(pointerSample(event(0, paced[0]), ORIGIN));
        for (let step = 1; step < paced.length - 1; step += 1) {
            gestures.move(pointerSample(event(step * 20, paced[step]), ORIGIN));
        }

        const update = gestures.up(pointerSample(event(100, paced[5]), ORIGIN));
        expect(update.kind).toBe('flick');
        if (update.kind !== 'flick') throw new Error('expected a flick');

        // 100 px over the events' own 80 ms.
        expect(update.velocity.x).toBeCloseTo(1250, 6);

        // And what the dispatch clock would have claimed, for scale: the same
        // travel over 18 ms is over five times the real speed.
        const atDispatch = 100 / (handled[5] / 1000);
        expect(atDispatch / update.velocity.x).toBeGreaterThan(4);
    });

    it('loses no momentum when paced input is handled late and bunched', () => {
        // The symmetric failure: real travel spread over 90 ms, but every move
        // handled within a millisecond of the next. A dispatch-stamped trail
        // falls under any sane minimum span and reports no flick at all.
        const gestures = new GestureRecogniser(CONFIG);
        gestures.down(pointerSample(event(0, 1000), ORIGIN));
        gestures.move(pointerSample(event(45, 1045), ORIGIN));

        const update = gestures.up(pointerSample(event(90, 1090), ORIGIN));
        expect(update.kind).toBe('flick');
    });
});
