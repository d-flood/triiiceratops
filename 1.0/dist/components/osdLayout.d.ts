export declare const MULTI_CANVAS_GAP = 0.0125;
export type ViewingMode = 'individuals' | 'paged' | 'continuous';
export type ViewingDirection = 'left-to-right' | 'right-to-left' | 'top-to-bottom' | 'bottom-to-top';
export interface PositionedTileSource {
    canvasId?: string;
    x?: number;
    y?: number;
    width?: number;
    tileSource?: unknown;
}
export interface CanvasDisplayLayout {
    canvasId: string;
    x: number;
    y: number;
    width: number;
    height: number;
}
export interface DisplayPositionedTileSource {
    tileSource: unknown;
    x: number;
    y: number;
    width: number;
    canvasId: string;
}
interface CanvasLayoutResult {
    sources: DisplayPositionedTileSource[];
    layouts: CanvasDisplayLayout[];
}
export declare function getCanvasDisplayLayouts(sources: unknown[], options: {
    mode: ViewingMode;
    direction: ViewingDirection;
    preserveCanvasScale?: boolean;
    gap: number;
}): CanvasLayoutResult;
export declare function getContinuousTargetPosition(indexOrCanvasId: number | string, layouts: CanvasDisplayLayout[], direction: ViewingDirection): number | null;
export {};
