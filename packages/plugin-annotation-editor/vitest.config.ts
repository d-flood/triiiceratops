import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

// The tests mount the plugin's Svelte components into a jsdom container and drive
// the real Store/Manager domain machinery, so the Svelte compiler plugin is
// required and the browser condition is selected. `@triiiceratops/plugin-sdk/testing`
// (and, through it, `triiiceratops/testing`) resolve from their built dists —
// build the workspace before running (`pnpm build:all`).
export default defineConfig({
    plugins: [svelte()],
    resolve: { conditions: ['browser'] },
    test: {
        environment: 'jsdom',
        include: ['src/**/*.test.ts'],
        globals: false,
        // The plugin's `styles.ts` imports the Annotorious stylesheet with Vite's
        // `?inline` query (the single CSS source, F23). Inline the package so
        // vitest runs it through Vite's CSS transform (yielding the string)
        // instead of externalizing the raw `.css` to Node's ESM loader.
        server: {
            deps: {
                inline: ['@annotorious/openseadragon'],
            },
        },
    },
});
