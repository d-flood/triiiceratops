// GENERATED from docs/plugin-testing.md — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import {
    createTestViewerContext,
    whenRendererReady,
} from '@triiiceratops/plugin-sdk/testing';

async function readinessExample() {
    const tc = createTestViewerContext();
    const ready = whenRendererReady(tc.viewerState);
    const renderer = tc.attachRenderer({ scale: 2 }); // sized surface
    await ready;

    // Move the viewport and fire one animation event, synchronously.
    renderer.setView({ scale: 4 });
    renderer.emitFrame();

    // And read what a command sent to the renderer.
    tc.viewerState.zoomIn();
    return renderer.calls;
}
