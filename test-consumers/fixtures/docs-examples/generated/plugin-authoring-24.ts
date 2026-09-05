// GENERATED from docs/plugin-authoring.md — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import { isUnsupportedCanvas, type PluginContext } from 'triiiceratops';

function claimMine(context: PluginContext) {
    const releases = context.viewerState.canvases
        .filter((canvas) => isUnsupportedCanvas(canvas))
        .map((canvas) =>
            context.viewerState.claimCanvas(
                canvas.id ?? canvas['@id'],
                // The id the viewer knows this plugin by — never a literal.
                context.surface.id,
            ),
        );

    return () => releases.forEach((release) => release());
}
