import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
    ELEMENT_TERSER_OPTIONS,
    minifyElementChunk,
    terserElementBuilds,
} from './terserElement';

/** A throwaway output directory standing in for `dist/`. */
function outDir(): string {
    return mkdtempSync(join(tmpdir(), 'terser-element-'));
}

describe('ELEMENT_TERSER_OPTIONS', () => {
    it('uses the measured compress settings', () => {
        expect(ELEMENT_TERSER_OPTIONS.compress).toEqual({
            passes: 3,
            pure_getters: true,
        });
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
        // Property mangling would rename the `attribute` keys of the wrapper's
        // custom-element props definition, so attribute reflection would stop
        // working while the element went on registering.
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
    it('rewrites every emitted JS chunk on disk', async () => {
        const dir = outDir();
        const plugin = terserElementBuilds();
        const before =
            'function f(x){var y=x*2;var z=y+1;return z}globalThis.f=f;';
        writeFileSync(join(dir, 'element.js'), before);

        await plugin.writeBundle(
            { dir },
            {
                'element.js': {
                    type: 'chunk',
                    fileName: 'element.js',
                    code: before,
                },
            },
        );

        const after = readFileSync(join(dir, 'element.js'), 'utf8');
        expect(after.length).toBeLessThan(before.length);
    });

    it('leaves non-chunk assets untouched', async () => {
        const dir = outDir();
        const plugin = terserElementBuilds();
        const css = '.a{color:red}';
        writeFileSync(join(dir, 'element.css'), css);

        await plugin.writeBundle(
            { dir },
            {
                'element.css': { type: 'asset', fileName: 'element.css' },
                'element.js': {
                    type: 'chunk',
                    fileName: 'element.js',
                    code: 'globalThis.x=1;',
                },
            },
        );

        expect(readFileSync(join(dir, 'element.css'), 'utf8')).toBe(css);
    });

    it('fails the build when the bundle contained no chunk to minify', async () => {
        // A silently-skipping post-build pass is how a size gate quietly stops
        // measuring a minified artifact; make the omission loud instead.
        const dir = outDir();
        await expect(
            terserElementBuilds().writeBundle(
                { dir },
                { 'element.css': { type: 'asset', fileName: 'element.css' } },
            ),
        ).rejects.toThrow(/no JavaScript chunk/i);
    });

    it('fails when the output directory is unknown', async () => {
        await expect(
            terserElementBuilds().writeBundle(
                {},
                {
                    'element.js': {
                        type: 'chunk',
                        fileName: 'element.js',
                        code: 'globalThis.x=1;',
                    },
                },
            ),
        ).rejects.toThrow(/output directory/i);
    });
});
