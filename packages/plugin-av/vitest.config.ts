import { svelte } from '@sveltejs/vite-plugin-svelte';
import { bundledCss } from '@triiiceratops/ui/vite';
import { defineConfig } from 'vitest/config';

import { coverage } from '../../vitest.coverage.js';

// The activation tests mount the plugin's Svelte panel into a jsdom container
// and drive real media elements, so the Svelte compiler plugin is required and
// the browser condition is selected. `@triiiceratops/plugin-sdk/testing` (and,
// through it, `triiiceratops/testing`) resolve from their built dists — build
// the workspace before running (`pnpm build:all`), exactly as the SDK's own
// tests require.
export default defineConfig({
    // `bundledCss()` resolves the `virtual:tri-bundled-css` module the plugin
    // entry imports (to an empty string under vitest — tests don't need the
    // build-extracted CSS).
    plugins: [svelte(), bundledCss()],
    resolve: { conditions: ['browser'] },
    test: {
        coverage,
        environment: 'jsdom',
        include: ['src/**/*.test.ts'],
        globals: false,
    },
});
