import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { coverage } from '../../vitest.coverage.js';

export default defineConfig({
    plugins: [svelte()],
    esbuild: {
        pure: ['console.log', 'console.debug'],
        drop: ['debugger'],
    },
    resolve: {
        // `triiiceratops` ships Svelte SOURCE, compiled here by this app's own
        // build. It would otherwise resolve its `svelte` peer inside its own
        // package directory, giving the page two copies of the runtime and two
        // rune registries.
        dedupe: ['svelte'],
        // Vitest resolves through Vite's SSR pipeline, which would hand the
        // specs Svelte's server build — where `mount()` throws.
        conditions: process.env.VITEST ? ['browser'] : undefined,
    },
    base: './', // Relative paths: the playground is published under a subpath.
    // The default `dist` here, not a staging directory inside `docs/`: the
    // publish job assembles the site's tree from each app's own output.
    test: {
        coverage,
        // `playgroundState` reads `sessionStorage` and base64-encodes with `btoa`.
        environment: 'jsdom',
        include: ['src/**/*.test.ts'],
    },
});
