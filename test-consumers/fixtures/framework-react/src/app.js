// The client-contract route: the whole browser half of the framework-wrapper
// contract, driven from a packed `triiiceratops` tarball and React 19 alone.
//
// Authored with `createElement` — no JSX, so no React Vite plugin — and with no
// Svelte package, no Svelte Vite plugin, and no plugin SDK anywhere in the
// dependency graph.

import {
    Component,
    createElement as h,
    useRef,
    useSyncExternalStore,
} from 'react';
import {
    TriiiceratopsViewer,
    useViewer,
    useViewerHandle,
    useViewerSelector,
    ViewerProvider,
} from 'triiiceratops/react';
import { createTestViewerHandle, flush } from 'triiiceratops/testing';

import * as F from './fixtures.js';
import {
    onFrameworkEvent,
    retryLastPlugin,
    snapshot,
    totals,
} from './events.js';

// Every static import above has been evaluated by the time this runs, so a
// `true` here would mean an entry point registered the element as an import
// side effect. Registration must be lazy, and triggered by a mounted wrapper.
const definedBeforeMount = !!(
    globalThis.customElements &&
    globalThis.customElements.get('triiiceratops-viewer')
);

// --- a tiny external store, so Playwright can drive React re-renders ---------

let version = 0;
const listeners = new Set();
const subscribe = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};
const getVersion = () => version;

const store = {
    theme: 'light',
    canvasProp: F.CANVAS_1,
    config: F.CONFIG,
    dynamicSeed: 0,
    coarseEquality: false,
    fragileThrows: false,
    fragileKey: 0,
    viewer1Mounted: true,
    viewer1Generation: 0,
};

function patch(next) {
    Object.assign(store, next);
    version++;
    for (const listener of [...listeners]) listener();
}

// --- live references the control surface reads ------------------------------

const live = {
    handle1: null,
    handle2: null,
    ref1: null,
    deepToggle: null,
    errors: [],
};

const stateIds = new WeakMap();
let nextStateId = 1;
function idOf(state) {
    if (!state) return null;
    if (!stateIds.has(state)) stateIds.set(state, nextStateId++);
    return stateIds.get(state);
}

/** Hoisted so its identity is stable: a projection re-created every render
 * would recompute every render, which would mask the cadence contrast below. */
const selectZoomThousandths = (state) =>
    state.rendererReady ? Math.round(state.viewportScale * 1000) : -1;

const selectCanvasId = (state) => state.canvasId ?? 'none';

export function captureError(error) {
    live.errors.push(String((error && error.message) || error));
}

// The ticket-08 consumer testing helper, imported from the SAME packed tarball
// with no Svelte, no viewer, no custom element and no network behind it.
const testHandle = createTestViewerHandle();

// --- components -------------------------------------------------------------

/** An ordinary React error boundary: the consumer's own error handling. */
class Boundary extends Component {
    constructor(props) {
        super(props);
        this.state = { message: null };
    }

    static getDerivedStateFromError(error) {
        return { message: String((error && error.message) || error) };
    }

    render() {
        return h(
            'div',
            null,
            h(
                'span',
                { 'data-testid': 'fragile-error' },
                this.state.message ?? 'ok',
            ),
            this.state.message
                ? h('span', { 'data-testid': 'fragile' }, 'gone')
                : this.props.children,
        );
    }
}

/** A projection the fixture can break on demand. */
function Fragile({ handle }) {
    const value = useViewerSelector(handle, (state) => {
        if (store.fragileThrows) {
            throw new Error('consumer projection failed');
        }
        return state.canvasId ?? 'none';
    });
    return h('span', { 'data-testid': 'fragile' }, String(value));
}

/** Deep in the tree, reading through `<ViewerProvider>` with no handle prop. */
function DeepLabel() {
    const canvasId = useViewerSelector((state) => state.canvasId ?? 'none');
    const viewer = useViewer();
    live.deepToggle = () => viewer?.toggleToolbar();
    return h('span', { 'data-testid': 'deep-canvas' }, String(canvasId));
}

