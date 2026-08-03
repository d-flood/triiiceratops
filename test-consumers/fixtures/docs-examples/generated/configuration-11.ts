// GENERATED from docs/configuration.md — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import 'triiiceratops/element/register';
import type { SearchProvider, TriiiceratopsViewerElement } from 'triiiceratops';

const el = document.querySelector<TriiiceratopsViewerElement>(
    'triiiceratops-viewer',
)!;

const searchProvider: SearchProvider = async (query) => [
    {
        canvasIndex: 0,
        canvasLabel: 'Page 1',
        hits: [{ type: 'hit', before: '', match: query, after: '' }],
    },
];

el.searchProvider = searchProvider;
