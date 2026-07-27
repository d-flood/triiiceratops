// GENERATED from docs/plugin-testing.md — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import { createTestViewerContext, whenOsdReady } from '@triiiceratops/plugin-sdk/testing';

async function readinessExample() {
    const tc = createTestViewerContext();
    const ready = whenOsdReady(tc.viewerState);
    tc.setOsdViewer({ viewport: {} }); // your stub
    await ready;
}
