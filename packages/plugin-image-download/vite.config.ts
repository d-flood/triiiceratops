import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { svelte } from '@sveltejs/vite-plugin-svelte';
import { bundledCss } from '@triiiceratops/ui/vite';
import { defineConfig } from 'vite';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Build the plugin into a SELF-CONTAINED bundle for one output format.
 *
 * `BUILD_FORMAT=es`   → `dist/index.js`  (the ESM entry consumers import).
 * `BUILD_FORMAT=iife` → `dist/iife.js`   (a `<script>`-loadable bundle that
 *                       registers into `window.Triiiceratops.plugins`).
 *
 * The UI is Svelte, but Svelte is BUNDLED IN (not externalized to a global) in
 * BOTH formats so the plugin shares neither a Svelte runtime nor `svelte/internal`
 * with core (SPEC.md — "Core and browser plugins do not share a Svelte runtime
 * or import private `svelte/internal` modules"). `emitCss: false` keeps any
 * component CSS in the JS; this plugin installs its styles through the SDK style
 * service, so the built output ships no stylesheet.
 *
 * The two formats differ only in how the peer packages are treated:
 * - ESM (`index.js`): `@triiiceratops/plugin-sdk` and `triiiceratops` (including
 *   the `triiiceratops/image-export` seam this plugin's export helpers consume)
 *   stay external — declared peers a consumer's bundler resolves and dedupes.
 *   The seam is a framework-neutral cluster of pure IIIF/canvas helpers carrying
 *   no `svelte/internal`, so this keeps the grep clean while honoring the peer
 *   contract.
 * - IIFE (`iife.js`): everything is bundled — including `triiiceratops/image-export`
 *   — so the `<script>`-loadable file is fully self-contained (SPEC.md —
 *   "self-contained no-bundler IIFE").
 */
const format = process.env.BUILD_FORMAT === 'iife' ? 'iife' : 'es';

const lib =
    format === 'iife'
        ? {
              entry: resolve(__dirname, 'src/iife.ts'),
              formats: ['iife' as const],
              name: 'TriiiceratopsPluginImageDownload',
              fileName: () => 'iife.js',
          }
        : {
              entry: resolve(__dirname, 'src/index.ts'),
              formats: ['es' as const],
              fileName: () => 'index.js',
          };

// Externalize the declared peers (and their subpaths, e.g.
// `triiiceratops/image-export`) for ESM only; bundle them for the IIFE.
const external =
    format === 'iife'
        ? []
        : [/^@triiiceratops\/plugin-sdk(\/.*)?$/, /^triiiceratops(\/.*)?$/];

export default defineConfig({
    plugins: [
        // `emitCss: true` + `bundledCss()` extract the (Svelte-scoped) component
        // CSS into the `virtual:tri-bundled-css` module instead of Svelte's
        // un-nonced `append_styles` injection, so the plugin installs it through
        // the nonce-aware SDK style service and `@triiiceratops/ui` components
        // (and this plugin's own) keep idiomatic `<style>` blocks under strict
        // CSP. See `@triiiceratops/ui/vite`.
        svelte({
            emitCss: true,
            compilerOptions: { customElement: false },
        }),
        bundledCss(),
    ],
    build: {
        // Production build so no dev-only `svelte/internal` strings or warnings
        // leak into the bundle (the dist is grepped for `svelte/internal` — it
        // must be absent; plugins share no Svelte runtime with core).
        minify: true,
        // One extracted CSS asset (bundledCss concatenates + strips it).
        cssCodeSplit: false,
        lib,
        rollupOptions: {
            external,
            output: { inlineDynamicImports: true },
        },
        outDir: 'dist',
        emptyOutDir: false,
    },
});
