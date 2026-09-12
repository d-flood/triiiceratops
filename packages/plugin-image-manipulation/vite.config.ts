import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';

// Core's shared plugin packaging policy, by source path: it lives in
// `src/packaging`, which core neither publishes nor exports, so there is no
// package specifier to reach it by. It is monorepo build tooling, never shipped.
import { pluginBuild } from '../core/src/packaging/pluginBuild';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Build the image-manipulation plugin into a SELF-CONTAINED bundle for one
 * format.
 *
 * `BUILD_FORMAT=es`   → `dist/index.js` (the ESM entry consumers import).
 * `BUILD_FORMAT=iife` → `dist/iife.js`  (a `<script>`-loadable bundle that
 *                       registers into `window.Triiiceratops.plugins`).
 *
 * The terser pass, the global-CSS minification, the bundled Svelte runtime and
 * the peer externals are all `pluginBuild`'s; this package adds nothing to them.
 * What the CSS handling buys here in particular is that almost all of the
 * Flyout's look is Svelte-scoped CSS extracted by `bundledCss()`, and the small
 * remainder — the downward-flyout flip, keyed off the core-owned
 * `[data-flyout-panel]` ancestor a scoped rule cannot reach — is the global sheet
 * `src/flyout.css` that the build now minifies on its way into the bundle.
 */
export default defineConfig(
    pluginBuild({
        root: __dirname,
        name: 'tri-image-manipulation',
        globalName: 'TriiiceratopsPluginImageManipulation',
        entries: { index: 'src/index.ts' },
        iifeEntry: 'src/iife.ts',
    }),
);
