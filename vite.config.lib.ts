import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
// import dts from 'vite-plugin-dts';
import { paraglide } from '@inlang/paraglide-vite';
import tailwindcss from '@tailwindcss/vite';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    plugins: [
        paraglide({
            project: './project.inlang',
            outdir: './src/lib/paraglide',
        }),
        tailwindcss(),
        svelte(),
        // dts({
        //     include: ['src/lib'],
        //     tsconfigPath: './tsconfig.app.json',
        //     outDir: 'dist',
        //     exclude: ['**/*.test.ts', '**/*.spec.ts'],
        // }),
    ],
    build: {
        lib: {
            entry: {
                'triiiceratops-bundle': resolve(__dirname, 'src/lib/index.ts'),
                // 'plugins/image-manipulation': resolve(
                //     __dirname,
                //     'src/lib/plugins/image-manipulation/index.ts',
                // ),
            },
            name: 'Triiiceratops',

            formats: ['es'],
        },
        rollupOptions: {
            external: [
                'svelte',
                'svelte/internal',
                /^svelte\//,
                'openseadragon',
                'manifesto.js',
                '@tailwindcss/vite',
                'daisyui',
                'tailwindcss',
            ],
        },
        outDir: 'dist',
        emptyOutDir: false,
    },
});
