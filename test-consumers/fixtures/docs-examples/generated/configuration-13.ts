// GENERATED from docs/configuration.md — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import { TriiiceratopsViewer, type SearchProvider } from 'triiiceratops/vue';

const searchProvider: SearchProvider = async (query) => [
    {
        canvasIndex: 0,
        canvasLabel: 'Page 1',
        hits: [{ type: 'hit', before: '', match: query, after: '' }],
    },
];
