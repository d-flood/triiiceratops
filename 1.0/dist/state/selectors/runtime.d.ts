/**
 * The framework-neutral selector runtime — ONE implementation shared by plugin
 * activations and framework wrappers (CONTEXT.md **Selector**, **Selector
 * cadence**; ADR 0008, ADR 0011).
 *
 * This module is deliberately lightweight: it imports no Svelte runtime, no
 * OpenSeadragon, and nothing from the plugin SDK. Its only dependency on
 * `ViewerState` is `subscribe` plus synchronous property reads, so it is equally
 * usable from a plugin activation, a React wrapper, and a Vue wrapper.
 *
 * A runtime owns exactly ONE `ViewerState.subscribe` registration and fans out
 * from it to cheap per-consumer projections. Each projection is created from a
 * `(projection, equality)` pair and is never mutated in place by a caller: a
 * framework helper that needs new inputs creates a NEW projection object, so
 * nothing shared is written during a render pass.
 *
 * Two properties make a projection directly usable as a React `getSnapshot`:
 *
 * - **Equality gates the cached value, not only the notification.** A recompute
 *   whose result satisfies `equals` returns the PREVIOUSLY returned reference.
 *   (This is an intentional, documented change to what `Selector.get()` returns
 *   for plugins, which previously returned a fresh-but-equal value after any
 *   version bump.)
 * - **Two read entry points share that one gated cache.** {@link
 *   SelectorProjection.read} is memoized by the runtime's notification version
 *   (React's external-store contract); {@link SelectorProjection.recompute}
 *   bypasses the version memo but still applies the equality gate, because a Vue
 *   `computed` can be invalidated by a framework reactive dependency the viewer
 *   never notified about.
 *
 * Consumer failures are RETAINED, never smoothed over: a projection or equality
 * function that throws makes every read at that version rethrow, so the failure
 * reaches the caller's own error handling instead of being served as a stale
 * selected value.
 */
import type { ViewerSelectors } from '../../types/plugin.js';
import type { ViewerState } from '../viewer.svelte.js';
/**
 * Which notification wakes a projection (CONTEXT.md **Selector cadence**).
 *
 * - `state` (the default) — the batched, payload-free inventoried-member watcher
 *   behind `ViewerState.subscribe` (ADR 0008).
 * - `frame` — additionally the live OpenSeadragon instance's own animation
 *   events, so continuous viewport values (zoom, pan, rotation, bounds) are
 *   readable reactively without ever being mirrored into viewer state
 *   (ADR 0011). `frame` is the FINER cadence, never a coarser one: a
 *   frame-cadence projection also wakes on state notifications, so it never
 *   serves a stale inventoried member between animations.
 */
export type SelectorCadence = 'state' | 'frame';
/** Per-projection options. */
export interface SelectorProjectionOptions<T> {
    /** Equality gate for the selected value. Defaults to `Object.is`. */
    equals?: (a: T, b: T) => boolean;
    /** Which notification wakes this projection. Defaults to `state`. */
    cadence?: SelectorCadence;
}
/**
 * A memoized, equality-gated projection of viewer state. Cheap to create and
 * cheap to throw away — a framework helper mints a new one whenever its
 * projection or equality inputs change.
 */
export interface SelectorProjection<T> {
    /** This projection's cadence. */
    readonly cadence: SelectorCadence;
    /**
     * The notification version this projection wakes on. Advances only for its
     * own cadence, so a framework reactive read of it re-evaluates exactly when
     * the projection could have changed.
     */
    readonly version: number;
    /**
     * Read the selected value, recomputing only when {@link version} has
     * advanced since the last evaluation (React's `getSnapshot`). Reference
     * stable while the value is equal. Rethrows a retained consumer failure.
     */
    read(): T;
    /**
     * Recompute now, bypassing the version memo but still applying the equality
     * gate (Vue's `computed`, whose dependencies can change with no viewer
     * notification). Rethrows a retained consumer failure.
     */
    recompute(): T;
    /**
     * Wake up on this projection's cadence. The listener receives no payload —
     * read through {@link read} or {@link recompute}. Returns an unsubscribe
     * function; unsubscribing is idempotent.
     */
    subscribe(listener: () => void): () => void;
}
/**
 * Failure hooks for the runtime. The plugin SDK passes both so a failing
 * selector is attributed to its owning plugin:
 * - `onProjectionError`: a projection (or its equality gate) threw while
 *   recomputing in reaction to a viewer command — `pluginerror` phase `command`.
 *   Only the plugin path routes here; framework wrappers leave the failure to be
 *   rethrown through the consumer's own read.
 * - `onListenerError`: a subscription callback threw during delivery —
 *   `pluginerror` phase `subscription`. On the `state` cadence this is handed to
 *   `ViewerState.subscribe`, which owns that attribution seam; on the `frame`
 *   cadence the runtime routes it here itself, because no core guard sits on the
 *   OpenSeadragon event path.
 */
export interface SelectorRuntimeOptions {
    onProjectionError?: (error: unknown) => void;
    onListenerError?: (error: unknown) => void;
}
/** One isolated selector runtime bound to exactly one `ViewerState`. */
export interface SelectorRuntime {
    /** The `ViewerSelectors` factory handed to a plugin context. */
    readonly selectors: ViewerSelectors;
    /** Create a per-consumer memoized projection. */
    createProjection<T>(projection: (state: ViewerState) => T, options?: SelectorProjectionOptions<T>): SelectorProjection<T>;
    /**
     * Remove the underlying `ViewerState` subscription, drop all fan-out, and
     * detach any frame ticker. Idempotent.
     */
    dispose(): void;
}
/**
 * Create an isolated selector runtime bound to one `ViewerState`. Subscribes to
 * the viewer state immediately so version memoization stays correct even before
 * any projection is individually subscribed.
 */
export declare function createSelectorRuntime(viewerState: ViewerState, options?: SelectorRuntimeOptions): SelectorRuntime;
