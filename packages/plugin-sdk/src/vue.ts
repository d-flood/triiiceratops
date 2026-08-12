/**
 * Vue adapter (`@triiiceratops/plugin-sdk/vue`).
 *
 * Turns the SDK's memoized, equality-gated selector contract into a
 * readonly Vue `Ref` that a composable can consume directly.
 *
 * This module imports ONLY `vue` at runtime and the core seam TYPES (erased at
 * build). It never imports another framework adapter, the SDK base entry, or
 * core's Svelte reactivity (ADR 0008): the sole reactive source is the
 * `Selector.subscribe` fan-out handed out through `PluginContext.selectors`.
 */

import { getCurrentScope, onScopeDispose, readonly, shallowRef } from 'vue';
import type { Ref } from 'vue';

import type { PluginContext, Selector, ViewerState } from 'triiiceratops';

/**
 * Subscribe a Vue setup/composable to a slice of the live viewer state.
 *
 * Returns a readonly ref that starts at the selector's current value and
 * updates on every equality-gated change. A `shallowRef` is used because the
 * selected value is replaced wholesale (member-level notification granularity,
 * ADR 0008) rather than deep-mutated. The subscription is torn down through the
 * active effect scope, so it is released automatically when the owning
 * component unmounts.
 *
 * @param context The plugin activation context (supplies `selectors`).
 * @param selector Pure projection of the viewer state to observe.
 * @param equals Optional equality gate; defaults to `Object.is` in the SDK.
 * @returns A readonly ref tracking the current selected value.
 */
export function useViewerSelector<T>(
    context: PluginContext,
    selector: (state: ViewerState) => T,
    equals?: (a: T, b: T) => boolean,
): Readonly<Ref<T>> {
    const bound: Selector<T> = context.selectors.select(selector, equals);
    const state = shallowRef(bound.get()) as Ref<T>;

    const unsubscribe = bound.subscribe((value) => {
        state.value = value;
    });

    // Release with the owning component/effect scope. When called outside a
    // scope the caller owns teardown via their own selector lifecycle.
    if (getCurrentScope()) {
        onScopeDispose(unsubscribe);
    }

    return readonly(state) as Readonly<Ref<T>>;
}
