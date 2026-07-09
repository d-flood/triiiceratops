import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dist = (p: string) => resolve(__dirname, 'dist', p);

/*
 * Builds the /svelte/ demo (docs/svelte) — a real Svelte-package CONSUMER.
 *
 * The `triiiceratops*` aliases below point at the BUILT `dist/` outputs, so the
 * demo imports the package exactly as an external app resolving it from
 * node_modules would (including `triiiceratops/style.css`). Run AFTER build:lib
 * so `dist/` exists. `configFile: false` mimics a clean consumer without this
 * repo's svelte.config.js; the dist `.svelte` files are already preprocessed by
 * svelte-package, so no preprocessing is needed here.
 */
export default defineConfig({
    plugins: [svelte({ configFile: false })],
    resolve: {
        alias: [
            { find: 'triiiceratops/style.css', replacement: dist('triiiceratops.css') },
            {
                find: 'triiiceratops/plugins/image-manipulation',
                replacement: dist('plugins/image-manipulation/index.js'),
            },
            {
                find: 'triiiceratops/plugins/annotation-editor',
                replacement: dist('plugins/annotation-editor/index.js'),
            },
            {
                find: 'triiiceratops/plugins/pdf-export',
                replacement: dist('plugins/pdf-export/index.js'),
            },
            {
                find: 'triiiceratops/plugins/image-download',
                replacement: dist('plugins/image-download/index.js'),
            },
            { find: /^triiiceratops$/, replacement: dist('index.js') },
        ],
    },
    root: 'src/demo-svelte',
    base: './', // Relative paths for GitHub Pages
    build: {
        outDir: resolve(__dirname, 'docs/svelte'),
        emptyOutDir: true,
    },
    publicDir: resolve(__dirname, 'public'),
});
