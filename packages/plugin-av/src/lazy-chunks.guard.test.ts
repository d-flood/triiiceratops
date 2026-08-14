/**
 * Lazy-chunk regression guard, over the BUILT artifacts of BOTH formats.
 *
 * The savings these chunks exist for are invisible in source and easy to lose:
 * one static `import` of `./waveform/…`, `./hls/…` or `./sequencer/…` anywhere
 * in the eager graph pulls the parsers, the renderer, the segment map, or
 * 223 KB gzip of hls.js into the entry, and
 * everything still works — it just costs every page bytes it cannot use. So the
 * built entries are inspected the way `scripts/check-shared-runtime.mjs`
 * inspects the IIFE.
 *
 * Requires `pnpm --filter @triiiceratops/plugin-av build` to have run.
 *
 * Both formats are asserted on, and they split differently. The ESM build emits
 * hashed chunks a consumer's bundler re-splits, reached by relative specifier.
 * The IIFE cannot code-split at all (rollup refuses), so `vite.config.ts` takes
 * its lazy modules out of the graph and rewrites the specifier into a runtime
 * URL resolved against the plugin's own script — `import(f("av-hls.js"))` after
 * minification. Either way the chunk names come out of the ENTRY's own
 * `import(...)` calls rather than off a directory listing: reading every `.js`
 * in `dist` would let a leftover chunk from an earlier build satisfy the
 * assertion.
 *
 * To verify this guard once: change `hlsLink.ts`'s `await import(...)` to a
 * static import, rebuild, and watch it fail.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const DIST = resolve(dirname(fileURLToPath(import.meta.url)), '../dist');

/**
 * Strings only the chunk's own code can have put in the bundle they appear in.
 *
 * The waveform's linkage rule, the HLS playability gate and "is this canvas
 * temporally composed" are all EAGER, so neither a profile, a media type nor
 * `t=` itself would do: the markers have to come from the parsers, the
 * renderer, hls.js itself, and the segment map's own normalization warnings.
 */
const CHUNK_ONLY = {
    waveform: ['samples_per_pixel', 'getUint32'],
    hls: ['manifestLoadError', 'bufferAppendError'],
    sequencer: [
        'cannot be placed on the canvas timeline',
        'skips the gap rather than resting',
    ],
    transcript: ['tri-av-transcript-cues', 'tri-av-transcript-time'],
};

const ENTRIES = [
    { label: 'the ESM entry', file: 'index.js' },
    { label: 'the IIFE entry', file: 'iife.js' },
];

/**
 * The chunk files an entry actually imports.
 *
 * Two specifier shapes, one per format: the ESM entry's relative path, and the
 * IIFE's minified `import(<resolver>("name"))`.
 */
function importedChunks(entry: string): string[] {
    const names = new Set<string>();
    for (const [, name] of entry.matchAll(
        /import\(\s*["']\.\/([^"']+\.js)["']\s*\)/g,
    )) {
        names.add(name);
    }
    for (const [, name] of entry.matchAll(
        /import\(\s*[A-Za-z_$][\w$]*\(\s*["']([^"'/]+\.js)["']\s*\)\s*\)/g,
    )) {
        names.add(name);
    }
    return [...names]
        .filter((name) => existsSync(join(DIST, name)))
        .map((name) => readFileSync(join(DIST, name), 'utf8'));
}

describe.each(ENTRIES)(
    '$label reaches its lazy code only lazily',
    ({ file }) => {
        const path = join(DIST, file);

        // Not a skip: a guard that reports green when there is nothing to guard is
        // worse than no guard, because it is the state a CI job that forgot to
        // build is in.
        it('has a build to inspect', () => {
            expect(
                existsSync(path),
                `${path} is missing — run \`pnpm --filter @triiiceratops/plugin-av build\``,
            ).toBe(true);
        });

        const entry = existsSync(path) ? readFileSync(path, 'utf8') : '';

        it.each(Object.entries(CHUNK_ONLY))(
            'carries no %s code itself',
            (_name, markers) => {
                expect(entry).toMatch(/import\(/);
                for (const marker of markers)
                    expect(entry).not.toContain(marker);
            },
        );

        it.each(Object.entries(CHUNK_ONLY))(
            'emits the %s code as a separate chunk',
            (_name, markers) => {
                const carrying = importedChunks(entry).filter((chunk) =>
                    markers.every((marker) => chunk.includes(marker)),
                );
                expect(carrying).toHaveLength(1);
            },
        );

        it('still decides whether to load each chunk without loading it', () => {
            // The eager halves must stay in the entry: they are what answer "is
            // there any waveform data at all" and "does this browser need hls.js"
            // on every canvas. Matched loosely — the BBC profile lives in the entry
            // as a regex literal, whose dots are escaped.
            expect(entry).toContain('prototyping');
            expect(entry).toContain('vnd.apple.mpegurl');
        });
    },
);
