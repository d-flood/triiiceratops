import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { paraglideVitePlugin } from '@inlang/paraglide-js';

import { coverage } from '../../vitest.coverage.js';
// A fake IIIF Image API service for the tiled e2e fixture. Dev-server only —
// the plugin declares `apply: 'serve'`, so it is in no build.
// @ts-expect-error - plain ESM fixture helper, deliberately untyped
import { iiifFixture } from './scripts/iiifFixturePlugin.mjs';

/**
 * The framework substrate (`src/lib/framework/registration.ts`) dynamic-imports
 * the self-contained element bundle by RELATIVE specifier so a consumer's
 * bundler resolves it inside the installed package. That artifact,
 * `dist/triiiceratops-element.js`, is produced by `build:element` — a LATER
 * build step than the one that compiles the substrate — so it does not exist in
 * `src/`, and Vite's import analysis fails the whole module graph over it in
 * dev and under vitest.
 *
 * Resolve it to an inert stub here. No test loads it: registration is always
 * driven through the registrar's injected `load` seam, precisely so the shared
 * memoized registrar never depends on a built artifact. That the REAL artifact
 * exists beside the real import is asserted at build time by
 * `scripts/check-element-artifact.mjs`, after `build:element`.
 */
const ELEMENT_ARTIFACT_SPECIFIER = '../triiiceratops-element.js';
const ELEMENT_ARTIFACT_STUB_ID = '\0triiiceratops:element-artifact-stub';

function elementArtifactStub() {
    return {
        name: 'triiiceratops:element-artifact-stub',
        resolveId(source: string, importer: string | undefined) {
            if (
                source === ELEMENT_ARTIFACT_SPECIFIER &&
                importer?.includes('lib/framework/')
            ) {
                return ELEMENT_ARTIFACT_STUB_ID;
            }
            return null;
        },
        load(id: string) {
            if (id === ELEMENT_ARTIFACT_STUB_ID) return 'export default null;';
            return null;
        },
    };
}

// https://vite.dev/config/
export default defineConfig({
    plugins: [
        elementArtifactStub(),
        iiifFixture(),
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
            // The internal, unpublished shared UI primitives (ticket 01) and the
            // SDK resolve to SOURCE so the dev server and core's tests compile
            // them from `.svelte`/`.ts` with HMR. In the published `build:lib`
            // path the UI is inlined into dist by src/packaging/inlineUi.ts.
            '@triiiceratops/ui': fileURLToPath(
                new URL('../ui/src/index.ts', import.meta.url),
            ),
            '@triiiceratops/plugin-sdk': fileURLToPath(
                new URL('../plugin-sdk/src/index.ts', import.meta.url),
            ),
            // The SDK source above imports the selector runtime from core's
            // `triiiceratops/selectors` entry. Point that back at SOURCE so
            // core's own tests and dev server compile ONE copy of the runtime
            // and never need a built `dist/` to resolve their own package.
            'triiiceratops/selectors': fileURLToPath(
                new URL('./src/lib/state/selectors/index.ts', import.meta.url),
            ),
            // The first-party plugins resolve to their BUILT `dist/` (not source).
            // Their CSP-safe styling contract is build-time: `emitCss:true` +
            // `bundledCss()` extract each component's CSS into a string the plugin
            // installs through the root-aware SDK style service (reaching the Web
            // Component's shadow root). Consuming plugin SOURCE in dev would skip
            // that build step, so Svelte's `append_styles` would inject the CSS
            // into `document.head` — which never reaches the shadow-root viewer,
            // leaving plugin panels/flyouts unstyled. Using `dist/` makes the dev
            // demo + e2e faithfully match a real consumer. Run `pnpm build:all`
            // (already required before `check`/tests) so the dist exists; rebuild
            // a plugin to see its source edits in the demo.
            '@triiiceratops/plugin-image-manipulation': fileURLToPath(
                new URL(
                    '../plugin-image-manipulation/dist/index.js',
                    import.meta.url,
                ),
            ),
            '@triiiceratops/plugin-image-export': fileURLToPath(
                new URL(
                    '../plugin-image-export/dist/index.js',
                    import.meta.url,
                ),
            ),
            '@triiiceratops/plugin-pdf-export': fileURLToPath(
                new URL('../plugin-pdf-export/dist/index.js', import.meta.url),
            ),
            '@triiiceratops/plugin-annotation-editor': fileURLToPath(
                new URL(
                    '../plugin-annotation-editor/dist/index.js',
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
