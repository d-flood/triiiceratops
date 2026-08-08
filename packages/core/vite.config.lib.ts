import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
// import dts from 'vite-plugin-dts';
import { paraglideVitePlugin } from '@inlang/paraglide-js';

import { rendererFlagDefine } from './rendererFlag.build';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    // Pin the development-only renderer flag to a literal (spec §Rollout).
    //
    // NOTE what this does and does not cover. This config's only entry is
    // `image-export`, so the define reaches that bundle alone. The package's
    // MAIN entry — `dist/index.js` and every module under it, including the
    // renderer — comes from `svelte-package`, which compiles per file and never
    // bundles, so no Vite define touches it. That output is folded separately,
    // textually, by `src/packaging/foldRendererFlag.ts` (a later step of
    // `build:lib`); without it the published tarball would ship a mutable
    // `globalThis` switch onto the in-progress renderer.
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
