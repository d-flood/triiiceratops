#!/usr/bin/env node
// Cookbook recipe-support generator.
//
// Every recipe-support number and per-recipe note published in
// docs/bundle-size-comparison.md is derived from the one committed catalog —
// `packages/cookbook/src/recipes.ts` — so a hand-maintained tally cannot
// drift from what the catalog records. Node runs the catalog's TypeScript
// directly, exactly as `scripts/api-report.ts` is run, so there is no build step.
//
// Six parts of the page are generated: two marked prose regions, the
// Triiiceratops row of the comparison table, the recipe total in that table's
// header, the scatter plot's own point (whose x coordinate encodes the recipe
// count), and the plot's x-axis total. The prose around them, and every other
// viewer's row, is hand-written and left alone.
//
// Usage:
//   node scripts/docs-recipes.mjs           # (re)generate the page's numbers
//   node scripts/docs-recipes.mjs --check   # fail if the page is stale

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');
const CATALOG = join(REPO_ROOT, 'packages', 'cookbook', 'src', 'recipes.ts');
const PAGE = join(REPO_ROOT, 'docs', 'bundle-size-comparison.md');

const REGENERATE = 'Regenerate with: node scripts/docs-recipes.mjs';
const LEAD_BEGIN = '<!-- BEGIN GENERATED recipe totals — do not edit by hand.';
const LEAD_END = '<!-- END GENERATED recipe totals -->';
const NOTES_BEGIN =
    '<!-- BEGIN GENERATED recipe support notes — do not edit by hand.';
const NOTES_END = '<!-- END GENERATED recipe support notes -->';

// The scatter plot's x axis: pixel 70 is nought recipes, pixel 567 is sixty.
const X_ORIGIN = 70;
const X_PER_RECIPE = (567 - 70) / 60;
const LABEL_OFFSET = 11;

const DEMO_URL = 'https://d-flood.github.io/triiiceratops/demo/';

/** Report a generation failure the way the catalog check does, and stop. */
function fail(message) {
    console.error(`docs-recipes: ${message}`);
    process.exit(1);
}

/**
 * Every entry must have a renderable group, and every entry that is not fully
 * supported must say why. Enforced here as well as in the catalog's unit test so
 * the documentation build cannot publish an unexplained claim.
 */
function assertConsistent(recipes, groupLabels) {
    const problems = [];
    for (const recipe of recipes) {
        if (!(recipe.group in groupLabels)) {
            problems.push(`${recipe.id}: unrenderable group "${recipe.group}"`);
        }
        if (recipe.support !== 'supported' && !recipe.reason?.trim()) {
            problems.push(`${recipe.id}: "${recipe.support}" with no reason`);
        }
    }
    if (problems.length) {
        console.error(
            'docs-recipes: the recipe catalog is inconsistent.\n' +
                `Fix ${relative(REPO_ROOT, CATALOG)}:\n`,
        );
        for (const problem of problems) console.error(`  - ${problem}`);
        process.exit(1);
    }
}

/** The counts the page publishes, all derived from the catalog. */
function tally(recipes) {
    const supported = recipes.filter((r) => r.support === 'supported');
    return {
        total: recipes.length,
        audiovisual: recipes.filter((r) => r.group === 'audiovisual').length,
        withPlugin: supported.length,
        core: supported.filter((r) => !r.requiresPluginAv).length,
        matrix: recipes.filter((r) => r.matrixSupport).length,
        pluginOnly: supported.filter((r) => r.requiresPluginAv).length,
        partial: recipes.filter((r) => r.support === 'partial'),
    };
}

/**
 * Render a catalog reason as Markdown for this page. Reasons are authored as
 * plain prose so a UI can show them verbatim; a `docs/<page>.md` reference
 * becomes a link, since this page sits in the same directory.
 */
function reasonMarkdown(reason) {
    return reason.replace(/`docs\/([\w-]+\.md)`/g, '[`$1`]($1)');
}

function leadRegion(counts) {
    return [
        'The proxy for capability is the number of IIIF Cookbook recipes each viewer is',
        'recorded as fully supporting in the',
        `[official support matrix](https://iiif.io/api/cookbook/recipe/matrix/) — ${counts.total}`,
        `distinct recipes, ${counts.audiovisual} of them audiovisual. Both axes have to describe the same`,
        "viewer, so the size axis is each project's audiovisual session.",
    ].join('\n');
}

function notesRegion(counts) {
    const lines = [
        // Our own core count and the matrix's cell are independent claims; only
        // assert they agree when they actually do.
        counts.core === counts.matrix
            ? `Core alone supports **${counts.core}** of ${counts.total}, which is also what the matrix lists Triiiceratops at. With`
            : `Core alone supports **${counts.core}** of ${counts.total}; the matrix lists Triiiceratops at **${counts.matrix}**. With`,
        `\`plugin-av\` the pair reaches **${counts.withPlugin}**: those recipes plus ${counts.pluginOnly}`,
        `of the ${counts.audiovisual} audiovisual recipes the AV spec suite drives end to end against the`,
        `[public demo](${DEMO_URL}).`,
    ];
    if (counts.partial.length) {
        const one = counts.partial.length === 1;
        lines.push(
            '',
            `A further ${one ? 'recipe is' : `${counts.partial.length} recipes are`} counted as partial rather than supported, ${one ? 'because it renders' : 'because they render'}`,
            "while the recipe's own feature does not:",
            '',
            ...counts.partial.map(
                (recipe) =>
                    `- \`${recipe.id}\` — ${reasonMarkdown(recipe.reason)}`,
            ),
        );
    }
    return lines.join('\n');
}

