/**
 * React adapter (`@triiiceratops/plugin-sdk/react`).
 *
 * Turns the SDK's memoized, equality-gated selector contract into
 * idiomatic React reactivity, built on `useSyncExternalStore` so reads stay
 * tear-free under concurrent rendering and `StrictMode` double-invocation.
 *
 * This module imports ONLY `react` at runtime and the core seam TYPES (erased at
 * build). It never imports another framework adapter, the SDK base entry, or
 * core's Svelte reactivity (ADR 0008): the sole reactive source is the
 * `Selector.subscribe` fan-out handed out through `PluginContext.selectors`.
 */

import { useRef, useSyncExternalStore } from 'react';

import type { PluginContext, Selector, ViewerState } from 'triiiceratops';

/**
 * Subscribe a React component to a slice of the live viewer state.
 *
 * The selector is created once from `context.selectors` and kept stable across
 * renders (a ref, so `StrictMode`'s double-invoked render body still creates a
 * single selector). `useSyncExternalStore` drives re-renders from the
 * selector's equality-gated `subscribe`, reading the current value through the
 * version-memoized `get` — a stable reference while unchanged, so React does not
 * loop.
 *
 * `selector` is captured on first render; give it a stable identity (module
 * scope or `useCallback`) if it closes over changing values.
 *
 * @param context The plugin activation context (supplies `selectors`).
 * @param selector Pure projection of the viewer state to observe.
 * @param equals Optional equality gate; defaults to `Object.is` in the SDK.
 * @returns The current selected value, updated on every gated change.
 */
export function useViewerSelector<T>(
    context: PluginContext,
    selector: (state: ViewerState) => T,
    equals?: (a: T, b: T) => boolean,
): T {
    const selectorRef = useRef<Selector<T> | null>(null);
    if (selectorRef.current === null) {
        selectorRef.current = context.selectors.select(selector, equals);
    }
    const bound = selectorRef.current;
    // `subscribe` and `get` are stable closures on the memoized selector, so
    // useSyncExternalStore neither resubscribes each render nor tears.
    return useSyncExternalStore(bound.subscribe, bound.get, bound.get);
}
