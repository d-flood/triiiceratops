// GENERATED from apps/site/content/docs/plugin-authoring.json — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import type { PluginContext } from 'triiiceratops';

function example(context: PluginContext) {
    const { viewerState } = context;

    // Read directly.
    const canvasId: string | null = viewerState.canvasId;
    void canvasId;

    // Mutate through commands.
    viewerState.nextCanvas();
    viewerState.toggleAnnotations();
}
