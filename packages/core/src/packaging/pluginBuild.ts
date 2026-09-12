/*
 * The packaging policy the first-party plugin builds share (build-time tooling —
 * lives in src/packaging, never published).
 *
 * `packages/plugin-av/vite.config.ts` is where this policy was first written,
 * and it stays there rather than adopting this helper: its dist is a directory
 * of lazily-fetched chunks, its IIFE externalizes Svelte and core onto globals
 * behind a skew gate, and it keeps IIFE mangling off so
 * `scripts/check-shared-runtime.mjs` can still find the namespace locals by
 * name. None of that generalizes, and its artifacts are the only gated ones.
 *
 * The other four plugins are the same build four times over: one ESM entry set a
 * consumer's bundler finishes, one self-contained IIFE a `<script>` tag loads.
 * Spelling that out per package meant each one could drift — and each one had:
 * two headers described `emitCss: false` while setting `true`, one externalized
 * core by exact string so a subpath import would have silently bundled a second
 * copy of it, and none of the four ran the terser second pass core's element
 * artifacts and the AV plugin have run for releases.
 *
 * Callers reach this by source path, as they already reach `minifyCss` and
 * `terserPass`: `src/packaging` is neither published nor exported, and Vite,
 * Svelte and Terser all resolve from THIS file, which is why the pass is shared
 * as a config factory rather than as an options object each package minifies
 * with itself.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { svelte } from '@sveltejs/vite-plugin-svelte';
import { bundledCss } from '@triiiceratops/ui/vite';
import type { Plugin, UserConfig } from 'vite';

import { minifyCss } from './minifyCss';
import { terserPass } from './terserPass';

/** The suffix a package's global stylesheet is imported under. */
const RAW_CSS_QUERY = '.css?raw';

/**
 * Core and the SDK are declared peers of every first-party plugin, so the ESM
 * build leaves them for the consumer's bundler to resolve and dedupe against
 * the copies the host already has.
 *
 * Matched by PATTERN, not by name: Rollup compares a string external against the
 * exact module id, so `'triiiceratops'` alone leaves `triiiceratops/image-export`
 * — whose pure IIIF and canvas helpers these plugins import — to be bundled in,
 * which is a private copy of core's helpers and precisely what the peer contract
 * exists to prevent.
 */
const PEERS = [/^@triiiceratops\/plugin-sdk(\/|$)/, /^triiiceratops(\/|$)/];

export interface PluginBuildOptions {
    /** The package directory: `dirname(fileURLToPath(import.meta.url))`. */
    root: string;
    /** Short package slug, used to name this build's plugin instances. */
    name: string;
    /** The IIFE's global name, e.g. `TriiiceratopsPluginPdfExport`. */
    globalName: string;
    /** ESM entries: emitted base name → source path relative to {@link root}. */
    entries: Record<string, string>;
    /** The IIFE entry, relative to {@link root}. */
    iifeEntry: string;
    /** Specifiers the ESM build externalizes on top of core and the SDK. */
    extraExternal?: (string | RegExp)[];
}

/**
 * Minify the package-owned stylesheets `?raw` brings in as strings.
 *
 * A plugin's global CSS is installed through the SDK style service rather than
 * appended by a bundler, so it reaches the bundle as a JS string literal — which
 * means no CSS pipeline and no JS minifier ever visits it, and every maintainer
 * comment and every indent would ship to every reader. `minifyCss` is the same
 * conservative pass core's element builds run over component CSS for the same
 * reason, proven semantics-preserving by `minifyCss.equivalence.test.ts`.
 *
 * A `load` hook rather than a `transform`: `?raw` is Vite's own asset suffix, so
 * by transform time the module is already `export default "<the whole sheet>"`
 * and the CSS would have to be dug back out of a JS literal. Claiming the load
 * first keeps the pass on plain CSS text. Unit tests read the sheet through each
 * package's vitest config, which does not register this plugin, so they see the
 * readable source — which is the point: formatting a `.css` file cannot change a
 * shipped byte.
 */
function minifiedRawCss(name: string): Plugin {
    return {
        name: `${name}-minify-raw-css`,
        apply: 'build',
        enforce: 'pre',
        async load(id) {
            if (!id.endsWith(RAW_CSS_QUERY)) return null;
            const css = await readFile(id.slice(0, -'?raw'.length), 'utf8');
            return `export default ${JSON.stringify(minifyCss(css))};`;
        },
    };
}