/** Reads a real `ViewerState` built by `triiiceratops/testing` — no viewer. */
function KitReadout() {
    const canvasId = useViewerSelector(
        testHandle,
        (state) => state.canvasId ?? 'none',
    );
    return h('span', { 'data-testid': 'kit-canvas' }, String(canvasId));
}

/**
 * The gated readout lives OUTSIDE `<ViewerOne>`, as a sibling, deliberately: it
 * must re-render only for its own selector notification and for a store change,
 * so an equality gate that collapses a change is observable at all. A component
 * that re-renders for some other reason mints a new projection and starts with
 * a fresh cache — which is exactly the "an inline projection reads current
 * values" behaviour proved by `v1-dynamic` above.
 */
function GatedReadout({ handle }) {
    // Read CURRENT, with no `useMemo` and no `useCallback` on either input.
    const coarse = store.coarseEquality;
    const value = useViewerSelector(handle, selectCanvasId, {
        equals: (a, b) => (coarse ? true : Object.is(a, b)),
    });
    return h('span', { 'data-testid': 'v1-gated' }, String(value ?? 'none'));
}

function ViewerOne({ handle }) {
    const ref = useRef(null);
    live.ref1 = ref;

    const canvasId = useViewerSelector(
        handle,
        (state) => state.canvasId ?? 'none',
    );
    const toolbar = useViewerSelector(handle, (state) =>
        state.toolbarOpen ? 'open' : 'closed',
    );
    // `frame` cadence: per-frame viewport values are woken by the renderer's own
    // animation events, not by the batched state watcher.
    const zoom = useViewerSelector(handle, selectZoomThousandths, {
        cadence: 'frame',
    });
    // The SAME projection at the default `state` cadence, as the contrast: the
    // batched watcher is never woken by the renderer, so this readout must
    // stay frozen while the `frame` one above follows the zoom.
    const zoomAtStateCadence = useViewerSelector(handle, selectZoomThousandths);
    // An INLINE projection whose closure changes between renders, with no
    // `useCallback` and no `useMemo`.
    const seed = store.dynamicSeed;
    const dynamic = useViewerSelector(
        handle,
        (state) => seed + ':' + (state.canvasId ?? 'none'),
    );

    return h(
        'section',
        null,
        h(
            'div',
            { id: 'viewer-1-host' },
            h(TriiiceratopsViewer, {
                ref,
                handle,
                // Attribute tier.
                manifestId: F.MANIFEST_ID,
                canvasId: store.canvasProp,
                theme: store.theme,
                // Property tier, including the function-valued search provider
                // and a NEW plugin array on every render.
                manifestJson: F.MANIFEST_JSON,
                config: store.config,
                themeConfig: F.THEME_CONFIG,
                searchProvider: F.searchProvider,
                plugins: F.pluginList(),
                // Host attributes.
                id: F.HOST_ID_1,
                className: 'fixture-viewer',
                style: { display: 'block', width: '320px', height: '240px' },
                'data-fixture': 'primary',
                'aria-label': 'Primary fixture viewer',
                // Typed callbacks for every translated channel.
                onStateChange: (d) =>
                    onFrameworkEvent(F.HOST_ID_1, 'statechange', d),
                onCanvasChange: (d) =>
                    onFrameworkEvent(F.HOST_ID_1, 'canvaschange', d),
                onManifestChange: (d) =>
                    onFrameworkEvent(F.HOST_ID_1, 'manifestchange', d),
                onChoiceChange: (d) =>
                    onFrameworkEvent(F.HOST_ID_1, 'choicechange', d),
                onPluginError: (d) =>
                    onFrameworkEvent(F.HOST_ID_1, 'pluginerror', d),
                onViewerError: (d) =>
                    onFrameworkEvent(F.HOST_ID_1, 'viewererror', d),
            }),
        ),
        h('span', { 'data-testid': 'v1-canvas' }, String(canvasId)),
        h('span', { 'data-testid': 'v1-toolbar' }, String(toolbar)),
        h('span', { 'data-testid': 'v1-zoom' }, String(zoom)),
        h(
            'span',
            { 'data-testid': 'v1-zoom-state' },
            String(zoomAtStateCadence),
        ),
        h('span', { 'data-testid': 'v1-dynamic' }, String(dynamic)),
        h(ViewerProvider, { value: handle }, h(DeepLabel)),
        h(Boundary, { key: store.fragileKey }, h(Fragile, { handle })),
    );
}

