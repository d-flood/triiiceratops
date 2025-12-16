import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    plugins: [svelte(), tailwindcss()],
    root: 'src/demo-consumer',
    base: './',
    resolve: {
        alias: {
            // Alias to project root to use the package.json definition (which points to dist)
            triiiceratops: resolve(__dirname, '.'),

            // "triiiceratops": resolve(__dirname, "src/lib/index.ts"), // fallback for dev speed if needed
        },
    },
    build: {
        outDir: resolve(__dirname, 'docs/demo-consumer'),
        emptyOutDir: true,
    },
});