/**
 * The Vite config for one first-party plugin in one output format, chosen by
 * `BUILD_FORMAT` (`iife`, else `es`).
 *
 * ## Svelte is bundled in, in both formats
 *
 * These plugins share neither a Svelte runtime nor `svelte/internal` with core.
 * `svelte/internal` is private, unversioned API and a plugin is released
 * independently of core, so a consumer may pair any plugin version with any core
 * version and a shared runtime would break on the first skew. `@triiiceratops/ui`
 * is bundled for the same reason. The AV plugin is the single exception, and it
 * buys the exception with two runtime gates of its own — see its vite config.
 *
 * ## The formats differ only in what is left external
 *
 * The ESM entry externalizes the declared peers; the IIFE externalizes nothing,
 * because a `<script>`-tag consumer has no bundler to resolve a bare specifier
 * with, so anything left external would be an unresolved global at runtime.
 *
 * ## The terser second pass
 *
 * A second, conservative pass over what Vite's own minifier produced. Core's
 * element artifacts have run the same two-pass pipeline since it measured better
 * than swapping esbuild out; `./terserElement.ts` carries those measurements and
 * the reasons `pure_getters`, `unsafe*` and property mangling stay off — Svelte's
 * compiled signal plumbing is in these bundles too, so the same three stay off
 * here.
 *
 * What matters for a LIBRARY output is that `build.minify` deliberately skips
 * WHITESPACE for ES output, because collapsing it would strip the `@__PURE__`
 * annotations a downstream bundler tree-shakes with. That is why every
 * `dist/index.js` here shipped pretty-printed, and it is most of what this pass
 * recovers — but only if the annotations survive it. So `preserve_annotations`
 * and `module` semantics follow the OUTPUT format: on for the ES entries, whose
 * output a consumer's bundler still has to tree-shake, off for the IIFE, whose
 * body is script scope and which reaches a browser with no bundler after it.
 * Each package's `consumer-bundles.guard.test.ts` is what proves the annotations
 * are still there and still doing their job.
 *
 * `comments: 'some'` keeps `@license`, `@preserve` and `/*!` banners, so a vendor
 * notice that reaches this pass leaves in the artifact.
 */
export function pluginBuild({
    root,
    name,
    globalName,
    entries,
    iifeEntry,
    extraExternal = [],
}: PluginBuildOptions): UserConfig {
    const iife = process.env.BUILD_FORMAT === 'iife';

    const names = Object.keys(entries);
    const single = names.length === 1 ? names[0] : undefined;
    const path = (relative: string) => resolve(root, relative);

    const lib = iife
        ? {
              entry: path(iifeEntry),
              formats: ['iife' as const],
              name: globalName,
              fileName: () => 'iife.js',
          }
        : single !== undefined
          ? {
                entry: path(entries[single]!),
                formats: ['es' as const],
                fileName: () => `${single}.js`,
            }
          : {
                entry: Object.fromEntries(
                    names.map((entry) => [entry, path(entries[entry]!)]),
                ),
                formats: ['es' as const],
            };

    return {
        plugins: [
            // `emitCss: true` extracts each component's (still Svelte-scoped)
            // CSS through Vite's CSS pipeline instead of Svelte's runtime
            // `append_styles` injection — which would append an un-nonced
            // `<style>` to the document head and be blocked under a strict
            // `style-src` CSP. `bundledCss()` collects that extracted CSS into
            // the `virtual:tri-bundled-css` module and strips the stray `.css`
            // asset, so the entry installs it through the root-aware,
            // nonce-aware SDK style service and the package keeps shipping one
            // self-contained JS file per format with no stylesheet beside it.
            svelte({
                emitCss: true,
                compilerOptions: { customElement: false },
            }),
            bundledCss(),
            minifiedRawCss(name),
            terserPass(`${name}-terser`, {
                compress: { passes: 3 },
                mangle: true,
                module: !iife,
                format: {
                    comments: 'some',
                    preserve_annotations: !iife,
                },
            }),
        ],
        build: {
            // Lowering private fields leaks helpers outside Vite's generated IIFE.
            target: 'es2022',
            // Production build so no dev-only `svelte/internal` strings or
            // warnings leak into the bundle (each dist is grepped for
            // `svelte/internal` — it must be absent; these plugins share no
            // Svelte runtime with core).
            minify: true,
            // One extracted CSS asset (bundledCss concatenates + strips it)
            // rather than a per-entry split.
            cssCodeSplit: false,
            lib,
            rollupOptions: {
                external: iife ? [] : [...PEERS, ...extraExternal],
                output:
                    // A multi-entry ES build cannot inline its dynamic imports;
                    // it splits shared code into hashed chunks a consumer's
                    // bundler re-splits. Every other output here is one file.
                    iife || single !== undefined
                        ? { inlineDynamicImports: true }
                        : {
                              entryFileNames: '[name].js',
                              chunkFileNames: 'chunks/[name]-[hash].js',
                          },
            },
            outDir: 'dist',
            emptyOutDir: false,
        },
    };
}
