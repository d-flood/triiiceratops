import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { paraglideVitePlugin } from '@inlang/paraglide-js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    plugins: [
        svelte({
            configFile: false,
            // @ts-ignore - The types for this function signature might be slightly off in the plugin dts but valid in Svelte
            compilerOptions: (url) => {
                const isCustomElement =
                    url.includes('TriiiceratopsViewerElement.svelte') ||
                    url.includes('TriiiceratopsViewerElementImage.svelte');
                return { customElement: isCustomElement };
            },
        }),
        paraglideVitePlugin({
            project: './project.inlang',
            outdir: './src/lib/paraglide',
        }),
        tailwindcss(),
    ],
    build: {
        minify: true,
        lib: {
            entry: {
                'triiiceratops-element': resolve(
                    __dirname,
                    'src/lib/custom-element.ts',
                ),
                'triiiceratops-element-image': resolve(
                    __dirname,
                    'src/lib/custom-element-image.ts',
                ),
            },
            name: 'TriiiceratopsElement',
            formats: ['es'], // IIFE is hard with multiple entries, standardizing on ES for now
        },
        rollupOptions: {
            output: {
                // Remove inlineDynamicImports as we have multiple entries now
                chunkFileNames: 'chunks/[name]-[hash].js',
                assetFileNames: 'triiiceratops-element.[ext]',
            },
        },
        outDir: 'dist',
        emptyOutDir: false, // Don't clear dist (lib build runs first)
        cssCodeSplit: false, // Output single CSS file
    },
});