/** How many times a literal marker occurs in the page. */
function countOccurrences(page, marker) {
    let count = 0;
    for (
        let at = page.indexOf(marker);
        at !== -1;
        at = page.indexOf(marker, at + marker.length)
    ) {
        count += 1;
    }
    return count;
}

/**
 * Replace one marked region, leaving the prose around it untouched. Each marker
 * must occur exactly once: a duplicated region would leave the second copy
 * un-generated and permanently stale while `--check` still passed.
 */
function replaceRegion(page, begin, end, body) {
    const where = relative(REPO_ROOT, PAGE);
    for (const marker of [begin, end]) {
        const seen = countOccurrences(page, marker);
        if (seen !== 1) {
            fail(`${where}: expected exactly one "${marker}", found ${seen}.`);
        }
    }
    const start = page.indexOf(begin);
    const stop = page.indexOf(end);
    if (stop < start) {
        fail(`${where}: "${end}" precedes its "${begin}".`);
    }
    return `${page.slice(0, start)}${begin} ${REGENERATE} -->\n\n${body}\n\n${page.slice(stop)}`;
}

/** Rewrite the Triiiceratops row's recipe count and bytes-per-recipe. */
function replaceTableRow(page, counts) {
    const row =
        /(\| \*\*Triiiceratops \+ `plugin-av`\*\* \| )\*\*[\d,]+\*\*( \| \*\*([\d,]+)\*\* \| )\*\*[\d,]+\*\*/;
    if (!row.test(page)) {
        fail(
            `${relative(REPO_ROOT, PAGE)}: the Triiiceratops comparison row was not found.`,
        );
    }
    return page.replace(row, (_match, head, middle, gzip) => {
        const bytes = Number(gzip.replace(/,/g, ''));
        const perRecipe = Math.round(bytes / counts.withPlugin);
        return (
            `${head}**${counts.withPlugin}**${middle}` +
            `**${perRecipe.toLocaleString('en-US')}**`
        );
    });
}

/** Move the scatter plot's own point to the recipe count it encodes. */
function replaceScatterPoint(page, counts) {
    const cx = Math.round(X_ORIGIN + counts.withPlugin * X_PER_RECIPE);
    const point =
        /(<circle class="tri-scatter-point tri-scatter-point--self" cx=")\d+(")/;
    const label =
        /(<text class="tri-scatter-point-label tri-scatter-point-label--self" x=")\d+(")/;
    if (!point.test(page) || !label.test(page)) {
        fail(
            `${relative(REPO_ROOT, PAGE)}: the scatter plot's own point was not found.`,
        );
    }
    return page
        .replace(point, `$1${cx}$2`)
        .replace(label, `$1${cx + LABEL_OFFSET}$2`);
}

/**
 * Rewrite the recipe total in the comparison table's header and on the scatter
 * plot's x axis, so a recipe added to the catalog cannot leave them stale.
 */
function replaceTotals(page, counts) {
    const header = /(\| Viewer \| Recipes, of )\d+( \|)/;
    const axis =
        /(<text class="tri-scatter-axis-label"[^>]*>Cookbook recipes supported, of )\d+( →<\/text>)/;
    if (!header.test(page) || !axis.test(page)) {
        fail(
            `${relative(REPO_ROOT, PAGE)}: the comparison table header or the scatter plot's axis label was not found.`,
        );
    }
    return page
        .replace(header, `$1${counts.total}$2`)
        .replace(axis, `$1${counts.total}$2`);
}

export async function renderPage() {
    const { COOKBOOK_RECIPES, RECIPE_GROUP_LABELS } = await import(
        `file://${CATALOG}`
    );
    assertConsistent(COOKBOOK_RECIPES, RECIPE_GROUP_LABELS);
    const counts = tally(COOKBOOK_RECIPES);

    let page = readFileSync(PAGE, 'utf8');
    page = replaceRegion(page, LEAD_BEGIN, LEAD_END, leadRegion(counts));
    page = replaceRegion(page, NOTES_BEGIN, NOTES_END, notesRegion(counts));
    page = replaceTableRow(page, counts);
    page = replaceScatterPoint(page, counts);
    page = replaceTotals(page, counts);
    return { page, counts };
}

async function main() {
    const check = process.argv.includes('--check');
    const { page: wanted, counts } = await renderPage();
    const have = readFileSync(PAGE, 'utf8');

    if (!check) {
        if (have !== wanted) writeFileSync(PAGE, wanted, 'utf8');
        console.log(
            `docs-recipes: ${counts.withPlugin} of ${counts.total} recipes ` +
                `(${counts.core} core), written to ${relative(REPO_ROOT, PAGE)}`,
        );
        return;
    }

    if (have !== wanted) {
        console.error(
            'docs-recipes: the published recipe-support numbers are out of sync ' +
                'with the recipe catalog.\n' +
                'Run `node scripts/docs-recipes.mjs` and commit the result.\n',
        );
        console.error(`  - stale: ${relative(REPO_ROOT, PAGE)}`);
        process.exit(1);
    }
    console.log(
        `docs-recipes: ${counts.withPlugin} of ${counts.total} recipes in sync.`,
    );
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
