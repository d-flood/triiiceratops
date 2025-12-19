import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Get plugin name from environment variable (set by build script)
const pluginName = process.env.PLUGIN_NAME || 'image-manipulation';

const pluginConfigs: Record<string, { entry: string; name: string }> = {
    'image-manipulation': {
        entry: resolve(
            __dirname,
            'src/lib/plugins/image-manipulation/iife-entry.ts',
        ),
        name: 'TriiiceratopsPluginImageManipulation',
    },
    'annotation-editor': {
        entry: resolve(
            __dirname,
            'src/lib/plugins/annotation-editor/iife-entry.ts',
        ),
        name: 'TriiiceratopsPluginAnnotationEditor',
    },
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
 *   PLUGIN_NAME=image-manipulation vite build --config vite.config.plugins-iife.ts
 *   PLUGIN_NAME=annotation-editor vite build --config vite.config.plugins-iife.ts
 */
export default defineConfig({
    plugins: [svelte(), tailwindcss()],
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
            },
        },
        outDir: 'dist',
        emptyOutDir: false,
    },
});
