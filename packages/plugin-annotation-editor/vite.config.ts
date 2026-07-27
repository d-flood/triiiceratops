import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Build the annotation-editor plugin into a self-contained bundle per format.
 *
 * `BUILD_FORMAT=es`   → `dist/index.js` (the ESM entry) + `dist/testing/index.js`
 *                       (the adapter-conformance kit subpath).
 * `BUILD_FORMAT=iife` → `dist/iife.js` (a `<script>`-loadable bundle that
 *                       registers into `window.Triiiceratops.plugins`).
 *
 * The UI is Svelte, but Svelte is BUNDLED IN (not externalized to a global) in
 * BOTH formats so the plugin shares neither a Svelte runtime nor `svelte/internal`
 * with core (SPEC.md — "Core and browser plugins do not share a Svelte runtime").
 * `emitCss: false` keeps component CSS in the JS; the Annotorious stylesheet and
 * the plugin's own CSS install through the SDK style service, so the built output
 * ships no stylesheet.
 *
 * ESM externalizes the declared peers AND the heavy runtime dependencies
 * (`@annotorious/*`, `openseadragon`) so a consumer's bundler resolves and dedupes
 * them from the plugin's own `dependencies`; the IIFE bundles everything so the
 * `<script>`-loadable file is fully self-contained (SPEC.md — "self-contained
 * no-bundler IIFE").
 */
const format = process.env.BUILD_FORMAT === 'iife' ? 'iife' : 'es';

const esExternal = [
    '@triiiceratops/plugin-sdk',
    'triiiceratops',
    '@annotorious/annotorious',
    '@annotorious/openseadragon',
    '@annotorious/openseadragon/annotorious-openseadragon.css?inline',
    'openseadragon',
    // The `/testing` entry imports vitest; leave it for the consumer's test
    // runner rather than bundling it into the shipped kit.
    'vitest',
];

export default defineConfig({
    plugins: [
        svelte({
            emitCss: false,
            compilerOptions: { customElement: false },
        }),
    ],
    build: {
        // Production build so no dev-only `svelte/internal` strings leak into the
        // bundle (the dist is grepped for `svelte/internal` — it must be absent;
        // plugins share no Svelte runtime with core).
        minify: true,
        lib:
            format === 'iife'
                ? {
                      entry: resolve(__dirname, 'src/iife.ts'),
                      formats: ['iife' as const],
                      name: 'TriiiceratopsPluginAnnotationEditor',
                      fileName: () => 'iife.js',
                  }
                : {
                      entry: {
                          index: resolve(__dirname, 'src/index.ts'),
                          'testing/index': resolve(
                              __dirname,
                              'src/testing/index.ts',
                          ),
                      },
                      formats: ['es' as const],
                  },
        rollupOptions:
            format === 'iife'
                ? {
                      external: [],
                      output: { inlineDynamicImports: true },
                  }
                : {
                      external: esExternal,
                      output: {
                          entryFileNames: '[name].js',
                          chunkFileNames: 'chunks/[name]-[hash].js',
                      },
                  },
        outDir: 'dist',
        emptyOutDir: false,
    },
});
