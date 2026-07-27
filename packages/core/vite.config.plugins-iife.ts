import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Get plugin name from environment variable (set by build script)
const pluginName = process.env.PLUGIN_NAME || 'pdf-export';

const pluginConfigs: Record<string, { entry: string; name: string }> = {
};

const config = pluginConfigs[pluginName];
if (!config) {
    throw new Error(`Unknown plugin: ${pluginName}`);
}

/**
 * Build configuration for IIFE plugin bundles.
 *
 * Plugins are built to use the Svelte runtime exposed by the main
 * triiiceratops-element.iife.js bundle via window.__TriiiceratopsSvelteRuntime.
 * This ensures getContext/setContext work correctly across bundle boundaries.
 *
 * Usage:
 *   (no in-core plugins remain — see NOTE below)
 *
 * NOTE: ALL first-party plugins (image-manipulation/12, image-download/15,
 * pdf-export/16, annotation-editor/17) have migrated to their own packages and
 * build their own self-contained IIFEs. No in-core plugin IIFEs remain, so this
 * config is vestigial (`build:plugins-iife` is now a no-op). Ticket 20 should
 * delete this file and the legacy `__TriiiceratopsSvelteRuntime`/`TriiiceratopsPlugins`
 * globals once nothing references them.
 */
export default defineConfig({
    plugins: [svelte()],
    build: {
        minify: true,
        lib: {
            entry: config.entry,
            formats: ['iife'],
            name: config.name,
            fileName: () => `triiiceratops-plugin-${pluginName}.iife.js`,
        },
        rollupOptions: {
            // Externalize Svelte - plugins use the runtime from the main element bundle
            external: [
                'svelte',
                'svelte/reactivity',
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
                    if (id === 'svelte/reactivity') {
                        return 'window.__TriiiceratopsSvelteRuntime.reactivity';
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
            },
        },
        outDir: 'dist',
        emptyOutDir: false,
    },
});
