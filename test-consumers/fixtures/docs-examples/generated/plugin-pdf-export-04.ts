// GENERATED from docs/plugin-pdf-export.md — do not edit by hand.
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
