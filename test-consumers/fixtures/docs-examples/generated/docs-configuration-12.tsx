// GENERATED from apps/site/content/docs/configuration.json — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import { TriiiceratopsViewer } from 'triiiceratops/react';
import type { SearchProvider } from 'triiiceratops/react';

const searchProvider: SearchProvider = async (query) => [
    {
        canvasIndex: 0,
        canvasLabel: 'Page 1',
        hits: [{ type: 'hit', before: '', match: query, after: '' }],
    },
];

export function Reader() {
    return (
        <TriiiceratopsViewer
            manifestId="urn:example:manifest"
            searchProvider={searchProvider}
            style={{ display: 'block', height: '600px' }}
        />
    );
}
