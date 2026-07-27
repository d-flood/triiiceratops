import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { paraglideVitePlugin } from '@inlang/paraglide-js';

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
    resolve: process.env.VITEST
        ? {
              conditions: ['browser'],
              alias: {
                  // Resolve the workspace SDK to its TypeScript source in tests
                  // so core's integration tests need no pre-built dist. Vite
                  // resolves the SDK's internal `.js` imports to their `.ts`.
                  '@triiiceratops/plugin-sdk': fileURLToPath(
                      new URL('../plugin-sdk/src/index.ts', import.meta.url),
                  ),
              },
          }
        : undefined,
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
    },
});
