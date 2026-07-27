import { createPanelPlugin, type PluginDef } from '../../types/plugin';
import FilePdf from 'phosphor-svelte/lib/FilePdf';
import PdfExportController from './PdfExportController.svelte';
import type {
    PdfCanvasOcrOverlayProvider,
    PdfCoverSheetConfig,
    PdfExportFilenameProvider,
    PdfImageLoader,
    PdfImageRequestConfig,
    PdfOcrPlacementMode,
    PdfOcrSizingMode,
    PdfOcrVisibilityMode,
} from './exportPdf';

export type PdfExportConfig = {
    coverSheet?: PdfCoverSheetConfig;
    filename?: string;
    getFilename?: PdfExportFilenameProvider;
    ocrAnnotationSource?: string;
    getCanvasOcrOverlays?: PdfCanvasOcrOverlayProvider;
    imageRequest?: PdfImageRequestConfig;
    loadImageBlob?: PdfImageLoader;
    ocrPlacementMode?: PdfOcrPlacementMode;
    ocrSizingMode?: PdfOcrSizingMode;
    ocrVisibilityMode?: PdfOcrVisibilityMode;
    onSelectionChange?: PdfExportSelectionChangeHandler;
};

export type PdfExportSelection = {
    startIndex: number | null;
    endIndex: number | null;
    startCanvas: any | null;
    endCanvas: any | null;
};

export type PdfExportSelectionChangeHandler = (
    selection: PdfExportSelection,
) => void;

export function createPdfExportPlugin(config: PdfExportConfig = {}): PluginDef {
    return createPanelPlugin({
        id: 'pdf-export',
        name: 'pdf_export_title',
        icon: FilePdf,
        panel: PdfExportController,
        position: 'left',
        props: { config },
    });
}

export const PdfExportPlugin: PluginDef = createPdfExportPlugin();

export { PdfExportController, FilePdf };
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
