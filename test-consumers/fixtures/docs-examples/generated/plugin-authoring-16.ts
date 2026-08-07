// GENERATED from docs/plugin-authoring.md — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import { whenOsdReady } from '@triiiceratops/plugin-sdk';
import type { PluginContext } from 'triiiceratops';

async function fitToViewport(context: PluginContext) {
    const osd = await whenOsdReady(context.viewerState);
    osd.viewport.goHome();
}
