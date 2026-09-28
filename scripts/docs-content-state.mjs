#!/usr/bin/env node
// Content-state conformance table, generated from the fixture index tests run on.

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');
export const INDEX = join(
    REPO_ROOT,
    'packages',
    'core',
    'src',
    'lib',
    'test',
    'fixtures',
    'content-state',
    'index.json',
);
const PAGE = join(
    REPO_ROOT,
    'apps',
    'site',
    'content',
    'docs',
    'content-state.json',
);

export const BLOCK = 'contentStateFixtures';

/** The block's `fixtures` attribute, derived from the fixture index. */
export function conformanceFixtures(indexFile = INDEX) {
    const index = JSON.parse(readFileSync(indexFile, 'utf8'));
    return index.fixtures.map((fixture) => ({
        form: fixture.form,
        resolvesVia: fixture.resolvesVia,
        file: fixture.file,
        recipe: fixture.recipe ?? null,
        capturedAt: fixture.capturedAt,
    }));
}

/** Fixture files no index entry names. */
export function orphanedFixtures(indexFile = INDEX) {
    const index = JSON.parse(readFileSync(indexFile, 'utf8'));
    const named = new Set(index.fixtures.map((fixture) => fixture.file));
    return readdirSync(dirname(indexFile)).filter(
        (name) => name !== 'index.json' && !named.has(name),
    );
}

export function withFixtures(document, fixtures) {
    let found = 0;
    const rewrite = (node) => {
        const content = Array.isArray(node.content)
            ? node.content.map(rewrite)
            : node.content;
        if (node.type !== BLOCK) {
            return content === node.content ? node : { ...node, content };
        }
        found += 1;
        return { ...node, attrs: { ...node.attrs, fixtures } };
    };

    const next = {
        ...document,
        content: (document.content ?? []).map(rewrite),
    };
    if (found !== 1) {
        throw new Error(
            `expected exactly one "${BLOCK}" block, found ${found}`,
        );
    }
    return next;
}

function serialize(document) {
    return `${JSON.stringify(document, null, '\t')}\n`;
}

function main() {
    const check = process.argv.includes('--check');
    const page = readFileSync(PAGE, 'utf8');
    const wanted = serialize(
        withFixtures(JSON.parse(page), conformanceFixtures()),
    );

    if (!check) {
        writeFileSync(PAGE, wanted, 'utf8');
        console.log(
            `docs-content-state: wrote the conformance table to ${relative(REPO_ROOT, PAGE)}`,
        );
        return;
    }

    const problems = [];
    if (page !== wanted) problems.push(`stale: ${relative(REPO_ROOT, PAGE)}`);
    for (const name of orphanedFixtures()) problems.push(`orphaned: ${name}`);

    if (problems.length) {
        console.error(
            'docs-content-state: the conformance table is out of sync with the ' +
                'content-state fixture index.\n' +
                'Run `node scripts/docs-content-state.mjs` and commit the result.\n',
        );
        for (const p of problems) console.error(`  - ${p}`);
        process.exit(1);
    }
    console.log('docs-content-state: conformance table in sync.');
}

if (import.meta.url === `file://${process.argv[1]}`) main();
