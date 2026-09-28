import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Only the Svelte example builds; the others load the IIFE by relative path.
// `dist/` mirrors the published site subtree; the doubled `dist/dist` is the URL path their script tags resolve against.
export default defineConfig({
    plugins: [svelte()],
    resolve: {
        dedupe: ['svelte'],
    },
    root: resolve(__dirname, 'src/svelte'),
    base: './',
    build: {
        outDir: resolve(__dirname, 'dist/examples/svelte'),
        emptyOutDir: true,
    },
});
