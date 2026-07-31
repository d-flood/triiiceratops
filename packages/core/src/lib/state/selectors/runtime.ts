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

import { isDebugEnabled, logger } from '../../logging/logger.js';
import type { Selector, ViewerSelectors } from '../../types/plugin.js';
import type { ViewerState } from '../viewer.svelte.js';

/** The live OpenSeadragon instance, as core hands it out (ADR 0009). */
type OsdViewer = NonNullable<ViewerState['osdViewer']>;

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

/** The OSD events a `frame`-cadence projection is woken by. */
const FRAME_EVENTS = [
    'animation',
    'viewport-change',
    'animation-finish',
] as const;

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
    createProjection<T>(
        projection: (state: ViewerState) => T,
        options?: SelectorProjectionOptions<T>,
    ): SelectorProjection<T>;
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
export function createSelectorRuntime(
    viewerState: ViewerState,
    options: SelectorRuntimeOptions = {},
): SelectorRuntime {
    let disposed = false;
    // One counter per cadence. A `state` projection memoizes on `stateVersion`;
    // a `frame` projection memoizes on their sum, because frame is the finer
    // cadence and wakes on both.
    let stateVersion = 0;
    let frameVersion = 0;

    const stateListeners = new Set<() => void>();
    const frameListeners = new Set<() => void>();

    /** The OSD instance the frame ticker is currently attached to. */
    let tickingOsd: OsdViewer | null = null;

    const onFrameTick = (): void => {
        frameVersion++;
        // No core listener guard sits on the OSD event path, so isolate delivery
        // here rather than letting one consumer's throw abort the rest (and land
        // inside OpenSeadragon's event dispatch).
        for (const listener of [...frameListeners]) {
            try {
                listener();
            } catch (error) {
                if (options.onListenerError) options.onListenerError(error);
                else logger.error('selector frame listener failed', error);
            }
        }
    };

    /**
     * Attach the frame ticker to the live OSD instance when — and only when — a
     * `frame`-cadence projection is subscribed and an instance exists. Detaches
     * on teardown and on OSD replacement, so an idle viewer costs nothing and no
     * `requestAnimationFrame` loop is ever created.
     */
    const syncFrameTicker = (): void => {
        const wanted =
            !disposed && frameListeners.size > 0
                ? (viewerState.osdViewer ?? null)
                : null;
        if (wanted === tickingOsd) return;
        if (tickingOsd) {
            for (const event of FRAME_EVENTS) {
                tickingOsd.removeHandler(event, onFrameTick);
            }
        }
        tickingOsd = wanted;
        if (tickingOsd) {
            for (const event of FRAME_EVENTS) {
                tickingOsd.addHandler(event, onFrameTick);
            }
        }
    };

    // The single `ViewerState.subscribe` registration for this runtime. It
    // carries the caller's listener error handler so a throwing consumer
    // callback keeps its attribution through core's guard.
    const unsubscribe = viewerState.subscribe(() => {
        stateVersion++;
        // `osdViewer` is an inventoried observable member, so this notification
        // is also how the ticker learns that OSD appeared or was replaced. Sync
        // BEFORE delivery: a throwing consumer callback must not strand it.
        syncFrameTicker();
        for (const listener of [...stateListeners]) listener();
        for (const listener of [...frameListeners]) listener();
    }, options.onListenerError);

    function createProjection<T>(
        projection: (state: ViewerState) => T,
        projectionOptions: SelectorProjectionOptions<T> = {},
    ): SelectorProjection<T> {
        const equals = projectionOptions.equals ?? Object.is;
        const cadence: SelectorCadence = projectionOptions.cadence ?? 'state';
        const listeners = cadence === 'frame' ? frameListeners : stateListeners;

        let evaluatedVersion = -1;
        let hasValue = false;
        let value: T;
        // Retained consumer failure for the evaluated version; `null` when the
        // last evaluation succeeded.
        let failure: { error: unknown } | null = null;
        let warnedOsdRead = false;

        const currentVersion = (): number =>
            cadence === 'frame' ? stateVersion + frameVersion : stateVersion;

        const compute = (): T => {
            // Development-only diagnostic (debug-gated, once per projection):
            // a batched-cadence projection that reaches for the OSD pass-through
            // is the one selector mistake that fails silently.
            if (cadence === 'state' && !warnedOsdRead && isDebugEnabled()) {
                const probe = readingOsdViewer(viewerState, () =>
                    projection(viewerState),
                );
                if (probe.readOsdViewer) {
                    warnedOsdRead = true;
                    logger.warn(
                        "A `state`-cadence selector read `osdViewer`. Values read THROUGH the OpenSeadragon instance (zoom, pan, rotation, bounds) never wake the batched state watcher, so such a projection appears frozen: pass `cadence: 'frame'` to wake it from OpenSeadragon's own animation events instead. (Reading `osdViewer` only to test readiness is correct at `state` cadence — it is an inventoried member.)",
                    );
                }
                return probe.value;
            }
            return projection(viewerState);
        };

        /** Recompute into the gated cache. Never throws; retains the failure. */
        const evaluate = (): void => {
            let next: T;
            try {
                next = compute();
            } catch (error) {
                failure = { error };
                return;
            }
            if (hasValue) {
                let equal: boolean;
                try {
                    equal = equals(value, next);
                } catch (error) {
                    failure = { error };
                    return;
                }
                // The gate applies to the CACHED VALUE: an equal recompute keeps
                // the previously returned reference, which is what makes this a
                // valid React `getSnapshot`.
                if (equal) {
                    failure = null;
                    return;
                }
            }
            value = next;
            hasValue = true;
            failure = null;
        };

        const current = (): T => {
            if (failure) throw failure.error;
            return value;
        };

        return {
            cadence,
            get version() {
                return currentVersion();
            },
            read() {
                const version = currentVersion();
                if (evaluatedVersion !== version) {
                    evaluatedVersion = version;
                    evaluate();
                }
                return current();
            },
            recompute() {
                evaluatedVersion = currentVersion();
                evaluate();
                return current();
            },
            subscribe(listener: () => void): () => void {
                if (disposed) return () => {};
                listeners.add(listener);
                syncFrameTicker();
                let released = false;
                return () => {
                    if (released) return;
                    released = true;
                    listeners.delete(listener);
                    syncFrameTicker();
                };
            },
        };
    }

    const selectors: ViewerSelectors = {
        select<T>(
            fn: (state: ViewerState) => T,
            equals: (a: T, b: T) => boolean = Object.is,
        ): Selector<T> {
            // Plugins get the same projection every wrapper gets — batched
            // cadence only, until the SDK's `select` signature grows one.
            const bound = createProjection(fn, { equals });

            return {
                get: () => bound.read(),
                subscribe(callback: (value: T) => void): () => void {
                    if (disposed) return () => {};
                    // The initial read runs in the CALLER's context (typically a
                    // plugin's mount): a projection throw here surfaces as the
                    // `mount` failure, not `command`.
                    let last = bound.read();
                    return bound.subscribe(() => {
                        // Recompute — the projection reacting to a command. A
                        // throw here is this plugin's `command` failure: skip
                        // this selector so the others in the same flush still
                        // recompute.
                        let next: T;
                        try {
                            next = bound.read();
                        } catch (error) {
                            options.onProjectionError?.(error);
                            return;
                        }
                        if (!equals(last, next)) {
                            last = next;
                            // Delivery: a throw here is the `subscription`
                            // failure, left to bubble to the `ViewerState` guard.
                            callback(next);
                        }
                    });
                },
            };
        },
    };

    return {
        selectors,
        createProjection,
        dispose() {
            if (disposed) return;
            disposed = true;
            stateListeners.clear();
            frameListeners.clear();
            syncFrameTicker();
            unsubscribe();
        },
    };
}

