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
import { logger } from '../logging/logger.js';
import { describeViewerElement, TriiiceratopsHandleConflictError, } from './errors.js';
/**
 * Create an unbound handle slot. Cheap, inert, and safe to create during
 * render: it touches no browser global and schedules nothing until
 * {@link ViewerHandleSlot.armUnboundWarning} is called.
 */
export function createViewerHandleSlot() {
    let handle = null;
    let owner = null;
    let everClaimed = false;
    let warnedUnbound = false;
    const listeners = new Set();
    const notify = () => {
        for (const listener of [...listeners])
            listener();
    };
    const slot = {
        get: () => handle,
        subscribe(listener) {
            listeners.add(listener);
            let released = false;
            return () => {
                if (released)
                    return;
                released = true;
                listeners.delete(listener);
            };
        },
        armUnboundWarning() {
            if (everClaimed || warnedUnbound)
                return () => { };
            // A macrotask, not a microtask: the claiming viewer's own mount
            // effect may run after this one (React runs child effects first,
            // but a sibling or lazily mounted viewer need not). `logger.warn`
            // is silent outside debug mode, so production pays one timer that
            // does nothing.
            const timer = setTimeout(() => {
                if (everClaimed || warnedUnbound)
                    return;
                warnedUnbound = true;
                logger.warn('A Triiiceratops viewer handle was created but never passed ' +
                    'to a <TriiiceratopsViewer>. Reads through it will stay ' +
                    'null forever. Pass it to the viewer (React: the `handle` ' +
                    'prop; Vue: the template ref) — or drop the handle if ' +
                    'nothing reads viewer state.');
            }, 0);
            let cancelled = false;
            return () => {
                if (cancelled)
                    return;
                cancelled = true;
                clearTimeout(timer);
            };
        },
        claim(element) {
            if (owner && owner !== element) {
                throw new TriiiceratopsHandleConflictError(describeViewerElement(owner), describeViewerElement(element));
            }
            owner = element;
            everClaimed = true;
            let active = true;
            return {
                publish(next) {
                    if (!active)
                        return;
                    if (handle === next)
                        return;
                    handle = next;
                    notify();
                },
                release() {
                    if (!active)
                        return;
                    active = false;
                    if (owner !== element)
                        return;
                    owner = null;
                    if (handle !== null) {
                        handle = null;
                        notify();
                    }
                },
            };
        },
    };
    return slot;
}
