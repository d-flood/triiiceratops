// GENERATED from docs/plugin-authoring.md — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import { whenRendererReady } from '@triiiceratops/plugin-sdk';
import type { PluginContext } from 'triiiceratops';

async function markCentre(context: PluginContext) {
    await whenRendererReady(context.viewerState);
    // The surface is sized, so this answers in real screen pixels.
    return context.viewerState.canvasToScreen({ x: 100, y: 200 });
}
