import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

import { wrapperCustomElementGuard } from './src/packaging/elementCompileOptions';
import { messageCompiler } from './src/packaging/messageCompiler';
import { minifyCssPreprocessor } from './src/packaging/minifyCss';
import { terserElementBuilds } from './src/packaging/terserElement';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Upgrades the wrapper AND fails the build if the wrapper was never found.
const customElementGuard = wrapperCustomElementGuard();

// Standards-based ESM registration entry for the Web Component, for bundler
// consumers. Behavior is identical to the self-contained IIFE
// (vite.config.element.ts): same compiler options (scoped CSS inlined into the
// shadow root, only the wrapper upgraded to a custom element), same self-styled
// shadow DOM, same single self-contained artifact — only the module format and
// the entry (element.ts, without the legacy globals) differ.
export default defineConfig({
    // Never copy demo dev-server static assets into the published dist.
    publicDir: false,
    plugins: [
        svelte({
            configFile: false,
            preprocess: [minifyCssPreprocessor()],
            emitCss: false,
            // Only the wrapper gets custom-element codegen; see
            // elementCompileOptions.ts for why a global flag is wrong.
            compilerOptions: { customElement: false },
            dynamicCompileOptions: customElementGuard.dynamicCompileOptions,
        }),
        customElementGuard.plugin,
        messageCompiler(),
        // The same second pass the IIFE gets, from the same module, so the two
        // artifacts cannot be minified to different settings.
        terserElementBuilds(),
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
