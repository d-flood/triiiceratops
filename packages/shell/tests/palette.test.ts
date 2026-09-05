/**
 * The palettes: measured, selected, and in agreement with the stylesheet.
 *
 * Three obligations are asserted here, because none of them is visible in a
 * browser until a reader with low vision fails to read the page:
 *
 * 1. Every text pairing clears AA at body size, in both schemes.
 * 2. Every figure the design record measured is still the figure the palette
 *    produces — the anchor that catches a mistyped hex.
 * 3. The palette module and `tokens.css` say the same thing. The stylesheet cannot
 *    import from the module, and the dark values appear in two blocks there, so
 *    three copies have to be held together by something.
 */

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { TOKENS_CSS } from '../src/paths';

import {
    AA_NON_TEXT,
    AA_TEXT,
    AMBER_ON_BONE,
    COLOURS,
    MARK_PAIRINGS,
    PAIRINGS,
    RECORDED,
    RESTEPPED,
    colour,
    contrast,
    ratio,
    type Scheme,
} from '../src/palette';

const SCHEMES: Scheme[] = ['light', 'dark'];

const TOKENS = readFileSync(TOKENS_CSS, 'utf8');

/** The hex-valued custom properties declared in one CSS block. */
function declarations(block: string): Map<string, string> {
    const found = new Map<string, string>();
    for (const [, name, value] of block.matchAll(
        /(--[a-z0-9-]+):\s*(#[0-9a-f]{3,8});/g,
    )) {
        found.set(name, value);
    }
    return found;
}

/** The body of the first rule whose selector line contains `needle`. */
function block(needle: string): string {
    const start = TOKENS.indexOf(needle);
    expect(start, `tokens.css declares a block for ${needle}`).toBeGreaterThan(
        -1,
    );
    const open = TOKENS.indexOf('{', start);
    const close = TOKENS.indexOf('}', open);
    return TOKENS.slice(open + 1, close);
}

describe('the WCAG formula', () => {
    it('reports 21 for black on white and 1 for a colour on itself', () => {
        expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
        expect(contrast('#b84a19', '#b84a19')).toBeCloseTo(1, 5);
    });
});

describe('every text pairing', () => {
    for (const pairing of PAIRINGS) {
        for (const scheme of SCHEMES) {
            it(`${pairing.ink} on ${pairing.ground} clears AA in ${scheme}`, () => {
                expect(ratio(pairing, scheme)).toBeGreaterThanOrEqual(AA_TEXT);
            });
        }
    }
});

describe('every data mark', () => {
    for (const pairing of MARK_PAIRINGS) {
        for (const scheme of SCHEMES) {
            it(`${pairing.ink} on ${pairing.ground} clears the non-text threshold in ${scheme}`, () => {
                expect(ratio(pairing, scheme)).toBeGreaterThanOrEqual(
                    AA_NON_TEXT,
                );
            });
        }
    }
});

describe('the two values that invert between the schemes', () => {
    it('steps the orange lighter in dark, not darker', () => {
        const token = COLOURS.find((entry) => entry.name === '--link');
        expect(token).toBeDefined();
        expect(colour('--link', 'dark')).not.toBe(colour('--link', 'light'));
        // Lighter, measured as luminance rather than judged by the hex digits.
        expect(contrast(colour('--link', 'dark'), '#ffffff')).toBeLessThan(
            contrast(colour('--link', 'light'), '#ffffff'),
        );
    });

    it('keeps the brand amber off the light ground and admits it on the dark one', () => {
        expect(
            contrast(colour('--amber', 'light'), colour('--bone', 'light')),
        ).toBeCloseTo(AMBER_ON_BONE, 2);
        expect(AMBER_ON_BONE).toBeLessThan(AA_NON_TEXT);
        expect(
            contrast(colour('--amber', 'dark'), colour('--bone', 'dark')),
        ).toBeGreaterThanOrEqual(AA_TEXT);
    });

    it('emphasises with the orange on light and the amber on dark', () => {
        expect(colour('--mark-emphasis', 'light')).toBe(
            colour('--link', 'light'),
        );
        expect(colour('--mark-emphasis', 'dark')).toBe(
            colour('--amber', 'dark'),
        );
    });
});

describe('the filled colour fields', () => {
    it('keep their light values in both schemes', () => {
        for (const name of [
            '--amber',
            '--amber-ink',
            '--cta',
            '--cta-ink',
            '--ink-block',
            '--ink-on-dark',
            '--ink-dim-on-dark',
        ]) {
            expect(colour(name, 'dark'), name).toBe(colour(name, 'light'));
        }
    });
});

describe('the design record’s measured figures', () => {
    it('are still what the palette produces', () => {
        expect(RECORDED.length).toBeGreaterThan(0);
        for (const entry of RECORDED) {
            expect(
                ratio(entry.pairing, entry.scheme),
                `${entry.pairing.ink} on ${entry.pairing.ground} (${entry.scheme})`,
            ).toBe(entry.measured);
        }
    });
});

describe('tokens.css and the palette module', () => {
    const rootLight = declarations(block(':root {'));
    const explicitDark = declarations(block(":root[data-theme='dark'] {"));
    const preferredDark = declarations(
        block(":root:not([data-theme='light']) {"),
    );

    it('declare the same light value for every token', () => {
        for (const token of COLOURS) {
            expect(rootLight.get(token.name), token.name).toBe(token.light);
        }
    });

    it('name no colour token the appendix does not document', () => {
        const documented = new Set(COLOURS.map((token) => token.name));
        for (const name of rootLight.keys()) {
            expect(
                documented.has(name),
                `${name} is declared in tokens.css but missing from palette.ts`,
            ).toBe(true);
        }
    });

    it('re-step exactly the tokens the module re-steps, in both dark blocks', () => {
        const expected = new Map(
            RESTEPPED.map((token) => [token.name, token.dark]),
        );
        expect(new Map(explicitDark)).toEqual(expected);
        expect(new Map(preferredDark)).toEqual(expected);
    });
});

describe('colour()', () => {
    it('refuse a name the palette does not carry', () => {
        // A pairing naming a token that no longer exists is the failure this
        // guards: silently resolving it to a default would let a renamed token
        // pass every contrast assertion below on the wrong colour.
        expect(() => colour('--not-a-token', 'light')).toThrow(
            /No colour token named/,
        );
    });
});
