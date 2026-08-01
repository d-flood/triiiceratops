// GENERATED from docs/vue.md — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import { TriiiceratopsViewer, type SearchProvider } from 'triiiceratops/vue';

interface IndexHit {
    canvasIndex: number;
    label: string;
    match: string;
}

const searchProvider: SearchProvider = async (query, context) => {
    const response = await fetch(
        `/api/search?q=${encodeURIComponent(query)}` +
            `&manifest=${encodeURIComponent(context.manifestId)}`,
    );
    const found: IndexHit[] = await response.json();
    return found.map((hit) => ({
        canvasIndex: hit.canvasIndex,
        canvasLabel: hit.label,
        hits: [{ type: 'hit', match: hit.match }],
    }));
};
