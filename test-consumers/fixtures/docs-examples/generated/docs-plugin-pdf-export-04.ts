// GENERATED from apps/site/content/docs/plugin-pdf-export.json — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import { createPdfExportPlugin } from '@triiiceratops/plugin-pdf-export';

const plugin = createPdfExportPlugin({
    imageRequest: {
        credentials: 'include',
        mode: 'cors',
        headers: {
            Authorization: 'Bearer <token>',
        },
    },
});
