#!/usr/bin/env node
// The site's internal link gate.
//
// Every internal link in every content document resolves: to a path the tree
// publishes, and — where the link carries an anchor — to a heading slug the
// target document actually persists.
//
// Nothing else in the tree asserts this, and a large share of the
// documentation's internal links carry a heading anchor, so checking paths alone
// would leave most of the ways one of them can break unguarded.
//
// Anchors are resolved against each heading's PERSISTED slug and never against
// anything derived from its text. That is the whole reason slugs are persisted:
// a retitled section keeps its slug, so a link into it keeps resolving. A gate
// that slugified heading text instead would go green on a link that is about to
// rot and red on one that is fine.
//
// External links are out of scope. This gate makes no network requests, so a
// link to somebody else's server is not this gate's business — the site cannot
// gate on the continued existence of iiif.io.
//
// The resolvable set is deliberately closed. A path is resolvable if a route
// declares it (`src/lib/routes.ts`) or the URL contract promises it
// (`site-urls.json` — the examples subtree, the two applications, the emitted
// files). Anything else fails, including a link into a sibling path the tree
// happens to serve but nobody declared: silently passing what it does not
// recognise is how a link gate becomes decoration.
//
// This is NOT part of `pnpm urls:check`. That gate asserts the site's public
// URL contract against a built tree; this one asserts internal referential
// integrity of the content, needs no build, and fails for different reasons.
//
// Usage:
//   node scripts/check-links.mjs [--content <dir>]

import { readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CONTENT_ROUTES, ROUTES, DOC_ROUTES } from '../src/lib/routes.ts';

const APP_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const REPO_ROOT = resolve(APP_ROOT, '..', '..');

/** A link with a scheme, or a protocol-relative one: somebody else's server. */
const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

/**
 * Where a route's document lives, mirroring Uncial's default path-to-source
 * mapping: `/production/` is `content/production.json`, `/docs/react/` is
 * `content/docs/react.json`. The root's `index` case is kept because it is part
 * of that mapping, not because a route currently uses it.
 *
 * Restated here rather than imported from `uncial-cms/sveltekit` because this
 * gate runs as a plain node script against a checkout: the site resolves that
 * package to source through a serve-only Vite alias, and its built output need
 * not exist for a link check to run.
 */
function contentFile(contentDir, path) {
    const within = path === '/' ? 'index' : path.slice(1, -1);
    return join(contentDir, `${within}.json`);
}

/** Every `link` mark's `href` in a document subtree, in document order. */
function linksIn(node, found = []) {
    if (Array.isArray(node)) {
        for (const child of node) linksIn(child, found);
        return found;
    }
    if (!node || typeof node !== 'object') return found;
    for (const mark of node.marks ?? []) {
        if (mark?.type === 'link' && typeof mark.attrs?.href === 'string') {
            found.push(mark.attrs.href);
        }
    }
    return linksIn(node.content ?? [], found);
}

/**
 * Every heading slug in a document subtree.
 *
 * Nested headings count. A heading inside a callout or a tab renders its slug as
 * an id exactly as a top-level one does, so it is a real anchor target — this is
 * where the gate and the table of contents part company, since the contents
 * deliberately show only a page's own top level.
 */
function slugsIn(node, found = new Set()) {
    if (Array.isArray(node)) {
        for (const child of node) slugsIn(child, found);
        return found;
    }
    if (!node || typeof node !== 'object') return found;
    if (
        node.type === 'heading' &&
        typeof node.attrs?.slug === 'string' &&
        node.attrs.slug
    ) {
        found.add(node.attrs.slug);
    }
    return slugsIn(node.content ?? [], found);
}

/**
 * Every internal link that does not resolve.
 *
 * `documents` are the content documents, each with the site path it is served
 * at. `published` are the paths the tree publishes that no content document
 * backs — code routes and the URL contract's own entries.
 */
export function brokenLinks(documents, published) {
    const slugs = new Map(
        documents.map((entry) => [
            entry.path,
            slugsIn(entry.document.content ?? []),
        ]),
    );
    const resolvable = new Set([...published, ...slugs.keys()]);
    const failures = [];

    for (const entry of documents) {
        const fail = (href, reason) =>
            failures.push({
                source: entry.path,
                file: entry.file,
                href,
                reason,
            });

        for (const href of linksIn(entry.document.content ?? [])) {
            if (EXTERNAL.test(href)) continue;

            const hash = href.indexOf('#');
            const target = hash === -1 ? href : href.slice(0, hash);
            const anchor = hash === -1 ? '' : href.slice(hash + 1);

            // A bare `#anchor` is this page's own heading.
            const page = target === '' ? entry.path : target;

            if (target !== '' && !resolvable.has(target)) {
                fail(
                    href,
                    `${target} is neither a declared route nor a path the URL contract publishes.`,
                );
                continue;
            }
            if (anchor === '') continue;

            const carried = slugs.get(page);
            if (carried === undefined) {
                fail(
                    href,
                    `${page} is not a content document, so no persisted heading slug can back the anchor "${anchor}".`,
                );
                continue;
            }
            if (!carried.has(anchor)) {
                fail(
                    href,
                    `${page} carries no heading with the persisted slug "${anchor}".`,
                );
            }
        }
    }

    return failures;
}

/** The paths the tree publishes that no content document backs. */
function publishedPaths() {
    const manifest = JSON.parse(
        readFileSync(join(REPO_ROOT, 'site-urls.json'), 'utf8'),
    );
    return [
        ...ROUTES.map((route) => route.path),
        ...DOC_ROUTES.map((route) => route.path),
        ...manifest.urls.map((entry) => entry.url),
    ];
}

function parseArgs(argv) {
    let content = join(APP_ROOT, 'content');
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--content') {
            content = argv[++i];
            if (!content) throw new Error('--content <dir> requires a value');
        } else throw new Error(`unknown argument: ${argv[i]}`);
    }
    return { content: resolve(content) };
}

function main() {
    const { content } = parseArgs(process.argv.slice(2));

    const documents = CONTENT_ROUTES.map((route) => {
        const file = contentFile(content, route.path);
        return {
            path: route.path,
            file,
            document: JSON.parse(readFileSync(file, 'utf8')),
        };
    });

    const failures = brokenLinks(documents, publishedPaths());
    if (failures.length > 0) {
        const lines = failures.map(
            (failure) =>
                `  ${relative(REPO_ROOT, failure.file)}  (${failure.source})\n` +
                `    ${failure.href}\n      ${failure.reason}`,
        );
        console.error(
            `check-links: ${failures.length} broken internal link${
                failures.length === 1 ? '' : 's'
            }:\n${lines.join('\n')}`,
        );
        process.exit(1);
    }

    const links = documents.reduce(
        (total, entry) => total + linksIn(entry.document.content ?? []).length,
        0,
    );
    console.log(
        `check-links: ${links} links across ${documents.length} content documents; every internal one resolves.`,
    );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