function ViewerTwo() {
    const handle = useViewerHandle();
    live.handle2 = handle;

    const canvasId = useViewerSelector(
        handle,
        (state) => state.canvasId ?? 'none',
    );
    const toolbar = useViewerSelector(handle, (state) =>
        state.toolbarOpen ? 'open' : 'closed',
    );

    return h(
        'section',
        null,
        h(
            'div',
            { id: 'viewer-2-host' },
            h(TriiiceratopsViewer, {
                handle,
                manifestId: F.SECOND_MANIFEST_ID,
                theme: 'dark',
                config: F.CONFIG,
                id: F.HOST_ID_2,
                style: { display: 'block', width: '160px', height: '120px' },
                onStateChange: (d) =>
                    onFrameworkEvent(F.HOST_ID_2, 'statechange', d),
                onCanvasChange: (d) =>
                    onFrameworkEvent(F.HOST_ID_2, 'canvaschange', d),
                onManifestChange: (d) =>
                    onFrameworkEvent(F.HOST_ID_2, 'manifestchange', d),
                onChoiceChange: (d) =>
                    onFrameworkEvent(F.HOST_ID_2, 'choicechange', d),
                onPluginError: (d) =>
                    onFrameworkEvent(F.HOST_ID_2, 'pluginerror', d),
                onViewerError: (d) =>
                    onFrameworkEvent(F.HOST_ID_2, 'viewererror', d),
            }),
        ),
        h('span', { 'data-testid': 'v2-canvas' }, String(canvasId)),
        h('span', { 'data-testid': 'v2-toolbar' }, String(toolbar)),
    );
}

export function App() {
    useSyncExternalStore(subscribe, getVersion);
    // Viewer 1's handle is created HERE, above the viewer it is passed to, so
    // it survives the unmount/remount journey: a handle whose viewer unmounts
    // reverts to unbound and rebinds cleanly on remount.
    const handle1 = useViewerHandle();
    live.handle1 = handle1;
    return h(
        'main',
        null,
        store.viewer1Mounted
            ? h(ViewerOne, { handle: handle1, key: store.viewer1Generation })
            : null,
        h(GatedReadout, { handle: handle1 }),
        h(ViewerTwo),
        h(KitReadout),
    );
}

// --- the control surface Playwright drives ----------------------------------

function element(id) {
    return document.getElementById(id);
}

