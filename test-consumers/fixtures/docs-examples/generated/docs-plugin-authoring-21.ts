// GENERATED from apps/site/content/docs/plugin-authoring.json — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import type { PluginContext } from 'triiiceratops';

function watchTaps(context: PluginContext, onCanvasPoint: (point: { x: number; y: number }) => void) {
    // Returns an idempotent unsubscribe; a listener survives a renderer remount.
    return context.viewerState.subscribeSurfaceTap((point) => {
        const canvasPoint = context.viewerState.screenToCanvas(point);
        if (canvasPoint) onCanvasPoint(canvasPoint);
    });
}
