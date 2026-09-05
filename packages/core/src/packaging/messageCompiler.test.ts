import { describe, it, expect, afterEach } from 'vitest';
import { readdirSync, readFileSync, renameSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { messageCompiler, SKIP_ENV } from './messageCompiler';

/*
 * Holds the two properties that keep a build from pulling the compiled messages
 * out from under a concurrently running test suite. Both are invisible in
 * output — the artifact is byte-identical either way — so nothing else would
 * report their loss.
 */

const PACKAGE_ROOT = resolve(__dirname, '..', '..');
const OUTDIR = join(PACKAGE_ROOT, 'src', 'lib', 'paraglide');

afterEach(() => {
    delete process.env[SKIP_ENV];
});

describe('the message compiler leaves a concurrent test run alone', () => {
    /*
     * The scan, not a spot-check of the five configs that exist today: the
     * failure mode is a NEW config registering the plugin directly, which no
     * enumerated list would notice.
     */
    it('is the only place the paraglide plugin is registered', () => {
        const configs = readdirSync(PACKAGE_ROOT).filter(
            (f) => f.startsWith('vite.config.') && f.endsWith('.ts'),
        );
        expect(configs.length).toBeGreaterThan(0);

        const direct = configs.filter((f) =>
            /paraglideVitePlugin\s*\(/.test(
                readFileSync(join(PACKAGE_ROOT, f), 'utf8'),
            ),
        );
        expect(direct).toEqual([]);
    });

    it('never lets the compiler clear the directory it emits into', () => {
        const source = readFileSync(
            join(__dirname, 'messageCompiler.ts'),
            'utf8',
        );
        expect(source).toMatch(/cleanOutdir:\s*false/);
    });

    it('compiles when nothing asked it not to', () => {
        expect(messageCompiler()).not.toEqual([]);
    });

    it('registers no plugin when the output is already current', () => {
        process.env[SKIP_ENV] = '1';
        expect(messageCompiler()).toEqual([]);
    });

    it('refuses to skip when there is no compiled output to reuse', () => {
        process.env[SKIP_ENV] = '1';
        const parked = `${OUTDIR}.parked-by-test`;
        renameSync(OUTDIR, parked);
        try {
            expect(() => messageCompiler()).toThrow(
                /messages\.js, runtime\.js/,
            );
        } finally {
            renameSync(parked, OUTDIR);
        }
    });
});