function probe() {
    const el1 = element(F.HOST_ID_1);
    const el2 = element(F.HOST_ID_2);
    const host1 = element('viewer-1-host');
    const ctor = window.customElements.get('triiiceratops-viewer');
    return {
        definedBeforeMount,
        elementDefined: !!ctor,
        sharedRegistration:
            !!el1 &&
            !!el2 &&
            el1.constructor === ctor &&
            el2.constructor === ctor,
        singleChildHost:
            !!host1 &&
            host1.children.length === 1 &&
            host1.firstElementChild === el1,
        attributeTier: el1 && {
            manifestId: el1.getAttribute('manifest-id'),
            canvasId: el1.getAttribute('canvas-id'),
            theme: el1.getAttribute('theme'),
        },
        hostAttributes: el1 && {
            class: el1.getAttribute('class'),
            style: el1.getAttribute('style'),
            id: el1.getAttribute('id'),
            data: el1.getAttribute('data-fixture'),
            aria: el1.getAttribute('aria-label'),
        },
        propertyTier: el1 && {
            manifestJson: el1.manifestJson === F.MANIFEST_JSON,
            config: el1.config === store.config,
            themeConfig: el1.themeConfig === F.THEME_CONFIG,
            searchProvider: el1.searchProvider === F.searchProvider,
            searchProviderType: typeof el1.searchProvider,
            plugins:
                Array.isArray(el1.plugins) &&
                el1.plugins.length === 2 &&
                el1.plugins[0] === F.stable.plugin,
        },
        stringifiedAttributes: el1
            ? [
                  'manifestjson',
                  'config',
                  'themeconfig',
                  'searchprovider',
                  'plugins',
                  'initialcanvasregion',
              ].filter((name) => el1.hasAttribute(name))
            : [],
        stateCanvasId: el1 && el1.viewerState ? el1.viewerState.canvasId : null,
        state2CanvasId:
            el2 && el2.viewerState ? el2.viewerState.canvasId : null,
    };
}

function describeHandle(handle, hostId) {
    if (!handle) return { bound: false };
    return {
        bound: true,
        elementId: handle.element.id,
        elementInDom: element(hostId) === handle.element,
        stateMatchesElement: handle.state === handle.element.viewerState,
        stateId: idOf(handle.state),
    };
}

function handleSnapshot() {
    const h1 = live.handle1 ? live.handle1.get() : null;
    const h2 = live.handle2 ? live.handle2.get() : null;
    const current = live.ref1 ? live.ref1.current : null;
    return {
        v1: describeHandle(h1, F.HOST_ID_1),
        v2: describeHandle(h2, F.HOST_ID_2),
        refMatchesHandle: !!current && current === h1,
        refIsNull: current === null,
        distinctStates: !!h1 && !!h2 && h1.state !== h2.state,
        distinctElements: !!h1 && !!h2 && h1.element !== h2.element,
    };
}

function state1() {
    const handle = live.handle1 ? live.handle1.get() : null;
    return handle ? handle.state : null;
}

export function installControls() {
    window.__tri = {
        framework: 'react',
        capabilities: { keepAlive: false },
        probe,
        events: snapshot,
        totals,
        pluginStats: F.pluginStats,
        handleSnapshot,
        capturedErrors: () => live.errors.slice(),

        navigate: (canvasId) => state1().setCanvas(canvasId),
        selectChoice: () => state1().selectChoice(F.CANVAS_1, 'choice-a'),
        toggleToolbar: (which) => {
            if (which === 2) {
                live.handle2.get().state.toggleToolbar();
                return;
            }
            // Through `useViewer()` in a deep, provider-resolved component.
            live.deepToggle();
        },
        rendererReady: () => !!(state1() && state1().rendererReady),
        zoomIn: () => {
            const state = state1();
            if (!state || !state.rendererReady) return false;
            state.zoomIn();
            return true;
        },

        setThemeProp: (value) => patch({ theme: value }),
        setCanvasProp: (value) => patch({ canvasProp: value }),
        setConflictConfig: () => patch({ config: F.CONFLICT_CONFIG }),
        rerenderEqual: () => patch({}),
        bumpDynamic: () => patch({ dynamicSeed: store.dynamicSeed + 1 }),
        setCoarseEquality: (value) => patch({ coarseEquality: value }),
        breakSelector: () => patch({ fragileThrows: true }),
        fixSelector: () =>
            patch({ fragileThrows: false, fragileKey: store.fragileKey + 1 }),

        retryPlugin: retryLastPlugin,
        unmountViewer1: () => patch({ viewer1Mounted: false }),
        remountViewer1: () =>
            patch({
                viewer1Mounted: true,
                viewer1Generation: store.viewer1Generation + 1,
            }),

        driveTestHandle: async () => {
            testHandle.state.setCanvas('kit/canvas-2');
            await flush();
        },
        keepAliveRoundTrip: async () => 'unsupported',
    };
}
