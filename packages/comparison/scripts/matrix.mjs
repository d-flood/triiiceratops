#!/usr/bin/env node
// The Cookbook support matrix's reader.
//
// Fetches the IIIF Cookbook's own support matrix, parses every cell of it, and
// rewrites `src/matrix.json`.
//
//   node scripts/matrix.mjs
//
// The matrix is one HTML table per recipe category, recipes down the side and
// viewers across the top, and each cell is an icon whose `alt` is the claim:
// Yes, Partial or No. That is the whole format, and parsing it is why the
// comparison can draw per-recipe coverage rather than a count: a count says a
// viewer supports 31 recipes, and the matrix says which 31.
//
// The categories are not read. A recipe appears under more than one of them, so
// rows are folded by recipe slug — and what the site bands its columns by is
// `@triiiceratops/cookbook`'s own `RecipeGroup`, which it already has labels
// for. The count of distinct slugs is the matrix's own recipe total, which moves
// when the Cookbook publishes a new recipe.
//
// Like `measure.mjs` this runs on demand only, and for the same reason: the
// matrix records what each project has submitted about itself and moves without
// reference to this repository, so a scheduled run would rewrite a published
// comparison with nobody reading the diff. Re-run it deliberately, read the
// diff, and commit the result.
//
// It is not a support claim about Triiiceratops. `@triiiceratops/cookbook` is
// the only place that lives; the matrix's own Triiiceratops column is an
// external reading of us, carried here so the site can show both.

import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(HERE, '..');
const OUTPUT = join(PACKAGE_ROOT, 'src', 'matrix.json');

const SOURCE = 'https://iiif.io/api/cookbook/recipe/matrix/';

/** The claim an icon carries, keyed by the icon's file name. */
const MARKS = { yes: 'yes', partial: 'partial', no: 'no' };

function fail(message) {
    console.error(`matrix: ${message}`);
    process.exit(1);
}

function text(html) {
    return html
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function rowsOf(table) {
    return [...table.matchAll(/<tr[\s\S]*?<\/tr>/g)].map((m) => m[0]);
}

function cellsOf(row) {
    return [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map(
        (m) => m[1],
    );
}

const response = await fetch(SOURCE);
if (!response.ok) {
    fail(`${SOURCE} answered ${response.status}`);
}
const html = await response.text();

const tables = [...html.matchAll(/<table[\s\S]*?<\/table>/g)]
    .map((match) => match[0])
    // The page opens with a table describing the viewers themselves. A matrix
    // table is the one whose first cell is the recipe column.
    .filter((table) => {
        const rows = rowsOf(table);
        return (
            rows.length > 1 && /^Recipe$/i.test(text(cellsOf(rows[0])[0] ?? ''))
        );
    });
if (tables.length === 0) fail('no matrix tables found; the page format moved');

/** @type {string[] | null} */
let viewers = null;
/** @type {Map<string, {id: string, name: string, marks: Record<string, string>}>} */
const recipes = new Map();

for (const [at, table] of tables.entries()) {
    const rows = rowsOf(table);
    const header = cellsOf(rows[0]).slice(1).map(text);
    if (viewers === null) {
        viewers = header;
    } else if (header.join(' ') !== viewers.join(' ')) {
        fail(`table ${at + 1}'s viewer columns differ from the first table's`);
    }

    for (const row of rows.slice(1)) {
        const cells = cellsOf(row);
        const link = /href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(cells[0] ?? '');
        if (link === null) fail(`a row in table ${at + 1} has no recipe link`);
        const slug = /\/recipe\/([^/"]+)\/?$/.exec(link[1]);
        if (slug === null) fail(`cannot read a recipe slug from ${link[1]}`);

        const existing = recipes.get(slug[1]);
        const entry = existing ?? {
            id: slug[1],
            name: text(link[2]),
            marks: {},
        };
        for (const [column, viewer] of viewers.entries()) {
            const icon = /icons\/(\w+)\.png/.exec(cells[column + 1] ?? '');
            const mark = icon === null ? null : MARKS[icon[1]];
            if (mark === undefined) fail(`unknown icon ${icon[1]}`);
            if (mark === null) continue;
            // A recipe listed under two categories carries the same cell in
            // both; a disagreement would mean the page contradicts itself.
            const seen = entry.marks[viewer];
            if (seen !== undefined && seen !== mark) {
                fail(`${entry.id} reads ${seen} and ${mark} for ${viewer}`);
            }
            entry.marks[viewer] = mark;
        }
        if (existing === undefined) recipes.set(slug[1], entry);
    }
}

const missing = [...recipes.values()].filter(
    (recipe) => Object.keys(recipe.marks).length !== viewers.length,
);
if (missing.length > 0) {
    fail(
        `${missing.length} recipe row(s) are missing a cell: ${missing[0].id}`,
    );
}

const output = {
    readAt: new Date().toISOString().slice(0, 10),
    source: SOURCE,
    viewers,
    recipes: [...recipes.values()].sort((a, b) => a.id.localeCompare(b.id)),
};

writeFileSync(OUTPUT, `${JSON.stringify(output, null, 4)}\n`);
console.log(
    `matrix: wrote ${output.recipes.length} recipe(s) × ${viewers.length} viewer(s) to ${OUTPUT.replace(`${resolve(PACKAGE_ROOT, '..', '..')}/`, '')}`,
);
