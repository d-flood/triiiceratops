import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

import { coverage } from '../../vitest.coverage.js';

// The primitive component tests mount Svelte components into a jsdom container,
// so the Svelte compiler plugin is required and the browser condition is
// selected — the same setup the first-party plugin packages use.
export default defineConfig({
    plugins: [svelte()],
    resolve: { conditions: ['browser'] },
    test: {
        coverage,
        environment: 'jsdom',
        include: ['src/**/*.test.ts', 'src/**/*.svelte.test.ts'],
        globals: false,
    },
});
