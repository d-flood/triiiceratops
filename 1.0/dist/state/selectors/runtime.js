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
/** The OSD events a `frame`-cadence projection is woken by. */
const FRAME_EVENTS = [
    'animation',
    'viewport-change',
    'animation-finish',
];
/**
 * Create an isolated selector runtime bound to one `ViewerState`. Subscribes to
 * the viewer state immediately so version memoization stays correct even before
 * any projection is individually subscribed.
 */
export function createSelectorRuntime(viewerState, options = {}) {
    let disposed = false;
    // One counter per cadence. A `state` projection memoizes on `stateVersion`;
    // a `frame` projection memoizes on their sum, because frame is the finer
    // cadence and wakes on both.
    let stateVersion = 0;
    let frameVersion = 0;
    const stateListeners = new Set();
    const frameListeners = new Set();
    /** The OSD instance the frame ticker is currently attached to. */
    let tickingOsd = null;
    const onFrameTick = () => {
        frameVersion++;
        // No core listener guard sits on the OSD event path, so isolate delivery
        // here rather than letting one consumer's throw abort the rest (and land
        // inside OpenSeadragon's event dispatch).
        for (const listener of [...frameListeners]) {
            try {
                listener();
            }
            catch (error) {
                if (options.onListenerError)
                    options.onListenerError(error);
                else
                    logger.error('selector frame listener failed', error);
            }
        }
    };
    /**
     * Attach the frame ticker to the live OSD instance when — and only when — a
     * `frame`-cadence projection is subscribed and an instance exists. Detaches
     * on teardown and on OSD replacement, so an idle viewer costs nothing and no
     * `requestAnimationFrame` loop is ever created.
     */
    const syncFrameTicker = () => {
        const wanted = !disposed && frameListeners.size > 0
            ? (viewerState.osdViewer ?? null)
            : null;
        if (wanted === tickingOsd)
            return;
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
        for (const listener of [...stateListeners])
            listener();
        for (const listener of [...frameListeners])
            listener();
    }, options.onListenerError);
    function createProjection(projection, projectionOptions = {}) {
        const equals = projectionOptions.equals ?? Object.is;
        const cadence = projectionOptions.cadence ?? 'state';
        const listeners = cadence === 'frame' ? frameListeners : stateListeners;
        let evaluatedVersion = -1;
        let hasValue = false;
        let value;
        // Retained consumer failure for the evaluated version; `null` when the
        // last evaluation succeeded.
        let failure = null;
        let warnedOsdRead = false;
        // Whether the `osdViewer` probe below has run at least once while debug
        // mode was ON. Distinct from `warnedOsdRead`: a probe that ran and found
        // nothing is still a probe that ran.
        let probedOsdRead = false;
        const currentVersion = () => cadence === 'frame' ? stateVersion + frameVersion : stateVersion;
        /**
         * Whether this projection still owes the debug-gated `osdViewer` probe
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
         * projection, since the probe sets `probedOsdRead`.
         */
        const owesOsdProbe = () => cadence === 'state' &&
            !probedOsdRead &&
            !warnedOsdRead &&
            isDebugEnabled();
        const compute = () => {
            // Development-only diagnostic (debug-gated, once per projection):
            // a batched-cadence projection that reaches for the OSD pass-through
            // is the one selector mistake that fails silently.
            if (cadence === 'state' && !warnedOsdRead && isDebugEnabled()) {
                probedOsdRead = true;
                const probe = readingOsdViewer(viewerState, () => projection(viewerState));
                if (probe.readOsdViewer) {
                    warnedOsdRead = true;
                    logger.warn("A `state`-cadence selector read `osdViewer`. Values read THROUGH the OpenSeadragon instance (zoom, pan, rotation, bounds) never wake the batched state watcher, so such a projection appears frozen: pass `cadence: 'frame'` to wake it from OpenSeadragon's own animation events instead. (Reading `osdViewer` only to test readiness is correct at `state` cadence — it is an inventoried member.)");
                }
                return probe.value;
            }
            return projection(viewerState);
        };
        /** Recompute into the gated cache. Never throws; retains the failure. */
        const evaluate = () => {
            let next;
            try {
                next = compute();
            }
            catch (error) {
                failure = { error };
                return;
            }
            if (hasValue) {
                let equal;
                try {
                    equal = equals(value, next);
                }
                catch (error) {
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
        const current = () => {
            if (failure)
                throw failure.error;
            return value;
        };
        return {
            cadence,
            get version() {
                return currentVersion();
            },
            read() {
                const version = currentVersion();
                if (evaluatedVersion !== version || owesOsdProbe()) {
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
            subscribe(listener) {
                if (disposed)
                    return () => { };
                listeners.add(listener);
                syncFrameTicker();
                let released = false;
                return () => {
                    if (released)
                        return;
                    released = true;
                    listeners.delete(listener);
                    syncFrameTicker();
                };
            },
        };
    }
    const selectors = {
        select(fn, equals = Object.is) {
            // Plugins get the same projection every wrapper gets — batched
            // cadence only, until the SDK's `select` signature grows one.
            const bound = createProjection(fn, { equals });
            return {
                get: () => bound.read(),
                subscribe(callback) {
                    if (disposed)
                        return () => { };
                    // The initial read runs in the CALLER's context (typically a
                    // plugin's mount): a projection throw here surfaces as the
                    // `mount` failure, not `command`.
                    let last = bound.read();
                    return bound.subscribe(() => {
                        // Recompute — the projection reacting to a command. A
                        // throw here is this plugin's `command` failure: skip
                        // this selector so the others in the same flush still
                        // recompute.
                        let next;
                        try {
                            next = bound.read();
                        }
                        catch (error) {
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
            if (disposed)
                return;
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
function readingOsdViewer(state, read) {
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
        set: (next) => {
            set?.call(state, next);
        },
    });
    try {
        return { value: read(), readOsdViewer };
    }
    finally {
        probing = false;
        Reflect.deleteProperty(state, 'osdViewer');
    }
}
/** The nearest INHERITED descriptor for `key`, ignoring own properties. */
function inheritedAccessor(target, key) {
    let current = Object.getPrototypeOf(target);
    while (current) {
        const descriptor = Object.getOwnPropertyDescriptor(current, key);
        if (descriptor)
            return descriptor;
        current = Object.getPrototypeOf(current);
    }
    return undefined;
}
