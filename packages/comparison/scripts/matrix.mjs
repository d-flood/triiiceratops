#!/usr/bin/env node
// Reads the IIIF Cookbook support matrix (one HTML table per category, cell claim
// in each icon's `alt`) and rewrites `src/matrix.json`. Rows fold by recipe slug;
// runs on demand only.

import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(HERE, '..');
const OUTPUT = join(PACKAGE_ROOT, 'src', 'matrix.json');

const SOURCE = 'https://iiif.io/api/cookbook/recipe/matrix/';

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
    // A matrix table is the one whose first cell is the recipe column.
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
