// GENERATED from apps/site/content/docs/plugin-pdf-export.json — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import { createPdfExportPlugin } from '@triiiceratops/plugin-pdf-export';

const pdfExportPlugin = createPdfExportPlugin({
    loadImageBlob: async ({ imageUrl }) => {
        const response = await fetch(
            `/api/pdf-image?url=${encodeURIComponent(imageUrl)}`,
        );
        if (!response.ok) {
            throw new Error('Unable to load image for PDF export.');
        }

        return response.blob();
    },
});
