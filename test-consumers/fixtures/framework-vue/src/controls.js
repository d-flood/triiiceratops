// The in-page control surface Playwright drives. Identical in shape to the
// React fixture's, so both fixtures run the SAME journey.

import { nextTick } from 'vue';

import * as F from './fixtures.js';
import { retryLastPlugin, snapshot, totals } from './events.js';
import {
    configRef,
    definedBeforeMount,
    driveTestHandle,
    live,
    store,
} from './store.js';

const stateIds = new WeakMap();
let nextStateId = 1;
function idOf(state) {
    if (!state) return null;
    if (!stateIds.has(state)) stateIds.set(state, nextStateId++);
    return stateIds.get(state);
}

function element(id) {
    return document.getElementById(id);
}

function instance(box) {
    return box && box.value ? box.value : null;
}

function state1() {
    const viewer = instance(live.viewer1);
    return viewer ? (viewer.state ?? null) : null;
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
            config: el1.config === configRef.value,
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

function describeHandle(viewer, hostId) {
    if (!viewer || !viewer.element || !viewer.state) return { bound: false };
    return {
        bound: true,
        elementId: viewer.element.id,
        elementInDom: element(hostId) === viewer.element,
        stateMatchesElement: viewer.state === viewer.element.viewerState,
        stateId: idOf(viewer.state),
    };
}

function handleSnapshot() {
    const v1 = instance(live.viewer1);
    const v2 = instance(live.viewer2);
    return {
        v1: describeHandle(v1, F.HOST_ID_1),
        v2: describeHandle(v2, F.HOST_ID_2),
        refMatchesHandle: null,
        refIsNull: v1 === null,
        distinctStates: !!(
            v1 &&
            v2 &&
            v1.state &&
            v2.state &&
            v1.state !== v2.state
        ),
        distinctElements: !!(v1 && v2 && v1.element !== v2.element),
    };
}

function waitFor(predicate, timeout = 20_000) {
    const deadline = Date.now() + timeout;
    return new Promise((resolve) => {
        const tick = () => {
            let ok = false;
            try {
                ok = !!predicate();
            } catch {
                ok = false;
            }
            if (ok) return resolve(true);
            if (Date.now() > deadline) return resolve(false);
            setTimeout(tick, 50);
        };
        tick();
    });
}

export function installControls() {
    window.__tri = {
        framework: 'vue',
        capabilities: { keepAlive: true },
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
                instance(live.viewer2).state.toggleToolbar();
                return;
            }
            // Through `useViewer()` in a deep, provideViewer-resolved component.
            live.deepToggle();
        },
        rendererReady: () => !!(state1() && state1().rendererReady),
        zoomIn: () => {
            const state = state1();
            if (!state || !state.rendererReady) return false;
            state.zoomIn();
            return true;
        },

        setThemeProp: (value) => {
            store.theme = value;
        },
        setCanvasProp: (value) => {
            store.canvasProp = value;
        },
        setConflictConfig: () => {
            configRef.value = F.CONFLICT_CONFIG;
        },
        // Vue re-evaluates a component's render only when a dependency changes,
        // so "re-render with an equal plugin list" is driven by touching a
        // dependency the root template reads while every viewer input — and in
        // particular the freshly-built plugin array — stays equal.
        rerenderEqual: () => {
            store.renderTick += 1;
        },
        bumpDynamic: () => {
            store.dynamicSeed += 1;
        },
        setCoarseEquality: (value) => {
            store.coarseEquality = value;
        },
        breakSelector: () => {
            store.fragileThrows = true;
        },
        fixSelector: () => {
            store.fragileThrows = false;
            store.fragileKey += 1;
        },

        retryPlugin: retryLastPlugin,
        unmountViewer1: () => {
            store.viewer1Mounted = false;
        },
        remountViewer1: () => {
            store.viewer1Mounted = true;
        },

        driveTestHandle,

        /**
         * A `<KeepAlive>` round trip: deactivation detaches the element long
         * enough for the custom element to destroy its inner viewer, and
         * reactivation publishes a brand-new `ViewerState` the composables must
         * rewire to.
         */
        keepAliveRoundTrip: async () => {
            const before = state1();
            store.keepAliveActive = false;
            await nextTick();
            const deactivated = !element(F.HOST_ID_1);
            store.keepAliveActive = true;
            await nextTick();
            const rebound = await waitFor(() => {
                const now = state1();
                return !!now && now !== before;
            });
            return { deactivated, rebound };
        },
    };
}
