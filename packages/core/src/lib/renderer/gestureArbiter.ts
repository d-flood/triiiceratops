/**
 * The gesture recogniser: pointer samples in, gesture updates out.
 *
 * This module is **DOM-free**. It is fed plain `{ id, x, y, time }` records
 * rather than `PointerEvent`s, which is what lets the whole gesture model —
 * ownership, pinch geometry, flick velocity, double-tap detection — be asserted
 * in unit tests rather than only through synthesized browser input.
 *
 * ## One arbitration point
 *
 * {@link GestureRecogniser.arbitrate} is the **only** place that decides which
 * consumer owns a gesture. Nothing else in the renderer branches on "am I
 * panning or pinching?".
 *
 * That includes the **discrete** outcomes. A tap, a double tap, and a flick are
 * decided at pointer-up, long after arbitration ran, so they are gated on the
 * ownership captured when the gesture's first pointer went down (see
 * `gestureOwned`). Without that gate a held claim would silence pan and pinch
 * while `up()` still emitted a double-tap zoom and a momentum glide — which is
 * not what a claim means: it suppresses pan **and** zoom for its duration
 * (CONTEXT.md §Renderer domain / *Input claim*).
 *
 * That single point is the whole reason this module exists as something more
 * than a pair of handlers on the canvas. The phase-2 **input claim** API — a
 * consumer (the annotation drawing layer) temporarily owning pointer input and
 * suppressing pan and zoom for its duration — is granted *there*, by returning
 * `'none'` while a claim is held. Retrofitting preemption into scattered
 * `pointerdown`/`pointermove` handlers means restructuring all of them;
 * adding it to one arbiter is a two-line change. The claim API is deliberately
 * **not exposed in this phase** (spec §Input and animation, CONTEXT.md
 * §Renderer domain / *Input claim*) — only the shape that makes it cheap.
 *
 * ## What this module does NOT decide
 *
 * It reports gesture *deltas in screen space* and never touches the viewport.
 * Clamping, anchoring, and the direct-versus-animated distinction all belong to
 * the host, which owns the transform.
 */

import type { Point } from './types';

/** Who owns the current gesture. */
export type GestureOwner = 'none' | 'pan' | 'pinch';

/** One pointer sample, in screen space, with a monotonic timestamp in ms. */
export interface PointerSample {
    id: number;
    x: number;
    y: number;
    time: number;
}

/**
 * What the host should do with a sample.
 *
 * Deltas are in **screen pixels** and are incremental — each update describes
 * only what changed since the previous one.
 */
export type GestureUpdate =
    | { kind: 'none' }
    /** Direct pan. Never smoothed: this is the transform, not a target. */
    | { kind: 'pan'; dx: number; dy: number }
    /**
     * Direct pinch: scale by `scaleBy` about `anchor` (the midpoint the
     * pointers were at before this sample), then translate by the midpoint's
     * own movement `(dx, dy)`.
     */
    | { kind: 'pinch'; anchor: Point; scaleBy: number; dx: number; dy: number }
    /** Release with momentum. `velocity` is screen pixels per second. */
    | { kind: 'flick'; velocity: Point }
    /**
     * A single tap that moved no further than `tapSlop` — **annotation
     * selection**, and nothing to do with the viewport.
     *
     * Reported rather than swallowed so that the one thing single tap is
     * reserved for is decided *here*, at the arbitration point, with everything
     * a tap has to clear already applied: not a pinch, not a drag, and not a
     * gesture the arbiter refused to grant (a held input claim). The host does
     * not move the viewport for it — `clickToZoom` stays false — it forwards the
     * point to whoever is listening.
     */
    | { kind: 'tap'; point: Point }
    /** A second quick tap in the same place — the animated zoom step. */
    | { kind: 'doubleTap'; point: Point };

/**
 * Recogniser thresholds.
 *
 * Passed in rather than imported from `rendererDefaults` so tests can supply
 * their own values: every shipped threshold is provisional, and a test that
 * asserted against them would turn tuning into a silent rewrite of what it
 * proves.
 */
export interface GestureConfig {
    /** Screen px a press may travel and still count as a tap. */
    tapSlop: number;
    /** Longest gap between two taps that still reads as a double tap, in ms. */
    doubleTapMs: number;
    /** How far apart two taps may be and still pair, in screen px. */
    doubleTapSlop: number;
    /** How far back release velocity is measured, in ms. */
    velocityWindowMs: number;
    /**
     * Shortest trail, in ms, that carries usable timing.
     *
     * A whole gesture can arrive inside one task with barely-distinguishable
     * timestamps: coalesced pointer moves delivered together, an automated or
     * synthesized sequence, a page resuming after being throttled. Dividing
     * real distance by a near-zero interval yields a velocity orders of
     * magnitude past anything a hand can produce, and the resulting glide
     * throws the viewport clear across the world. Below this, the samples say
     * nothing about speed and the release carries no momentum.
     */
    minVelocitySpanMs: number;
    /** Speed below which a release carries no momentum, in screen px/s. */
    minFlickSpeed: number;
}

