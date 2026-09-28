/*
 * The packaging policy the first-party plugin builds share (build-time tooling —
 * lives in src/packaging, never published).
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
 * Minify the package-owned stylesheets `?raw` brings in as strings. A `load`
 * hook rather than a `transform`: by transform time the CSS is already a JS
 * literal Vite's asset suffix produced.
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
 * `BUILD_FORMAT` (`iife`, else `es`). Svelte is bundled in both formats; the
 * formats differ only in what is left external.
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
