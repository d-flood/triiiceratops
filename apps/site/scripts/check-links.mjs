#!/usr/bin/env node
// Internal link gate: every internal link resolves to a published path and a persisted heading slug.

import { readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CONTENT_ROUTES, ROUTES, DOC_ROUTES } from '../src/lib/routes.ts';

const APP_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const REPO_ROOT = resolve(APP_ROOT, '..', '..');

/** A link with a scheme, or a protocol-relative one. */
const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

function contentFile(contentDir, path) {
    const within = path === '/' ? 'index' : path.slice(1, -1);
    return join(contentDir, `${within}.json`);
}

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
