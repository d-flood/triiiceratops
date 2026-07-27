import type { SearchConfig } from './panels';

export interface SearchHit {
    type: 'hit' | 'resource';
    before?: string;
    match: string;
    after?: string;
    bounds?: number[] | null;
    allBounds?: number[][];
}

export interface SearchResultGroup {
    canvasIndex: number;
    canvasLabel: string;
    hits: SearchHit[];
}

export interface SearchProviderContext {
    manifestId: string;
    manifest: any;
    canvases: any[];
    canvasId: string | null;
}

export type SearchProvider = (
    query: string,
    context: SearchProviderContext,
) => Promise<SearchResultGroup[]>;

export type { SearchConfig };
