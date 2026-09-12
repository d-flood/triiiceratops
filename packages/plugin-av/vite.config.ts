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
import { terserPass } from '../core/src/packaging/terserPass';
import { sharedRuntimeGateSource } from './src/sharedRuntimeGate';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Build the plugin for one output format.
 *
 * `BUILD_FORMAT=es`   → `dist/index.js` (the ESM entry consumers import) plus
 *                      `dist/av-timeline.js`, `dist/av-hls.js`,
 *                      `dist/av-sequencer.js`, `dist/av-transcript.js` — the
 *                      lazy halves, under fixed names.
 * `BUILD_FORMAT=iife` → `dist/iife.js`  (a `<script>`-loadable bundle that
 *                      registers into `window.Triiiceratops.plugins`), which
 *                      fetches those same four chunks from beside itself.
 *
 * ## The deliberate deviation: the dist is a DIRECTORY
 *
 * Every other first-party plugin ships one file per format, because
 * `inlineDynamicImports` folds its lazy code into the entry. This plugin does
 * not: hls.js is roughly 178 KB gzip of Media Source machinery that a manifest
 * of progressive MP4s never needs, and the timeline's ruler and waveform
 * parsers are another 3 KB that only a canvas with a lane to draw in needs. Inlining either would spend
 * the competitive pair budget (`scripts/size-check.mjs`) on bytes most readers
 * never use.
 *
 * Rollup cannot code-split an `iife` output — "UMD and IIFE output formats are
 * not supported for code-splitting builds" — so the IIFE build treats each lazy
 * module as EXTERNAL and, via `chunkedIife()` below, rewrites its `import()`
 * specifier into a URL resolved against the plugin's own
 * `document.currentScript.src`. A classic `<script>` can `import()` an ES
 * module, so the entry stays a plain IIFE.
 *
 * The chunks those URLs name are the ES build's own, emitted under the fixed
 * names in {@link LAZY_CHUNKS} rather than hashed ones. ONE set of files
 * therefore serves both loaders: the ESM entry reaches them by relative
 * specifier and the IIFE by resolved URL. They can be shared because a chunk
 * reaches neither Svelte nor core — `check-shared-runtime.mjs` fails the build
 * if one grows an import at all — so the ES build's externals never apply to
 * one, and what it emits is already the self-contained module a `<script>` page
 * can `import()`. It carries the `@__PURE__` annotations that build preserves,
 * which such a page reads as comments; the alternative, a second IIFE-side
 * build of the same modules, buys their absence for a duplicate 570 KB of
 * hls.js in the tarball.
 *
 * The consumer-visible contract is therefore behavioral: a script-tag consumer
 * hosts the whole `dist` directory rather than copying one file out of it, and
 * the chunks are fetched from beside `iife.js` on demand. A chunk that cannot
 * be fetched degrades exactly as an absent one does — an ungraduated lane, or that
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
const format = process.env.BUILD_FORMAT === 'iife' ? 'iife' : 'es';

/**
 * The modules the IIFE loads on demand: source specifier → emitted file name.
 *
 * The keys are exactly the specifiers the eager modules write in their
 * `await import()`. The values are the file names the ES build emits the chunks
 * under and the IIFE fetches them by, so a chunk cannot be renamed on one side
 * and fetched under the old name on the other.
 */
const LAZY_CHUNKS: Record<string, string> = {
    './timeline/index': 'av-timeline.js',
    './hls/index': 'av-hls.js',
    './sequencer/index': 'av-sequencer.js',
    './transcript/index': 'av-transcript.js',
};

/**
 * The same map keyed by the module rollup will hand `chunkFileNames` as a
 * chunk's `facadeModuleId` — the dynamically imported module's own resolved
 * path. Every lazy specifier is written from a module directly in `src/`, so
 * dropping the leading `./` and adding the extension is the whole resolution.
 *
 * Naming the chunks off the facade rather than off rollup's `name` is what makes
 * the names distinguishable at all: all four modules are called `index`, which
 * is why the hashed output was four indistinguishable `index-<hash>.js`.
 */
const LAZY_CHUNK_FACADES: Record<string, string> = Object.fromEntries(
    Object.entries(LAZY_CHUNKS).map(([specifier, file]) => [
        resolve(__dirname, 'src', `${specifier.slice('./'.length)}.ts`),
        file,
    ]),
);

