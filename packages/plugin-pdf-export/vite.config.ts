import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';

// Core's shared plugin packaging policy, by source path: it lives in
// `src/packaging`, which core neither publishes nor exports, so there is no
// package specifier to reach it by. It is monorepo build tooling, never shipped.
import { pluginBuild } from '../core/src/packaging/pluginBuild';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Build the PDF-export plugin into a SELF-CONTAINED bundle for one format.
 *
 * `BUILD_FORMAT=es`   → `dist/index.js` (the ESM entry consumers import).
 * `BUILD_FORMAT=iife` → `dist/iife.js`  (a `<script>`-loadable bundle that
 *                       registers into `window.Triiiceratops.plugins`).
 *
 * The terser pass, the global-CSS minification, the bundled Svelte runtime and
 * the peer externals are all `pluginBuild`'s; what is specific to this package
 * is `pdf-lib`.
 *
 * `pdf-lib` is declared in THIS package's `dependencies` — it left core's graph
 * — so it is installed alongside the plugin and the ESM entry leaves it external
 * for the consumer's bundler to resolve exactly as it resolves the peers. A
 * core-only install therefore never pays for it. The IIFE bundles it, like
 * everything else, because a `<script>`-tag consumer has no bundler to resolve
 * it with.
 */
export default defineConfig(
    pluginBuild({
        root: __dirname,
        name: 'tri-pdf-export',
        globalName: 'TriiiceratopsPluginPdfExport',
        entries: { index: 'src/index.ts' },
        iifeEntry: 'src/iife.ts',
        extraExternal: ['pdf-lib'],
    }),
);
