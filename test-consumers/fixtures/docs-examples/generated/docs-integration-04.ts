// GENERATED from apps/site/content/docs/integration.json — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import 'triiiceratops/element/register';
import type { SearchProvider, TriiiceratopsViewerElement } from 'triiiceratops';

const el = document.querySelector<TriiiceratopsViewerElement>(
    'triiiceratops-viewer',
)!;

const searchProvider: SearchProvider = async (query, context) => [
    {
        canvasIndex: 0,
        canvasLabel: context.canvasId ?? 'Page 1',
        hits: [{ type: 'hit', match: query }],
    },
];

el.searchProvider = searchProvider;
