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
    /**
     * The active manifest as **raw IIIF Manifest JSON** — v2 or v3 as the
     * publisher authored it.
     *
     * Renamed from `manifest`, which handed out a `manifesto.js` object. The
     * name changed with the value on purpose: keeping `manifest` would have
     * left an identical name and an identical `any` type over a completely
     * different object, which no compiler, linter or API report can see.
     */
    manifestJson: any;
    /** The active sequence's canvases, as raw IIIF Canvas JSON. */
    canvases: any[];
    canvasId: string | null;
}

export type SearchProvider = (
    query: string,
    context: SearchProviderContext,
) => Promise<SearchResultGroup[]>;

export type { SearchConfig };
