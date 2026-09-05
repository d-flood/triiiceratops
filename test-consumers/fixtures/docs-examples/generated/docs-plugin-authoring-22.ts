// GENERATED from apps/site/content/docs/plugin-authoring.json — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import type { PaintFrame, PluginContext } from 'triiiceratops';

function markRegion(context: PluginContext, canvasId: string) {
    return context.viewerState.registerPaintLayer({
        id: 'my-plugin:region',
        order: 10,
        draw: (ctx: CanvasRenderingContext2D, frame: PaintFrame) => {
            // The region in the Canvas's own coordinates — as an annotation
            // stores it — mapped into the space the context is in.
            const box = frame.canvasBoxToWorld(
                { x: 100, y: 200, width: 300, height: 400 },
                canvasId,
            );
            if (!box) return; // that canvas is not on screen this frame

            ctx.strokeStyle = 'red';
            ctx.lineWidth = 2 / frame.transform.scale; // 2 device px, any zoom
            ctx.strokeRect(box.x, box.y, box.width, box.height);
        },
    });
}
