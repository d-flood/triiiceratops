// GENERATED from apps/site/content/docs/plugin-pdf-export.json — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import { createPdfExportPlugin } from '@triiiceratops/plugin-pdf-export';

const pdfExportPlugin = createPdfExportPlugin({
    getFilename: ({ manifestLabel, startIndex, endIndex, defaultFilename }) =>
        manifestLabel
            ? `${manifestLabel}-${startIndex + 1}-${endIndex + 1}.pdf`
            : defaultFilename,
    coverSheet: {
        title: 'Digitization Summary',
        fields: [
            { label: 'Repository', value: 'Example Library' },
            { label: 'Call Number', value: 'MS 123' },
        ],
    },
    ocrAnnotationSource: 'https://example.org/canvas/1/ocr',
    async getCanvasOcrOverlays({ canvasId }) {
        const response = await fetch(
            `/api/ocr-overlays?canvas=${encodeURIComponent(canvasId)}`,
        );
        if (!response.ok) {
            return [];
        }

        const overlays = await response.json();

        return overlays.map((overlay: Record<string, unknown>) => ({
            ...overlay,
            // Use 'image' when your OCR API returns coordinates in the
            // selected source image's pixel space instead of canvas pixels.
            coordinateSpace: 'image',
        }));
    },
    imageRequest: {
        credentials: 'same-origin',
    },
    onSelectionChange({ startCanvas, endCanvas, startIndex, endIndex }) {
        console.log('Selected PDF export range', {
            startCanvas,
            endCanvas,
            startIndex,
            endIndex,
        });
    },
});
