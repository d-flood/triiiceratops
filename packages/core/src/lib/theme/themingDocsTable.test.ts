import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
    renderThemingTokenTable,
    THEMING_TABLE_BEGIN,
    THEMING_TABLE_END,
} from './themingDocsTable';

/*
 * Asserts the public CSS-token table in `docs/theming.md` is GENERATED from
 * `publicTokens.ts` and never drifts from it. The docs must not hand-copy the
 * token list.
 *
 * To regenerate after changing the token set:
 *   UPDATE_DOCS=1 pnpm --filter triiiceratops exec vitest run src/lib/theme/themingDocsTable
 */

// src/lib/theme → workspace root
const WORKSPACE_ROOT = resolve(__dirname, '..', '..', '..', '..', '..');
const THEMING_DOC = resolve(WORKSPACE_ROOT, 'docs', 'theming.md');

function extractGeneratedBlock(markdown: string): string {
    const start = markdown.indexOf(THEMING_TABLE_BEGIN);
    const end = markdown.indexOf(THEMING_TABLE_END);
    if (start === -1 || end === -1) {
        throw new Error(
            'docs/theming.md is missing the GENERATED public token table markers',
        );
    }
    return markdown.slice(start, end + THEMING_TABLE_END.length);
}

describe('theming docs public token table', () => {
    it('matches the table generated from publicTokens.ts', () => {
        const expected = renderThemingTokenTable();
        const markdown = readFileSync(THEMING_DOC, 'utf8');

        if (process.env.UPDATE_DOCS) {
            const current = extractGeneratedBlock(markdown);
            if (current !== expected) {
                writeFileSync(
                    THEMING_DOC,
                    markdown.replace(current, expected),
                    'utf8',
                );
            }
        }

        const actual = extractGeneratedBlock(readFileSync(THEMING_DOC, 'utf8'));
        expect(actual).toBe(expected);
    });
});
