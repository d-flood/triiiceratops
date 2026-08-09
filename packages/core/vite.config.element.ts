import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { paraglideVitePlugin } from '@inlang/paraglide-js';

import { elementOnlyCustomElement } from './src/packaging/elementCompileOptions';
import { minifyCssPreprocessor } from './src/packaging/minifyCss';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    // Never copy demo dev-server static assets into the published dist.
    publicDir: false,
    plugins: [
        svelte({
            configFile: false,
            // Scoped component CSS ends up in JS string literals (see
            // `emitCss: false` below), which never pass through Vite's CSS
            // pipeline — so nothing else in this build would ever minify it.
            // Registered here and in vite.config.element-esm.ts ONLY; the
            // svelte-package path keeps shipping readable, commented CSS.
            preprocess: [minifyCssPreprocessor()],
            // Keep scoped component CSS in the JS bundle (injected at runtime via
            // Svelte's append_styles, which targets getRootNode() — i.e. the
            // custom element's shadow root) instead of extracting it to a
            // light-DOM stylesheet that never reaches the shadow DOM.
            emitCss: false,
            // Upgrade ONLY the wrapper. A global `customElement: true` does not
            // limit itself to components declaring `<svelte:options
            // customElement>` — it puts every component through custom-element
            // codegen, which emits a wrapper class and the accompanying
            // `custom_element_props_identifier` warnings for components that
            // will never be registered. `svelte.config.js` gets this right with
            // the same `dynamicCompileOptions`; this build cannot read that file
            // (see `configFile: false` above), so it repeats the rule.
            compilerOptions: { customElement: false },
            dynamicCompileOptions: elementOnlyCustomElement,
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
