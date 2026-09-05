#!/usr/bin/env node
// Build the site's client-side search index from the built HTML.
//
// The index is produced from the published output rather than from the content
// documents behind it. Reading the built pages is what keeps this cheap and what
// keeps it correct as blocks change: an indexer that walked document JSON would
// need to know how every block renders, and would silently miss the routes that
// still render from code.
//
// Scope is declared in the markup, never here. The chrome layout marks its `main`
// with `data-pagefind-body`, so every prose route — marketing and documentation
// alike — is in scope, and `/demo/` and `/viewer/` are out of it because they
// hang off the root layout and draw their own chrome. The navigations that sit
// inside the body region carry `data-pagefind-ignore`, so a page does not match a
// query for the title of the page next to it in the sidebar. Nothing in this file
// names a path, which is the point: a new route is indexed by wearing the chrome.
//
// Pagefind's assets are a promise about a public path, so `/pagefind/pagefind.js`
// is an entry in `site-urls.json` and `pnpm urls:check` holds it.
//
// Usage:
//   node scripts/search-index.mjs [--build <dir>]

import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as pagefind from 'pagefind';

const APP_ROOT = fileURLToPath(new URL('..', import.meta.url));
const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));

/** The bundle directory Pagefind writes, and the path the site loads it from. */
export const BUNDLE_DIRECTORY = 'pagefind';

/** The attribute a page's markup uses to declare its indexable body region. */
const BODY_MARKER = 'data-pagefind-body';

/**
 * Every built page that declares a body to index.
 *
 * Counted here so the indexer can hold its own result to the markup's
 * declaration. Pagefind falls back to indexing every page's whole `<body>` when
 * it finds the marker nowhere at all, which would quietly pull the playground
 * and the bare viewer in — the exact scope this is meant to exclude — so the
 * fallback has to be caught rather than trusted.
 */
function markedPages(build) {
    return readdirSync(build, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.html'))
        .filter((entry) =>
            readFileSync(join(entry.parentPath, entry.name), 'utf8').includes(
                BODY_MARKER,
            ),
        ).length;
}

/** How many pages the written index actually holds, across every language. */
function indexedPages(output) {
    const entry = JSON.parse(
        readFileSync(join(output, 'pagefind-entry.json'), 'utf8'),
    );
    return Object.values(entry.languages).reduce(
        (total, language) => total + language.page_count,
        0,
    );
}

function parseArgs(argv) {
    const args = { build: join(APP_ROOT, 'build') };
    for (let i = 0; i < argv.length; i++) {
        const flag = argv[i];
        if (flag === '--build') args.build = argv[++i];
        else throw new Error(`unknown argument: ${flag}`);
    }
    if (!args.build) throw new Error('--build <dir> requires a value');
    return args;
}

/**
 * Index the built tree at `build`, writing the bundle into it.
 *
 * Throws rather than exiting, so the caller decides what a failure means. An
 * index with no pages in it is a failure: it would publish a search field that
 * answers every query with nothing, and that is invisible in a green build.
 */
export async function buildSearchIndex({ build }) {
    if (!existsSync(build)) {
        throw new Error(
            `no site build output at ${build} — this step runs after \`vite build\`.`,
        );
    }

    const declared = markedPages(build);
    if (declared === 0) {
        throw new Error(
            `nothing under ${build} carries \`${BODY_MARKER}\`. Indexing scope is ` +
                "declared by the chrome layout's page body region, so a tree without " +
                'it holds no prose route at all — and Pagefind would fall back to ' +
                'indexing every page whole, the playground and the bare viewer ' +
                'included.',
        );
    }

    const output = join(build, BUNDLE_DIRECTORY);
    // Replaced rather than merged: Pagefind's fragment and index files are
    // content-hashed, so a stale one from a previous build would be served
    // forever without ever being referenced.
    rmSync(output, { recursive: true, force: true });

    const { errors: createErrors, index } = await pagefind.createIndex();
    if (createErrors.length > 0 || index === undefined) {
        throw new Error(
            `could not start the indexer: ${createErrors.join('; ')}`,
        );
    }

    try {
        const { errors: addErrors } = await index.addDirectory({ path: build });
        if (addErrors.length > 0) {
            throw new Error(
                `indexing ${build} failed: ${addErrors.join('; ')}`,
            );
        }

        const { errors: writeErrors } = await index.writeFiles({
            outputPath: output,
        });
        if (writeErrors.length > 0) {
            throw new Error(
                `writing ${output} failed: ${writeErrors.join('; ')}`,
            );
        }

        // The written index's own count, not `addDirectory`'s: that one reports
        // every file it read, whether or not the file declared a body region.
        const pages = indexedPages(output);
        if (pages !== declared) {
            throw new Error(
                `${declared} page(s) under ${build} declare \`${BODY_MARKER}\` but ` +
                    `${pages} reached the index. The index and the markup disagree ` +
                    'about what is in scope.',
            );
        }
        return { pages, output };
    } finally {
        await pagefind.close();
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const { build } = parseArgs(process.argv.slice(2));
    try {
        const { pages, output } = await buildSearchIndex({ build });
        console.log(
            `search-index: ${pages} page(s) -> ${relative(REPO_ROOT, output) || output}`,
        );
    } catch (error) {
        console.error(
            `search-index: ${error instanceof Error ? error.message : error}`,
        );
        process.exit(1);
    }
}
