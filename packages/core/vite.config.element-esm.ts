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

// Standards-based ESM registration entry for the Web Component, for bundler
// consumers. Behavior is identical to the self-contained IIFE
// (vite.config.element.ts): same compiler options (scoped CSS inlined into the
// shadow root, no component compiled as a custom element), same self-styled
// shadow DOM, same single self-contained artifact — only the module format and
// the entry (element.ts, without the legacy globals) differ.
export default defineConfig({
    // Never copy demo dev-server static assets into the published dist.
    publicDir: false,
    plugins: [
        svelte({
            configFile: false,
            emitCss: true,
            // No component is a custom element; see elementCompileOptions.ts.
            compilerOptions,
        }),
        noCustomElementGuard(),
        elementStylesheet(),
        svelteRuntimeTrims(compilerOptions),
        // The same second pass the IIFE gets, from the same module, so the two
        // artifacts cannot be minified to different settings by accident.
        // `'es'` is the one deliberate difference: this artifact really is a
        // module, so terser may mangle its top level and compress across it.
        terserElementBuilds('es'),
    ],
    esbuild: {
        pure: ['console.log', 'console.debug'],
        drop: ['debugger'],
    },
    css: {
        // The same shadow-root CSS trim the IIFE gets, from the same module, so
        // the two artifacts cannot ship different stylesheets.
        postcss: { plugins: [dropLightDomOnly()] },
        lightningcss,
    },
    build: {
        // The same floor the IIFE pins, so neither artifact downlevels what
        // the other ships natively. The supported browser floor for both
        // element artifacts is Chrome 111+, Firefox 113+, Safari 16.4+, because
        // the CSS uses `oklch` and `color-mix` — stated in the install
        // documentation and in src/packaging/cssTargets.ts — and es2022 is the
        // highest target that floor permits. Vite's default `'modules'` floor
        // (es2020 / safari14) cost 3,449 gzip bytes here to downlevel for
        // browsers below it.
        target: 'es2022',
        minify: true,
        cssMinify: 'lightningcss',
        cssTarget,
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
