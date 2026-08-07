/**
 * The consumer-created handle slot: a stable box a mounted viewer claims and
 * publishes its {@link ViewerHandle} into.
 *
 * Consumers create the handle and pass it to the component, rather than the
 * component providing one, so application UI has no placement constraint — it
 * can live before the viewer, after it, or nested in the consumer's own layout.
 * This is the framework-neutral half of that: React's `useViewerHandle()`
 * returns a slot and reads it through `useSyncExternalStore`; Vue consumers
 * normally use an ordinary template ref instead, and reach for a slot only when
 * they want the same claim rules.
 *
 * The slot is a SLOT, not the handle. `get()` returns `ViewerHandle | null` —
 * null until a viewer claims it and publishes state, null again after that
 * viewer unmounts. Reads being nullable is the honest state of the world, so
 * nothing here gates or withholds a value to manufacture non-nullability.
 *
 * Three wiring mistakes are named rather than left silent:
 * - a handle created but never passed to a viewer warns once (development);
 * - a second viewer claiming a bound handle THROWS, naming both elements;
 * - a handle whose viewer unmounts reverts to unbound and rebinds cleanly.
 */
import type { TriiiceratopsViewerElement, ViewerHandle } from './types.js';
/** A mounted viewer's exclusive lease on a slot. */
export interface ViewerHandleClaim {
    /** Publish the current handle (or `null` while state is unavailable). */
    publish(handle: ViewerHandle | null): void;
    /**
     * Give the slot back: clears the handle and allows a later viewer to claim
     * it. Idempotent, and a no-op once another viewer legitimately holds it.
     */
    release(): void;
}
export interface ViewerHandleSlot {
    /**
     * The current handle, or `null` while unbound. Reference-stable while
     * unchanged, so it is a valid React `getSnapshot` with no extra machinery.
     */
    get(): ViewerHandle | null;
    /**
     * Wake up when the published handle changes. Returns an idempotent
     * unsubscribe function.
     */
    subscribe(listener: () => void): () => void;
    /**
     * Arm the development-only "created but never passed to a viewer" warning.
     * Call from a mount effect (React `useEffect`, Vue `onMounted`), never
     * during render: a render discarded by React Strict Mode's double
     * invocation never runs an effect, so a discarded slot cannot warn.
     *
     * Returns a cancel function; cancelling is idempotent.
     */
    armUnboundWarning(): () => void;
    /**
     * INTERNAL — a mounted viewer takes the slot. Throws
     * {@link TriiiceratopsHandleConflictError} when a DIFFERENT element already
     * holds it. Re-claiming with the same element returns a fresh lease.
     */
    claim(element: TriiiceratopsViewerElement): ViewerHandleClaim;
}
/**
 * Create an unbound handle slot. Cheap, inert, and safe to create during
 * render: it touches no browser global and schedules nothing until
 * {@link ViewerHandleSlot.armUnboundWarning} is called.
 */
export declare function createViewerHandleSlot(): ViewerHandleSlot;
