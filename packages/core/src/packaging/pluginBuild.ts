/*
 * The packaging policy the first-party plugin builds share (build-time tooling —
 * lives in src/packaging, never published).
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { svelte } from '@sveltejs/vite-plugin-svelte';
import { bundledCss } from '@triiiceratops/ui/vite';
import { build, type Plugin, type Rollup, type UserConfig } from 'vite';

import { minifyCss } from './minifyCss';
import { minifyChunk, terserPass } from './terserPass';

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

/**
 * Externalized only by the `svelte`-condition build, never by the default ES
 * build, even though `svelte` is also a declared optional peer.
 */
const SVELTE = /^svelte(\/|$)/;

export interface PluginBuildOptions {
    /** The package directory: `dirname(fileURLToPath(import.meta.url))`. */
    root: string;
    /** Short package slug, used to name this build's plugin instances. */
    name: string;
    /** The IIFE's global name, e.g. `TriiiceratopsPluginPdfExport`. */
    globalName: string;
    /** ESM entries: emitted base name → source path relative to {@link root}. */
    entries: Record<string, string>;
    /**
     * The {@link entries} that hold Svelte components and so get a
     * `svelte`-condition build in `dist/svelte/`. Defaults to all of them.
     */
    svelteEntries?: string[];
    /** The IIFE entry, relative to {@link root}. */
    iifeEntry: string;
    /** Specifiers the ESM build externalizes on top of core and the SDK. */
    extraExternal?: (string | RegExp)[];
    /**
     * IIFE only: dynamically imported specifiers the IIFE fetches from a
     * self-contained sibling ES module instead of inlining, keyed to that
     * module's fixed file name in `dist/`.
     */
    iifeLazyChunks?: Record<string, string>;
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
 * Resolves each lazy chunk against the IIFE's own script URL, which
 * `document.currentScript` only exposes while the bundle evaluates. A failed
 * load is rethrown naming the URL: browsers disagree on whether theirs does.
 * The module map caches a failed fetch for good, so a retry needs a new URL.
 */
const LAZY_CHUNK_INTRO = `
var __triChunkBase =
    (typeof document !== 'undefined' && document.currentScript && document.currentScript.src) || '';
var __triChunkFailures = {};
function __triChunkImport(name) {
    var failures = __triChunkFailures[name] || 0;
    var url = (__triChunkBase ? new URL(name, __triChunkBase).href : './' + name) +
        (failures ? '?retry=' + failures : '');
    return import(url).catch(function (cause) {
        __triChunkFailures[name] = failures + 1;
        throw new Error('Failed to load chunk ' + url, { cause: cause });
    });
}
`;

/** Bundle one package into a single import-free, minified ES module. */
async function buildChunk(
    root: string,
    entry: string,
    fileName: string,
): Promise<string> {
    const [output] = (await build({
        root,
        configFile: false,
        logLevel: 'warn',
        build: {
            write: false,
            target: 'es2022',
            minify: true,
            lib: { entry, formats: ['es'], fileName: () => fileName },
            rollupOptions: { output: { inlineDynamicImports: true } },
        },
    })) as Rollup.RollupOutput[];
    const chunk = output?.output.find((file) => file.type === 'chunk');
    if (!chunk) throw new Error(`building ${fileName} emitted no chunk`);
    return minifyChunk(
        chunk.code,
        {
            compress: { passes: 3 },
            mangle: true,
            module: true,
            format: { comments: 'some' },
        },
        fileName,
    );
}

/**
 * Take each lazy specifier out of the IIFE's graph, point its `import()` at
 * {@link LAZY_CHUNK_INTRO}'s loader, and emit the chunk beside the IIFE.
 * Rollup cannot code-split an IIFE, so the chunk is a build of its own.
 */
function lazyChunks(
    name: string,
    root: string,
    chunks: Record<string, string>,
): Plugin {
    const files = Object.values(chunks);
    return {
        name: `${name}-lazy-chunks`,
        apply: 'build',
        enforce: 'pre',
        resolveId(source) {
            const fileName = chunks[source];
            return fileName ? { id: fileName, external: true } : null;
        },
        renderDynamicImport({ targetModuleId }) {
            return targetModuleId && files.includes(targetModuleId)
                ? { left: '__triChunkImport(', right: ')' }
                : null;
        },
        async generateBundle() {
            for (const [specifier, fileName] of Object.entries(chunks)) {
                const resolved = await this.resolve(
                    specifier,
                    resolve(root, 'package.json'),
                    { skipSelf: true },
                );
                if (!resolved) throw new Error(`cannot resolve ${specifier}`);
                this.emitFile({
                    type: 'asset',
                    fileName,
                    source: await buildChunk(root, resolved.id, fileName),
                });
            }
        },
    };
}

/**
 * The Vite config for one first-party plugin in one output format, chosen by
 * `BUILD_FORMAT` (`iife`, `svelte`, else `es`). Svelte is bundled in the `es`
 * and `iife` formats; the formats differ only in what is left external. The
 * `svelte` format is the `es` build with the Svelte runtime left external too,
 * for Svelte apps that resolve the `svelte` export condition.
 */
export function pluginBuild({
    root,
    name,
    globalName,
    entries,
    svelteEntries,
    iifeEntry,
    extraExternal = [],
    iifeLazyChunks = {},
}: PluginBuildOptions): UserConfig {
    const iife = process.env.BUILD_FORMAT === 'iife';
    const shared = process.env.BUILD_FORMAT === 'svelte';
    const chunked = iife && Object.keys(iifeLazyChunks).length > 0;

    const names = shared
        ? (svelteEntries ?? Object.keys(entries))
        : Object.keys(entries);
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
            ...(chunked ? [lazyChunks(name, root, iifeLazyChunks)] : []),
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
            // warnings leak into the bundle. `pluginDistCheck.ts`, the last
            // step of each plugin's `build`, fails a default ES or IIFE output
            // that imports `svelte/internal`, and a `svelte` output that
            // bundles the runtime instead of importing it.
            minify: true,
            // One extracted CSS asset (bundledCss concatenates + strips it)
            // rather than a per-entry split.
            cssCodeSplit: false,
            lib,
            rollupOptions: {
                external: iife
                    ? []
                    : [...PEERS, ...extraExternal, ...(shared ? [SVELTE] : [])],
                output:
                    // A multi-entry ES build cannot inline its dynamic imports;
                    // it splits shared code into hashed chunks a consumer's
                    // bundler re-splits. Every other output here is one file.
                    iife || single !== undefined
                        ? {
                              inlineDynamicImports: true,
                              ...(chunked ? { intro: LAZY_CHUNK_INTRO } : {}),
                          }
                        : {
                              entryFileNames: '[name].js',
                              chunkFileNames: 'chunks/[name]-[hash].js',
                          },
            },
            outDir: shared ? 'dist/svelte' : 'dist',
            emptyOutDir: false,
        },
    };
}
