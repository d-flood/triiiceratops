// GENERATED from apps/site/content/docs/plugin-pdf-export.json — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import { createPdfExportPlugin } from '@triiiceratops/plugin-pdf-export';

const pdfExportPlugin = createPdfExportPlugin({
    coverSheet: {
        title: 'Export Summary',
        fields: [{ label: 'Collection', value: 'Example collection' }],
    },
});

viewer.plugins = [pdfExportPlugin];
