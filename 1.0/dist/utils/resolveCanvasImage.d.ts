import { getCanvasLabel } from './canvasLabels';
import { getCanvasId } from './iiifIds';
export type TileSource = string | {
    type: 'image';
    url: string;
};
export type RegionRect = {
    x: number;
    y: number;
    width: number;
    height: number;
};
export type PositionedTileSource = {
    canvasId: string;
    tileSource: TileSource;
    x: number;
    y: number;
    width: number;
};
type ResolveCanvasImageOptions = {
    getSelectedChoice?: (canvasId: string) => string | undefined;
};
type GetViewerTileSourcesParams = {
    canvases: any[];
    currentCanvasIndex: number;
    currentCanvasId: string | null;
    viewingMode: 'individuals' | 'paged' | 'continuous';
    pagedOffset: number;
    getSelectedChoice?: (canvasId: string) => string | undefined;
};
export type ResolvedCanvasImage = {
    canvasId: string;
    annotation: any;
    resource: any;
    resourceId: string | null;
    /** Human-readable label from the annotation body or annotation itself, if present. */
    label: string | null;
    canvasWidth: number;
    canvasHeight: number;
    resourceWidth: number | null;
    resourceHeight: number | null;
    serviceId: string | null;
    serviceProfile: string | null;
    imageApiRegion: RegionRect | null;
    x: number;
    y: number;
    width: number;
};
export declare function getRegionString(region: RegionRect): string;
export { getCanvasLabel, getCanvasId };
export declare function resolveCanvasImage(canvas: any, options?: ResolveCanvasImageOptions): ResolvedCanvasImage | null;
export declare function resolveAllCanvasImages(canvas: any, options?: ResolveCanvasImageOptions): ResolvedCanvasImage[];
export declare function getCanvasTileSource(canvas: any, options?: ResolveCanvasImageOptions): TileSource | null;
export declare function getCanvasTileSources(canvas: any, options?: ResolveCanvasImageOptions): PositionedTileSource[];
export declare function buildIiifImageRequestUrl(serviceId: string, options?: {
    region?: string;
    size?: string;
    width?: number;
    height?: number;
    quality?: string;
    format?: string;
}): string;
export declare function getViewerTileSources({ canvases, currentCanvasIndex, currentCanvasId, viewingMode, pagedOffset, getSelectedChoice, }: GetViewerTileSourcesParams): PositionedTileSource[] | null;
