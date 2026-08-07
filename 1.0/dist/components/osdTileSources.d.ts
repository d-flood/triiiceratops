export type TileSourceResolutionResult = {
    ok: true;
    resolved: any[];
} | {
    ok: false;
    error: {
        type: 'auth';
    };
};
type ResolveTileSourcesParams = {
    sources: any[];
    osd?: any;
    viewport?: {
        width: number;
        height: number;
    };
};
export declare function isIiifLevel0Profile(profile: unknown): boolean;
export declare function createIiifTileSource(osd: any, data: any, url: string, viewport?: {
    width: number;
    height: number;
}): any;
export declare function getFullImageUrlForLevel(tileSource: any, level: number): string;
export declare function resolveTileSources(params: ResolveTileSourcesParams): Promise<TileSourceResolutionResult>;
export {};
