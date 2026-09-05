import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
    CUSTOM_ELEMENT_WRAPPER,
    elementOnlyCustomElement,
    wrapperCustomElementGuard,
} from './elementCompileOptions';

/*
 * Custom-element codegen belongs to the wrapper alone.
 *
 * A global `compilerOptions.customElement: true` does NOT restrict itself to
 * components declaring `<svelte:options customElement>` — every component in
 * the graph would get a `create_custom_element(...)` registration nobody
 * instantiates, plus the compiler's `custom_element_props_identifier`
 * warning.
 *
 * The counting half of that rule lives in the guard's `transform` hook,
 * reading the Svelte compiler's own output, so these tests feed it the two
 * shapes the compiler emits rather than running a build. The artifacts are
 * still checked on their own terms elsewhere:
 * `scripts/check-element-artifact.mjs` requires the wrapper's attribute map in
 * both bundles during `build:element`, and `distributions.test.ts` loads the
 * IIFE and asserts it defines exactly the one element.
 */

/** What `svelte.compile({ customElement: true })` appends to a component. */
const CODEGEN = `customElements.define('x-y', $.create_custom_element(X, {}, [], [], true));`;

/** Paths both copies of the rule must answer identically. */
const PATHS = [
    '/abs/path/lib/components/TriiiceratopsViewerElement.svelte',
    '/abs/path/lib/components/MetadataPanel.svelte',
    '/abs/path/packages/ui/src/Spinner.svelte',
    '/abs/path/NotTriiiceratopsViewerElement.svelte',
    '/abs/path/TriiiceratopsViewerElement.svelte.ts',
    'TriiiceratopsViewerElement.svelte',
];

describe('elementOnlyCustomElement', () => {
    it('upgrades the wrapper', () => {
        expect(
            elementOnlyCustomElement({
                filename:
                    '/abs/path/lib/components/TriiiceratopsViewerElement.svelte',
            }),
        ).toEqual({ customElement: true });
    });

    it('leaves every other component an ordinary Svelte component', () => {
        for (const filename of [
            '/abs/path/lib/components/MetadataPanel.svelte',
            '/abs/path/packages/ui/src/Spinner.svelte',
            // The whole basename must match. A suffix test (`endsWith`) says
            // yes to this one, and to anything else someone names with the
            // wrapper's name on the end.
            '/abs/path/NotTriiiceratopsViewerElement.svelte',
            '/abs/path/TriiiceratopsViewerElement.svelte.ts',
        ]) {
            expect(
                elementOnlyCustomElement({ filename }),
                filename,
            ).toBeUndefined();
        }
    });

    it('agrees with the copy of the rule in svelte.config.js', async () => {
        // The two definitions are forced apart — svelte.config.js is plain JS
        // loaded by node and svelte-check, so it cannot import the .ts. This is
        // the only thing holding them together.
        //
        // Loaded through a computed URL rather than a static specifier: a static
        // import would pull svelte.config.js into tsconfig.app.json's composite
        // program, which is the same program svelte-package emits declarations
        // from.
        const config = (await import(
            pathToFileURL(resolve(__dirname, '..', '..', 'svelte.config.js'))
                .href
        )) as {
            default?: {
                vitePlugin?: {
                    dynamicCompileOptions?: (options: {
                        filename: string;
                    }) => unknown;
                };
            };
        };

        const inlined = config.default?.vitePlugin?.dynamicCompileOptions;
        if (!inlined) {
            throw new Error(
                'svelte.config.js no longer exports a vitePlugin.dynamicCompileOptions hook',
            );
        }
        for (const filename of PATHS) {
            expect(inlined({ filename }), filename).toEqual(
                elementOnlyCustomElement({ filename }),
            );
        }
    });
});

describe('wrapperCustomElementGuard', () => {
    /** A guard that has seen the wrapper compiled as a custom element. */
    function guardWithWrapper() {
        const guard = wrapperCustomElementGuard();
        guard.dynamicCompileOptions({
            filename: `/abs/path/lib/components/${CUSTOM_ELEMENT_WRAPPER}`,
        });
        guard.plugin.transform(
            CODEGEN,
            `/abs/path/lib/components/${CUSTOM_ELEMENT_WRAPPER}`,
        );
        return guard;
    }

    it('fails the build when the wrapper name matched nothing', () => {
        const guard = wrapperCustomElementGuard();
        guard.dynamicCompileOptions({
            filename: `/abs/path/Not${CUSTOM_ELEMENT_WRAPPER}`,
        });

        // A stale hard-coded filename turns the rule into a no-op that answers
        // `undefined` to every file, and there are two hard-coded copies of it.
        // Nothing else in the toolchain reports that.
        expect(() => guard.plugin.buildEnd()).toThrow(/renamed, moved/i);
    });

    it('passes once the wrapper has been seen and compiled', () => {
        expect(() => guardWithWrapper().plugin.buildEnd()).not.toThrow();
    });

    it('fails when a second component was compiled as a custom element', () => {
        // What a global `compilerOptions.customElement: true` does: every
        // component in the graph gets codegen nobody instantiates.
        const guard = guardWithWrapper();
        guard.plugin.transform(CODEGEN, '/abs/path/lib/MetadataPanel.svelte');

        expect(() => guard.plugin.buildEnd()).toThrow(
            /2 component\(s\).*MetadataPanel\.svelte/s,
        );
    });

    it('fails when nothing was compiled as a custom element at all', () => {
        // `customElement: false` everywhere, including the wrapper: the bundle
        // registers no element and the size gate reads the loss as a win.
        const guard = wrapperCustomElementGuard();
        guard.dynamicCompileOptions({
            filename: `/abs/path/lib/components/${CUSTOM_ELEMENT_WRAPPER}`,
        });

        expect(() => guard.plugin.buildEnd()).toThrow(/0 component\(s\)/);
    });

    it('ignores the compiler’s non-component sub-modules', () => {
        // `Foo.svelte?svelte&type=style` is the same file's stylesheet, and a
        // plain `.ts` module naming the helper is not a compiled component.
        const guard = guardWithWrapper();
        guard.plugin.transform(
            CODEGEN,
            '/abs/path/Other.svelte?svelte&type=style',
        );
        guard.plugin.transform(CODEGEN, '/abs/path/internal/client.js');

        expect(() => guard.plugin.buildEnd()).not.toThrow();
    });

    it('stays quiet when the build already failed for another reason', () => {
        const guard = wrapperCustomElementGuard();
        expect(() =>
            guard.plugin.buildEnd(new Error('rollup already failed')),
        ).not.toThrow();
    });
});
