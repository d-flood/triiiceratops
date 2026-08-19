import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { svelte } from '@sveltejs/vite-plugin-svelte';
import { bundledCss } from '@triiiceratops/ui/vite';
import { defineConfig, type Plugin } from 'vite';

// Core's build-time CSS pass, by source path: it lives in `src/packaging`, which
// core neither publishes nor exports, so there is no package specifier to reach
// it by. `scripts/check-shared-runtime.mjs` reads core's source the same way and
// for the same reason — both are monorepo build tooling, never shipped.
import { minifyCss } from '../core/src/packaging/minifyCss';
import { sharedRuntimeGateSource } from './src/sharedRuntimeGate';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Build the plugin for one output format.
 *
 * `BUILD_FORMAT=es`          → `dist/index.js` plus its own hashed chunks (the
 *                              ESM entry consumers import).
 * `BUILD_FORMAT=iife`        → `dist/iife.js`  (a `<script>`-loadable bundle
 *                              that registers into `window.Triiiceratops.plugins`).
 * `BUILD_FORMAT=iife-chunks` → `dist/av-waveform.js`, `dist/av-hls.js`,
 *                              `dist/av-sequencer.js`, `dist/av-transcript.js`
 *                              — the lazy halves the IIFE fetches at runtime.
 *
 * ## The deliberate deviation: the dist is a DIRECTORY
 *
 * Every other first-party plugin ships one file per format, because
 * `inlineDynamicImports` folds its lazy code into the entry. This plugin does
 * not: hls.js is roughly 225 KB gzip of Media Source machinery that a manifest
 * of progressive MP4s never needs, and the waveform parsers are another 2.4 KB
 * that only a canvas linking waveform data needs. Inlining either would spend
 * the competitive pair budget (`scripts/size-check.mjs`) on bytes most readers
 * never use.
 *
 * Rollup cannot code-split an `iife` output — "UMD and IIFE output formats are
 * not supported for code-splitting builds" — so the split is made by hand and
 * in two halves. The entry build treats each lazy module as EXTERNAL and, via
 * `chunkedIife()` below, rewrites its `import()` specifier into a URL resolved
 * against the plugin's own `document.currentScript.src`. The chunk build then
 * emits those modules as self-contained ES modules. A classic `<script>` can
 * `import()` an ES module, so the entry stays a plain IIFE.
 *
 * The consumer-visible contract is therefore behavioral: a script-tag consumer
 * hosts the whole `dist` directory rather than copying one file out of it, and
 * the chunks are fetched from beside `iife.js` on demand. A chunk that cannot
 * be fetched degrades exactly as an absent one does — no waveform, or that
 * canvas's "can't play" treatment — never an activation failure.
 *
 * ## The deliberate deviation: neither Svelte nor core's utilities are bundled
 *
 * Every other first-party plugin bundles its own Svelte runtime, and its vite
 * config says why: a plugin released independently of core can be paired with
 * any core version, and `svelte/internal` is private, unversioned API that would
 * break on the first skew. That reasoning is correct and must stay in those
 * packages — and for third-party plugins, which the authoring docs go on telling
 * to bundle.
 *
 * This plugin is the exception, and it is bought rather than assumed. The public
 * bundle-size comparison measures `triiiceratops-element.iife.js` against
 * viewers that already support audio and video; a Svelte plugin that ships its
 * own runtime spends about half the remaining headroom on bytes no reader can
 * see (13.24 KB gzip → 1.51 KB gzip for a representative transport). So the IIFE
 * externalizes `svelte` and `svelte/internal/client` onto the globals core
 * exposes on the `window.Triiiceratops` namespace it already owns. The privilege
 * rests on core and plugin being built and released from ONE repo at ONE Svelte
 * version — which is why `coreRange` is pinned to an exact version, and why the
 * script order is core-then-plugin. Neither is left to convention: the
 * `shared-svelte-runtime` capability refuses activation on a core that shares no
 * runtime, and `output.intro` below refuses to evaluate this bundle at all
 * against a core that is absent or shares a runtime it cannot use.
 *
 * The same bargain covers `triiiceratops` itself. Importing core's curated
 * utilities drags the painting classifier, the IIIF parsing helpers and the
 * companion resolution behind them into this bundle — all of it already parsed
 * and retained by the core script sitting beside it on the page. So the IIFE
 * externalizes core too and reads them off `window.Triiiceratops.core`, fenced
 * by the same pair of gates: the
 * `shared-core-utils` capability at activation, and `output.intro` ahead of the
 * bundle body.
 *
 * The ESM half needs no globals and no special pleading: `svelte` and
 * `triiiceratops` are left external as ordinary peers, which a consumer's
 * bundler dedupes against core's copy exactly as it dedupes any other shared
 * dependency.
 */
const format =
    process.env.BUILD_FORMAT === 'iife'
        ? 'iife'
        : process.env.BUILD_FORMAT === 'iife-chunks'
          ? 'iife-chunks'
          : 'es';

