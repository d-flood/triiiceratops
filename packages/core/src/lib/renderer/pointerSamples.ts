/**
 * The one place a `PointerEvent` becomes a `PointerSample`.
 *
 * Split out of the host so the mapping — which decides what flick velocity is
 * measured against — can be asserted without a browser. Everything downstream of
 * here (`gestureArbiter.ts`) is DOM-free.
 */

import type { PointerSample } from './gestureArbiter';
import type { Point } from './types';

/**
 * The part of a `PointerEvent` a sample is built from.
 *
 * Structural rather than `PointerEvent` itself so this module, like the
 * recogniser behind it, can be exercised in plain Node.
 */
export interface SampledPointerEvent {
    pointerId: number;
    clientX: number;
    clientY: number;
    /** A `DOMHighResTimeStamp`. See `pointerSample`. */
    timeStamp: number;
}

/**
 * A pointer sample in surface-local screen coordinates.
 *
 * The timestamp is the **event's own** `timeStamp`, not the `performance.now()`
 * of the handler that received it. `PointerEvent.timeStamp` is a
 * `DOMHighResTimeStamp` on the same time origin as `performance.now()` and as
 * the `requestAnimationFrame` timestamps momentum is integrated against, so
 * there is no clock to mix — and it records when the input actually happened
 * rather than when the main thread got round to it.
 *
 * That difference is the whole point. Under jank the browser delivers a backlog
 * of moves in one burst: ninety milliseconds of real travel handled inside
 * twenty. Stamped at dispatch, the same distance divided by the shorter
 * interval reads as several times the speed, and the release flings the
 * viewport across the world. The symmetric case — moves paced normally but
 * handled late and bunched — silently loses momentum instead. Neither is
 * observable from the geometry, only from the clock.
 */
export function pointerSample(
    event: SampledPointerEvent,
    origin: Point,
): PointerSample {
    return {
        id: event.pointerId,
        x: event.clientX - origin.x,
        y: event.clientY - origin.y,
        time: event.timeStamp,
    };
}
