// GENERATED from docs/integration-svelte.md — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import { ImageManipulationPlugin } from '@triiiceratops/plugin-image-manipulation';
import { createPdfExportPlugin } from '@triiiceratops/plugin-pdf-export';

const pdfExport = createPdfExportPlugin({
    coverSheet: { title: 'Export', fields: [] },
});

// <TriiiceratopsViewer manifestId="..." plugins={[ImageManipulationPlugin, pdfExport]} />
const plugins = [ImageManipulationPlugin, pdfExport];
