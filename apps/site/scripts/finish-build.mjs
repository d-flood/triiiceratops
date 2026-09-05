#!/usr/bin/env node
// Relocate the prerendered not-found page to the name the static host looks for.
//
// SvelteKit prerenders the `/404` page route to `build/404/index.html`. GitHub
// Pages serves `404.html` from the root of the published tree for every
// unmatched path, and `/404.html` is the URL this site's contract promises. The
// directory is removed afterwards so the published root gains no top-level entry
// no owner accounts for — `scripts/url-contract.mjs` check 4 would report it.
//
// The relocation is why `paths.relative` is off in svelte.config.js: a
// page-relative asset path computed for `/404/` resolves outside the tree once
// the document sits at the root.

import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const BUILD = join(APP_ROOT, 'build');
const SOURCE = join(BUILD, '404', 'index.html');
const TARGET = join(BUILD, '404.html');

if (!existsSync(SOURCE)) {
    console.error(
        `finish-build: expected a prerendered not-found page at ${SOURCE}. ` +
            'The site contract promises /404.html; without it the static host ' +
            'serves its own default for every retired URL.',
    );
    process.exit(1);
}

mkdirSync(BUILD, { recursive: true });
rmSync(TARGET, { force: true });
renameSync(SOURCE, TARGET);
rmSync(join(BUILD, '404'), { recursive: true, force: true });
console.log('finish-build: 404/index.html -> 404.html');
