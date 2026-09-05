// GENERATED from apps/site/content/docs/plugin-authoring.json — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import type { PluginContext, ViewportPoint } from 'triiiceratops';

function panToVisibleCentre(context: PluginContext, target: ViewportPoint) {
    const { viewportInset: inset, viewportScale: scale } = context.viewerState;
    if (!scale) return; // no sized surface yet

    context.viewerState.panTo({
        x: target.x - (inset.left - inset.right) / 2 / scale,
        y: target.y - (inset.top - inset.bottom) / 2 / scale,
    });
}
