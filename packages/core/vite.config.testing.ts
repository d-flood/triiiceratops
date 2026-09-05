import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

const __dirname = dirname(fileURLToPath(import.meta.url));

/*
 * Dependency policy for this entry: EVERYTHING is bundled — notably Svelte and
 * its transitive deps (`esm-env`, `clsx`) and `#client/*` internal imports — so
 * the chunk is self-contained and runs in a project that installed only the
 * tarball + vitest, with no Svelte tooling or runtime required. There is no
 * heavy browser-only runtime dependency left to externalize: core has no runtime
 * dependencies at all, and the renderer is first-party.
 *
 * The one exception is module IDENTITY, below, which is a different question.
 */

/**
 * Kept external for a different and stricter reason: MODULE IDENTITY.
 *
 * Both of these own module-level MUTABLE state that another published entry
 * writes or reads. Inlining a private copy here does not fail loudly — it
 * produces a second instance that is green in source-resolved unit tests
 * (where there is only ever one) and silently wrong in the tarball.
 *
 * - `framework/runtimeRegistry.js` owns a `WeakMap` keyed by `ViewerState`.
 *   `createTestViewerHandle()` writes the handle's selector runtime into it and
 *   `triiiceratops/react` / `triiiceratops/vue` read it back out through
 *   `getSelectorRuntime()`. `dist/react.js` imports
 *   `dist/framework/runtimeRegistry.js` as a real module; a private copy here
 *   would be two `WeakMap`s, so `useViewerSelector()` would resolve no runtime
 *   for a test handle and return `undefined` forever.
 * - `logging/logger.js` owns the `debugEnabled` gate every development warning
 *   is checked against. A framework wrapper turns it on from
 *   `ViewerConfig.debug` (see `framework/debugFlag.ts`) by writing
 *   `dist/logging/logger.js`. A private copy here would be a second gate that
 *   nothing can reach — and worse: with `configureLogging` unreachable from
 *   this entry's exports, `debugEnabled` becomes a provable constant `false`
 *   and the minifier DELETES the `state`-cadence viewport probe outright, so
 *   the warning is not merely silent in the artifact, it is absent from it.
 *
 * Both specifiers are relative and `dist/testing/index.js` sits at the same
 * depth as the copies `svelte-package` emits, so rollup can preserve them
 * verbatim and they resolve inside `dist/`. Both modules are dependency-free
 * plain JS (no Svelte, no runes), so keeping them external costs the entry
 * nothing it was built to avoid.
 */
const SHARED_MODULE_IDENTITY = [
    {
        match: /(^|\/)framework\/runtimeRegistry\.js$/,
        /** Where it sits relative to `dist/testing/index.js` in the package. */
        specifier: '../framework/runtimeRegistry.js',
    },
    {
        match: /(^|\/)logging\/logger\.js$/,
        specifier: '../logging/logger.js',
    },
] as const;

const SHARED_SPECIFIERS: readonly string[] = SHARED_MODULE_IDENTITY.map(
    (entry) => entry.specifier,
);

/**
 * Build the compiled headless `triiiceratops/testing` entry.
 *
 * `svelte-package` (in `build:lib`) copies `src/lib/testing/index.ts` to
 * `dist/testing/index.js` UNCOMPILED — importing the runes module
 * `state/viewer.svelte.js`, which a consumer without a Svelte compiler cannot
 * run. This build runs AFTER `svelte-package` and OVERWRITES that `.js` with a
 * Svelte-compiled, self-contained chunk while leaving `svelte-package`'s
 * `dist/testing/index.d.ts` (the correct types) in place.
 *
 * Dependency policy: see the note at the top of this file. Svelte is bundled so
 * the entry runs in a plain vitest project that installed ONLY the tarball; the
 * only externals are the shared-identity modules. This is what the packed
 * `vitest-kit` fixture verifies.
 */
export default defineConfig({
    // Never copy demo dev-server static assets into the published dist.
    publicDir: false,
    // No paraglide plugin: the generated `src/lib/paraglide/runtime.js`
    // (`getLocale`) already exists from `build:lib`, which this build follows.
    // Re-running the paraglide vite plugin here would overwrite that directory
    // with a differently-shaped output and break core's message imports.
    plugins: [
        svelte({ compilerOptions: { customElement: false } }),
        {
            // Emit the shared-identity import with the specifier the PUBLISHED
            // layout needs. Rollup's own relativization of a relative external
            // is derived from the source tree (`src/lib/testing/` →
            // `src/lib/framework/`), which does not mirror `dist/testing/` →
            // `dist/framework/`, so it would emit a path that escapes `dist/`.
            // Resolving it to the literal output specifier and marking it
            // external — with `makeAbsoluteExternalsRelative: false` so rollup
            // leaves it alone — writes exactly what the artifact needs.
            name: 'triiiceratops:shared-module-identity',
            enforce: 'pre' as const,
            resolveId(source: string) {
                const shared = SHARED_MODULE_IDENTITY.find((entry) =>
                    entry.match.test(source),
                );
                return shared ? { id: shared.specifier, external: true } : null;
            },
        },
    ],
    esbuild: {
        // Match the lib build: the published testing entry must be quiet.
        pure: ['console.log', 'console.debug'],
        drop: ['debugger'],
    },
    build: {
        lib: {
            entry: resolve(__dirname, 'src/lib/testing/index.ts'),
            formats: ['es'],
            fileName: () => 'testing/index.js',
        },
        rollupOptions: {
            // The shared-identity specifiers above are already the exact
            // strings the artifact must contain; leave them alone.
            makeAbsoluteExternalsRelative: false,
            // Externalize ONLY the shared-identity modules; bundle Svelte and
            // its transitive closure so no Svelte tooling/runtime is required.
            external: (id) => SHARED_SPECIFIERS.includes(id),
            output: {
                // Single self-contained file: any lazy import in the headless
                // graph folds inline rather than emitting a sibling chunk.
                inlineDynamicImports: true,
            },
        },
        outDir: 'dist',
        emptyOutDir: false,
        // Minify so the `@__PURE__`-annotated `console.log`/`console.debug`
        // statements are actually dropped (quiet published entry). `console.error`
        // / `console.warn` diagnostics are preserved.
        minify: 'esbuild',
    },
});
