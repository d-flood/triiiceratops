export type CanvasRegion = {
    x: number;
    y: number;
    width: number;
    height: number;
};
export type ContentStateTarget = {
    manifestId: string;
    canvasId?: string;
    region?: CanvasRegion;
};
export declare function parseContentState(value: string): ContentStateTarget | null;