interface TrackedPointer {
    id: number;
    /** Where it is now. */
    x: number;
    y: number;
    /** Total distance travelled, which is what disqualifies a tap. */
    travelled: number;
    /** Recent samples, oldest first, pruned to the velocity window. */
    trail: PointerSample[];
}

const NONE: GestureUpdate = { kind: 'none' };

export class GestureRecogniser {
    private readonly config: GestureConfig;
    /** Active pointers in arrival order; the first two drive a pinch. */
    private readonly pointers: TrackedPointer[] = [];
    private currentOwner: GestureOwner = 'none';
    /**
     * True once a gesture has had two pointers down. A pinch is never a tap,
     * however briefly its last finger lingers.
     */
    private multiTouch = false;
    /**
     * Whether {@link GestureRecogniser.arbitrate} granted this gesture to a
     * viewport consumer at any point since its first pointer went down.
     *
     * This is what carries the arbiter's decision forward to the discrete
     * outcomes, which are only knowable at release. Reset when the last pointer
     * lifts, so the next gesture is arbitrated afresh.
     */
    private gestureOwned = false;
    /** The previous tap, waiting to be paired into a double tap. */
    private pendingTap: { x: number; y: number; time: number } | null = null;

    constructor(config: GestureConfig) {
        this.config = config;
    }

    get owner(): GestureOwner {
        return this.currentOwner;
    }

    /**
     * **The single arbitration point.** Every ownership decision in the
     * renderer is this function's return value.
     *
     * Phase 2's input claim is granted here: a held claim returns `'none'`,
     * which suppresses pan, pinch, flick momentum, and double-tap zoom for its
     * duration without any other handler knowing a claim exists. Nothing grants
     * one today.
     *
     * `protected` rather than `private` only so the claim-suppression contract
     * can be pinned by a test that overrides it (see `gestureArbiter.test.ts`).
     * That is deliberately not a claim API: nothing outside this class can grant
     * or release one, and the host never calls it.
     */
    protected arbitrate(): GestureOwner {
        if (this.pointers.length >= 2) return 'pinch';
        if (this.pointers.length === 1) return 'pan';
        return 'none';
    }

    down(sample: PointerSample): GestureUpdate {
        if (this.find(sample.id)) return NONE;

        this.pointers.push({
            id: sample.id,
            x: sample.x,
            y: sample.y,
            travelled: 0,
            trail: [{ ...sample }],
        });

        this.currentOwner = this.arbitrate();
        if (this.currentOwner === 'pinch') this.multiTouch = true;
        if (this.currentOwner !== 'none') this.gestureOwned = true;

        return NONE;
    }

    move(sample: PointerSample): GestureUpdate {
        const pointer = this.find(sample.id);
        if (!pointer) return NONE;

        // Captured BEFORE the pointer moves: a pinch is the change between the
        // two-pointer configurations either side of this sample.
        const before = this.pinchFrame();

        pointer.travelled += Math.hypot(
            sample.x - pointer.x,
            sample.y - pointer.y,
        );
        const dx = sample.x - pointer.x;
        const dy = sample.y - pointer.y;
        pointer.x = sample.x;
        pointer.y = sample.y;
        pointer.trail.push({ ...sample });
        prune(pointer.trail, sample.time - this.config.velocityWindowMs);

        if (this.currentOwner === 'pinch' && before) {
            const after = this.pinchFrame()!;
            return {
                kind: 'pinch',
                anchor: before.centre,
                // A degenerate zero separation carries no scale information;
                // the gesture is pure translation until the fingers part.
                scaleBy:
                    before.separation > 0
                        ? after.separation / before.separation
                        : 1,
                dx: after.centre.x - before.centre.x,
                dy: after.centre.y - before.centre.y,
            };
        }

        if (this.currentOwner === 'pan') return { kind: 'pan', dx, dy };

        return NONE;
    }

    up(sample: PointerSample): GestureUpdate {
        return this.release(sample, true);
    }

    /**
     * A cancelled pointer ends its gesture with no outcome: the browser took
     * the input away (a system gesture, a lost capture), and neither a flick
     * nor a tap can be inferred from an interruption.
     */
    cancel(sample: PointerSample): GestureUpdate {
        return this.release(sample, false);
    }

