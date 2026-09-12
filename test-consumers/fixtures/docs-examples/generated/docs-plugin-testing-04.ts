// GENERATED from apps/site/content/docs/plugin-testing.json — do not edit by hand.
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

    // Tap the image surface at a screen-space point — the gesture reserved for
    // annotation selection — without synthesizing pointer events.
    renderer.emitTap({ x: 120, y: 80 });

    // And read what a command sent to the renderer.
    tc.viewerState.zoomIn();
    return renderer.calls;
}