/**
 * The modules the IIFE loads on demand: source specifier → emitted file name.
 *
 * The keys are exactly the specifiers the eager modules write in their
 * `await import()`, and the values are what `iife-chunks` emits beside
 * `iife.js`. Both halves read this one map, so a chunk cannot be renamed on one
 * side and fetched under the old name on the other.
 */
const LAZY_CHUNKS: Record<string, string> = {
    './waveform/index': 'av-waveform.js',
    './hls/index': 'av-hls.js',
    './sequencer/index': 'av-sequencer.js',
    './transcript/index': 'av-transcript.js',
};

const lib =
    format === 'iife'
        ? {
              entry: resolve(__dirname, 'src/iife.ts'),
              formats: ['iife' as const],
              name: 'TriiiceratopsPluginAv',
              fileName: () => 'iife.js',
          }
        : format === 'iife-chunks'
          ? {
                entry: {
                    'av-waveform': resolve(__dirname, 'src/waveform/index.ts'),
                    'av-hls': resolve(__dirname, 'src/hls/index.ts'),
                    'av-sequencer': resolve(
                        __dirname,
                        'src/sequencer/index.ts',
                    ),
                    'av-transcript': resolve(
                        __dirname,
                        'src/transcript/index.ts',
                    ),
                },
                formats: ['es' as const],
                fileName: (_format: string, name: string) => `${name}.js`,
            }
          : {
                entry: resolve(__dirname, 'src/index.ts'),
                formats: ['es' as const],
                fileName: () => 'index.js',
            };

/**
 * The base URL the IIFE resolves its chunks against, emitted ahead of the
 * bundle body.
 *
 * `document.currentScript` is only correct WHILE the script is evaluating, so
 * it is captured eagerly into a variable and read later — by the time a reader
 * opens an HLS canvas it is `null`. The fallback resolves against the document
 * base, which is right for the common case of a dist directory served from the
 * page's own origin and wrong for a CDN; a bundle loaded in a way that hides
 * its own URL (an inline `eval`, a bare `import()`) therefore degrades to no
 * chunk rather than to a broken one.
 */
const CHUNK_BASE_SOURCE = `
var __triAvChunkBase =
    (typeof document !== 'undefined' && document.currentScript && document.currentScript.src) || '';
function __triAvChunkUrl(name) {
    return __triAvChunkBase ? new URL(name, __triAvChunkBase).href : './' + name;
}
`;

/** The suffix `src/styles.ts` imports the stage stylesheet under. */
const RAW_CSS_QUERY = '.css?raw';

/**
 * Minify the package-owned stylesheets `?raw` brings in as strings.
 *
 * A plugin's global CSS is installed through the SDK style service rather than
 * appended by a bundler, so it reaches the bundle as a JS string literal — which
 * means no CSS pipeline and no JS minifier ever visits it, and every comment and
 * every indent would ship to every reader. `minifyCss` is the same conservative
 * pass core's element builds run over component CSS for the same reason, proven
 * semantics-preserving by `minifyCss.equivalence.test.ts`.
 *
 * A `load` hook rather than a `transform`: `?raw` is Vite's own asset suffix, so
 * by transform time the module is already `export default "<the whole sheet>"`
 * and the CSS would have to be dug back out of a JS literal. Claiming the load
 * first keeps the pass on plain CSS text. Unit tests read the sheet through
 * vitest's own config, which does not register this plugin, so they see the
 * readable source — which is the point: formatting `stage.css` cannot change a
 * shipped byte.
 */
