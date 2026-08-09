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
 * Both element configs used to set a global `compilerOptions.customElement:
 * true`, which does NOT restrict itself to components declaring
 * `<svelte:options customElement>` — every component in the graph got a
 * `create_custom_element(...)` registration nobody instantiates, plus the
 * compiler's `custom_element_props_identifier` warning.
 *
 * The built artifacts are checked elsewhere, so nothing here runs a build:
 * `scripts/check-element-artifact.mjs` counts registrations in both bundles
 * during `build:element`, and `distributions.test.ts` loads the IIFE and
 * asserts it defines exactly the one element.
 */

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

    it('passes once the wrapper has been seen', () => {
        const guard = wrapperCustomElementGuard();
        expect(
            guard.dynamicCompileOptions({
                filename: `/abs/path/lib/components/${CUSTOM_ELEMENT_WRAPPER}`,
            }),
        ).toEqual({ customElement: true });

        expect(() => guard.plugin.buildEnd()).not.toThrow();
    });

    it('stays quiet when the build already failed for another reason', () => {
        const guard = wrapperCustomElementGuard();
        expect(() =>
            guard.plugin.buildEnd(new Error('rollup already failed')),
        ).not.toThrow();
    });
});
