import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
// import dts from 'vite-plugin-dts';
import { paraglideVitePlugin } from '@inlang/paraglide-js';

import { rendererFlagDefine } from './rendererFlag.build';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    // Pin the development-only renderer flag to a literal so the unselected
    // renderer is tree-shaken out of this artifact entirely (spec §Rollout).
    define: rendererFlagDefine(),
    // Never copy the demo dev-server's static assets (favicon, demo manifests,
    // e2e host pages) into the published dist — those are not part of the package.
    publicDir: false,
    plugins: [
        paraglideVitePlugin({
            project: './project.inlang',
            outdir: './src/lib/paraglide',
        }),
        svelte({ compilerOptions: { customElement: false } }),
        // dts({
        //     include: ['src/lib'],
        //     tsconfigPath: './tsconfig.app.json',
        //     outDir: 'dist',
        //     exclude: ['**/*.test.ts', '**/*.spec.ts'],
        // }),
    ],
    esbuild: {
        pure: ['console.log', 'console.debug'],
        drop: ['debugger'],
    },
    build: {
        lib: {
            entry: {
                'image-export': resolve(__dirname, 'src/lib/image-export.ts'),
            },
            name: 'Triiiceratops',

            formats: ['es'],
        },
        rollupOptions: {
            external: ['svelte', 'svelte/internal', /^svelte\//],
        },
        outDir: 'dist',
        emptyOutDir: false,
    },
});
