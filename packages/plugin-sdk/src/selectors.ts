/**
 * Memoized viewer-state selectors (ticket 07).
 *
 * Built ONLY on `ViewerState.subscribe` (ticket 04) — never on Svelte
 * reactivity. Each activation gets its own selector runtime, which holds a
 * single `ViewerState.subscribe` registration and a state-version counter that
 * it bumps on every notification:
 *
 * - `get()` recomputes `fn(state)` only when the version has advanced since the
 *   last read (memoized by version), and returns the cached value otherwise.
 * - `subscribe(cb)` fans out from the shared notification and calls `cb` only
 *   when the selected value fails the equality gate (default `Object.is`).
 *
 * Disposing the runtime removes the underlying subscription, so no callbacks
 * fire after deactivation.
 */

import type { Selector, ViewerSelectors, ViewerState } from 'triiiceratops';

export interface SelectorRuntime {
    /** The `ViewerSelectors` factory handed to the plugin context. */
    readonly selectors: ViewerSelectors;
    /** Remove the underlying `ViewerState` subscription and all fan-out. */
    dispose(): void;
}

/**
 * Failure hooks for the selector runtime (ticket 09). Both are attributed to the
 * owning plugin by `runActivation`:
 * - `onProjectionError`: a selector's projection (`fn`) threw while recomputing
 *   in reaction to a viewer command (a state-change flush) — `pluginerror`
 *   phase `command`. Guarded here so the failing selector is skipped and the
 *   other selectors in the same flush still recompute.
 * - `onListenerError`: a selector's subscribe callback threw during delivery —
 *   `pluginerror` phase `subscription`. NOT caught here: it is left to bubble to
 *   the single `ViewerState.subscribe` listener guard, which is the specified
 *   attribution seam.
 */
export interface SelectorRuntimeOptions {
    onProjectionError?: (error: unknown) => void;
    onListenerError?: (error: unknown) => void;
}

/**
 * Create an isolated selector runtime bound to one `ViewerState`. Subscribes to
 * the viewer state immediately so `get()` memoization stays correct even before
 * any selector is individually subscribed.
 */
export function createSelectorRuntime(
    viewerState: ViewerState,
    options: SelectorRuntimeOptions = {},
): SelectorRuntime {
    let version = 0;
    let disposed = false;
    // Fan-out listeners registered by individual selector subscriptions.
    const listeners = new Set<() => void>();

    // A single ViewerState.subscribe per activation, carrying the plugin's
    // subscription error handler so a throwing callback is attributed to this
    // plugin (phase `subscription`) via the core listener guard.
    const unsubscribe = viewerState.subscribe(() => {
        version++;
        // Snapshot so a listener that (un)subscribes mid-delivery is safe.
        for (const listener of [...listeners]) {
            listener();
        }
    }, options.onListenerError);

    const selectors: ViewerSelectors = {
        select<T>(
            fn: (state: ViewerState) => T,
            equals: (a: T, b: T) => boolean = Object.is,
        ): Selector<T> {
            let cachedVersion = -1;
            let cachedValue: T;

            const get = (): T => {
                if (cachedVersion !== version) {
                    cachedValue = fn(viewerState);
                    cachedVersion = version;
                }
                return cachedValue;
            };

            return {
                get,
                subscribe(callback: (value: T) => void): () => void {
                    if (disposed) return () => {};
                    // Initial read runs in the caller's context (typically the
                    // plugin's mount): a projection throw here surfaces as the
                    // `mount` failure, not `command`.
                    let last = get();
                    const listener = () => {
                        // Recompute (the projection reacting to a command). A
                        // throw here is this plugin's `command` failure: skip
                        // this selector and let the other selectors in the flush
                        // still recompute.
                        let next: T;
                        try {
                            next = get();
                        } catch (error) {
                            options.onProjectionError?.(error);
                            return;
                        }
                        if (!equals(last, next)) {
                            last = next;
                            // Delivery: a throw here is the `subscription`
                            // failure. Left to bubble to the ViewerState guard.
                            callback(next);
                        }
                    };
                    listeners.add(listener);
                    return () => {
                        listeners.delete(listener);
                    };
                },
            };
        },
    };

    return {
        selectors,
        dispose() {
            if (disposed) return;
            disposed = true;
            listeners.clear();
            unsubscribe();
        },
    };
}
