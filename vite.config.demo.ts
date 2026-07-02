import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { paraglideVitePlugin } from '@inlang/paraglide-js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    plugins: [
        svelte({
            // Keep scoped component CSS in the JS bundle (injected at runtime via
            // Svelte's append_styles → getRootNode()) so it reaches the
            // <triiiceratops-viewer> custom element's shadow root in the demo's
            // web-component mode. A per-file compilerOptions *function* silently
            // disables emitCss:false, so use a static object; `customElement: true`
            // only upgrades components declaring <svelte:options customElement>.
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
    root: 'src/demo',
    base: './', // Relative paths for GitHub Pages
    build: {
        outDir: resolve(__dirname, 'docs/viewer'),
        emptyOutDir: true,
    },
    publicDir: resolve(__dirname, 'public'),
});
