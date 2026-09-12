import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';

// Core's shared plugin packaging policy, by source path: it lives in
// `src/packaging`, which core neither publishes nor exports, so there is no
// package specifier to reach it by. It is monorepo build tooling, never shipped.
import { pluginBuild } from '../core/src/packaging/pluginBuild';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Build the annotation-editor plugin into a self-contained bundle per format.
 *
 * `BUILD_FORMAT=es`   → `dist/index.js` (the ESM entry) + `dist/testing/index.js`
 *                       (the adapter-conformance kit subpath).
 * `BUILD_FORMAT=iife` → `dist/iife.js` (a `<script>`-loadable bundle that
 *                       registers into `window.Triiiceratops.plugins`).
 *
 * Everything about the terser pass, the global-CSS minification, the bundled
 * Svelte runtime and the peer externals is `pluginBuild`'s; what is specific to
 * this package is the two-entry ESM build and `vitest`.
 *
 * The `/testing` entry imports vitest, which is left external so it resolves
 * from the consumer's own test runner rather than being bundled into the shipped
 * kit. It is the only entry that reaches it, and the IIFE does not ship it at
 * all.
 */
export default defineConfig(
    pluginBuild({
        root: __dirname,
        name: 'tri-annotation-editor',
        globalName: 'TriiiceratopsPluginAnnotationEditor',
        entries: {
            index: 'src/index.ts',
            'testing/index': 'src/testing/index.ts',
        },
        iifeEntry: 'src/iife.ts',
        extraExternal: ['vitest'],
    }),
);
