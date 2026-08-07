/**
 * The per-wrapper binding: one element, its live `ViewerState`, and exactly one
 * selector runtime.
 *
 * `<TriiiceratopsViewer>` owns this. Providers and handles only distribute it.
 *
 * **Listen-then-check.** Binding attaches the `viewerstateavailable` listener
 * BEFORE it triggers registration, then reads `element.viewerState`. The
 * element populates the property before dispatching the event, so state that
 * became available before, during, or after the wrapper initialized is caught
 * by exactly one of the two — never both (the same state binds once) and never
 * neither.
 *
 * **Availability is repeatable, not a one-shot latch.** Disconnecting the
 * element destroys the inner viewer and its `ViewerState`; reconnecting builds
 * a new one and dispatches a new event. Vue's `<KeepAlive>` does exactly that
 * on every deactivate/reactivate cycle. On each event after the first this
 * disposes the previous runtime, publishes the new binding, and rebuilds the
 * handle — all synchronously, before any listener is notified — so no consumer
 * can ever observe a handle whose projections are subscribed to a disposed
 * runtime. Because the loss of canvas, zoom, and plugin state is otherwise
 * completely silent, the second availability warns once in development.
 *
 * Preserving or restoring viewer state across that teardown is deliberately not
 * attempted: it would require the wrapper to own a second state surface, which
 * is precisely what ADR 0007 rules out.
 */
import { logger } from '../logging/logger.js';
import { createSelectorRuntime, } from '../state/selectors/index.js';
import { VIEWER_STATE_AVAILABLE_EVENT } from '../types/viewerElement.js';
import { ensureViewerElementRegistered } from './registration.js';
import { attachSelectorRuntime, detachSelectorRuntime, } from './runtimeRegistry.js';
/**
 * Create the binding controller for one mounted wrapper.
 *
 * Every member of the returned object is a closure, not a prototype method, so
 * `controller.subscribe` can be handed straight to `useSyncExternalStore`
 * without binding or memoization.
 */
export function createViewerBinding(options = {}) {
    const ensureRegistered = options.ensureRegistered ?? ensureViewerElementRegistered;
    const listeners = new Set();
    let element = null;
    let binding = null;
    let claim = null;
    let availabilityCount = 0;
    let warnedReavailability = false;
    let destroyed = false;
    const notify = () => {
        options.onChange?.();
        for (const listener of [...listeners])
            listener();
    };
    /** Dispose the current runtime and forget the binding. Publishes nothing. */
    const clearBinding = () => {
        if (!binding)
            return;
        const previous = binding;
        binding = null;
        detachSelectorRuntime(previous.state, previous.runtime);
        previous.runtime.dispose();
    };
    const bindState = (state) => {
        if (destroyed || !element)
            return;
        // The same state binding twice is the listen-then-check overlap, not a
        // rebind: a wrapper that attached between the property write and the
        // event dispatch sees both.
        if (binding?.state === state)
            return;
        availabilityCount++;
        if (availabilityCount > 1 && !warnedReavailability) {
            warnedReavailability = true;
            logger.warn('A <triiiceratops-viewer> published a second ViewerState. The ' +
                'element was detached long enough for its inner viewer to be ' +
                'destroyed (Vue <KeepAlive> does this on every deactivation), ' +
                'so the previous manifest, canvas, viewport, and plugin state ' +
                'are gone. The wrapper has rebound and every selector now ' +
                'reads the new state; restoring the old one is not attempted.');
        }
        // Atomic swap: dispose the old runtime, publish the new binding, and
        // rebuild the handle BEFORE anyone is notified, so no consumer can read
        // a handle whose runtime has been disposed.
        clearBinding();
        const runtime = createSelectorRuntime(state);
        attachSelectorRuntime(state, runtime);
        binding = {
            element,
            state,
            runtime,
            handle: { element, state },
        };
        claim?.publish(binding.handle);
        notify();
    };
    const onAvailable = (event) => {
        const detail = event.detail;
        if (!detail)
            return;
        bindState(detail);
    };
    const detach = () => {
        element?.removeEventListener(VIEWER_STATE_AVAILABLE_EVENT, onAvailable);
        clearBinding();
        claim?.release();
        claim = null;
        element = null;
    };
    return {
        get element() {
            return element;
        },
        get binding() {
            return binding;
        },
        get handle() {
            return binding?.handle ?? null;
        },
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
        attach(next) {
            if (destroyed || element === next)
                return;
            const hadBinding = binding !== null;
            detach();
            // Claim first: a double-bind must fail before any listener is
            // installed or any registration is triggered.
            claim = options.handle?.claim(next) ?? null;
            element = next;
            if (hadBinding)
                notify();
            // Listen BEFORE registration is triggered, then check. Registration
            // is asynchronous and the element may already be upgraded and
            // mounted, so neither order alone is sufficient.
            next.addEventListener(VIEWER_STATE_AVAILABLE_EVENT, onAvailable);
            void ensureRegistered().catch((error) => {
                if (options.onRegistrationError) {
                    options.onRegistrationError(error);
                }
                else {
                    logger.error('Registering <triiiceratops-viewer> failed.', error);
                }
            });
            const existing = next.viewerState;
            if (existing)
                bindState(existing);
        },
        destroy() {
            if (destroyed)
                return;
            destroyed = true;
            const hadBinding = binding !== null;
            detach();
            // Notify before dropping the listener set: a wrapper that is
            // unmounting still needs to see the handle go null.
            if (hadBinding)
                notify();
            listeners.clear();
        },
    };
}
