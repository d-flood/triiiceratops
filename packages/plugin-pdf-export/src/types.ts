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

/**
 * Consumer-facing configuration for the PDF export plugin. This is the same
 * public shape the core `triiiceratops/plugins/pdf-export` subpath exposed
 * (ticket 16 moved it here unchanged), so `createPdfExportPlugin(config)` keeps
 * its factory-with-config authoring contract.
 */
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

/** The current start/end selection reported through `onSelectionChange`. */
export type PdfExportSelection = {
    startIndex: number | null;
    endIndex: number | null;
    startCanvas: any | null;
    endCanvas: any | null;
};

export type PdfExportSelectionChangeHandler = (
    selection: PdfExportSelection,
) => void;
