import { type ResolvedCanvasImage } from './resolveCanvasImage';
export type ExportSizeOption = {
    width: number;
    height: number;
    label: string;
    url?: string;
};
export type ComposeImageEntry = {
    blob: Blob;
    x: number;
    y: number;
    width: number;
    height: number;
};
export declare function getCompositeImagePlacement(image: ResolvedCanvasImage, canvasWidth: number, canvasHeight: number, scale: number): {
    x: number;
    y: number;
    width: number;
    height: number;
};
export declare function downloadBlob(blob: Blob, filename: string): void;
export declare function fetchImageBlob(url: string, requestInit?: RequestInit): Promise<Blob>;
/**
 * Draws pre-fetched image blobs onto a single offscreen canvas at their
 * given pixel rects and re-encodes the result as one blob. Shared by
 * pdf-export's per-page rasterization and the image-download plugin's
 * composite-canvas/current-world modes.
 */
export declare function composeImages(entries: ComposeImageEntry[], canvasWidth: number, canvasHeight: number, format?: 'image/png' | 'image/jpeg'): Promise<Blob>;
/**
 * Scales width/height down (preserving aspect ratio) so neither dimension
 * nor total area exceeds what browsers reliably allow for a 2D canvas.
 */
export declare function clampCompositeSize(width: number, height: number): {
    width: number;
    height: number;
    clamped: boolean;
};
/**
 * Builds the export request URL for a single resolved image at an optional
 * target pixel size. Level0 services can only be requested at their native
 * size (or one of the fixed sizes surfaced by `resolveExportSizeOptions`),
 * so any explicit width/height is ignored for them.
 */
export declare function getResolvedImageExportUrl(resolved: ResolvedCanvasImage, options?: {
    width?: number;
    height?: number;
}): string | null;
export declare const EXPORT_RESOLUTION_PRESETS: {
    fraction: number;
    label: string;
}[];
/**
 * Builds a small "Original / 50% / 25%" ladder of pixel dimensions from a
 * native width/height. Shared by the single-image preset resolver below and
 * by the image-download plugin's composite/current-world size pickers,
 * which have no single canonical request URL to attach per option.
 */
export declare function buildRelativeSizeOptions(nativeWidth: number, nativeHeight: number, getUrl?: (size: {
    width: number;
    height: number;
    isOriginal: boolean;
}) => string | null | undefined): ExportSizeOption[];
/**
 * Lists the resolutions a single resolved image can be requested/downloaded
 * at. Level0 IIIF services only support a fixed list of pre-rendered sizes
 * (from `info.json`), so those are enumerated exactly; other services get a
 * small set of relative presets built from their native dimensions.
 */
export declare function resolveExportSizeOptions(resolved: ResolvedCanvasImage): Promise<ExportSizeOption[]>;
