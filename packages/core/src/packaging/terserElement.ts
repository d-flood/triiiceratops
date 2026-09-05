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
 * The options are fixed by the same measurements:
 *
 *   - `compress: { passes: 3, pure_getters: true }`. More passes stop paying.
 *   - `unsafe*` compression is deliberately OFF. It was measured and gains 468
 *     further bytes over a ~122 KB artifact, which does not buy the risk of
 *     terser assuming things about coercion and prototypes in Svelte's compiled
 *     signal plumbing.
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
 * `mangle.toplevel` is left at its default `false`, as is `module`, so terser
 * renames nothing at the top level of either artifact. Both are single
 * self-contained bundles whose top-level names esbuild has already shortened.
 *
 * Neither element config enables `sourcemap`, so there is no map to chain and
 * none is generated here.
 *
 * Registered ONLY in `vite.config.element.ts` and `vite.config.element-esm.ts`.
 * The `svelte-package` library path must not get it: Svelte, React and Vue
 * consumers receive readable package output and minify it with their own
 * bundler, and byte-for-byte that path is unchanged by this module's existence.
 */

import { minify, type MinifyOptions } from 'terser';
import type { Plugin } from 'vite';

/**
 * The measured terser configuration for the element artifacts. Exported so the
 * two configs share one copy and a test can hold the contract still.
 */
export const ELEMENT_TERSER_OPTIONS: MinifyOptions = {
    compress: { passes: 3, pure_getters: true },
    mangle: true,
    format: { comments: false },
};

/**
 * Minify one already-esbuild-minified chunk with {@link ELEMENT_TERSER_OPTIONS}.
 *
 * `fileName` only names the artifact in the failure message. Terser reports a
 * parse error as a bare line/column into a single-line 400 KB bundle, which is
 * unreadable without knowing which of the two artifacts it came from.
 */
export async function minifyElementChunk(
    code: string,
    fileName = 'chunk',
): Promise<string> {
    let result;
    try {
        result = await minify(code, ELEMENT_TERSER_OPTIONS);
    } catch (cause) {
        throw new Error(
            `terser failed on ${fileName}: ${(cause as Error).message}`,
            { cause },
        );
    }
    if (typeof result.code !== 'string') {
        throw new Error(`terser produced no code for ${fileName}.`);
    }
    return result.code;
}

/**
 * Rollup plugin running {@link minifyElementChunk} over every JS chunk Vite
 * renders.
 *
 * `renderChunk` with `order: 'post'`, because esbuild's minifier is itself a
 * `renderChunk` hook (`vite:esbuild-transpile`) and this pass has to be the
 * second one. `renderChunk` is one of Rollup's SEQUENTIAL hooks and honours
 * `order`, so `'post'` is an actual guarantee of running last rather than a
 * plugin-array coincidence. `writeBundle`, the obvious alternative, is a
 * PARALLEL hook: it would be less ordered, not more, and minifying there means
 * rewriting the file behind Rollup's back — the in-memory bundle would keep the
 * pre-terser code, so `vite:reporter` would print sizes the shipped file does
 * not have and any other `writeBundle` post-processor touching the same file
 * would race this one.
 *
 * A build in which this plugin never minified anything throws from
 * `writeBundle`. This plugin's whole output is bytes that nothing else observes
 * — `scripts/size-check.mjs` only fails on GROWTH, so an artifact that silently
 * stopped being terser-processed reads to the gate as a change to re-baseline,
 * and the saving would be handed back without a single failing check. The
 * plugin is typed as Vite's `Plugin` for the other half of that: a renamed or
 * re-signatured hook is a compile error here rather than a plugin that
 * type-checks clean and quietly does nothing.
 */
export function terserElementBuilds(): Plugin {
    let minified = 0;
    return {
        name: 'triiiceratops:terser-element',
        renderChunk: {
            order: 'post',
            async handler(code, chunk) {
                minified += 1;
                return {
                    code: await minifyElementChunk(code, chunk.fileName),
                    map: null,
                };
            },
        },
        writeBundle(_options, bundle) {
            if (minified > 0) return;
            throw new Error(
                `triiiceratops:terser-element found no JavaScript chunk to ` +
                    `minify. The element build emitted only ` +
                    `[${Object.keys(bundle).join(', ')}], so the terser pass ` +
                    `ran over nothing and the shipped artifact is ` +
                    `esbuild-minified only.`,
            );
        },
    };
}
