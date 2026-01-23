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
            // @ts-expect-error - The types for this function signature might be slightly off in the plugin dts but valid in Svelte
            compilerOptions: (url) => {
                const isCustomElement = url.includes(
                    'TriiiceratopsViewerElement.svelte',
                );
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
