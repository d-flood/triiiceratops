// @vitest-environment node
import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Plugin } from 'vite';

import { pluginBuild, type PluginBuildOptions } from './pluginBuild';

const OPTIONS: PluginBuildOptions = {
    root: '/pkg',
    name: 'demo',
    globalName: 'TriiiceratopsDemo',
    entries: { index: 'src/index.ts', svelte: 'src/svelte.ts' },
    svelteEntries: ['svelte'],
    iifeEntry: 'src/iife.ts',
    extraExternal: ['extra'],
    iifeLazyChunks: { 'lazy-lib': 'lazy.js' },
};

function configFor(format: string | undefined, options = OPTIONS) {
    vi.stubEnv('BUILD_FORMAT', format);
    return pluginBuild(options);
}

type Hooks = {
    resolveId: (source: string) => unknown;
    renderDynamicImport: (options: {
        targetModuleId: string | null;
    }) => unknown;
    generateBundle: (this: unknown) => Promise<void>;
    load: (id: string) => Promise<string | null>;
};

function plugin(config: ReturnType<typeof pluginBuild>, name: string) {
    return (config.plugins as Plugin[])
        .flat()
        .find((p) => p?.name === name) as unknown as Hooks;
}

afterEach(() => vi.unstubAllEnvs());

describe('pluginBuild', () => {
    it('builds every entry as split ES with peers external', () => {
        const { build } = configFor(undefined);
        expect(build?.lib).toEqual({
            entry: { index: '/pkg/src/index.ts', svelte: '/pkg/src/svelte.ts' },
            formats: ['es'],
        });
        expect(build?.rollupOptions?.external).toHaveLength(3);
        expect(build?.rollupOptions?.output).toEqual({
            entryFileNames: '[name].js',
            chunkFileNames: 'chunks/[name]-[hash].js',
        });
        expect(build?.outDir).toBe('dist');
    });

    it('builds only the Svelte entries, with Svelte external, for the svelte condition', () => {
        const config = configFor('svelte');
        const lib = config.build?.lib as unknown as { fileName: () => string };
        expect(lib).toMatchObject({
            entry: '/pkg/src/svelte.ts',
            formats: ['es'],
        });
        expect(lib.fileName()).toBe('svelte.js');
        const external = config.build?.rollupOptions?.external as RegExp[];
        expect(
            external.some(
                (e) => e instanceof RegExp && e.test('svelte/internal'),
            ),
        ).toBe(true);
        expect(config.build?.rollupOptions?.output).toEqual({
            inlineDynamicImports: true,
        });
        expect(config.build?.outDir).toBe('dist/svelte');
    });

    it('falls back to every entry when no Svelte entries are named', () => {
        const { build } = configFor('svelte', {
            ...OPTIONS,
            svelteEntries: undefined,
        });
        expect(Object.keys((build?.lib as { entry: object }).entry)).toEqual([
            'index',
            'svelte',
        ]);
    });

    it('bundles everything into one IIFE with the lazy-chunk loader', () => {
        const config = configFor('iife');
        const lib = config.build?.lib as unknown as { fileName: () => string };
        expect(lib).toMatchObject({
            entry: '/pkg/src/iife.ts',
            formats: ['iife'],
            name: 'TriiiceratopsDemo',
        });
        expect(lib.fileName()).toBe('iife.js');
        expect(config.build?.rollupOptions?.external).toEqual([]);
        expect(config.build?.rollupOptions?.output).toMatchObject({
            inlineDynamicImports: true,
            intro: expect.stringContaining('__triChunkImport'),
        });
        expect(plugin(config, 'demo-lazy-chunks')).toBeDefined();
    });

    it('adds no loader to an IIFE without lazy chunks', () => {
        const config = configFor('iife', { ...OPTIONS, iifeLazyChunks: {} });
        expect(config.build?.rollupOptions?.output).toEqual({
            inlineDynamicImports: true,
        });
        expect(plugin(config, 'demo-lazy-chunks')).toBeUndefined();
    });
});

describe('the lazy-chunk plugin', () => {
    const lazy = () => plugin(configFor('iife'), 'demo-lazy-chunks');

    it('externalizes a lazy specifier under its chunk file name', () => {
        expect(lazy().resolveId('lazy-lib')).toEqual({
            id: 'lazy.js',
            external: true,
        });
        expect(lazy().resolveId('other')).toBeNull();
    });

    it('routes only the lazy chunks through the loader', () => {
        expect(
            lazy().renderDynamicImport({ targetModuleId: 'lazy.js' }),
        ).toEqual({
            left: '__triChunkImport(',
            right: ')',
        });
        expect(
            lazy().renderDynamicImport({ targetModuleId: 'other.js' }),
        ).toBeNull();
        expect(lazy().renderDynamicImport({ targetModuleId: null })).toBeNull();
    });

    it('fails when a lazy specifier cannot be resolved', async () => {
        await expect(
            lazy().generateBundle.call({ resolve: async () => null }),
        ).rejects.toThrow(/cannot resolve lazy-lib/);
    });
});

describe('the raw-CSS plugin', () => {
    const raw = () => plugin(configFor(undefined), 'demo-minify-raw-css');

    it('minifies a raw stylesheet into a string export', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'plugin-build-'));
        const file = join(dir, 'a.css');
        writeFileSync(file, '.a {\n    color: red;\n}\n');
        const code = await raw().load(`${file}?raw`);
        expect(code).toMatch(
            /^export default ".a\s*\{\s*color:\s*red;?\s*\}";$/,
        );
    });

    it('leaves every other module alone', async () => {
        expect(await raw().load('/abs/a.css')).toBeNull();
    });
});
