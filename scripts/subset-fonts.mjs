#!/usr/bin/env node
// Generate the Latin slice of each self-hosted face.
//
// Every face is served twice: this slice, and the full unmodified upstream file
// behind it. The stylesheets declare the full face first and the slice second
// with a `unicode-range`, so the slice wins for the codepoints it covers and
// the full face is fetched only when a page actually paints something outside
// them. A marketing page in English costs the slice; a manifest carrying Greek,
// Cyrillic, CJK or Hebrew still renders, from the full face, on demand.
//
// NOTHING IS DROPPED. This is not the lossy subsetting ticket 05 rules out:
// that item is about permanently removing glyphs from the shipped face, and no
// glyph is removed here. The full faces stay byte-identical to upstream and
// remain the fallback for everything the slice does not carry.
//
// Re-runnable, and it has to stay that way: the outputs are committed, so the
// only thing that makes them trustworthy is that anyone can regenerate them and
// get the same bytes.
//
//   node scripts/subset-fonts.mjs           regenerate, and report what changed
//   node scripts/subset-fonts.mjs --check   fail if a committed slice is stale
//
// The subsetter is fontTools, fetched and cached by `uvx` rather than installed
// into the repository: it runs at most a few times a year, and a pinned version
// in a lockfile nobody re-resolves is how a build tool rots quietly.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const FONTS = join(REPO_ROOT, 'apps', 'site', 'static', 'fonts');

/**
 * The two slices, with the codepoints each carries.
 *
 * Google Fonts' own `latin` and `latin-ext` ranges, copied rather than
 * invented — those ranges are what a decade of serving them has established as
 * what a western page really touches — plus the one symbol this site uses that
 * they do not carry. A hand-drawn range misses one curly quote or one dash and
 * fetches the whole face to paint it.
 *
 * Two slices and not one because the second is most of the weight. English
 * prose needs `latin` — 192 KB of the roman. Adding `latin-ext` (Latin
 * Extended A through D, the phonetic extensions, the currency symbols) takes it
 * to 238 KB for glyphs the marketing copy never paints. Split, a page pays for
 * what it sets.
 */
const SLICE_RANGES = {
    Latin: [
        'U+0000-00FF',
        'U+0131',
        'U+0152-0153',
        'U+02BB-02BC',
        'U+02C6',
        'U+02DA',
        'U+02DC',
        'U+0304',
        'U+0308',
        'U+0329',
        'U+2000-206F',
        'U+20AC',
        'U+2122',
        'U+2191',
        // U+2192, the rightwards arrow, is the one addition to Google's own
        // range: the rail's outbound links and every next-page link are set
        // with it, and Google's `latin` carries U+2191 and U+2193 but not it.
        // Without this the front page painted one arrow and fetched the whole
        // 419 KB face to do it — which is the failure mode this whole split
        // exists to avoid, and why `tests/type.spec.ts` now asserts that no
        // marketing route fetches a full face.
        'U+2192',
        'U+2193',
        'U+2212',
        'U+2215',
        'U+FEFF',
        'U+FFFD',
    ],
    LatinExt: [
        'U+0100-02BA',
        'U+02BD-02C5',
        'U+02C7-02CC',
        'U+02CE-02D7',
        'U+02DD-02FF',
        'U+0304',
        'U+0308',
        'U+0329',
        'U+1D00-1DBF',
        'U+1E00-1E9F',
        'U+1EF2-1EFF',
        'U+2020',
        'U+20A0-20AB',
        'U+20AD-20C0',
        'U+2113',
        'U+2C60-2C7F',
        'U+A720-A7FF',
    ],
};

/** The three upstream faces. Each one produces one file per slice. */
const FACES = [
    'SourceSerif4Variable-Roman',
    'SourceSerif4Variable-Italic',
    'SourceCodeVariable-Roman',
];

/**
 * Every file the stylesheets name, and how each is declared.
 *
 * `range` is `null` for the full face, which is declared first and without a
 * `unicode-range` so that it answers for everything; each slice is declared
 * after it, and wins for the codepoints it covers because the last matching
 * face is the one the browser picks. That ordering is the whole mechanism, and
 * reversing it would download the full face on every page.
 */
export const FONT_FILES = FACES.flatMap((stem) => [
    { file: `${stem}.woff2`, from: null, range: null },
    ...Object.entries(SLICE_RANGES).map(([slice, codepoints]) => ({
        file: `${stem}-${slice}.woff2`,
        from: `${stem}.woff2`,
        range: codepoints.join(', '),
    })),
]);

function subset(full, slice, range) {
    const out = join(FONTS, `${slice}.tmp`);
    execFileSync(
        'uvx',
        [
            '--from',
            'fonttools[woff]',
            'pyftsubset',
            join(FONTS, full),
            `--unicodes=${range.replaceAll(' ', '')}`,
            '--flavor=woff2',
            `--output-file=${out}`,
            // The slice has to stay the same variable face, only narrower:
            // every layout feature, every name record (the licence lives in
            // those), the variation axes, and the hinting all survive. Only
            // glyphs outside the range are cut. Deliberately no
            // `--desubroutinize` and no instancing — either would change the
            // outlines rather than the glyph set.
            '--layout-features=*',
            '--name-IDs=*',
            '--name-legacy',
            '--notdef-outline',
            '--recalc-bounds',
            '--drop-tables+=DSIG',
        ],
        { stdio: ['ignore', 'ignore', 'inherit'] },
    );
    return out;
}

const check = process.argv.includes('--check');
let stale = 0;

for (const { file, from, range } of FONT_FILES) {
    if (from === null) {
        if (existsSync(join(FONTS, file))) continue;
        console.error(`subset-fonts: missing upstream face ${file}`);
        process.exit(1);
    }

    const produced = subset(from, file, range);
    const target = join(FONTS, file);
    const fresh = readFileSync(produced);
    const committed = existsSync(target) ? readFileSync(target) : null;
    const changed = committed === null || !committed.equals(fresh);

    if (check) {
        rmSync(produced);
        if (changed) {
            stale++;
            console.error(
                `subset-fonts: ${file} is not what ${basename(from)} produces`,
            );
        }
        continue;
    }

    if (changed) renameSync(produced, target);
    else rmSync(produced);
    console.log(
        `subset-fonts: ${file} ${(fresh.length / 1024).toFixed(0)} KB,` +
            ` from ${(readFileSync(join(FONTS, from)).length / 1024).toFixed(0)} KB` +
            ` ${changed ? '(updated)' : '(unchanged)'}`,
    );
}

if (check && stale > 0) {
    console.error(
        'subset-fonts: run `node scripts/subset-fonts.mjs` and commit the result.',
    );
    process.exit(1);
}
if (check) console.log('subset-fonts: every slice matches its upstream face.');
