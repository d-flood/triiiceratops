// Development-warning route: artifact-level proof the wrapper warnings fire only with `config.debug`.
// Viewer B remounts every phase for a fresh property applier; its config carries no `debug` key.

import { createElement as h, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import {
    TriiiceratopsViewer,
    useViewerHandle,
    useViewerSelector,
} from 'triiiceratops/react';
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

// --- a tiny external store, so Playwright can drive React re-renders --------

let version = 0;
const listeners = new Set();
const subscribe = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};
const getVersion = () => version;

/** Viewer B's baseline theme override: stable identity, so it is not a write. */
const STABLE_THEME_CONFIG = { cssVars: { '--tri-debug-token': '#000000' } };

const store = {
    debug: false,
    phase: 0,
    // A NEW nested object each churn: the applier's change detection is one
    // level deep, so every one of these is a genuine write.
    churn: STABLE_THEME_CONFIG,
    unbound: 0,
};

function patch(next) {
    Object.assign(store, next);
    version++;
    for (const listener of [...listeners]) listener();
}

const live = { handleA: null };

/** Hoisted, so the projection identity is stable and its cache survives a
 * re-render — which is what makes "first read before debug was on" real. */
// Reads `viewportScale` UNCONDITIONALLY, which is the mistake this page exists
// to provoke. Guarding the read on `rendererReady` made the probe's one chance
// depend on whether a renderer happened to be attached the first time debug was
// on — so the warning it is here to demonstrate never fired for the mounted
// viewer at all.
const selectZoomThousandths = (state) => Math.round(state.viewportScale * 1000);

/**
 * A real `ViewerState` from `triiiceratops/testing` with no viewer, no element
 * and no renderer behind it — and therefore genuinely IDLE: nothing ever
 * notifies it, so a projection over it never sees its version advance.
 *
 * That is the strict version of the same ordering viewer A demonstrates. A
 * probe that is decided once, at whatever moment the projection happened to be
 * read first, gets no second chance here at all.
 */
const idleHandle = createTestViewerHandle();
// The headless renderer stand-in `triiiceratops/testing` ships, attached so the
// projection below really does read a viewport value: `rendererReady` is false
// on a bare handle, and the projection short-circuits on it, so without this the
// probe has nothing to catch. The stand-in answers queries; it does not notify,
// so "idle" is still literally true — which is the point of this case.
idleHandle.attachRenderer();

// --- components -------------------------------------------------------------

/**
 * A handle created and never passed to a viewer. One new instance per phase,
 * and previous instances stay mounted: the warning is armed from a mount
 * effect, so unmounting one would just cancel its timer.
 */
function UnboundHandle() {
    useViewerHandle();
    return null;
}

/** The `state`-cadence projection that reads a query-only viewport value. */
function ZoomAtStateCadence({ handle }) {
    const zoom = useViewerSelector(handle, selectZoomThousandths);
    return h('span', { 'data-testid': 'debug-zoom-state' }, String(zoom));
}

/** The same mistake over a state that never notifies. */
function IdleZoomAtStateCadence() {
    const zoom = useViewerSelector(idleHandle, selectZoomThousandths);
    return h('span', { 'data-testid': 'debug-idle-zoom-state' }, String(zoom));
}

function ViewerA({ handle }) {
    const canvasId = useViewerSelector(
        handle,
        (state) => state.canvasId ?? 'none',
    );
    return h(
        'section',
        null,
        h(TriiiceratopsViewer, {
            handle,
            id: 'debug-viewer-a',
            manifestJson: F.MANIFEST_JSON,
            // The ONLY `debug` opinion on this page.
            config: { debug: store.debug },
            style: { display: 'block', width: '240px', height: '180px' },
        }),
        h('span', { 'data-testid': 'debug-canvas' }, String(canvasId)),
        h(ZoomAtStateCadence, { handle }),
    );
}

/** Remounted every phase, and re-rendered with a rebuilt object prop. */
function ViewerB() {
    return h(TriiiceratopsViewer, {
        id: 'debug-viewer-b',
        manifestJson: F.MANIFEST_JSON,
        // No `debug` key: not an opinion, so it must not contradict viewer A.
        config: F.CONFIG,
        // The hazard the applier names: rebuilt on every render.
        themeConfig: store.churn,
        style: { display: 'block', width: '160px', height: '120px' },
    });
}

function App() {
    useSyncExternalStore(subscribe, getVersion);
    const handleA = useViewerHandle();
    live.handleA = handleA;
    const unbound = [];
    for (let i = 0; i < store.unbound; i++) {
        unbound.push(h(UnboundHandle, { key: i }));
    }
    return h(
        'main',
        null,
        h(ViewerA, { handle: handleA }),
        h(IdleZoomAtStateCadence),
        store.phase > 0 ? h(ViewerB, { key: store.phase }) : null,
        unbound,
    );
}

// --- the control surface Playwright drives ----------------------------------

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const tokenValue = (i) => '#00000' + (i % 10);

async function waitFor(predicate, timeoutMs = 20_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (predicate()) return true;
        await delay(50);
    }
    return predicate();
}

const boundA = () => !!(live.handleA && live.handleA.get());

/**
 * Run one phase: set the debug flag on viewer A, remount viewer B, then provoke
 * every warning this framework can provoke and report what reached the console.
 */
async function runPhase(debug) {
    warnings.length = 0;
    patch({ debug, phase: store.phase + 1 });
    await waitFor(boundA);
    // 15 writes of one property-tier prop on ONE viewer, well past the
    // documented threshold of 10. One task each, so React really re-renders
    // 15 times instead of batching them into one.
    for (let i = 0; i < 15; i++) {
        patch({ churn: { cssVars: { '--tri-debug-token': tokenValue(i) } } });
        await delay(16);
    }
    // One more handle that is never passed to a viewer.
    patch({ unbound: store.unbound + 1 });
    // Long enough for the unbound-handle macrotask and for React to have
    // re-read every projection.
    await delay(500);
    return {
        bound: boundA(),
        warnings: warnings.slice(),
    };
}

createRoot(document.getElementById('app')).render(h(App));

window.__debug = {
    framework: 'react',
    capabilities: { unboundHandle: true, keepAlive: false },
    ready: boundA,
    warnings: () => warnings.slice(),
    runPhase,
};
