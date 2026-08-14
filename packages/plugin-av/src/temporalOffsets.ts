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
 */

/** `readyState` at which the element knows its duration (spec: `HAVE_METADATA`). */
const HAVE_METADATA = 1;

export interface OffsetSeekerPort {
    /** The claimed canvas's media element, or `null` when it has no stage. */
    mediaFor(canvasId: string): HTMLMediaElement | null;
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
    destroy(): void;
}

export function createOffsetSeeker(port: OffsetSeekerPort): OffsetSeeker {
    let held: { media: HTMLMediaElement; onReady: () => void } | null = null;

    function release(): void {
        held?.media.removeEventListener('loadedmetadata', held.onReady);
        held = null;
    }

    return {
        apply(offset): void {
            release();
            if (!offset) return;

            const media = port.mediaFor(offset.canvasId);
            if (!media) return;

            if (media.readyState >= HAVE_METADATA) {
                port.seek(offset.canvasId, offset.seconds);
                return;
            }

            const onReady = (): void => {
                release();
                port.seek(offset.canvasId, offset.seconds);
            };
            held = { media, onReady };
            media.addEventListener('loadedmetadata', onReady);
        },
        destroy: release,
    };
}
