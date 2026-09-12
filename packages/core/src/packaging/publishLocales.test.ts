import { describe, it, expect } from 'vitest';
import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ASSET_LOCALES, publishLocales } from './publishLocales';

function scratch(): string {
    return mkdtempSync(join(tmpdir(), 'publish-locales-'));
}

describe('publishLocales', () => {
    it('moves every asset catalog out of dist/messages', () => {
        const root = scratch();
        try {
            const messages = join(root, 'messages');
            const locales = join(root, 'locales');
            mkdirSync(messages, { recursive: true });
            writeFileSync(join(messages, 'en.json'), '{"close":"Close"}');
            for (const locale of ASSET_LOCALES) {
                writeFileSync(
                    join(messages, `${locale}.json`),
                    '{"close":"Schließen"}',
                );
            }

            expect(publishLocales(messages, locales)).toEqual([
                ...ASSET_LOCALES,
            ]);

            for (const locale of ASSET_LOCALES) {
                expect(
                    JSON.parse(
                        readFileSync(join(locales, `${locale}.json`), 'utf8'),
                    ),
                ).toEqual({ close: 'Schließen' });
                // Not published twice: the shipped chrome imports neither.
                expect(existsSync(join(messages, `${locale}.json`))).toBe(
                    false,
                );
            }
            // English stays where `state/i18n.svelte.ts` imports it from.
            expect(existsSync(join(messages, 'en.json'))).toBe(true);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    it('fails rather than publish an export map pointing at nothing', () => {
        const root = scratch();
        try {
            mkdirSync(join(root, 'messages'), { recursive: true });
            expect(() =>
                publishLocales(join(root, 'messages'), join(root, 'locales')),
            ).toThrow(/not found/);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
});