function minifiedRawCss(): Plugin {
    return {
        name: 'tri-av-minify-raw-css',
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
 * Emit the IIFE's dynamic imports as fetches of sibling files instead of
 * inlining them.
 *
 * Two hooks. `resolveId` takes each lazy module out of this build's graph
 * (external, under its emitted file name), which is what stops rollup demanding
 * `inlineDynamicImports`; `renderDynamicImport` then wraps the specifier rollup
 * would have written literally, so `import('av-hls.js')` — which a browser
 * would resolve against the PAGE — becomes `import(__triAvChunkUrl('av-hls.js'))`,
 * resolved against the plugin's own script URL.
 */
function chunkedIife(): Plugin {
    return {
        name: 'tri-av-chunked-iife',
        apply: 'build',
        enforce: 'pre',
        resolveId(source) {
            const emitted = LAZY_CHUNKS[source];
            return emitted ? { id: emitted, external: true } : null;
        },
        renderDynamicImport({ targetModuleId }) {
            if (!targetModuleId) return null;
            return Object.values(LAZY_CHUNKS).includes(targetModuleId)
                ? { left: 'import(__triAvChunkUrl(', right: '))' }
                : null;
        },
    };
}

// Both formats keep Svelte external. The ESM build additionally externalizes the
// declared peers for the consumer's bundler to resolve; the IIFE bundles them,
// because a script-tag consumer has no bundler to resolve anything with — and
// the SDK is framework-neutral, so bundling it pulls in no second runtime.
const SVELTE = /^svelte(\/|$)/;
const CORE = /^triiiceratops(\/|$)/;
// The IIFE externalizes core's PACKAGE ENTRY only. `window.Triiiceratops.core`
// is the one curated namespace member, and core's subpath entries — the selector
// runtime the SDK re-exports, in particular — are not on it, so externalizing
// them would leave an unresolvable bare global at runtime. They stay bundled.
const CORE_ENTRY = /^triiiceratops$/;
const external =
    format === 'iife'
        ? [SVELTE, CORE_ENTRY]
        : format === 'iife-chunks'
          ? // Self-contained: an ES module fetched from a `<script>` page has
            // no import map and no bundler, so anything it left external would
            // be an unresolvable bare specifier at runtime. So the chunks
            // bundle whatever they reach — `src/sequencer/index.ts` imports
            // `triiiceratops` and carries its own copy of what it uses, which
            // is the price of the chunk being loadable on its own.
            //
            // What must not happen is a chunk reaching Svelte, and
            // `check-shared-runtime.mjs` fails the build if one does: it scans
            // every chunk for the Svelte client runtime's fingerprint strings.
            // It also scans them for reads off `window.Triiiceratops.core`,
            // which a chunk has no globals wiring for and could only write by
            // hand — those are held to core's published set and to
            // `REQUIRED_CORE_UTILS` exactly as the entry's are.
            []
          : [SVELTE, /^@triiiceratops\/plugin-sdk(\/|$)/, CORE];

/**
 * Where each externalized Svelte module is read from at runtime in the IIFE.
 *
 * Optional-chained rather than bare: an IIFE's arguments are evaluated before
 * its body, so `Triiiceratops.svelteInternal` on a page with no core throws a
 * bare `ReferenceError` before the skew gate in `output.intro` can run and say
 * what actually went wrong. `?.` yields `undefined` instead, and the gate then
 * returns without registering.
 *
 * `svelte/internal/disclose-version` is a side-effect-only module the DEV
 * compiler emits to register the runtime version for devtools; a production
 * build emits no import of it. It is mapped anyway so a stray import cannot turn
 * into a bare unresolved global.
 */
const globals = {
    svelte: 'window.Triiiceratops?.svelte',
    'svelte/internal/client': 'window.Triiiceratops?.svelteInternal',
    'svelte/internal/disclose-version': 'window.Triiiceratops?.svelte',
    // Core's curated utilities, read off the namespace for the same reason and
    // under the same first-party rules as its Svelte runtime: bundling them
    // would ship a second copy of the painting classifier and the IIIF parsing
    // helpers the core script beside this one has already parsed.
    triiiceratops: 'window.Triiiceratops?.core',
};

export default defineConfig({
    plugins: [
        // `emitCss: true` extracts each component's (still Svelte-scoped) CSS
        // through Vite's CSS pipeline instead of Svelte's runtime `append_styles`
        // injection — which would append an un-nonced `<style>` to the document
        // head and be blocked under a strict `style-src` CSP. `bundledCss()`
        // collects that extracted CSS into the `virtual:tri-bundled-css` module
        // and strips the stray `.css` asset, so the entry can install it through
        // the root-aware, nonce-aware SDK style service.
        svelte({
            emitCss: true,
            compilerOptions: { customElement: false },
        }),
        bundledCss(),
        minifiedRawCss(),
        ...(format === 'iife' ? [chunkedIife()] : []),
    ],
    build: {
        // Lowering private fields leaks helpers outside Vite's generated IIFE.
        target: 'es2022',
        // Production build: no dev-only `svelte/internal` strings or warnings.
        minify: true,
        // One extracted CSS asset (bundledCss concatenates + strips it).
        cssCodeSplit: false,
        lib,
        rollupOptions: {
            external,
            output: {
                globals,
                /*
                    Nothing is inlined in any format. The ESM build splits its
                    dynamic imports into hashed chunks a consumer's bundler
                    re-splits; the IIFE's lazy halves are taken out of its graph
                    by `chunkedIife()` and emitted by the `iife-chunks` build
                    instead (SPEC — "Delivery and packaging", deliberate
                    template deviation 1).
                */
                inlineDynamicImports: false,
                // Only the IIFE reads core's runtime off a global, so only it
                // needs the gate. `intro` is the one hook that lands inside the
                // generated function and ahead of every module statement, which
                // is what lets the gate `return` before a compiled component
                // dereferences a helper that is not there — see
                // src/sharedRuntimeGate.ts. The chunk-base capture goes ahead of
                // the gate so its `return` cannot skip it.
                ...(format === 'iife'
                    ? {
                          intro: CHUNK_BASE_SOURCE + sharedRuntimeGateSource(),
                      }
                    : {}),
            },
        },
        outDir: 'dist',
        emptyOutDir: false,
    },
});
