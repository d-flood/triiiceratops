import type { PluginDef } from '../../types/plugin';
import DownloadSimple from 'phosphor-svelte/lib/DownloadSimple';
import PdfExportController from './PdfExportController.svelte';
import type {
    PdfCanvasOcrOverlayProvider,
    PdfCoverSheetConfig,
    PdfImageLoader,
    PdfImageRequestConfig,
} from './exportPdf';

export type PdfExportConfig = {
    coverSheet?: PdfCoverSheetConfig;
    ocrAnnotationSource?: string;
    getCanvasOcrOverlays?: PdfCanvasOcrOverlayProvider;
    imageRequest?: PdfImageRequestConfig;
    loadImageBlob?: PdfImageLoader;
};

export function createPdfExportPlugin(config: PdfExportConfig = {}): PluginDef {
    return {
        id: 'pdf-export',
        name: 'PDF export',
        icon: DownloadSimple,
        panel: PdfExportController,
        position: 'left',
        props: { config },
    };
}

export const PdfExportPlugin: PluginDef = createPdfExportPlugin();

export { PdfExportController, DownloadSimple };
export type {
    PdfCanvasOcrOverlayProvider,
    PdfCoverSheetConfig,
    PdfCoverSheetField,
    PdfExportOcrProviderContext,
    PdfImageLoader,
    PdfImageLoaderParams,
    PdfImageRequestConfig,
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
