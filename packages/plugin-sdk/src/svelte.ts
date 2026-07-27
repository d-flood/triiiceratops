/**
 * Svelte adapter (`@triiiceratops/plugin-sdk/svelte`) — ticket 13.
 *
 * Bridges the SDK's memoized, equality-gated selector contract (ticket 07) to a
 * Svelte readable store, so viewer state is consumable with `$`-auto-subscription
 * in Svelte 5 components.
 *
 * This module imports NO framework runtime — a Svelte readable store is a plain
 * `{ subscribe }` object, and the `svelte/store` `Readable` type is erased at
 * build. It never imports another framework adapter, the SDK base entry, or
 * core's Svelte reactivity (ADR 0008): the sole reactive source is the
 * `Selector.subscribe` fan-out handed out through `PluginContext.selectors`.
 */

import type { Readable, Subscriber, Unsubscriber } from 'svelte/store';

import type { PluginContext, Selector, ViewerState } from 'triiiceratops';

/**
 * Wrap a selector as a Svelte readable store.
 *
 * A selector's `subscribe` only fires on a gated *change*; a Svelte store must
 * also emit the current value synchronously on subscription. This bridge adds
 * that immediate emission, then forwards every subsequent gated change.
 *
 * @param selector The memoized selector to expose as a store.
 * @returns A `Readable<T>` usable with `$store` auto-subscription.
 */
export function selectorStore<T>(selector: Selector<T>): Readable<T> {
    return {
        subscribe(run: Subscriber<T>): Unsubscriber {
            run(selector.get());
            return selector.subscribe(run);
        },
    };
}

/**
 * Create a Svelte readable store for a slice of the live viewer state.
 *
 * Convenience over {@link selectorStore} that builds the memoized selector from
 * the plugin context in one call.
 *
 * @param context The plugin activation context (supplies `selectors`).
 * @param selector Pure projection of the viewer state to observe.
 * @param equals Optional equality gate; defaults to `Object.is` in the SDK.
 * @returns A `Readable<T>` tracking the current selected value.
 */
export function viewerSelector<T>(
    context: PluginContext,
    selector: (state: ViewerState) => T,
    equals?: (a: T, b: T) => boolean,
): Readable<T> {
    return selectorStore(context.selectors.select(selector, equals));
}
