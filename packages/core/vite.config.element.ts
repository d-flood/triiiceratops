import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

import { cssTarget, lightningcss } from './src/packaging/cssTargets';
import dropLightDomOnly from './src/packaging/dropLightDomOnly';
import { noCustomElementGuard } from './src/packaging/elementCompileOptions';
import {
    elementCssHash,
    elementStylesheet,
} from './src/packaging/elementStylesheet';
import { svelteRuntimeTrims } from './src/packaging/svelteRuntimeTrims';
import { terserElementBuilds } from './src/packaging/terserElement';

const __dirname = dirname(fileURLToPath(import.meta.url));

const compilerOptions = {
    customElement: false,
    cssHash: elementCssHash(resolve(__dirname, '../..')),
};

export default defineConfig({
    // Never copy demo dev-server static assets into the published dist.
    publicDir: false,
    plugins: [
        svelte({
            configFile: false,
            // Extracted component CSS never reaches the light DOM:
            // `elementStylesheet` joins it into the shadow root's one sheet.
            emitCss: true,
            // No component is a custom element; see elementCompileOptions.ts.
            compilerOptions,
        }),
        noCustomElementGuard(),
        elementStylesheet(),
        svelteRuntimeTrims(compilerOptions),
        // Second minification pass, over what esbuild writes. Deliberately not
        // `build.minify: 'terser'`: replacing esbuild rather than following it
        // measures thousands of gzip bytes worse. `'iife'` keeps terser in
        // script semantics — Vite's IIFE wrapper is not a module, so the
        // module-only licences the ESM config takes are unsound here. See
        // src/packaging/terserElement.ts.
        terserElementBuilds('iife'),
    ],
    esbuild: {
        pure: ['console.log', 'console.debug'],
        drop: ['debugger'],
    },
    css: {
        // `app.css?inline` goes into the shadow root, which never holds the
        // elements the marked reset rules target. Registered here and in
        // vite.config.element-esm.ts ONLY; every other build — the demo
        // documents and the published light-DOM sheet — gets the sheets whole.
        postcss: { plugins: [dropLightDomOnly()] },
        lightningcss,
    },
    build: {
        // Lowering private fields leaks helpers outside Vite's generated IIFE.
        // The browser floor is Chrome 111+, Firefox 113+, Safari 16.4+, which
        // `oklch` and `color-mix` need; see src/packaging/cssTargets.ts.
        target: 'es2022',
        minify: true,
        cssMinify: 'lightningcss',
        cssTarget,
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
