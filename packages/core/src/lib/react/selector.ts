/**
 * Reading one viewer's state from React: `useViewer()` for an on-demand
 * snapshot of the live object, `useViewerSelector()` for a reactive, memoized,
 * equality-gated projection of it.
 *
 * Both are built on `useSyncExternalStore`, hand-rolled against React 19's
 * built-in hook — `use-sync-external-store` is deliberately not a dependency.
 *
 * Three decisions are load bearing:
 *
 * 1. **The projection object is created inside a `useMemo` keyed on the
 *    projection and equality identities.** It is never frozen on first render
 *    (the plugin SDK's React helper deliberately does freeze its selector; that
 *    is prior art for the external-store contract only). An inline arrow whose
 *    closure changed therefore reads current values with no `useCallback` or
 *    `useMemo` from the consumer, and no shared projection is mutated during a
 *    render pass — which is what keeps this correct under concurrent rendering.
 * 2. **`getSnapshot` is the runtime's equality-gated cached read.** It is
 *    version-memoized and returns the previously returned reference while the
 *    selected value is equal, so React neither loops nor warns — even when the
 *    projection builds a fresh object literal every time.
 * 3. **`getServerSnapshot` is omitted.** State-reading components do not render
 *    on the server, so React's "Missing getServerSnapshot" is the correct, loud
 *    failure rather than an undesigned readiness path.
 *
 * A projection or equality function that throws is retained by the runtime and
 * rethrown from the consumer's own read, so it reaches a React error boundary.
 * It is never converted to `viewererror`, attributed as `pluginerror`, or
 * served as a stale value.
 */

import { useCallback, useMemo, useSyncExternalStore } from 'react';

import { useResolvedViewerHandle } from './context.js';
import {
    getSelectorRuntime,
    type ReadonlyViewerState,
    type SelectorCadence,
    type SelectorProjection,
    type ViewerHandle,
    type ViewerHandleSlot,
} from '../framework/index.js';

/** Per-call selector options. Both are optional. */
export interface ViewerSelectorOptions<T> {
    /** Equality gate for the selected value. Defaults to `Object.is`. */
    equals?: (a: T, b: T) => boolean;
    /**
     * Which notification wakes the projection. `state` (the default) is the
     * batched inventoried-member watcher; `frame` additionally wakes on the
     * live OpenSeadragon instance's own animation events, which is how
     * continuous viewport values (zoom, pan, rotation, bounds) are read
     * reactively.
     */
    cadence?: SelectorCadence;
}

/** A projection over the supported view of a viewer's live state. */
export type ViewerProjection<T> = (state: ReadonlyViewerState) => T;

/**
 * The current `ViewerHandle` for a slot, re-rendering when it changes.
 *
 * The subscription is to the HANDLE, not to viewer state: it wakes when the
 * viewer binds, rebinds after a detach/reattach, or unmounts. Reading notifying
 * state through the returned handle does not subscribe to that state.
 *
 * No `getServerSnapshot` here either — every caller is a state-reading hook,
 * and those do not render on the server (`<TriiiceratopsViewer>` does, and
 * reads the slot itself with a server snapshot of `null`).
 */
function useViewerHandleValue(slot: ViewerHandleSlot): ViewerHandle | null {
    return useSyncExternalStore(slot.subscribe, slot.get);
}

/**
 * The supported, readonly view of a viewer's live state — or `undefined` until
 * that state exists.
 *
 * This is a TYPE-LEVEL view of the very same live object the element owns, so
 * identity comparisons against `handle.get()!.state` hold and every supported
 * command is callable on it. The four lifecycle-plumbing methods are hidden.
 *
 * Reading a notifying member here does NOT subscribe to it: the component
 * re-renders when the viewer binds or rebinds, not when viewer state changes.
 * Use {@link useViewerSelector} for reactive reads.
 *
 * @param handle The viewer's handle. Omit it to use the nearest
 * `<ViewerProvider>`; supplying neither is a wiring mistake and throws.
 */
export function useViewer(
    handle?: ViewerHandleSlot | null,
): ReadonlyViewerState | undefined {
    const slot = useResolvedViewerHandle(handle, 'useViewer');
    return useViewerHandleValue(slot)?.state;
}

/**
 * Subscribe to a projection of one viewer's live state.
 *
 * `T` is inferred from the projection, equality defaults to `Object.is`, and
 * the result is `undefined` until the viewer's state exists. Inline
 * projections and inline equality functions are fully supported: neither needs
 * `useCallback` or `useMemo`.
 *
 * @example
 * ```ts
 * const canvasId = useViewerSelector(handle, (state) => state.canvasId);
 * const zoom = useViewerSelector(
 *     handle,
 *     (state) => state.viewportScale,
 *     { cadence: 'frame' },
 * );
 * ```
 */
export function useViewerSelector<T>(
    handle: ViewerHandleSlot | null | undefined,
    projection: ViewerProjection<T>,
    options?: ViewerSelectorOptions<T>,
): T | undefined;
/** Context form: resolves the handle from the nearest `<ViewerProvider>`. */
export function useViewerSelector<T>(
    projection: ViewerProjection<T>,
    options?: ViewerSelectorOptions<T>,
): T | undefined;
export function useViewerSelector<T>(
    handleOrProjection:
        | ViewerHandleSlot
        | null
        | undefined
        | ViewerProjection<T>,
    projectionOrOptions?: ViewerProjection<T> | ViewerSelectorOptions<T>,
    maybeOptions?: ViewerSelectorOptions<T>,
): T | undefined {
    // A handle is an object and a projection is a function, so the two forms
    // are distinguishable with no sentinel and no extra argument.
    const contextForm = typeof handleOrProjection === 'function';
    const explicit = contextForm ? undefined : handleOrProjection;
    const projection = (
        contextForm ? handleOrProjection : projectionOrOptions
    ) as ViewerProjection<T>;
    const options = (contextForm ? projectionOrOptions : maybeOptions) as
        | ViewerSelectorOptions<T>
        | undefined;

    const slot = useResolvedViewerHandle(explicit, 'useViewerSelector');
    const handle = useViewerHandleValue(slot);
    // Resolved INSIDE the render that the handle subscription drives, never
    // cached across rebinds: the previous runtime is disposed on rebind.
    const runtime = getSelectorRuntime(handle?.state);
    const equals = options?.equals;
    const cadence = options?.cadence;

    // Keyed on the projection and equality IDENTITIES, so a changed inline
    // closure mints a new projection object instead of mutating a shared one.
    const bound = useMemo<SelectorProjection<T> | null>(
        () =>
            runtime?.createProjection(projection, { equals, cadence }) ?? null,
        [runtime, projection, equals, cadence],
    );

    const subscribe = useCallback(
        (onStoreChange: () => void): (() => void) =>
            bound ? bound.subscribe(onStoreChange) : noop,
        [bound],
    );
    const getSnapshot = useCallback(
        (): T | undefined => (bound ? bound.read() : undefined),
        [bound],
    );

    // No `getServerSnapshot`, deliberately: see the module comment.
    return useSyncExternalStore(subscribe, getSnapshot);
}

function noop(): void {}
