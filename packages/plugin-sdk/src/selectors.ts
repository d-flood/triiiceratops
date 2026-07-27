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
 * Create an isolated selector runtime bound to one `ViewerState`. Subscribes to
 * the viewer state immediately so `get()` memoization stays correct even before
 * any selector is individually subscribed.
 */
export function createSelectorRuntime(
    viewerState: ViewerState,
): SelectorRuntime {
    let version = 0;
    let disposed = false;
    // Fan-out listeners registered by individual selector subscriptions.
    const listeners = new Set<() => void>();

    const unsubscribe = viewerState.subscribe(() => {
        version++;
        // Snapshot so a listener that (un)subscribes mid-delivery is safe.
        for (const listener of [...listeners]) {
            listener();
        }
    });

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
                    let last = get();
                    const listener = () => {
                        const next = get();
                        if (!equals(last, next)) {
                            last = next;
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
