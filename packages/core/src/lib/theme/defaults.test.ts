/**
 * What a viewer paints when nobody names a theme.
 *
 * Four themes ship, and the defaults block IS `light` rather than a fifth
 * palette. That is a claim about a stylesheet, so it is read out of the
 * stylesheet: the defaults and `[data-theme='light']` must share one selector
 * list, and the file is checked for the `prefers-color-scheme` block that used
 * to sit between them.
 *
 * The two did drift. A `prefers-color-scheme: dark` block survived the removal
 * of Tailwind and daisyUI still carrying daisyUI's indigo primary, and because
 * no name selected it, nothing rendered it deliberately, nothing documented it,
 * and `check-contrast.ts` — which walks `THEMES` — never measured it. This is
 * the check that would have caught it.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { BUILTIN_THEMES } from './types';

/*
 * Joined by hand rather than with `new URL(…, import.meta.url)`: Vite rewrites
 * that pattern into an asset reference, and a stylesheet is an asset, so the
 * path would arrive as a served URL rather than a file.
 */
const CSS = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), '../../styles/themes.css'),
    'utf8',
);

/** The rules alone. The prose above them talks about the block that was removed. */
const RULES = CSS.replace(/\/\*[\s\S]*?\*\//g, '');

/** The declarations of the block opened by `selector`. */
function block(selector: string): Record<string, string> {
    const at = RULES.indexOf(`${selector} {`);
    expect(at, `${selector} is not in themes.css`).toBeGreaterThan(-1);

    const body = RULES.slice(at, RULES.indexOf('\n}', at));
    return Object.fromEntries(
        [...body.matchAll(/(--tri-[\w-]+|color-scheme):\s*([^;]+);/g)].map(
            (match) => [match[1], match[2].trim()],
        ),
    );
}

/** The one selector list that opens the shared defaults / `light` block. */
const DEFAULTS_SELECTOR = ":where(:root, :host),\n[data-theme='light']";

describe('the tokens a viewer with no theme paints', () => {
    it('are `light`, because they are the same declarations', () => {
        // One selector list, not two blocks: token-for-token identity is then
        // structural rather than a thing that has to be re-checked. Each
        // selector keeps its own specificity, so the defaults are still
        // zero-specificity and a named `light` still outranks a host override.
        const defaults = block(DEFAULTS_SELECTOR);
        expect(Object.keys(defaults).length).toBeGreaterThan(0);

        // And `light` is declared nowhere else.
        expect(RULES.match(/\[data-theme='light'\]/g)).toHaveLength(1);
    });

    it('do not depend on the reader’s own colour scheme', () => {
        // Which scheme a viewer shows is the host page's decision: a component
        // that turned dark inside a light page would overrule the page it sits
        // in, and a media query has no answer while a host prerenders.
        expect(RULES).not.toContain('prefers-color-scheme');
    });
});

describe('the themes the stylesheet declares', () => {
    it('are exactly the four the package names', () => {
        const declared = [
            ...RULES.matchAll(/\[data-theme='([\w-]+)'\]\s*\{/g),
        ].map((match) => match[1]);

        expect(new Set(declared)).toEqual(new Set(BUILTIN_THEMES));
        expect(BUILTIN_THEMES).toHaveLength(4);
    });
});
