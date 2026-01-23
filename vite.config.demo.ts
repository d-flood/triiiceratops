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
            // @ts-expect-error - plugin supports a function signature with `url`
            compilerOptions: (url) => {
                return {
                    customElement: url.includes(
                        'TriiiceratopsViewerElement.svelte',
                    ),
                };
            },
        }),
        paraglideVitePlugin({
            project: './project.inlang',
            outdir: './src/lib/paraglide',
        }),
        tailwindcss(),
    ],
    root: 'src/demo',
    base: './', // Relative paths for GitHub Pages
    build: {
        outDir: resolve(__dirname, 'docs/demo'),
        emptyOutDir: true,
    },
    publicDir: resolve(__dirname, 'public'),
});
