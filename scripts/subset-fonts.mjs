#!/usr/bin/env node
// Generate the Latin slices of each self-hosted face; outputs are committed and re-runnable.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const FONTS = join(REPO_ROOT, 'apps', 'site', 'static', 'fonts');

/** Google Fonts `latin`/`latin-ext` ranges plus U+2192, which the rail links need. */
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

/** The three upstream faces. */
const FACES = [
    'SourceSerif4Variable-Roman',
    'SourceSerif4Variable-Italic',
    'SourceCodeVariable-Roman',
];

/** Every file the stylesheets name. Slices are declared after the full face so they win. */
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
