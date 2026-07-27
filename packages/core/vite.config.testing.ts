import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Kept external — the heavy, browser-only runtime dependencies that are NOT in
 * the headless state's import graph (they are reached only through OSD/overlay
 * paths that never run headless). They stay external so they are never bundled;
 * if a future change did pull one in, it would still resolve from the
 * `triiiceratops` tarball's own `dependencies`.
 *
 * Everything ELSE is BUNDLED, including:
 * - Svelte and its transitive deps (`esm-env`, `clsx`) and `#client/*` internal
 *   imports, so no Svelte tooling/runtime is required; and
 * - `manifesto.js`, whose published ESM uses extensionless directory imports
 *   (e.g. `./internal`) that plain Node/vitest resolution cannot follow — vite's
 *   bundler resolves them at build time, so the chunk is self-contained and runs
 *   in a project that installed only the tarball + vitest.
 */
const EXTERNAL = [
    /^openseadragon(\/|$)/,
    /^@annotorious\//,
    /^pdf-lib(\/|$)/,
];

/**
 * Build the compiled headless `triiiceratops/testing` entry (ticket 14).
 *
 * `svelte-package` (in `build:lib`) copies `src/lib/testing/index.ts` to
 * `dist/testing/index.js` UNCOMPILED — importing the runes module
 * `state/viewer.svelte.js`, which a consumer without a Svelte compiler cannot
 * run. This build runs AFTER `svelte-package` and OVERWRITES that `.js` with a
 * Svelte-compiled, self-contained chunk while leaving `svelte-package`'s
 * `dist/testing/index.d.ts` (the correct types) in place.
 *
 * Dependency policy: see {@link EXTERNAL}. In short, Svelte and `manifesto.js`
 * are bundled so the entry runs in a plain vitest project that installed ONLY
 * the tarball; the heavy browser-only deps that are never in the headless graph
 * stay external. This is what the packed `vitest-kit` fixture verifies.
 */
export default defineConfig({
    // No paraglide plugin: the generated `src/lib/paraglide/runtime.js`
    // (`getLocale`) already exists from `build:lib`, which this build follows.
    // Re-running the paraglide vite plugin here would overwrite that directory
    // with a differently-shaped output and break core's message imports.
    plugins: [svelte({ compilerOptions: { customElement: false } })],
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
            // Externalize ONLY the heavy tarball dependencies; bundle Svelte and
            // its transitive closure so no Svelte tooling/runtime is required.
            external: (id) => EXTERNAL.some((re) => re.test(id)),
            output: {
                // Single self-contained file: the lazy manifesto import folds
                // inline rather than emitting a sibling chunk.
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
