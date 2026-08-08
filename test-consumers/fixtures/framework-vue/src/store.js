// The fixture's own application state, plus the live references the Playwright
// control surface reads. Kept out of the single-file components so the control
// surface is one plain module.

import { nextTick, reactive, shallowRef } from 'vue';
import { createTestViewerHandle, flush } from 'triiiceratops/testing';

import * as F from './fixtures.js';

// Every static import above has been evaluated by the time this runs, so a
// `true` here would mean an entry point registered the element as an import
// side effect. Registration must be lazy, and triggered by a mounted wrapper.
export const definedBeforeMount = !!(
    globalThis.customElements &&
    globalThis.customElements.get('triiiceratops-viewer')
);

/** Primitive-only, so nothing handed to the viewer is ever a reactive proxy. */
export const store = reactive({
    theme: 'light',
    canvasProp: F.CANVAS_1,
    dynamicSeed: 0,
    coarseEquality: false,
    fragileThrows: false,
    fragileKey: 0,
    viewer1Mounted: true,
    keepAliveActive: true,
    // Read by the root template purely so the fixture can force a parent
    // re-render while every viewer input stays equal.
    renderTick: 0,
});

/**
 * `shallowRef`, NOT `ref`: a deep `ref` would hand the wrapper a reactive PROXY
 * of the config object, and the property tier's identity comparisons would stop
 * holding.
 */
export const configRef = shallowRef(F.CONFIG);

/** The ticket-08 consumer testing helper, from the same packed tarball. */
export const testHandle = createTestViewerHandle();
// `shallowRef` for the same reason (ticket 08's documented Vue usage).
export const testHandleRef = shallowRef(testHandle);

export const live = {
    viewer1: null,
    viewer2: null,
    deepToggle: null,
    errors: [],
};

export function captureError(error) {
    live.errors.push(String((error && error.message) || error));
}

/** Hoisted so their identity is stable across re-renders. */
export const selectCanvasId = (state) => state.canvasId ?? 'none';
export const selectZoomThousandths = (state) =>
    state.rendererReady ? Math.round(state.viewportScale * 1000) : -1;

export async function driveTestHandle() {
    testHandle.state.setCanvas('kit/canvas-2');
    await flush();
    await nextTick();
}
