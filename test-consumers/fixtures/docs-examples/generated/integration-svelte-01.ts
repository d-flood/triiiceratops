// GENERATED from docs/integration-svelte.md — do not edit by hand.
// Regenerate with: node scripts/docs-examples.mjs
import type { SearchProvider } from 'triiiceratops';

// A SearchProvider is a function: (query, context) => Promise<SearchResultGroup[]>.
const searchProvider: SearchProvider = async (query, _context) => {
    // Return grouped hits from your own data source.
    return [];
};
