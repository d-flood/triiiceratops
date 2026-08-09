import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { elementOnlyCustomElement } from './elementCompileOptions';

/*
 * Custom-element codegen belongs to the wrapper alone.
 *
 * Both element configs used to set a global `compilerOptions.customElement:
 * true`, which does NOT restrict itself to components declaring
 * `<svelte:options customElement>` — every component in the graph got a
 * `create_custom_element(...)` registration nobody instantiates, plus the
 * compiler's `custom_element_props_identifier` warning. Against that build the
 * assertions below counted 31 registrations per artifact instead of 1.
 */

// src/packaging → package root
const REPO = resolve(__dirname, '..', '..');

/**
 * Svelte emits one `create_custom_element(Component, props, slots, exports,
 * use_shadow_dom)` call per component compiled as a custom element. The helper
 * is shared and its name is minified away, but each CALL SITE keeps its
 * `[slots], [exports], true` tail — `true` minifies to `!0`, and the two builds
 * differ only in whether they keep the whitespace.
 */
const CALL_SITE = /\[[^[\]]*\]\s*,\s*\[[^[\]]*\]\s*,\s*!0\s*\)/g;

function countCustomElementRegistrations(file: string): number {
    const code = readFileSync(resolve(REPO, 'dist', file), 'utf8');
    return code.match(CALL_SITE)?.length ?? 0;
}

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
            // Not a suffix match: a same-named file is only the wrapper when
            // the whole basename matches.
            '/abs/path/NotTriiiceratopsViewerElement.svelte.ts',
        ]) {
            expect(elementOnlyCustomElement({ filename })).toBeUndefined();
        }
    });
});

describe('the element builds', () => {
    beforeAll(() => {
        for (const config of [
            'vite.config.element.ts',
            'vite.config.element-esm.ts',
        ]) {
            execSync(`pnpm exec vite build --config ${config}`, {
                cwd: REPO,
                stdio: 'pipe',
            });
        }
    }, 180_000);

    it.each(['triiiceratops-element.iife.js', 'triiiceratops-element.js'])(
        '%s registers exactly one custom element',
        (file) => {
            expect(countCustomElementRegistrations(file)).toBe(1);
        },
    );
});
