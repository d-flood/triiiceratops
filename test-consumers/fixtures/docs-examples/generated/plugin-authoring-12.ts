// GENERATED from docs/plugin-authoring.md — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import { getPaintingAnnotations } from 'triiiceratops';
import { getCanvasId, resolveAllCanvasImages } from 'triiiceratops/image-export';
import type { PluginContext } from 'triiiceratops';

function imagesOnCurrentCanvas(context: PluginContext) {
    const { viewerState } = context;
    const canvas = viewerState.canvases.find(
        (c: any) => getCanvasId(c) === viewerState.canvasId,
    );

    // Annotation-level view: what the manifest says paints this canvas.
    const painting = getPaintingAnnotations(canvas);
    // A v2 annotation carries its image under `resource`, a v3 one under `body`.

    // Or go straight to resolved image URLs, Choices included.
    return resolveAllCanvasImages(canvas);
}
