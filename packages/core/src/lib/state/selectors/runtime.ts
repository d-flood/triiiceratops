/**
 * The framework-neutral selector runtime — ONE implementation shared by plugin
 * activations and framework wrappers (CONTEXT.md **Selector**, **Selector
 * cadence**; ADR 0008, ADR 0011).
 *
 * This module is deliberately lightweight: it imports no Svelte runtime, no
 * renderer, and nothing from the plugin SDK. Its only dependency on
 * `ViewerState` is `subscribe`/`subscribeFrame` plus synchronous property reads,
 * so it is equally usable from a plugin activation, a React wrapper, and a Vue
 * wrapper.
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

/**
 * Which notification wakes a projection (CONTEXT.md **Selector cadence**).
 *
 * - `state` (the default) — the batched, payload-free inventoried-member watcher
 *   behind `ViewerState.subscribe` (ADR 0008).
 * - `frame` — additionally the renderer's own animation events, delivered
 *   through `ViewerState.subscribeFrame`, so the query-only viewport values
 *   (`viewportScale`, `viewportCentre`, `viewportBounds`) are readable
 *   reactively without ever being mirrored into notifying viewer state
 *   (ADR 0011). `frame` is the FINER cadence, never a coarser one: a
 *   frame-cadence projection also wakes on state notifications, so it never
 *   serves a stale inventoried member between animations.
 *
 * The cadence survives the renderer replacement unchanged as a concept; only
 * its event source moved, from a third party's event names to core's own.
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

    /** Detach from the viewer's frame notification; set while attached. */
    let untick: (() => void) | null = null;

    const onFrameTick = (): void => {
        frameVersion++;
        // Isolate delivery here rather than letting one consumer's throw abort
        // the rest: this runtime owns the per-plugin attribution the viewer's
        // own frame fan-out cannot make.
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
     * Attach the frame ticker when — and only when — a `frame`-cadence
     * projection is subscribed. `ViewerState.subscribeFrame` is itself lazy
     * about reaching the renderer, so an idle viewer costs nothing and no
     * `requestAnimationFrame` loop is ever created; a viewer whose renderer has
     * not mounted yet simply never ticks, and starts ticking when it does.
     */
    const syncFrameTicker = (): void => {
        const wanted = !disposed && frameListeners.size > 0;
        if (wanted === (untick !== null)) return;
        if (untick) {
            untick();
            untick = null;
            return;
        }
        untick = viewerState.subscribeFrame(onFrameTick);
    };

    // The single `ViewerState.subscribe` registration for this runtime. It
    // carries the caller's listener error handler so a throwing consumer
    // callback keeps its attribution through core's guard.
    const unsubscribe = viewerState.subscribe(() => {
        stateVersion++;
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
        let warnedViewportRead = false;
        // Whether the viewport probe below has run at least once while debug
        // mode was ON. Distinct from `warnedViewportRead`: a probe that ran and
        // found nothing is still a probe that ran.
        let probedViewportRead = false;

        const currentVersion = (): number =>
            cadence === 'frame' ? stateVersion + frameVersion : stateVersion;

        /**
         * Whether this projection still owes the debug-gated viewport probe
         * a run at the CURRENT version — i.e. debug mode was switched on after
         * the projection was already evaluated.
         *
         * That is the normal order, not an exotic one: a framework wrapper
         * bridges `config.debug` when it applies the property tier, a second
         * viewer can bridge it later still, and a projection over a handle from
         * `triiiceratops/testing` has no wrapper behind it at all. Gating only
         * inside {@link compute} would therefore decide "no probe" at whatever
         * moment the projection happened to be read first and, because reads are
         * memoized by version, never revisit it on an idle viewer.
         *
         * Costs nothing when debug is off: three field comparisons and one
         * boolean read, no allocation, no accessor installed, no timer, no
         * subscription. The forced re-evaluation happens at most ONCE per
         * projection, since the probe sets `probedViewportRead`.
         */
        const owesViewportProbe = (): boolean =>
            cadence === 'state' &&
            !probedViewportRead &&
            !warnedViewportRead &&
            isDebugEnabled();

        const compute = (): T => {
            // Development-only diagnostic (debug-gated, once per projection):
            // a batched-cadence projection that reads a query-only viewport
            // value is the one selector mistake that fails silently.
            if (
                cadence === 'state' &&
                !warnedViewportRead &&
                isDebugEnabled()
            ) {
                probedViewportRead = true;
                const probe = readingViewport(viewerState, () =>
                    projection(viewerState),
                );
                if (probe.readViewport) {
                    warnedViewportRead = true;
                    logger.warn(
                        `A \`state\`-cadence selector read \`${probe.readViewport}\`. The viewport's scale, centre, and bounds are query-only state: they change every frame and deliberately never wake the batched state watcher, so such a projection appears frozen. Pass \`cadence: 'frame'\` to wake it from the renderer's own animation events instead. (Reading \`rendererReady\` at \`state\` cadence is correct — that one is an inventoried observable member.)`,
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
                if (evaluatedVersion !== version || owesViewportProbe()) {
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
 * The query-only viewport members the probe watches for — the ones that change
 * every frame and never notify. `containerSize` is deliberately absent: it is
 * query-only too, but it changes only on resize, and a `state`-cadence
 * projection reading it is not the silent-freeze mistake this warning is about.
 */
const QUERY_ONLY_VIEWPORT_MEMBERS = [
    'viewportScale',
    'viewportCentre',
    'viewportBounds',
] as const;

/**
 * True while a viewport probe is installed. A nested projection must not
 * install a second one: its restore would remove the outer probe's accessors.
 */
let probing = false;

/**
 * Run `read` with the query-only viewport getters temporarily shadowed by own
 * accessors that record whether they were read, then restore the object exactly
 * as it was.
 *
 * Development-only (the caller gates on debug mode) and synchronous: the
 * shadowing accessors exist only for the duration of one projection call, and
 * they delegate to the real ones, so the values the projection sees are the real
 * ones. Objects without those accessors — a test double, say — are run
 * unmodified.
 *
 * @returns the projection's value, and the name of the first viewport member it
 * read (`null` if it read none), so the warning can name it.
 */
function readingViewport<T>(
    state: ViewerState,
    read: () => T,
): { value: T; readViewport: string | null } {
    if (probing || !Object.isExtensible(state)) {
        return { value: read(), readViewport: null };
    }

    const installed: string[] = [];
    let readViewport: string | null = null;

    for (const member of QUERY_ONLY_VIEWPORT_MEMBERS) {
        const descriptor = inheritedAccessor(state, member);
        if (!descriptor?.get) continue;
        const { get } = descriptor;
        Object.defineProperty(state, member, {
            configurable: true,
            enumerable: descriptor.enumerable ?? false,
            get: () => {
                readViewport ??= member;
                return get.call(state);
            },
        });
        installed.push(member);
    }

    if (installed.length === 0) {
        return { value: read(), readViewport: null };
    }

    probing = true;
    try {
        return { value: read(), readViewport };
    } finally {
        probing = false;
        for (const member of installed) {
            Reflect.deleteProperty(state, member);
        }
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