/**
 * True while an `osdViewer` probe is installed. A nested projection must not
 * install a second one: its restore would remove the outer probe's accessor.
 */
let probing = false;

/**
 * Run `read` with `osdViewer` temporarily shadowed by an own accessor that
 * records whether it was read, then restore the object exactly as it was.
 *
 * Development-only (the caller gates on debug mode) and synchronous: the
 * shadowing accessor exists only for the duration of one projection call, and it
 * delegates to the real accessor, so the value the projection sees is the real
 * one. Objects without an `osdViewer` accessor — a test double, say — are run
 * unmodified.
 */
function readingOsdViewer<T>(
    state: ViewerState,
    read: () => T,
): { value: T; readOsdViewer: boolean } {
    const descriptor = inheritedAccessor(state, 'osdViewer');
    if (!descriptor?.get || !Object.isExtensible(state) || probing) {
        return { value: read(), readOsdViewer: false };
    }
    const { get, set } = descriptor;
    let readOsdViewer = false;
    probing = true;
    Object.defineProperty(state, 'osdViewer', {
        configurable: true,
        enumerable: descriptor.enumerable ?? true,
        get: () => {
            readOsdViewer = true;
            return get.call(state);
        },
        set: (next: unknown) => {
            set?.call(state, next);
        },
    });
    try {
        return { value: read(), readOsdViewer };
    } finally {
        probing = false;
        Reflect.deleteProperty(state, 'osdViewer');
    }
}

/** The nearest INHERITED descriptor for `key`, ignoring own properties. */
function inheritedAccessor(
    target: object,
    key: string,
): PropertyDescriptor | undefined {
    let current: object | null = Object.getPrototypeOf(target) as object | null;
    while (current) {
        const descriptor = Object.getOwnPropertyDescriptor(current, key);
        if (descriptor) return descriptor;
        current = Object.getPrototypeOf(current) as object | null;
    }
    return undefined;
}
