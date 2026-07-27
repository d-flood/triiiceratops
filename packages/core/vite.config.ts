import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { paraglideVitePlugin } from '@inlang/paraglide-js';

import { coverage } from '../../vitest.coverage.js';

// https://vite.dev/config/
export default defineConfig({
    plugins: [
        paraglideVitePlugin({
            project: './project.inlang',
            outdir: './src/lib/paraglide',
        }),
        svelte({
            // Keep scoped component CSS in the JS bundle (injected at runtime via
            // Svelte's append_styles → getRootNode()) so it reaches the
            // <triiiceratops-viewer> shadow root in dev/e2e. A per-file
            // compilerOptions *function* silently disables emitCss:false, so use a
            // static object; `customElement: true` only upgrades components that
            // declare <svelte:options customElement>.
            emitCss: false,
            compilerOptions: { customElement: true },
        }),
    ],
    resolve: {
        // In tests, force the browser condition so Svelte resolves correctly.
        ...(process.env.VITEST ? { conditions: ['browser'] } : {}),
        alias: {
            // Resolve the workspace SDK and every plugin to its TypeScript
            // source (rather than its built `dist/`) so both the dev server
            // and core's integration tests run against live source with HMR —
            // no plugin rebuild needed. Vite resolves each package's internal
            // `.js` imports to their `.ts`.
            // The internal, unpublished shared UI primitives (ticket 01):
            // resolve to source so the dev server and core's tests/build
            // compile them from `.svelte` with HMR. In the published `build:lib`
            // path they are inlined into dist by src/packaging/inlineUi.ts.
            '@triiiceratops/ui': fileURLToPath(
                new URL('../ui/src/index.ts', import.meta.url),
            ),
            '@triiiceratops/plugin-sdk': fileURLToPath(
                new URL('../plugin-sdk/src/index.ts', import.meta.url),
            ),
            '@triiiceratops/plugin-image-manipulation': fileURLToPath(
                new URL(
                    '../plugin-image-manipulation/src/index.ts',
                    import.meta.url,
                ),
            ),
            '@triiiceratops/plugin-image-download': fileURLToPath(
                new URL(
                    '../plugin-image-download/src/index.ts',
                    import.meta.url,
                ),
            ),
            '@triiiceratops/plugin-pdf-export': fileURLToPath(
                new URL('../plugin-pdf-export/src/index.ts', import.meta.url),
            ),
            '@triiiceratops/plugin-annotation-editor': fileURLToPath(
                new URL(
                    '../plugin-annotation-editor/src/index.ts',
                    import.meta.url,
                ),
            ),
        },
    },
    esbuild: {
        pure: ['console.log', 'console.debug'],
        drop: ['debugger'],
    },
    server: {
        allowedHosts: ['df-laptop-wsl.flicker-lionfish.ts.net'],
    },
    test: {
        include: ['src/**/*.{test,spec}.{js,ts}'],
        environment: 'happy-dom',
        globals: true,
        coverage,
    },
});
