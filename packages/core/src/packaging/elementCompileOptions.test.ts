import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { noCustomElementGuard } from './elementCompileOptions';

/** What `svelte.compile({ customElement: true })` appends to a component. */
const CODEGEN = `customElements.define('x-y', $.create_custom_element(X, {}, [], [], true));`;

type Config = {
    compilerOptions?: { customElement?: boolean };
    vitePlugin?: { dynamicCompileOptions?: unknown };
};

async function loadConfig(file: string): Promise<Config> {
    // Loaded through a computed URL rather than a static specifier: a static
    // import would pull the config into tsconfig.app.json's composite program.
    const module = (await import(
        pathToFileURL(resolve(__dirname, '..', '..', file)).href
    )) as { default: Config };
    return module.default;
}

describe('no component is compiled as a custom element', () => {
    it('in svelte.config.js', async () => {
        const config = await loadConfig('svelte.config.js');
        expect(config.compilerOptions?.customElement).toBe(false);
        expect(config.vitePlugin?.dynamicCompileOptions).toBeUndefined();
    });

    it('in both element builds', async () => {
        for (const file of [
            'vite.config.element.ts',
            'vite.config.element-esm.ts',
        ]) {
            const config = (await import(
                pathToFileURL(resolve(__dirname, '..', '..', file)).href
            )) as { default: { plugins: Array<{ name?: string }> } };
            const names = config.default.plugins
                .flat()
                .map((plugin) => plugin?.name);
            expect(names, file).toContain(
                'triiiceratops:no-custom-element-codegen',
            );
        }
    });
});

describe('noCustomElementGuard', () => {
    it('passes a build with no custom-element codegen', () => {
        const guard = noCustomElementGuard();
        guard.transform('export default function X() {}', '/abs/X.svelte');
        expect(() => guard.buildEnd()).not.toThrow();
    });

    it('fails when any component was compiled as a custom element', () => {
        const guard = noCustomElementGuard();
        guard.transform(CODEGEN, '/abs/path/lib/MetadataPanel.svelte');

        expect(() => guard.buildEnd()).toThrow(
            /1 component\(s\).*MetadataPanel\.svelte/s,
        );
    });

    it('ignores the compiler’s non-component sub-modules', () => {
        const guard = noCustomElementGuard();
        guard.transform(CODEGEN, '/abs/path/Other.svelte?svelte&type=style');
        guard.transform(CODEGEN, '/abs/path/internal/client.js');

        expect(() => guard.buildEnd()).not.toThrow();
    });

    it('stays quiet when the build already failed for another reason', () => {
        const guard = noCustomElementGuard();
        guard.transform(CODEGEN, '/abs/path/lib/MetadataPanel.svelte');
        expect(() =>
            guard.buildEnd(new Error('rollup already failed')),
        ).not.toThrow();
    });
});
