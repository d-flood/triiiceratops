import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Build configuration for IIFE plugin bundles.
 *
 * Plugins are built to use the Svelte runtime exposed by the main
 * triiiceratops-element.iife.js bundle via window.__TriiiceratopsSvelteRuntime.
 * This ensures getContext/setContext work correctly across bundle boundaries.
 */
export default defineConfig({
    plugins: [svelte(), tailwindcss()],
    build: {
        minify: true,
        lib: {
            entry: {
                'triiiceratops-plugin-image-manipulation': resolve(
                    __dirname,
                    'src/lib/plugins/image-manipulation/iife-entry.ts',
                ),
            },
            formats: ['iife'],
            name: 'TriiiceratopsPluginImageManipulation',
        },
        rollupOptions: {
            // Externalize Svelte - plugins use the runtime from the main element bundle
            external: [
                'svelte',
                'svelte/internal/client',
                'svelte/internal/disclose-version',
                /^svelte\/.*/,
            ],
            output: {
                // Map external Svelte imports to the global exposed by triiiceratops-element.iife.js
                globals: (id: string) => {
                    if (id === 'svelte') {
                        return 'window.__TriiiceratopsSvelteRuntime.svelte';
                    }
                    if (
                        id === 'svelte/internal/client' ||
                        id === 'svelte/internal/disclose-version'
                    ) {
                        return 'window.__TriiiceratopsSvelteRuntime.internal';
                    }
                    if (id.startsWith('svelte/')) {
                        // For other svelte/* imports, try to access from the main svelte object
                        const submodule = id.replace('svelte/', '');
                        return `window.__TriiiceratopsSvelteRuntime.svelte.${submodule}`;
                    }
                    return id;
                },
                inlineDynamicImports: true,
                entryFileNames: '[name].iife.js',
            },
        },
        outDir: 'dist',
        emptyOutDir: false,
    },
});
