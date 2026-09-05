#!/usr/bin/env node
// Finish the built tree: relocate the not-found page, index the prose, and
// write the domain file.
//
// Every step needs the whole tree in place and none belongs inside the bundler,
// which is what makes this the post-build step rather than a plugin.
//
// ---- The not-found page ---------------------------------------------------
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

// ---- The domain file ------------------------------------------------------
//
// Written into the BUILD rather than committed at the repository root: Pages
// serves an uploaded artifact, so a repository-root file would never reach the
// served tree.
//
// Gated on PUBLISH_CNAME=1, and off by default, because a custom-domain file can
// make the default `*.github.io` host redirect to the custom domain. Until that
// domain resolves and is bound in the repository's Pages settings, publishing
// one can leave the site unreachable at both hosts — including the `/viewer/`
// URL that published IIIF Cookbook recipes link directly.

// ---- The search index ----------------------------------------------------
//
// The indexer reads the built HTML, so it can only run once the tree exists.
// Which pages it takes is declared in the markup rather than here; see
// `scripts/search-index.mjs`.

import {
    existsSync,
    mkdirSync,
    renameSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildSearchIndex } from './search-index.mjs';

/** The host the site is published at; the same origin `$lib/site` declares. */
const SITE_HOST = 'triiiceratops.org';

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

try {
    const { pages, output } = await buildSearchIndex({ build: BUILD });
    console.log(
        `finish-build: ${pages} page(s) indexed -> ${relative(BUILD, output)}/`,
    );
} catch (error) {
    console.error(
        `finish-build: ${error instanceof Error ? error.message : error}`,
    );
    process.exit(1);
}

if (process.env.PUBLISH_CNAME === '1') {
    writeFileSync(join(BUILD, 'CNAME'), `${SITE_HOST}\n`, 'utf8');
    console.log(`finish-build: CNAME -> ${SITE_HOST}`);
} else {
    console.log(
        'finish-build: CNAME not written (set PUBLISH_CNAME=1 once the domain resolves)',
    );
}
