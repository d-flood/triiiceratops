// GENERATED from docs/plugin-authoring.md — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import type { PluginContext } from 'triiiceratops';

function filmstrip(context: PluginContext, height: number) {
    const { viewerState } = context;

    viewerState.setViewportInset({ bottom: height });
    // Setting it does not move the image. Ask for the re-frame yourself, if you
    // want one — most of the time you do not, because the reader may have zoomed
    // in deliberately and being yanked back to the whole page is a surprise.
    viewerState.fitCanvas();

    return () => {
        viewerState.resetViewportInset();
        viewerState.fitCanvas();
    };
}
