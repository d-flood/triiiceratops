/**
 * `@triiiceratops/plugin-pdf-export` — ESM entry.
 *
 * Import the plugin factory and activate it explicitly on a viewer. The
 * factory-with-config API is preserved from the RC core subpath:
 *
 * ```ts
 * import {
 *     PdfExportPlugin,
 *     createPdfExportPlugin,
 * } from '@triiiceratops/plugin-pdf-export';
 *
 * // Preconfigured:
 * // Svelte:  <TriiiceratopsViewer plugins={[PdfExportPlugin]} />
 * // WC:      viewer.plugins = [PdfExportPlugin];
 *
 * // With consumer config (cover sheet, filename provider, OCR overlays, …):
 * const plugin = createPdfExportPlugin({ coverSheet: { fields: [...] } });
 * ```
 */

export { createPdfExportPlugin, PdfExportPlugin } from './plugin';

export type {
    PdfExportConfig,
    PdfExportSelection,
    PdfExportSelectionChangeHandler,
} from './types';

export type {
    PdfCanvasOcrOverlayProvider,
    PdfCoverSheetConfig,
    PdfCoverSheetField,
    PdfExportFilenameProvider,
    PdfExportFilenameProviderContext,
    PdfExportOcrProviderContext,
    PdfImageLoader,
    PdfImageLoaderParams,
    PdfImageRequestConfig,
    PdfOcrPlacementMode,
    PdfOcrSizingMode,
    PdfOcrVisibilityMode,
    PdfTextOverlay,
} from './exportPdf';
export {
    buildCoverSheetFields,
    buildImageRequestInit,
    buildPdfFilename,
    extractOcrTextOverlays,
    exportCanvasRangeAsPdf,
    normalizeCanvasRange,
} from './exportPdf';
