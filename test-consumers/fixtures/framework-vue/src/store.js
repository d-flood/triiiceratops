// Fixture application state plus live references for the Playwright control surface.

import { nextTick, reactive, shallowRef } from 'vue';
import { createTestViewerHandle, flush } from 'triiiceratops/testing';

import * as F from './fixtures.js';

// `true` here means an entry point registered the element as an import side effect; registration must be lazy.
export const definedBeforeMount = !!(
    globalThis.customElements &&
    globalThis.customElements.get('triiiceratops-viewer')
);

/** Primitive-only, so the viewer never receives a reactive proxy. */
export const store = reactive({
    theme: 'light',
    canvasProp: F.CANVAS_1,
    dynamicSeed: 0,
    coarseEquality: false,
    fragileThrows: false,
    fragileKey: 0,
    viewer1Mounted: true,
    keepAliveActive: true,
    // Forces a parent re-render while every viewer input stays equal.
    renderTick: 0,
});

/** `shallowRef`: a deep `ref` would hand the wrapper a reactive proxy, breaking identity. */
export const configRef = shallowRef(F.CONFIG);

/** The consumer testing helper, from the same packed tarball. */
export const testHandle = createTestViewerHandle();
// `shallowRef` for the same reason as `configRef` above (documented Vue usage).
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
