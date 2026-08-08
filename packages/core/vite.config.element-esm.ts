import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { paraglideVitePlugin } from '@inlang/paraglide-js';

import { rendererFlagDefine } from './rendererFlag.build';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Standards-based ESM registration entry for the Web Component, for bundler
// consumers (ticket 10). Behavior is identical to the self-contained IIFE
// (vite.config.element.ts): same compiler options (scoped CSS inlined into the
// shadow root, only the wrapper upgraded to a custom element), same self-styled
// shadow DOM, same single self-contained artifact — only the module format and
// the entry (element.ts, without the legacy globals) differ.
export default defineConfig({
    // Never copy demo dev-server static assets into the published dist.
    publicDir: false,
    // Pin the development-only renderer flag to a literal so the unselected
    // renderer is tree-shaken out of this artifact entirely (spec §Rollout).
    define: rendererFlagDefine(),
    plugins: [
        svelte({
            configFile: false,
            emitCss: false,
            compilerOptions: { customElement: true },
        }),
        paraglideVitePlugin({
            project: './project.inlang',
            outdir: './src/lib/paraglide',
        }),
    ],
    esbuild: {
        pure: ['console.log', 'console.debug'],
        drop: ['debugger'],
    },
    build: {
        minify: true,
        lib: {
            entry: resolve(__dirname, 'src/lib/element.ts'),
            formats: ['es'],
            fileName: () => 'triiiceratops-element.js',
        },
        rollupOptions: {
            output: {
                // Single self-contained file with no chunks.
                inlineDynamicImports: true,
                assetFileNames: 'triiiceratops-element.[ext]',
            },
        },
        outDir: 'dist',
        emptyOutDir: false, // Don't clear dist (lib build runs first).
        cssCodeSplit: false, // CSS is inlined into the shadow DOM.
    },
});
