// GENERATED from apps/site/content/docs/programmatic.json — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import type { ViewerState } from 'triiiceratops';

declare const state: ViewerState;

// Step through the manifest, or jump to a canvas by id.
state.nextCanvas();
state.setCanvas('https://example.org/iiif/canvas/p3');

// Open the annotations panel if it is closed.
if (!state.showAnnotations) state.toggleAnnotations();

// Frame a detail of the current canvas, in canvas coordinates.
state.fitBounds({ x: 1200, y: 800, width: 600, height: 400 });

// Open a different manifest at a chosen canvas.
void state.setManifest('https://example.org/iiif/other/manifest.json', {
    canvasId: 'https://example.org/iiif/other/canvas/1',
});
