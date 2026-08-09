import type { SearchConfig } from './panels';

/**
 * One search result inside a {@link SearchResultGroup}.
 *
 * `before`, `match` and `after` are **plain text**, not markup. The viewer
 * renders them as text nodes, so a provider that returns HTML sees its tags as
 * visible characters rather than elements. The one exception is `<mark>`:
 * highlight it with `<mark>…</mark>` — literal or entity-encoded as
 * `&lt;mark&gt;…&lt;/mark&gt;` — and the viewer renders a real `<mark>` element
 * around the run. Nothing else is interpreted.
 */
export interface SearchHit {
    type: 'hit' | 'resource';
    /** Plain text preceding the match. `<mark>` delimiters are honoured. */
    before?: string;
    /** The matched text, as plain text. `<mark>` delimiters are honoured. */
    match: string;
    /** Plain text following the match. `<mark>` delimiters are honoured. */
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
