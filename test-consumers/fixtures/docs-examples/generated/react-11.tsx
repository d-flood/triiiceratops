// GENERATED from docs/react.md — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import { TriiiceratopsViewer } from 'triiiceratops/react';
import type { SearchProvider } from 'triiiceratops/react';

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

export function Reader() {
    return (
        <TriiiceratopsViewer
            manifestId="https://example.org/manifest.json"
            searchProvider={searchProvider}
            style={{ display: 'block', height: '600px' }}
        />
    );
}
