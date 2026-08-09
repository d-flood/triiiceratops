// The development-warning route — the artifact-level proof for EPIC-1.
//
// The four wrapper-side development warnings (an unbound handle, a
// property-tier prop rebuilt every render, a second `ViewerState`, and a
// `state`-cadence projection reading a query-only viewport value) are gated on
// `ViewerConfig.debug`. In the PUBLISHED package the wrappers and the element
// bundle carry two different copies of the logger module, so for a while
// `config: { debug: true }` configured the element's copy and left the
// wrappers' silent forever — while every source-level test passed, because
// under vitest the two copies are one.
//
// Nothing here reaches into the library. The proof is a real consumer,
// installed from a real packed tarball, watching real `console.warn` output:
//
//   phase 1  `config: { debug: false }`  — provoke everything, expect silence
//   phase 2  `config: { debug: true }`   — provoke everything, expect warnings
//   phase 3  `config: { debug: false }`  — provoke everything, expect silence
//
// Three viewers, deliberately:
//
//   · Viewer A is mounted ONCE and lives through all three phases. Its `config`
//     carries the `debug` flag, and the `state`-cadence projection that reads
//     a query-only viewport value hangs off it — so that projection is created and first read
//     while debug is still OFF, which is the ordering a published wrapper
//     actually produces (the flag is bridged when the property tier is
//     applied) and the one a probe decided too early would miss forever.
//   · Viewer B is remounted every phase, so each phase gets a FRESH property
//     applier whose once-per-prop warning has not been used up. Its own config
//     deliberately carries no `debug` key at all: a second viewer with an
//     unrelated config must not switch off the diagnostics viewer A asked for.
//   · Viewer C lives inside a `<KeepAlive>` and is remounted every phase, so
//     each phase can round-trip it and publish a second `ViewerState` with a
//     binding whose once-only re-availability warning is still unused.
//
// Written with `h()` rather than single-file components so it stays line for
// line comparable with the React fixture's `debug-main.js`; the client-contract
// route next door is the one that proves the SFC authoring story.

import {
    createApp,
    defineComponent,
    h,
    KeepAlive,
    nextTick,
    reactive,
    shallowRef,
} from 'vue';
import { TriiiceratopsViewer, useViewerSelector } from 'triiiceratops/vue';
import { createTestViewerHandle } from 'triiiceratops/testing';

import * as F from './fixtures.js';

// --- the witness ------------------------------------------------------------

/** Every `[triiiceratops]` record that reached the real console, in order. */
const warnings = [];
const realWarn = console.warn.bind(console);
console.warn = (...args) => {
    const text = args.map((a) => String(a)).join(' ');
    if (text.includes('[triiiceratops]')) warnings.push(text);
    realWarn(...args);
};

// --- the fixture's own state ------------------------------------------------

/** Viewer B's baseline theme override: stable identity, so it is not a write. */
const STABLE_THEME_CONFIG = { cssVars: { '--tri-debug-token': '#000000' } };

/** Primitive-only, so nothing handed to the viewer is ever a reactive proxy. */
const store = reactive({
    phase: 0,
    keepAliveActive: true,
    // Read by the viewport-scale projection below purely so the fixture can
    // invalidate its `computed` in a phase where the viewer itself is idle.
    tick: 0,
});

/**
 * `shallowRef`, NOT `ref`: a deep `ref` would hand the wrapper a reactive PROXY
 * of these objects and the property tier's identity comparisons would stop
 * holding.
 */
const configA = shallowRef({ debug: false });
const churn = shallowRef(STABLE_THEME_CONFIG);

const viewerA = shallowRef(null);
const viewerC = shallowRef(null);

/**
 * Hoisted, so the projection identity is stable and its cache survives a
 * re-render — which is what makes "first read before debug was on" real.
 *
 * It also reads a Vue reactive dependency on purpose. A `computed` is lazy and
 * viewer A is idle between phases, so without one nothing would invalidate the
 * selection and the projection would never be re-evaluated. This is the
 * documented Vue path (`recompute()` exists for exactly this) and the projection
 * is still an ordinary `state`-cadence one reading a query-only viewport value.
 */
// Reads `viewportScale` UNCONDITIONALLY, which is the mistake this page exists
// to provoke. Guarding the read on `rendererReady` made the probe's one chance
// depend on whether a renderer happened to be attached the first time debug was
// on — so the warning it is here to demonstrate never fired for the mounted
// viewer at all.
const selectZoomThousandths = (state) => {
    void store.tick;
    return Math.round(state.viewportScale * 1000);
};

const selectCanvasId = (state) => state.canvasId ?? 'none';

/**
 * A real `ViewerState` from `triiiceratops/testing` with no viewer, no element
 * and no renderer behind it — and therefore genuinely IDLE: nothing ever
 * notifies it, so a projection over it never sees its version advance.
 *
 * That is the strict version of the same ordering viewer A demonstrates. A
 * probe that is decided once, at whatever moment the projection happened to be
 * read first, gets no second chance here at all.
 *
 * `shallowRef` for the reason the Vue guide documents.
 */
