import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
    foldRendererFlag,
    foldRendererFlagSource,
    RENDERER_FLAG_DIST_FILE,
} from './foldRendererFlag';

const EMITTED = `/** True when this build mounts the first-party Canvas2D renderer. */
export const CANVAS_RENDERER = globalThis.__TRIIICERATOPS_CANVAS_RENDERER__ === true;
`;

describe('foldRendererFlagSource', () => {
    it('pins the flag to the build-time answer', () => {
        expect(foldRendererFlagSource(EMITTED, false)).toContain(
            'export const CANVAS_RENDERER = false;',
        );
        expect(foldRendererFlagSource(EMITTED, true)).toContain(
            'export const CANVAS_RENDERER = true;',
        );
    });

    it('leaves no runtime global read for anything to flip', () => {
        const folded = foldRendererFlagSource(EMITTED, false);

        // The point of the step: an installed viewer must not be switchable
        // onto the in-progress renderer by setting a global before load.
        expect(folded).not.toMatch(
            /globalThis\s*\.\s*__TRIIICERATOPS_CANVAS_RENDERER__\s*===/,
        );
    });

    it('fails loudly if the flag spelling drifts', () => {
        // Silently publishing an unfolded flag is the failure mode this guards.
        expect(() =>
            foldRendererFlagSource(
                'export const CANVAS_RENDERER = false;',
                false,
            ),
        ).toThrow(/no runtime flag read/);
    });

    it('tolerates the whitespace a formatter may introduce', () => {
        const wrapped = `export const CANVAS_RENDERER =
    globalThis.__TRIIICERATOPS_CANVAS_RENDERER__ ===
        true;
`;

        expect(foldRendererFlagSource(wrapped, false)).toContain(
            'CANVAS_RENDERER =\n    false;',
        );
    });
});

describe('the real source is still foldable', () => {
    it('matches what src/lib/renderer/rendererFlag.ts actually writes', () => {
        // Type stripping does not touch the initializer, so the TS source is a
        // faithful stand-in for svelte-package's output — and this fails the
        // moment someone rewrites the flag without updating the packaging step.
        const source = readFileSync(
            join(
                dirname(fileURLToPath(import.meta.url)),
                '../lib/renderer/rendererFlag.ts',
            ),
            'utf8',
        );

        expect(foldRendererFlagSource(source, false)).toContain(
            'CANVAS_RENDERER: boolean =\n    false;',
        );
    });
});

describe('foldRendererFlag', () => {
    it('rewrites the packaged module in place', () => {
        const dist = mkdtempSync(join(tmpdir(), 'fold-renderer-flag-'));
        const target = join(dist, RENDERER_FLAG_DIST_FILE);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, EMITTED, 'utf8');

        expect(foldRendererFlag(dist, false)).toBe(
            `${dist}/${RENDERER_FLAG_DIST_FILE}`,
        );
        expect(readFileSync(target, 'utf8')).toContain(
            'export const CANVAS_RENDERER = false;',
        );
    });

    it('refuses to run against a dist that was never packaged', () => {
        const dist = mkdtempSync(join(tmpdir(), 'fold-renderer-flag-'));

        expect(() => foldRendererFlag(dist, false)).toThrow(/not found/);
    });
});
