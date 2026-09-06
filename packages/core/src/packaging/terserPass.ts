/*
 * A terser pass OVER a Vite build's own minifier output (build-time tooling —
 * lives in src/packaging, never published).
 *
 * The mechanics only; the OPTIONS belong to each caller, because "conservative"
 * means something different per artifact. `terserElement.ts` holds core's two
 * element artifacts' options and the measurements behind them;
 * `packages/plugin-av/vite.config.ts` holds the AV plugin's, which differ over
 * whether the output still has a bundler downstream. Callers reach this by
 * source path — `src/packaging` is neither published nor exported — the same
 * way they already reach `minifyCss`.
 *
 * Terser lives in core's dependencies, so every caller's `import` of it
 * resolves from THIS file rather than from the calling package. That is the
 * reason the pass is shared as a plugin rather than as an options object each
 * package minifies with itself.
 */

import { minify, type MinifyOptions } from 'terser';
import type { Plugin } from 'vite';

/**
 * Minify one already-minified chunk.
 *
 * `fileName` only names the artifact in the failure message. Terser reports a
 * parse error as a bare line/column into a single-line 400 KB bundle, which is
 * unreadable without knowing which artifact it came from.
 */
export async function minifyChunk(
    code: string,
    options: MinifyOptions,
    fileName = 'chunk',
): Promise<string> {
    let result;
    try {
        result = await minify(code, options);
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
 * Rollup plugin running {@link minifyChunk} over every JS chunk Vite renders.
 *
 * `renderChunk` with `order: 'post'`, because esbuild's minifier is itself a
 * `renderChunk` hook (`vite:esbuild-transpile`) and this pass has to be the
 * second one. `renderChunk` is one of Rollup's SEQUENTIAL hooks and honours
 * `order`, so `'post'` is an actual guarantee of running last rather than a
 * plugin-array coincidence. It is also still inside chunk rendering, so content
 * hashes and the import references naming them are computed from the minified
 * bytes. `writeBundle`, the obvious alternative, is a PARALLEL hook: it would
 * be less ordered, not more, and minifying there means rewriting the file
 * behind Rollup's back — the in-memory bundle would keep the pre-terser code,
 * so hashes would name content no file has, `vite:reporter` would print sizes
 * the shipped files do not have, and any other `writeBundle` post-processor
 * touching the same file would race this one.
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
export function terserPass(name: string, options: MinifyOptions): Plugin {
    let minified = 0;
    return {
        name,
        renderChunk: {
            order: 'post',
            async handler(code, chunk) {
                minified += 1;
                return {
                    code: await minifyChunk(code, options, chunk.fileName),
                    map: null,
                };
            },
        },
        writeBundle(_options, bundle) {
            if (minified > 0) return;
            throw new Error(
                `${name} found no JavaScript chunk to minify. The build ` +
                    `emitted only [${Object.keys(bundle).join(', ')}], so the ` +
                    `terser pass ran over nothing and the shipped artifact is ` +
                    `esbuild-minified only.`,
            );
        },
    };
}
