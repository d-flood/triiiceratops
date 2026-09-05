/**
 * Held-key panning: the set of arrow keys currently down → one velocity.
 *
 * DOM-free and pure, for the reason the spec gives held keys their own bullet
 * (§Keyboard): OS key repeat fires at roughly 30 Hz, and the obvious
 * implementation — a discrete pan step per `keydown` — compounds those repeats
 * into juddering acceleration. Modelling a held key as a **velocity** instead
 * makes the rate a function of which keys are down, not of how many repeat
 * events the OS chose to send, so the same function called on the first
 * `keydown` and on the thirtieth repeat returns the same answer.
 *
 * That idempotence is the whole point, and it is what this module exists to
 * make assertable without a browser.
 */

import type { Point } from './types';

/**
 * Which way each bound key moves the **viewport centre**, in screen space.
 *
 * `ArrowRight` moves the centre right — the reader looks further right and the
 * image travels left under them, the same relationship a scrollbar has to its
 * content. Deliberately not the "drag the paper" sense a pointer has: a pointer
 * grabs a point on the image, a key does not.
 *
 * Page Up/Down are deliberately absent (spec §Keyboard): canvas navigation
 * already has toolbar and gallery affordances, and those keys collide with
 * scroll expectations in continuous mode.
 */
export const PAN_KEYS: Readonly<Record<string, Point>> = {
    ArrowLeft: { x: -1, y: 0 },
    ArrowRight: { x: 1, y: 0 },
    ArrowUp: { x: 0, y: -1 },
    ArrowDown: { x: 0, y: 1 },
};

export interface KeyboardPanConfig {
    /** Steady speed of an unmodified held arrow, in screen px per second. */
    panSpeed: number;
    /** Multiplier applied while Shift is held — "pans further", per the spec. */
    shiftFactor: number;
}

/**
 * The velocity a set of held keys drives, in **screen** px/s, or `null` when
 * nothing bound is held (or two opposed keys cancel).
 *
 * Screen rather than canvas space, matching flick momentum: the image then
 * travels across the viewport at the same apparent rate whatever the zoom.
 *
 * Diagonals are normalized, so holding two arrows travels in the corner
 * direction at the same speed rather than 1.41× faster.
 */
export function keyPanVelocity(
    held: Iterable<string>,
    shift: boolean,
    config: KeyboardPanConfig,
): Point | null {
    let x = 0;
    let y = 0;

    for (const key of held) {
        const direction = PAN_KEYS[key];
        if (!direction) continue;
        x += direction.x;
        y += direction.y;
    }

    const length = Math.hypot(x, y);
    if (length === 0) return null;

    const speed = config.panSpeed * (shift ? config.shiftFactor : 1);
    return { x: (x / length) * speed, y: (y / length) * speed };
}
