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
 * with core. `svelte/internal` is private, unversioned API, and this plugin is
 * released independently of core, so a consumer can pair any plugin version with any
 * core version — a shared runtime would break on the first version skew. `emitCss: true` + `bundledCss()`
 * EXTRACT each component's (Svelte-scoped) CSS through Vite's CSS pipeline instead
 * of Svelte's runtime `append_styles` injection (which would append an un-nonced
 * `<style>` to the document head, blocked under a strict `style-src` CSP).
 * `bundledCss()` (from `@triiiceratops/ui/vite`) collects that extracted CSS into
 * the `virtual:tri-bundled-css` module and strips the stray `.css` asset, so the
 * plugin's entry installs it through the root-aware, nonce-aware SDK style service
 * and keeps shipping a single self-contained JS with no stylesheet. This is what
 * lets the Flyout and the `@triiiceratops/ui` Range/Tooltip primitives use
 * idiomatic `<style>` blocks while staying CSP-safe.
 *
 * The two formats differ only in how the peer packages are treated:
 * - ESM (`index.js`): `@triiiceratops/plugin-sdk` and `triiiceratops` stay
 *   external (declared peers a consumer's bundler resolves and dedupes) — the
 *   SDK is framework-neutral and carries no `svelte/internal`, so this keeps the
 *   grep clean while honoring the peer contract.
 * - IIFE (`iife.js`): everything is bundled so the `<script>`-loadable file is
 *   fully self-contained: a script-tag consumer has no bundler to resolve peers
 *   with, so nothing may be left external.
 */
const format = process.env.BUILD_FORMAT === 'iife' ? 'iife' : 'es';

const lib =
    format === 'iife'
        ? {
              entry: resolve(__dirname, 'src/iife.ts'),
              formats: ['iife' as const],
              name: 'TriiiceratopsPluginImageManipulation',
              fileName: () => 'iife.js',
          }
        : {
              entry: resolve(__dirname, 'src/index.ts'),
              formats: ['es' as const],
              fileName: () => 'index.js',
          };

// Externalize the declared peers for ESM only; bundle them for the IIFE.
const external =
    format === 'iife' ? [] : ['@triiiceratops/plugin-sdk', 'triiiceratops'];

export default defineConfig({
    plugins: [
        svelte({
            emitCss: true,
            compilerOptions: { customElement: false },
        }),
        bundledCss(),
    ],
    build: {
        // Lowering private fields leaks helpers outside Vite's generated IIFE.
        target: 'es2022',
        // Production build so no dev-only `svelte/internal` strings or warnings
        // leak into the bundle (the dist is grepped for `svelte/internal` — it
        // must be absent; plugins share no Svelte runtime with core).
        minify: true,
        // One extracted CSS asset (bundledCss concatenates + strips it), so the
        // whole bundle's component CSS is installed through the style service.
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
