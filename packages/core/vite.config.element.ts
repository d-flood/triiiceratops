import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { paraglideVitePlugin } from '@inlang/paraglide-js';

import { rendererFlagDefine } from './rendererFlag.build';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    // Never copy demo dev-server static assets into the published dist.
    publicDir: false,
    // Pin the development-only renderer flag to a literal so the unselected
    // renderer is tree-shaken out of this artifact entirely (spec §Rollout).
    define: rendererFlagDefine(),
    plugins: [
        svelte({
            configFile: false,
            // Keep scoped component CSS in the JS bundle (injected at runtime via
            // Svelte's append_styles, which targets getRootNode() — i.e. the
            // custom element's shadow root) instead of extracting it to a
            // light-DOM stylesheet that never reaches the shadow DOM.
            emitCss: false,
            // `customElement: true` only turns components that declare
            // `<svelte:options customElement>` into custom elements (just
            // TriiiceratopsViewerElement here); all other components compile as
            // normal Svelte components.
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
        // Lowering private fields leaks helpers outside Vite's generated IIFE.
        target: 'es2022',
        minify: true,
        lib: {
            entry: resolve(__dirname, 'src/lib/custom-element.ts'),
            name: 'TriiiceratopsElement',
            formats: ['iife'],
            fileName: () => 'triiiceratops-element.iife.js',
        },
        rollupOptions: {
            output: {
                // Produce a single file with no chunks
                inlineDynamicImports: true,
                assetFileNames: 'triiiceratops-element.[ext]',
            },
        },
        outDir: 'dist',
        emptyOutDir: false, // Don't clear dist (lib build runs first)
        cssCodeSplit: false, // Output single CSS file (though CSS is inlined in shadow DOM)
    },
});
