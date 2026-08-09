/*
 * A terser pass OVER esbuild's output, for the two self-contained element
 * builds (build-time tooling — lives in src/packaging, never published).
 *
 * This is a two-pass pipeline, not a minifier swap, and the ordering is the
 * whole point. Setting `build.minify: 'terser'` replaces esbuild's minifier
 * rather than following it, and measures 4,646 gzip bytes WORSE than running
 * terser over what esbuild already produced. Both orderings were measured; see
 * the epic spec. So the configs keep `build.minify: true` and register this
 * plugin, which reads the written chunk back and minifies it again.
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
 *     attribute it is given.
 *
 * Neither element config enables `sourcemap`, so there is no map to chain and
 * none is generated here.
 *
 * Registered ONLY in `vite.config.element.ts` and `vite.config.element-esm.ts`.
 * The `svelte-package` library path must not get it: Svelte, React and Vue
 * consumers receive readable package output and minify it with their own
 * bundler, and byte-for-byte that path is unchanged by this module's existence.
 */

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { minify, type MinifyOptions } from 'terser';

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

/*
 * The slices of Rollup's `writeBundle` arguments this plugin reads. Typed
 * structurally rather than imported from rollup so this stays a plain
 * build-time helper, and so the test can call the hook with a literal.
 */
interface WriteBundleOutputOptions {
    dir?: string;
}

interface BundleEntry {
    type: 'chunk' | 'asset';
    fileName: string;
    code?: string;
}

export interface TerserElementPlugin {
    name: string;
    writeBundle(
        options: WriteBundleOutputOptions,
        bundle: Record<string, BundleEntry>,
    ): Promise<void>;
}

/**
 * Rollup plugin running {@link minifyElementChunk} over every JS chunk after
 * Vite has written it.
 *
 * `writeBundle` rather than `renderChunk`, because esbuild's minifier is itself
 * a `renderChunk` hook and the ordering between two of them is a plugin-order
 * question; running after the write is unambiguously second.
 *
 * A pass that finds nothing to do throws. This plugin's whole output is bytes
 * that nothing else observes — `scripts/size-check.mjs` only fails on GROWTH,
 * so an artifact that silently stopped being terser-processed reads to the gate
 * as a change to re-baseline, and the saving would be handed back without a
 * single failing check.
 */
export function terserElementBuilds(): TerserElementPlugin {
    return {
        name: 'triiiceratops:terser-element',
        async writeBundle(options, bundle) {
            const chunks = Object.values(bundle).filter(
                (entry): entry is BundleEntry & { code: string } =>
                    entry.type === 'chunk' && typeof entry.code === 'string',
            );
            if (chunks.length === 0) {
                throw new Error(
                    `triiiceratops:terser-element found no JavaScript chunk to ` +
                        `minify. The element build emitted only ` +
                        `[${Object.keys(bundle).join(', ')}], so the terser pass ` +
                        `ran over nothing and the shipped artifact is ` +
                        `esbuild-minified only.`,
                );
            }
            if (options.dir === undefined) {
                throw new Error(
                    `triiiceratops:terser-element cannot find the output ` +
                        `directory: Rollup passed no \`dir\`. The element builds ` +
                        `must emit into \`build.outDir\`, not to a single \`file\`.`,
                );
            }
            const dir = options.dir;
            await Promise.all(
                chunks.map(async (chunk) => {
                    const code = await minifyElementChunk(
                        chunk.code,
                        chunk.fileName,
                    );
                    await writeFile(join(dir, chunk.fileName), code, 'utf8');
                }),
            );
        },
    };
}
