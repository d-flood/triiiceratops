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
import { type SelectorRuntime } from '../state/selectors/index.js';
import type { ViewerState } from '../state/viewer.svelte.js';
import type { ViewerHandleSlot } from './handle.js';
import type { TriiiceratopsViewerElement, ViewerHandle } from './types.js';
/** Everything one mounted wrapper is bound to. Rebuilt whole on rebind. */
export interface ViewerBinding {
    readonly element: TriiiceratopsViewerElement;
    /** The element's live state. `handle.state` is the same object, typed down. */
    readonly state: ViewerState;
    /** This wrapper's own runtime — never shared with a plugin activation. */
    readonly runtime: SelectorRuntime;
    /** The imperative handle for this binding. */
    readonly handle: ViewerHandle;
}
export interface ViewerBindingOptions {
    /**
     * Called after every binding change: first bind, each rebind, and teardown.
     * Wrappers turn this into a framework update (React's external-store
     * listener, a Vue ref write).
     */
    onChange?: () => void;
    /** Consumer-created slot this viewer claims while mounted, if any. */
    handle?: ViewerHandleSlot | null;
    /**
     * Registration hook. Defaults to the shared memoized registrar; injectable
     * so tests can drive registration outcomes without a real bundle.
     */
    ensureRegistered?: () => Promise<void>;
    /**
     * Registration rejected. Wrappers surface this framework-natively (React:
     * rethrow during render into an error boundary; Vue: throw from a watcher).
     * With no handler the failure is logged as a developer diagnostic.
     */
    onRegistrationError?: (error: unknown) => void;
}
export interface ViewerBindingController {
    /** The element this controller is attached to, or `null`. */
    readonly element: TriiiceratopsViewerElement | null;
    /** The current binding, or `null` while the element has no state. */
    readonly binding: ViewerBinding | null;
    /**
     * The current imperative handle, or `null`. Reference-stable while
     * unchanged, so it is a valid React `getSnapshot`.
     */
    readonly handle: ViewerHandle | null;
    /** Wake on binding changes. Idempotent unsubscribe. */
    subscribe(listener: () => void): () => void;
    /**
     * Bind to a mounted element: claim the handle slot, listen, trigger shared
     * registration, then check for already-available state. Idempotent for the
     * same element; attaching a different element detaches the previous one.
     *
     * Throws `TriiiceratopsHandleConflictError` if the slot is already bound to
     * another element.
     */
    attach(element: TriiiceratopsViewerElement): void;
    /**
     * Tear down: remove DOM listeners, dispose the runtime, clear the binding
     * and the handle, and release the slot. Idempotent, and terminal — a
     * destroyed controller never binds again.
     */
    destroy(): void;
}
/**
 * Create the binding controller for one mounted wrapper.
 *
 * Every member of the returned object is a closure, not a prototype method, so
 * `controller.subscribe` can be handed straight to `useSyncExternalStore`
 * without binding or memoization.
 */
export declare function createViewerBinding(options?: ViewerBindingOptions): ViewerBindingController;
