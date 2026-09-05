// GENERATED from apps/site/content/docs/plugin-authoring.json — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import type { PluginContext } from 'triiiceratops';

function watchCanvas(context: PluginContext) {
    const canvas = context.selectors.select((s) => s.canvasId);
    const stop = canvas.subscribe((id) => {
        console.log('canvas changed to', id);
    });
    return stop; // unsubscribe
}
