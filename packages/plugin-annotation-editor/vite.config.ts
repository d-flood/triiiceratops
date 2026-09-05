import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { svelte } from '@sveltejs/vite-plugin-svelte';
import { bundledCss } from '@triiiceratops/ui/vite';
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
 * with core. `svelte/internal` is private, unversioned API, and this plugin is
 * released independently of core, so a consumer can pair any plugin version with any
 * core version — a shared runtime would break on the first version skew.
 * `emitCss: false` keeps component CSS in the JS; the Annotorious stylesheet and
 * the plugin's own CSS install through the SDK style service, so the built output
 * ships no stylesheet.
 *
 * ESM externalizes the declared peers AND the heavy runtime dependencies
 * (`@annotorious/*`, `openseadragon`) so a consumer's bundler resolves and dedupes
 * them from the plugin's own `dependencies`; the IIFE bundles everything so the
 * `<script>`-loadable file is fully self-contained: a script-tag consumer has no
 * bundler to resolve peers with, so nothing may be left external.
 */
const format = process.env.BUILD_FORMAT === 'iife' ? 'iife' : 'es';

const esExternal = [
    '@triiiceratops/plugin-sdk',
    'triiiceratops',
    '@annotorious/annotorious',
    '@annotorious/openseadragon',
    'openseadragon',
    // The `/testing` entry imports vitest; leave it for the consumer's test
    // runner rather than bundling it into the shipped kit.
    'vitest',
];

export default defineConfig({
    plugins: [
        // `emitCss: true` + `bundledCss()` extract the (Svelte-scoped) component
        // CSS into the `virtual:tri-bundled-css` module instead of Svelte's
        // un-nonced `append_styles` injection, so the plugin installs it through
        // the nonce-aware SDK style service and `@triiiceratops/ui` components
        // (and this plugin's own) keep idiomatic `<style>` blocks under strict
        // CSP. The Annotorious stylesheet stays a `?inline` string import
        // installed separately, so `bundledCss()` never touches it. See
        // `@triiiceratops/ui/vite`.
        svelte({
            emitCss: true,
            compilerOptions: { customElement: false },
        }),
        bundledCss(),
    ],
    build: {
        // Lowering private fields leaks helpers outside Vite's generated IIFE.
        target: 'es2022',
        // Production build so no dev-only `svelte/internal` strings leak into the
        // bundle (the dist is grepped for `svelte/internal` — it must be absent;
        // plugins share no Svelte runtime with core).
        minify: true,
        // One extracted CSS asset (bundledCss concatenates + strips it) rather
        // than a per-entry split across the index/testing entries.
        cssCodeSplit: false,
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
