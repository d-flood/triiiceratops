/*
 * A terser pass OVER esbuild's output, for the two self-contained element
 * builds (build-time tooling — lives in src/packaging, never published).
 *
 * This is a two-pass pipeline, not a minifier swap, and the ordering is the
 * whole point. Setting `build.minify: 'terser'` replaces esbuild's minifier
 * rather than following it, and measures 4,646 gzip bytes WORSE than running
 * terser over what esbuild already produced. So the configs keep
 * `build.minify: true` and register this
 * plugin, which minifies each rendered chunk a second time.
 *
 * The options are fixed by the same measurements, except where a note below
 * says a setting is a correctness constraint instead:
 *
 *   - `compress: { passes: 3 }`. More passes stop paying.
 *   - `pure_getters` is deliberately OFF, and this one is a CORRECTNESS
 *     setting rather than a measurement. It tells terser that reading a
 *     property has no side effects, which is false for every Svelte 5 signal:
 *     a `$derived` is subscribed to BY READING IT. An effect that names its
 *     dependency as a bare read — `void renderer.paintedGeometry;` in
 *     `CanvasHost.svelte` is the pattern — then has that statement deleted as
 *     dead, and the effect silently loses a dependency it still needs. What
 *     that costs, concretely: a claimed audiovisual canvas whose companion
 *     geometry arrives after its world does never gets its opening fit, and the
 *     picture is framed at the surface's top-left corner — in the shipped
 *     artifact only, while the dev server shows it centred. Nothing in the
 *     source can defend against it, and no unit test can see it; only an e2e
 *     spec driving the BUILT element does (`tests/av-audio.spec.ts`, the
 *     companion drag and wheel; `tests/wc-parity.spec.ts` drives the same
 *     late-geometry refit against the built ESM entry, which is the artifact
 *     that gets the extra licence below).
 *   - `unsafe*` compression is OFF for the same class of reason. It was
 *     measured and gains 468 further bytes over a ~122 KB artifact, which does
 *     not buy the risk of terser assuming things about coercion and prototypes
 *     in Svelte's compiled signal plumbing.
 *   - Default mangling, meaning identifiers only. Property mangling is what
 *     would break this artifact quietly: the wrapper's custom-element props
 *     definition is a plain object whose `attribute` keys and `'manifest-id'`
 *     style string values ARE the attribute contract, and a renamed key leaves
 *     `<triiiceratops-viewer>` registering happily while ignoring every
 *     attribute it is given. Turning it on was built and measured: the artifact
 *     keeps its `static get observedAttributes()` (that name is in terser's
 *     `domprops` reserved list) and keeps the `"manifest-id"` string, but every
 *     `attribute:` key is gone. `scripts/check-element-artifact.mjs` catches
 *     exactly that, and only that.
 *
 * Terser's `module` flag is the ONE setting that differs between the two
 * artifacts, which is why every caller names the format it is minifying rather
 * than reaching for one shared options constant. `module: true` asserts the
 * code is an ES module: strict mode throughout, and nothing outside the file
 * can reach a top-level binding. That licenses `mangle.toplevel` and the
 * cross-statement compression `compress.module` turns on. It is TRUE for the
 * ESM artifact and must stay FALSE for the IIFE: Vite wraps the IIFE in a
 * function whose body is not a module, so telling terser otherwise would apply
 * strict-mode and unreachable-binding assumptions to script-scope code.
 * Neither artifact exports anything a consumer names — both are registration
 * side effects, single self-contained bundles — so on the ESM side the whole
 * top level is genuinely private and renameable.
 *
 * Neither element config enables `sourcemap`, so there is no map to chain and
 * none is generated here.
 *
 * The pass itself — the rollup hook, its ordering and its did-nothing guard —
 * is `terserPass.ts`, shared with the AV plugin's build. This module is the
 * element artifacts' OPTIONS and the measurements behind them.
 *
 * Registered ONLY in `vite.config.element.ts` and `vite.config.element-esm.ts`.
 * The `svelte-package` library path must not get it: Svelte, React and Vue
 * consumers receive readable package output and minify it with their own
 * bundler, and byte-for-byte that path is unchanged by this module's existence.
 */

import type { MinifyOptions } from 'terser';
import type { Plugin } from 'vite';

import { minifyChunk, terserPass } from './terserPass';

/**
 * Which of the two element artifacts is being minified, in Vite's own
 * `build.lib.formats` spelling so a config cannot name one thing and build
 * another.
 */
export type ElementFormat = 'iife' | 'es';

/**
 * The measured terser configuration shared by both element artifacts —
 * everything that is NOT format-dependent. Exported so a test can hold the
 * contract still; builds call {@link elementTerserOptions} instead, because
 * these options alone are the conservative script-scope half.
 */
export const ELEMENT_TERSER_OPTIONS: MinifyOptions = {
    compress: { passes: 3 },
    mangle: true,
    format: { comments: false },
};

/**
 * {@link ELEMENT_TERSER_OPTIONS} with the module semantics `format` earns. See
 * this module's header for why only `'es'` gets them.
 */
export function elementTerserOptions(format: ElementFormat): MinifyOptions {
    return { ...ELEMENT_TERSER_OPTIONS, module: format === 'es' };
}

/**
 * Minify one already-esbuild-minified element chunk with the options
 * {@link elementTerserOptions} gives `format`.
 */
export function minifyElementChunk(
    code: string,
    format: ElementFormat,
    fileName = 'chunk',
): Promise<string> {
    return minifyChunk(code, elementTerserOptions(format), fileName);
}

/**
 * The {@link terserPass} registered by both element configs, at the semantics
 * `format` earns.
 */
export function terserElementBuilds(format: ElementFormat): Plugin {
    return terserPass(
        'triiiceratops:terser-element',
        elementTerserOptions(format),
    );
}
