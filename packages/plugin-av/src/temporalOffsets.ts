/**
 * Turning core's `temporalOffset` into a seek — the reader half of ticket 05's
 * plumbing.
 *
 * **Seek, never autoplay.** An offset positions the playhead and leaves playback
 * state exactly as it was; a paused viewer stays paused. `endSeconds` is carried
 * by core and deliberately not enforced here.
 *
 * The only subtlety is timing: an offset commonly arrives with the navigation
 * that first shows the canvas, before its media has any duration to be clamped
 * against or any buffered range to seek within. Such an offset is held and
 * applied at `loadedmetadata`, and a newer offset replaces a held one rather
 * than queueing behind it.
 *
 * "The canvas timeline is ready" is NOT always one element's `loadedmetadata`,
 * which is why the port answers it separately: for a temporally composed canvas
 * it is the segment map's existence, and the element that will play the offset
 * is not even attached until the offset says which segment it lands in.
 */

/** `readyState` at which the element knows its duration (spec: `HAVE_METADATA`). */
const HAVE_METADATA = 1;

export interface OffsetSeekerPort {
    /** The claimed canvas's media element, or `null` when it has no stage. */
    mediaFor(canvasId: string): HTMLMediaElement | null;
    /**
     * What this canvas's timeline can place an offset against right now.
     *
     * - `ready` — it can place every second of the canvas, whatever the
     *   attached element has loaded. A composed canvas's segment map is this
     *   the moment the sequencer exists, and resolving an offset against it is
     *   what decides which segment to load in the first place.
     * - `pending` — a composed canvas whose sequencer chunk is still in
     *   flight. There is nothing to place the offset against yet, and the
     *   element that is attached is emphatically the wrong one to ask: it is
     *   the first body, about to be replaced, and its duration would clamp a
     *   deep link into a later body back to the end of the first. The offset
     *   waits for {@link OffsetSeeker.retry}.
     * - `element` — the canvas timeline IS the attached element's clock, so
     *   its `loadedmetadata` is the readiness.
     */
    timelineReadiness(canvasId: string): 'ready' | 'pending' | 'element';
    /**
     * Move the playhead — the same path a host's `AVState.seek` takes, so an
     * offset is clamped and refused by the same rules. Given the canvas the
     * offset named, because a held offset can come due after the reader has
     * navigated somewhere else.
     */
    seek(canvasId: string, seconds: number): void;
}

export interface OffsetSeeker {
    /** Apply an offset now, or at readiness; `null` drops any held offset. */
    apply(offset: { canvasId: string; seconds: number } | null): void;
    /**
     * A canvas's timeline became ready. Called when a sequencer arrives, which
     * is the one readiness no media event announces.
     */
    retry(): void;
    destroy(): void;
}

export function createOffsetSeeker(port: OffsetSeekerPort): OffsetSeeker {
    let held: { canvasId: string; seconds: number } | null = null;
    let waiting: { media: HTMLMediaElement; onReady: () => void } | null = null;

    function stopWaiting(): void {
        waiting?.media.removeEventListener('loadedmetadata', waiting.onReady);
        waiting = null;
    }

    function done(): void {
        const offset = held;
        held = null;
        stopWaiting();
        if (offset) port.seek(offset.canvasId, offset.seconds);
    }

    /** Apply the held offset if its timeline can place it, or wait until it can. */
    function attempt(): void {
        if (!held) return;

        const media = port.mediaFor(held.canvasId);
        if (!media) return;

        const readiness = port.timelineReadiness(held.canvasId);
        if (readiness === 'ready') {
            done();
            return;
        }
        if (readiness === 'pending') return;

        if (media.readyState >= HAVE_METADATA) {
            done();
            return;
        }
        // `loadedmetadata` IS the readiness here, so it applies the offset
        // rather than re-asking: the element has its duration by the time the
        // event fires.
        if (waiting?.media === media) return;
        stopWaiting();
        waiting = { media, onReady: done };
        media.addEventListener('loadedmetadata', done);
    }

    return {
        apply(offset): void {
            stopWaiting();
            held = offset;
            attempt();
        },
        retry: attempt,
        destroy(): void {
            stopWaiting();
            held = null;
        },
    };
}
