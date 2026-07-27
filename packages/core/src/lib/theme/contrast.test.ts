import { describe, it, expect } from 'vitest';
// The contrast logic lives in the CLI script so `node scripts/check-contrast.ts`
// (CI) and this test (pnpm test) share one source of truth for the color math,
// theme parsing, and documented token pairings.
import {
    checkAllThemes,
    THEMES,
    PAIRINGS,
    type ContrastResult,
} from '../../../scripts/check-contrast';

describe('theme token contrast (WCAG 2.2 AA)', () => {
    const results = checkAllThemes();

    it('checks every documented pairing in all four themes', () => {
        expect(results).toHaveLength(THEMES.length * PAIRINGS.length);
    });

    for (const theme of THEMES) {
        describe(`theme: ${theme}`, () => {
            const themeResults = results.filter(
                (r: ContrastResult) => r.theme === theme,
            );
            for (const r of themeResults) {
                it(`${r.fg} on ${r.bg} meets AA (${r.min}:1)`, () => {
                    expect(
                        r.ratio,
                        `${theme}: ${r.fg} on ${r.bg} = ${r.ratio}, need ${r.min}`,
                    ).toBeGreaterThanOrEqual(r.min);
                });
            }
        });
    }
});
