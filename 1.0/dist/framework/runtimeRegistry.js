/**
 * The `ViewerState` → {@link SelectorRuntime} registry that keeps
 * {@link ViewerHandle} at exactly two members.
 *
 * A consumer holds `{ element, state }`. The selector helpers need that
 * viewer's runtime, and putting it on the handle would both widen the
 * imperative contract and invite a consumer to hold a runtime across a rebind.
 * A `WeakMap` keyed by the state object resolves it internally instead, and
 * drops the entry the moment the state itself is unreachable.
 *
 * Only the framework wrappers' own runtimes are registered here. Plugin
 * activations own SEPARATE runtimes over the same `ViewerState`: they share the
 * implementation and the state, never the lifecycle or the subscription.
 */
const runtimeByState = new WeakMap();
/** Publish the wrapper-owned runtime for a viewer state. */
export function attachSelectorRuntime(state, runtime) {
    runtimeByState.set(state, runtime);
}
/**
 * Remove the registration, but only if `runtime` is still the registered one.
 * A rebind that already published a newer runtime must not be undone by the
 * disposal of the older one.
 */
export function detachSelectorRuntime(state, runtime) {
    if (runtimeByState.get(state) === runtime) {
        runtimeByState.delete(state);
    }
}
/**
 * The framework wrapper's selector runtime for a viewer state, or `undefined`
 * when no wrapper owns that state (an unbound handle, a plugin-only viewer, or
 * a state whose wrapper has torn down).
 *
 * Resolve this INSIDE a reactive read — a Vue `computed`, a React
 * `getSnapshot` — never once outside it. After a rebind the previous runtime is
 * disposed, and a helper that cached it would read a disposed runtime forever.
 */
export function getSelectorRuntime(state) {
    if (!state)
        return undefined;
    return runtimeByState.get(state);
}
