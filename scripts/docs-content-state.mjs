#!/usr/bin/env node
// Content-state conformance-table generator.
//
// The published claim about which IIIF Content State forms the viewer supports
// is generated from the committed fixture index that the unit tests are driven
// off — `packages/core/src/lib/test/fixtures/content-state/index.json` — so the
// documentation cannot claim a form no fixture pins. The index is plain JSON for
// exactly this reason: this script reads it with no build step.
//
// Only the marked region of docs/content-state.md is generated; the prose around
// it is hand-written.
//
// Usage:
//   node scripts/docs-content-state.mjs           # (re)generate the table
//   node scripts/docs-content-state.mjs --check   # fail if the page is stale, or
//                                                 # a fixture file is uncatalogued

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');
const INDEX = join(
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
const FIXTURE_DIR = dirname(INDEX);
const PAGE = join(REPO_ROOT, 'docs', 'content-state.md');

const BEGIN = '<!-- BEGIN GENERATED conformance table — do not edit by hand.';
const BEGIN_LINE = `${BEGIN} Regenerate with: node scripts/docs-content-state.mjs -->`;
const END = '<!-- END GENERATED conformance table -->';

/** Escape the cell separator so a fixture description cannot break the table. */
function cell(text) {
    return String(text).replace(/\|/g, '\\|');
}

function recipeCell(recipe) {
    if (!recipe) return '—';
    return `[${recipe}](https://iiif.io/api/cookbook/recipe/${recipe}/){target=_blank}`;
}

/** The generated region's body, derived from the fixture index. */
export function conformanceTable() {
    const index = JSON.parse(readFileSync(INDEX, 'utf8'));
    const rows = index.fixtures.map(
        (fixture) =>
            `| ${cell(fixture.form)} | ${cell(fixture.resolvesVia)} | ` +
            `\`${cell(fixture.file)}\` | ${recipeCell(fixture.recipe)} | ${cell(fixture.capturedAt)} |`,
    );

    return [
        `${index.fixtures.length} committed fixtures, each parsed by`,
        '`packages/core/src/lib/utils/contentState.test.ts`. Nothing here is fetched.',
        '',
        '| Form | Resolves via | Fixture | Cookbook recipe | Captured |',
        '| --- | --- | --- | --- | --- |',
        ...rows,
    ].join('\n');
}

/**
 * Fixture files no index entry names. An uncatalogued file is invisible to both
 * the tests and the table, so it is reported rather than silently tolerated.
 */
function orphanedFixtures() {
    const index = JSON.parse(readFileSync(INDEX, 'utf8'));
    const named = new Set(index.fixtures.map((fixture) => fixture.file));
    return readdirSync(FIXTURE_DIR).filter(
        (name) => name !== 'index.json' && !named.has(name),
    );
}

/** Replace the generated region of the page, leaving the prose untouched. */
function render(page, body) {
    const start = page.indexOf(BEGIN);
    const end = page.indexOf(END);
    if (start === -1 || end === -1 || end < start) {
        throw new Error(
            `${relative(REPO_ROOT, PAGE)}: generated-region markers not found`,
        );
    }
    return `${page.slice(0, start)}${BEGIN_LINE}\n\n${body}\n\n${page.slice(end)}`;
}

function main() {
    const check = process.argv.includes('--check');
    const page = readFileSync(PAGE, 'utf8');
    const wanted = render(page, conformanceTable());

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