    private release(sample: PointerSample, deliberate: boolean): GestureUpdate {
        const pointer = this.find(sample.id);
        if (!pointer) return NONE;

        pointer.trail.push({ ...sample });
        prune(pointer.trail, sample.time - this.config.velocityWindowMs);

        const wasLast = this.pointers.length === 1;
        const wasMultiTouch = this.multiTouch;
        const wasOwned = this.gestureOwned;
        this.pointers.splice(this.pointers.indexOf(pointer), 1);
        this.currentOwner = this.arbitrate();
        if (this.pointers.length === 0) {
            this.multiTouch = false;
            this.gestureOwned = false;
        }

        // Lifting one finger of a pinch leaves a pan in progress: no momentum
        // yet, and the surviving pointer's own position is already the
        // reference the next pan delta is measured from.
        if (!wasLast || !deliberate) return NONE;

        // The arbiter never granted this gesture, so it has no outcome — not a
        // flick, and not a tap either. Returning before `tap` also leaves
        // `pendingTap` untouched: a press made under a claim must not become
        // half of a later double tap. This is the same decision `arbitrate`
        // made at pointer-down, carried forward to the one place that could
        // otherwise move the viewport behind its back.
        if (!wasOwned) return NONE;

        if (!wasMultiTouch && pointer.travelled <= this.config.tapSlop) {
            return this.tap(sample);
        }

        // Any non-tap release clears the pending tap: a drag between two taps
        // means they were not a double tap.
        this.pendingTap = null;

        const velocity = trailVelocity(
            pointer.trail,
            this.config.minVelocitySpanMs,
        );
        if (Math.hypot(velocity.x, velocity.y) < this.config.minFlickSpeed) {
            return NONE;
        }
        return { kind: 'flick', velocity };
    }

    private tap(sample: PointerSample): GestureUpdate {
        const previous = this.pendingTap;
        // Cleared either way: a paired tap is consumed, and an unpaired one is
        // replaced. This is what stops a third tap chaining off the second.
        this.pendingTap = null;

        if (
            previous &&
            sample.time - previous.time <= this.config.doubleTapMs &&
            Math.hypot(sample.x - previous.x, sample.y - previous.y) <=
                this.config.doubleTapSlop
        ) {
            return { kind: 'doubleTap', point: { x: sample.x, y: sample.y } };
        }

        this.pendingTap = { x: sample.x, y: sample.y, time: sample.time };
        // A single tap moves nothing: it is reserved for annotation selection,
        // and binding zoom to it would break the phase-2 drawing layer (spec
        // §Input and animation). It is REPORTED so that selection reads the
        // arbiter's decision rather than recognising a tap a second time from
        // its own handlers — which is where a held input claim would stop
        // suppressing input, and where the two slop thresholds would drift.
        return { kind: 'tap', point: { x: sample.x, y: sample.y } };
    }

    /** Midpoint and separation of the two pinch-driving pointers. */
    private pinchFrame(): { centre: Point; separation: number } | null {
        const [a, b] = this.pointers;
        if (!a || !b) return null;
        return {
            centre: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
            separation: Math.hypot(b.x - a.x, b.y - a.y),
        };
    }

    private find(id: number): TrackedPointer | undefined {
        return this.pointers.find((pointer) => pointer.id === id);
    }
}

/** Drop samples older than `oldest`, keeping the array oldest-first. */
function prune(trail: PointerSample[], oldest: number): void {
    let drop = 0;
    // Never drop the final sample: an empty trail has no velocity at all.
    while (drop < trail.length - 1 && trail[drop].time < oldest) drop += 1;
    if (drop > 0) trail.splice(0, drop);
}

/**
 * Average velocity across the trail, in screen pixels per second.
 *
 * Measured from the ends of the window rather than from the last two samples:
 * a single jittery final sample would otherwise set the whole flick's speed,
 * and pointer samples are noisy at exactly the moment a finger lifts.
 */
function trailVelocity(trail: PointerSample[], minSpanMs: number): Point {
    const first = trail[0];
    const last = trail[trail.length - 1];
    const span = first && last ? last.time - first.time : 0;
    // Too short an interval is not a fast flick, it is an unmeasured one; see
    // `GestureConfig.minVelocitySpanMs`.
    if (span < minSpanMs || span <= 0) return { x: 0, y: 0 };
    const seconds = span / 1000;
    return {
        x: (last.x - first.x) / seconds,
        y: (last.y - first.y) / seconds,
    };
}
