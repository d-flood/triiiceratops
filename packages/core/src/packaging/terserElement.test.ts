import { describe, it, expect } from 'vitest';
import type { Plugin } from 'vite';

import {
    ELEMENT_TERSER_OPTIONS,
    minifyElementChunk,
    terserElementBuilds,
} from './terserElement';

/*
 * The two hooks, unwrapped from Rollup's `{ order, handler }` object form and
 * narrowed to the slices this plugin actually reads. Calling them directly is
 * the point: the plugin's failure mode is not running at all, so the tests
 * drive the hooks rather than a build.
 */
type RenderChunk = (
    code: string,
    chunk: { fileName: string },
) => Promise<{ code: string } | null>;

type WriteBundle = (
    options: Record<string, unknown>,
    bundle: Record<string, { type: 'chunk' | 'asset'; fileName: string }>,
) => void;

function renderChunkOf(plugin: Plugin): RenderChunk {
    const hook = plugin.renderChunk;
    if (typeof hook !== 'object' || hook === null) {
        throw new Error('renderChunk must use the object form to set `order`.');
    }
    return hook.handler as unknown as RenderChunk;
}

function writeBundleOf(plugin: Plugin): WriteBundle {
    const hook = plugin.writeBundle;
    return (typeof hook === 'function'
        ? hook
        : hook!.handler) as unknown as WriteBundle;
}

describe('ELEMENT_TERSER_OPTIONS', () => {
    it('uses the measured compress settings', () => {
        expect(ELEMENT_TERSER_OPTIONS.compress).toEqual({ passes: 3 });
    });

    it('assumes nothing about property reads being pure', () => {
        // A Svelte 5 `$derived` is subscribed to by being READ, so an effect
        // that names a dependency as a bare read has a statement terser would
        // call dead under `pure_getters`. Deleting it leaves the effect
        // compiling, registering, and never running again for that dependency
        // — in the shipped artifact only. See this module's header for the
        // framing bug it cost and for the e2e spec that is the only thing that
        // can catch it.
        const compress = ELEMENT_TERSER_OPTIONS.compress as Record<
            string,
            unknown
        >;
        expect(compress.pure_getters ?? false).toBe(false);
    });

    it('enables no unsafe compression', () => {
        const compress = ELEMENT_TERSER_OPTIONS.compress as Record<
            string,
            unknown
        >;
        const unsafe = Object.keys(compress).filter((k) =>
            k.startsWith('unsafe'),
        );
        expect(unsafe).toEqual([]);
    });

    it('mangles identifiers but never property names', () => {
        // Property mangling renames the `attribute` keys of the wrapper's
        // custom-element props definition, so attribute reflection stops
        // working while the element goes on registering. Built and measured:
        // `scripts/check-element-artifact.mjs` is what notices, because its
        // attribute-map regex drops to zero matches.
        const mangle = ELEMENT_TERSER_OPTIONS.mangle;
        expect(mangle).not.toBe(false);
        if (typeof mangle === 'object' && mangle !== null) {
            expect(
                (mangle as Record<string, unknown>).properties ?? false,
            ).toBe(false);
        }
    });

    it('drops every comment', () => {
        expect(ELEMENT_TERSER_OPTIONS.format?.comments).toBe(false);
    });

    it('configures no source map, matching the element builds', () => {
        expect(ELEMENT_TERSER_OPTIONS.sourceMap ?? false).toBe(false);
    });
});

describe('minifyElementChunk', () => {
    it('shrinks output esbuild already minified', async () => {
        // esbuild's minifier leaves single-use locals and the redundant
        // `return` chain alone; terser collapses them.
        const esbuildish =
            'function f(x){var y=x*2;var z=y+1;return z}globalThis.f=f;';
        const out = await minifyElementChunk(esbuildish);
        expect(out.length).toBeLessThan(esbuildish.length);
        // Still the same function.
        const scope: { f?: (n: number) => number } = {};
        new Function('globalThis', out)(scope);
        expect(scope.f?.(3)).toBe(7);
    });

    it('preserves the custom-element attribute map', async () => {
        // The shape Svelte's custom-element codegen emits from
        // `<svelte:options customElement={{ props: … }} />`.
        const code =
            'globalThis.El={props:{manifestId:{attribute:"manifest-id"},' +
            'canvasId:{attribute:"canvas-id"},theme:{attribute:"theme"}}};';
        const out = await minifyElementChunk(code);
        expect(out).toContain('"manifest-id"');
        expect(out).toContain('"canvas-id"');
        expect(out).toMatch(/attribute\s*:/);
    });

    it('strips comments esbuild kept', async () => {
        const out = await minifyElementChunk(
            '/*! legal */globalThis.x=1;//trailing\n',
        );
        expect(out).not.toContain('legal');
    });

    it('reports the offending file when terser cannot parse the chunk', async () => {
        await expect(
            minifyElementChunk('function (){', 'broken.js'),
        ).rejects.toThrow(/broken\.js/);
    });
});

describe('terserElementBuilds', () => {
    it('runs its renderChunk last, after esbuild minifies', () => {
        // `vite:esbuild-transpile` minifies in `renderChunk` with no `order`,
        // so `post` is what makes this pass unambiguously the second one.
        // `writeBundle` would not: Rollup classifies it as a PARALLEL hook.
        const hook = terserElementBuilds().renderChunk;
        expect(typeof hook).toBe('object');
        expect((hook as { order?: string }).order).toBe('post');
    });

    it('returns the minified chunk to Rollup rather than writing it', async () => {
        // Returning it keeps the in-memory bundle equal to the shipped file,
        // which is what `vite:reporter` reads its sizes from.
        const before =
            'function f(x){var y=x*2;var z=y+1;return z}globalThis.f=f;';
        const result = await renderChunkOf(terserElementBuilds())(before, {
            fileName: 'element.js',
        });
        expect(result?.code.length).toBeLessThan(before.length);
    });

    it('names the offending chunk when terser cannot parse it', async () => {
        await expect(
            renderChunkOf(terserElementBuilds())('function (){', {
                fileName: 'broken.js',
            }),
        ).rejects.toThrow(/broken\.js/);
    });

    it('fails the build when it never minified a chunk', () => {
        // A silently-skipping minification pass is how a size gate quietly
        // stops measuring a minified artifact; make the omission loud instead.
        const plugin = terserElementBuilds();
        expect(() =>
            writeBundleOf(plugin)(
                { dir: '/out' },
                { 'element.css': { type: 'asset', fileName: 'element.css' } },
            ),
        ).toThrow(/no JavaScript chunk/i);
    });

    it('passes once a chunk has been minified', async () => {
        const plugin = terserElementBuilds();
        await renderChunkOf(plugin)('globalThis.x=1;', {
            fileName: 'element.js',
        });
        expect(() =>
            writeBundleOf(plugin)(
                { dir: '/out' },
                {
                    'element.js': { type: 'chunk', fileName: 'element.js' },
                },
            ),
        ).not.toThrow();
    });
});
