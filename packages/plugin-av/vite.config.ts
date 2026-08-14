import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { svelte } from '@sveltejs/vite-plugin-svelte';
import { bundledCss } from '@triiiceratops/ui/vite';
import { defineConfig } from 'vite';

import { sharedRuntimeGateSource } from './src/sharedRuntimeGate';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Build the plugin for one output format.
 *
 * `BUILD_FORMAT=es`   → `dist/index.js`  (the ESM entry consumers import).
 * `BUILD_FORMAT=iife` → `dist/iife.js`   (a `<script>`-loadable bundle that
 *                       registers into `window.Triiiceratops.plugins`).
 *
 * ## The deliberate deviation: Svelte is NOT bundled
 *
 * Every other first-party plugin bundles its own Svelte runtime, and its vite
 * config says why: a plugin released independently of core can be paired with
 * any core version, and `svelte/internal` is private, unversioned API that would
 * break on the first skew. That reasoning is correct and must stay in those
 * packages — and for third-party plugins, which the authoring docs go on telling
 * to bundle.
 *
 * This plugin is the exception, and it is bought rather than assumed. The public
 * bundle-size comparison measures `triiiceratops-element.iife.js` against
 * viewers that already support audio and video; a Svelte plugin that ships its
 * own runtime spends about half the remaining headroom on bytes no reader can
 * see (13.24 KB gzip → 1.51 KB gzip for a representative transport). So the IIFE
 * externalizes `svelte` and `svelte/internal/client` onto the globals core
 * exposes on the `window.Triiiceratops` namespace it already owns. The privilege
 * rests on core and plugin being built and released from ONE repo at ONE Svelte
 * version — which is why `coreRange` is pinned to an exact version, and why the
 * script order is core-then-plugin. Neither is left to convention: the
 * `shared-svelte-runtime` capability refuses activation on a core that shares no
 * runtime, and `output.intro` below refuses to evaluate this bundle at all
 * against a core that is absent or shares a runtime it cannot use.
 *
 * The ESM half needs no globals and no special pleading: `svelte` is left
 * external as an ordinary peer, which a consumer's bundler dedupes against
 * core's copy exactly as it dedupes any other shared dependency.
 */
const format = process.env.BUILD_FORMAT === 'iife' ? 'iife' : 'es';

const lib =
    format === 'iife'
        ? {
              entry: resolve(__dirname, 'src/iife.ts'),
              formats: ['iife' as const],
              name: 'TriiiceratopsPluginAv',
              fileName: () => 'iife.js',
          }
        : {
              entry: resolve(__dirname, 'src/index.ts'),
              formats: ['es' as const],
              fileName: () => 'index.js',
          };

// Both formats keep Svelte external. The ESM build additionally externalizes the
// declared peers for the consumer's bundler to resolve; the IIFE bundles them,
// because a script-tag consumer has no bundler to resolve anything with — and
// the SDK is framework-neutral, so bundling it pulls in no second runtime.
const SVELTE = /^svelte(\/|$)/;
const external =
    format === 'iife'
        ? [SVELTE]
        : [SVELTE, /^@triiiceratops\/plugin-sdk(\/|$)/, /^triiiceratops(\/|$)/];

/**
 * Where each externalized Svelte module is read from at runtime in the IIFE.
 *
 * Optional-chained rather than bare: an IIFE's arguments are evaluated before
 * its body, so `Triiiceratops.svelteInternal` on a page with no core throws a
 * bare `ReferenceError` before the skew gate in `output.intro` can run and say
 * what actually went wrong. `?.` yields `undefined` instead, and the gate then
 * returns without registering.
 *
 * `svelte/internal/disclose-version` is a side-effect-only module the DEV
 * compiler emits to register the runtime version for devtools; a production
 * build emits no import of it. It is mapped anyway so a stray import cannot turn
 * into a bare unresolved global.
 */
const globals = {
    svelte: 'window.Triiiceratops?.svelte',
    'svelte/internal/client': 'window.Triiiceratops?.svelteInternal',
    'svelte/internal/disclose-version': 'window.Triiiceratops?.svelte',
};

export default defineConfig({
    plugins: [
        // `emitCss: true` extracts each component's (still Svelte-scoped) CSS
        // through Vite's CSS pipeline instead of Svelte's runtime `append_styles`
        // injection — which would append an un-nonced `<style>` to the document
        // head and be blocked under a strict `style-src` CSP. `bundledCss()`
        // collects that extracted CSS into the `virtual:tri-bundled-css` module
        // and strips the stray `.css` asset, so the entry can install it through
        // the root-aware, nonce-aware SDK style service.
        svelte({
            emitCss: true,
            compilerOptions: { customElement: false },
        }),
        bundledCss(),
    ],
    build: {
        // Lowering private fields leaks helpers outside Vite's generated IIFE.
        target: 'es2022',
        // Production build: no dev-only `svelte/internal` strings or warnings.
        minify: true,
        // One extracted CSS asset (bundledCss concatenates + strips it).
        cssCodeSplit: false,
        lib,
        rollupOptions: {
            external,
            output: {
                globals,
                inlineDynamicImports: true,
                // Only the IIFE reads core's runtime off a global, so only it
                // needs the gate. `intro` is the one hook that lands inside the
                // generated function and ahead of every module statement, which
                // is what lets the gate `return` before a compiled component
                // dereferences a helper that is not there — see
                // src/sharedRuntimeGate.ts.
                ...(format === 'iife'
                    ? { intro: sharedRuntimeGateSource() }
                    : {}),
            },
        },
        outDir: 'dist',
        emptyOutDir: false,
    },
});
