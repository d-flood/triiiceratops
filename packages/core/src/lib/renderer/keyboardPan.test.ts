import { describe, expect, it } from 'vitest';

import { PAN_KEYS, keyPanVelocity } from './keyboardPan';

/**
 * The config is supplied here rather than imported from `rendererDefaults`:
 * every shipped threshold in the renderer is provisional, and a test that asserted
 * the defaults would turn tuning one into a test failure (spec §Further Notes).
 */
const CONFIG = { panSpeed: 600, shiftFactor: 4 };

describe('keyPanVelocity', () => {
    it('is nothing when no bound key is held', () => {
        expect(keyPanVelocity([], false, CONFIG)).toBeNull();
        expect(keyPanVelocity(['Enter', 'a'], false, CONFIG)).toBeNull();
    });

    it('drives a steady velocity in the direction of the held key', () => {
        expect(keyPanVelocity(['ArrowRight'], false, CONFIG)).toEqual({
            x: 600,
            y: 0,
        });
        expect(keyPanVelocity(['ArrowUp'], false, CONFIG)).toEqual({
            x: 0,
            y: -600,
        });
    });

    /*
     * The property the spec singles out as most likely to be built wrong
     * (§Keyboard): OS key repeat fires at ~30 Hz, and a model that added a step
     * per repeat would accelerate. The answer must depend only on WHICH keys
     * are down, so re-asking on every repeat event changes nothing.
     */
    it('is idempotent — a repeated key-down does not accumulate', () => {
        const once = keyPanVelocity(['ArrowRight'], false, CONFIG);
        const held = new Set<string>();
        for (let repeat = 0; repeat < 30; repeat += 1) held.add('ArrowRight');
        expect(keyPanVelocity(held, false, CONFIG)).toEqual(once);
    });

    it('pans further with Shift', () => {
        expect(keyPanVelocity(['ArrowDown'], true, CONFIG)).toEqual({
            x: 0,
            y: 2400,
        });
    });

    it('normalizes a diagonal to the same speed as a single axis', () => {
        const diagonal = keyPanVelocity(
            ['ArrowRight', 'ArrowDown'],
            false,
            CONFIG,
        );
        expect(Math.hypot(diagonal!.x, diagonal!.y)).toBeCloseTo(600, 6);
        expect(diagonal!.x).toBeCloseTo(diagonal!.y, 6);
    });

    it('cancels opposed keys rather than drifting', () => {
        expect(
            keyPanVelocity(['ArrowLeft', 'ArrowRight'], false, CONFIG),
        ).toBeNull();
    });

    it('binds only the four arrows — no page-forward/back keys', () => {
        expect(Object.keys(PAN_KEYS).sort()).toEqual([
            'ArrowDown',
            'ArrowLeft',
            'ArrowRight',
            'ArrowUp',
        ]);
    });
});
