export type IiifTargetBounds = [number, number, number, number];
export type NormalizedIiifTarget = {
    raw: unknown;
    targetId: string | null;
    canvasId: string | null;
    selectors: any[];
    xywh: IiifTargetBounds | null;
};
export declare function parseIiifXywh(value: string): IiifTargetBounds | null;
export declare function getIiifCanvasId(targetId: string): string | null;
export declare function extractIiifTargetId(target: unknown): string | null;
export declare function normalizeIiifTargets(target: unknown): NormalizedIiifTarget[];
