/**
 * `useViewerHandle()` — the consumer-created handle a React application passes
 * to its viewer and reads through.
 *
 * The hook returns the substrate's {@link ViewerHandleSlot}: a stable box, not
 * the handle itself. `slot.get()` is `ViewerHandle | null` — null until the
 * viewer publishes its state, null again after that viewer unmounts, and a NEW
 * object after a rebind. That is why the box is what gets passed around: a
 * stable identity for the `handle` prop and `<ViewerProvider>`, with the
 * genuinely changing value read through it.
 *
 * Strict Mode double-invokes the `useState` initializer, so two slots are
 * created and one is discarded. The discarded one is inert: it is never claimed
 * by a viewer and its "created but never used" warning is armed from an EFFECT,
 * which a discarded render never runs.
 */
import { useEffect, useState } from 'react';
import { createViewerHandleSlot, } from '../framework/index.js';
/**
 * Create the stable viewer handle for one `<TriiiceratopsViewer>`.
 *
 * Pass it to the component's `handle` prop, then read through it with
 * `useViewer()` / `useViewerSelector()`, or imperatively with `handle.get()`.
 * A viewer with no state-reading consumers needs no handle at all.
 *
 * Create one handle per viewer: passing the same handle to a second viewer
 * throws `TriiiceratopsHandleConflictError`, because ambiguous ownership would
 * silently break per-viewer isolation.
 */
export function useViewerHandle() {
    const [slot] = useState(createViewerHandleSlot);
    // Development-only: a handle created and never passed to a viewer reads
    // null forever. Armed from an effect and cancelled on unmount, so neither a
    // discarded Strict Mode render nor a legitimate unmount can warn.
    useEffect(() => slot.armUnboundWarning(), [slot]);
    return slot;
}