/**
 * A second, conservative terser pass over what Vite's own minifier produced,
 * registered for every format. Core's element artifacts have run the same
 * two-pass pipeline since it measured better than swapping esbuild out
 * (`../core/src/packaging/terserElement.ts` carries those measurements and the
 * reasons `pure_getters`, `unsafe*` and property mangling stay off — Svelte's
 * compiled signal plumbing is this bundle's too, so the same three stay off
 * here).
 *
 * What this build needs that core's does not is that its two outputs are not
 * read by the same kind of consumer, and Vite's default minification already
 * reflects that: `build.minify` skips WHITESPACE for an ES library output,
 * because collapsing it would strip the `@__PURE__` annotations a downstream
 * bundler tree-shakes with. That is why `dist/index.js` and its chunks ship
 * pretty-printed today, and it is most of what this pass recovers — but only if
 * the annotations survive it. So:
 *
 *   - `preserve_annotations` is ON for the `es` build, whose output a
 *     consumer's bundler still has to tree-shake, and OFF for the IIFE, whose
 *     output goes to a browser with no bundler after it. A test asserts the
 *     annotations are still in the built ESM entry and chunks, and
 *     `consumer-bundles.guard.test.ts` bundles three consumers against them.
 *     The lazy chunks come out of the `es` build and so keep theirs, which a
 *     `<script>` page reading them as ES modules treats as comments.
 *   - `module` follows the OUTPUT format: true for the `es` build — the entry
 *     and the lazy chunks alike are ES modules — and false for the IIFE, whose
 *     body is script scope.
 *   - `comments: 'some'` keeps `@license`, `@preserve` and `/*!` banners, so a
 *     vendor notice that reaches this pass leaves in the artifact. hls.js marks
 *     none of its bundled third-party notices that way and Vite's esbuild pass
 *     drops them long before this one, so today nothing survives to be kept;
 *     this setting is what stops the second pass from being the reason.
 *   - `mangle` is OFF for the IIFE, and it is the one place this pass is
 *     deliberately left un-maximal. esbuild has already mangled that artifact;
 *     re-mangling it measures a further 448 gzip bytes, and it spends them
 *     renaming two-character locals to single letters. That is what
 *     `scripts/check-shared-runtime.mjs` cannot survive: it finds the locals
 *     holding `window.Triiiceratops.svelteInternal` and `.core` by name and
 *     then follows aliases of them textually, so once `p` is a namespace local
 *     the unrelated `s=p` and `c=f(p)` in every other function scope in the
 *     bundle join the set, and the gate reports 400 unpublished "helpers"
 *     instead of the real handful. That gate is the only thing standing between
 *     a compiled component reaching a helper core does not publish and a
 *     browser throwing "is not a function" at mount, so it is not weakened to
 *     collect the 448 bytes; making it scope-aware means parsing the artifact,
 *     which is its own change. The ESM entry and the lazy chunks have no
 *     globals wiring and no such gate, and keep full mangling — which is where
 *     this ticket's bytes are anyway.
 */
const terserOptions = {
    compress: { passes: 3 },
    mangle: format !== 'iife',
    module: format !== 'iife',
    format: {
        comments: 'some' as const,
        preserve_annotations: format === 'es',
    },
};

const lib =
    format === 'iife'
        ? {
              entry: resolve(__dirname, 'src/iife.ts'),
              formats: ['iife' as const],
              name: 'TriiiceratopsPluginAv',
              fileName: () => 'iife.js',
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
        : [SVELTE, /^@triiiceratops\/plugin-sdk(\/|$)/, CORE];

// None of these externals reaches a lazy chunk, and a chunk is the one place
// they must not: it is also fetched by a `<script>` page, which has no import
// map and no bundler, so a bare specifier left in one would be unresolvable at
// runtime. All four chunks are import-free today, and
// `check-shared-runtime.mjs` fails the build if one grows an import — which is
// what lets the ES build's chunks serve the IIFE as well.

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
        terserPass('tri-av-terser', terserOptions),
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
                    Nothing is inlined in either format. The ESM build splits
                    its dynamic imports into the chunks named in `LAZY_CHUNKS`;
                    the IIFE's lazy halves are taken out of its graph by
                    `chunkedIife()` and fetched from those same files (SPEC —
                    "Delivery and packaging", deliberate template deviation 1).
                */
                inlineDynamicImports: false,
                // Fixed names rather than hashed ones, so the IIFE — which
                // cannot code-split and so cannot learn a hash — can name the
                // very files the ESM build emitted. A chunk that is not one of
                // the lazy halves keeps the hashed default: it would be shared
                // eager code, which the entry imports statically and no loader
                // has to name.
                chunkFileNames: (chunk) =>
                    (chunk.facadeModuleId &&
                        LAZY_CHUNK_FACADES[chunk.facadeModuleId]) ||
                    '[name]-[hash].js',
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
