import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

import { coverage } from '../../vitest.coverage.js';

// The conformance test mounts the plugin's Svelte flyout into a jsdom container,
// so the Svelte compiler plugin is required and the browser condition is
// selected. `@triiiceratops/plugin-sdk/testing` (and, through it,
// `triiiceratops/testing`) resolve from their built dists — build the workspace
// before running (`pnpm build:all`), exactly as the SDK's own tests require.
export default defineConfig({
    plugins: [svelte()],
    resolve: { conditions: ['browser'] },
    test: {
        coverage,
        environment: 'jsdom',
        include: ['src/**/*.test.ts'],
        globals: false,
    },
});