const idleHandleRef = shallowRef(createTestViewerHandle());
// The headless renderer stand-in `triiiceratops/testing` ships, attached so the
// projection below really does read a viewport value: `rendererReady` is false
// on a bare handle, and the projection short-circuits on it, so without this the
// probe has nothing to catch. The stand-in answers queries; it does not notify,
// so "idle" is still literally true — which is the point of this case.
idleHandleRef.value.attachRenderer();

// --- components -------------------------------------------------------------

/** The `state`-cadence projection that reads a query-only viewport value. */
const ZoomAtStateCadence = defineComponent({
    name: 'ZoomAtStateCadence',
    setup() {
        const zoom = useViewerSelector(viewerA, selectZoomThousandths);
        return () =>
            h(
                'span',
                { 'data-testid': 'debug-zoom-state' },
                String(zoom.value ?? -1),
            );
    },
});

/** The same mistake over a state that never notifies. */
const IdleZoomAtStateCadence = defineComponent({
    name: 'IdleZoomAtStateCadence',
    setup() {
        const zoom = useViewerSelector(idleHandleRef, selectZoomThousandths);
        return () =>
            h(
                'span',
                { 'data-testid': 'debug-idle-zoom-state' },
                String(zoom.value ?? -1),
            );
    },
});

const App = defineComponent({
    name: 'DebugApp',
    setup() {
        const canvasId = useViewerSelector(viewerA, selectCanvasId);
        return () =>
            h('main', null, [
                h(TriiiceratopsViewer, {
                    ref: viewerA,
                    id: 'debug-viewer-a',
                    manifestJson: F.MANIFEST_JSON,
                    // The ONLY `debug` opinion on this page.
                    config: configA.value,
                    style: 'display: block; width: 240px; height: 180px',
                }),
                h(
                    'span',
                    { 'data-testid': 'debug-canvas' },
                    String(canvasId.value ?? 'none'),
                ),
                h(ZoomAtStateCadence),
                h(IdleZoomAtStateCadence),
                store.phase > 0
                    ? h(TriiiceratopsViewer, {
                          key: 'b' + store.phase,
                          id: 'debug-viewer-b',
                          manifestJson: F.MANIFEST_JSON,
                          // No `debug` key: not an opinion, so it must not
                          // contradict viewer A.
                          config: F.CONFIG,
                          // The hazard the applier names: rebuilt every render.
                          themeConfig: churn.value,
                          style: 'display: block; width: 160px; height: 120px',
                      })
                    : null,
                h(KeepAlive, null, {
                    default: () =>
                        store.phase > 0 && store.keepAliveActive
                            ? h(TriiiceratopsViewer, {
                                  ref: viewerC,
                                  key: 'c' + store.phase,
                                  id: 'debug-viewer-c',
                                  manifestJson: F.MANIFEST_JSON,
                                  config: F.CONFIG,
                                  style: 'display: block; width: 80px; height: 60px',
                              })
                            : null,
                }),
            ]);
    },
});

// --- the control surface Playwright drives ----------------------------------

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(predicate, timeoutMs = 20_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (predicate()) return true;
        await delay(50);
    }
    return predicate();
}

const stateOf = (ref) => (ref.value ? (ref.value.state ?? null) : null);
const boundA = () => stateOf(viewerA) !== null;

const tokenValue = (i) => '#00000' + (i % 10);

/**
 * Detach and reattach viewer C through `<KeepAlive>`. Vue destroys the inner
 * viewer on deactivation and builds a new one on reactivation, so this is what
 * publishes a SECOND `ViewerState` on one binding.
 */
async function keepAliveRoundTrip() {
    const before = stateOf(viewerC);
    if (!before) return false;
    store.keepAliveActive = false;
    await nextTick();
    store.keepAliveActive = true;
    await nextTick();
    return waitFor(() => {
        const now = stateOf(viewerC);
        return !!now && now !== before;
    });
}

/**
 * Run one phase: set the debug flag on viewer A, remount viewers B and C, then
 * provoke every warning this framework can provoke and report what reached the
 * console.
 */
async function runPhase(debug) {
    warnings.length = 0;
    configA.value = { debug };
    store.phase += 1;
    store.keepAliveActive = true;
    await waitFor(boundA);
    await waitFor(() => stateOf(viewerC) !== null);
    // Invalidate viewer A's viewport-scale projection so its `computed`
    // re-evaluates under the flag this phase just set.
    store.tick += 1;
    await nextTick();
    await delay(50);
    // 15 writes of one property-tier prop on ONE viewer, well past the
    // documented threshold of 10. One task each, so Vue really flushes 15
    // separate updates instead of collapsing them into one.
    for (let i = 0; i < 15; i++) {
        churn.value = { cssVars: { '--tri-debug-token': tokenValue(i) } };
        await delay(16);
    }
    const rebound = await keepAliveRoundTrip();
    // Long enough for every deferred notification to have been delivered and
    // for Vue to have re-evaluated every projection.
    await delay(500);
    return {
        bound: boundA(),
        rebound,
        warnings: warnings.slice(),
    };
}

createApp(App).mount('#app');

window.__debug = {
    framework: 'vue',
    capabilities: { unboundHandle: false, keepAlive: true },
    ready: boundA,
    warnings: () => warnings.slice(),
    runPhase,
};
