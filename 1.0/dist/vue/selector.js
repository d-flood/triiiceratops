/**
 * Reading one viewer's state from Vue: `useViewer()` for the live readonly
 * state object, `useViewerSelector()` for a reactive, memoized, equality-gated
 * projection of it.
 *
 * Both are a `computed`, and that shape is what makes three requirements free:
 *
 * 1. **Vue reactive dependencies read by the projection are tracked.** The
 *    projection runs inside the `computed`'s own evaluation, so a `ref` or
 *    `reactive` it reads invalidates the selection with no manual watcher.
 *    The runtime's dependency-driven `recompute()` exists precisely so that
 *    invalidation is not swallowed by a viewer-notification version memo.
 * 2. **A failing projection throws during the CONSUMER's evaluation.** It
 *    reaches `onErrorCaptured` and `app.config.errorHandler` — Vue's own
 *    application error handling — instead of being swallowed, converted to
 *    `viewererror`, attributed as `pluginerror`, or served as a stale value.
 * 3. **Equal selections cost nothing downstream.** The runtime's gate returns
 *    the previously returned reference, so `computed`'s own `Object.is`
 *    dirty-check suppresses the update.
 *
 * A pushed `shallowRef` written from the subscription callback — the shape the
 * plugin SDK's Vue adapter uses — is deliberately NOT the design here: it would
 * either swallow projection failures inside the notification or freeze a stale
 * value after one.
 *
 * The `computed` reads BOTH the handle and the runtime's notification version
 * inside its own body. Resolving the runtime once, outside, is the specific bug
 * to avoid: after a `<KeepAlive>` round trip the element publishes a NEW
 * `ViewerState` and the previous runtime is disposed, so a cached one would be
 * read forever with no updates.
 */
import { computed, getCurrentScope, onScopeDispose, shallowRef } from 'vue';
import { resolveViewerHandleRef } from './handle.js';
import { getSelectorRuntime, } from '../framework/index.js';
/**
 * The supported, readonly view of a viewer's live state — or `undefined` until
 * that state exists.
 *
 * This is a TYPE-LEVEL view of the very same live object the element owns, so
 * identity comparisons against `viewer.value?.state` hold and every supported
 * command is callable on it. The four lifecycle-plumbing methods are hidden.
 *
 * Reading a notifying member off the returned object does NOT subscribe to it:
 * the ref changes when the viewer binds or rebinds, not when viewer state
 * changes. Use {@link useViewerSelector} for reactive reads.
 *
 * @param handle The viewer's template ref. Omit it to use the handle published
 * by `provideViewer()` / `<ViewerProvider>`; supplying neither is a wiring
 * mistake and throws.
 */
export function useViewer(handle) {
    const source = resolveViewerHandleRef(handle, 'useViewer');
    return computed(() => source.value?.state);
}
export function useViewerSelector(handleOrProjection, projectionOrOptions, maybeOptions) {
    const contextForm = typeof handleOrProjection === 'function';
    const explicit = contextForm ? undefined : handleOrProjection;
    const project = (contextForm ? handleOrProjection : projectionOrOptions);
    const options = (contextForm ? projectionOrOptions : maybeOptions);
    const source = resolveViewerHandleRef(explicit, 'useViewerSelector');
    const equals = options?.equals;
    const cadence = options?.cadence;
    // Bumped by this projection's own cadence, and read inside the computed, so
    // a viewer notification invalidates the selection exactly once.
    const version = shallowRef(0);
    let bound = null;
    const release = () => {
        bound?.unsubscribe();
        bound = null;
    };
    const selected = computed(() => {
        // BOTH dependencies, in this body: the handle (so a rebind rewires) and
        // the notification version (so a command wakes the projection).
        const state = source.value?.state;
        void version.value;
        const runtime = getSelectorRuntime(state);
        if (!runtime) {
            release();
            return undefined;
        }
        if (bound?.runtime !== runtime) {
            release();
            const projection = runtime.createProjection(project, {
                equals,
                cadence,
            });
            bound = {
                runtime,
                projection,
                unsubscribe: projection.subscribe(() => {
                    version.value++;
                }),
            };
        }
        // `recompute`, not `read`: the computed may have been invalidated by a
        // Vue reactive dependency the viewer never notified about, and the
        // version memo would otherwise return the previous selection.
        return bound.projection.recompute();
    });
    // Release with the owning component or effect scope. Called outside a scope
    // (a bare unit test, say) the caller owns teardown.
    if (getCurrentScope())
        onScopeDispose(release);
    return selected;
}
