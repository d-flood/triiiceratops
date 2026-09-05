#!/usr/bin/env node
// Cookbook recipe drift detector.
//
// The repository makes claims about IIIF Cookbook recipes that only stay true
// while the Cookbook keeps publishing what it published when the claims were
// written: `packages/cookbook/src/recipes.ts` names a manifest URL per
// recipe, `src/lib/test/fixtures/manifests/{cookbook,av}/` vendors most of those
// manifests verbatim, and the content-state fixture index pins a manifest id and
// canvas id per fixture. This script fetches the live Cookbook and reports where
// those three sets of claims no longer hold.
//
// It reports; it never rewrites the catalog or the fixtures, and by default it
// exits 0 even when it finds drift — the scheduled workflow that runs it must
// never be able to fail a build over third-party infrastructure. A human reads
// the report and decides.
//
// Node reads the catalog's TypeScript directly, as `scripts/api-report.ts` is
// run, so there is no build step.
//
// Usage:
//   node scripts/recipe-drift.mjs
//   node scripts/recipe-drift.mjs --report drift.md
//   node scripts/recipe-drift.mjs --recipe 0009-book-1 --recipe 0299-region
//   node scripts/recipe-drift.mjs --limit 5 --fail-on-drift

import {
    appendFileSync,
    readFileSync,
    readdirSync,
    writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { COOKBOOK_RECIPES } from '../packages/cookbook/src/recipes.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');
const CORE = join(REPO_ROOT, 'packages', 'core', 'src', 'lib');
const CONTENT_STATE_INDEX = join(
    CORE,
    'test',
    'fixtures',
    'content-state',
    'index.json',
);
const VENDORED_DIRS = [
    join(CORE, 'test', 'fixtures', 'manifests', 'cookbook'),
    join(CORE, 'test', 'fixtures', 'manifests', 'av'),
];

const DEFAULT_REPORT = join(REPO_ROOT, 'recipe-drift-report.md');
// Be a good citizen against iiif.io: a small pool, a bounded wait, and a
// User-Agent whose owner is identifiable from a server log.
const CONCURRENCY = 6;
const TIMEOUT_MS = 20_000;
const USER_AGENT =
    'triiiceratops-recipe-drift/1.0 (+https://github.com/d-flood/triiiceratops)';

/** Diffs shown per recipe, and the point at which walking a diff gives up. */
const DIFF_LIMIT = 12;
const DIFF_SCAN_LIMIT = 500;

// ---------------------------------------------------------------------------
// Pure helpers. Exported for `recipeDrift.test.ts`, which must not touch the
// network — everything below this line is fed literal objects.
// ---------------------------------------------------------------------------

function kindOf(value) {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
}

/**
 * JSON with every object key in a stable order, so re-serialising a manifest at
 * a different indent or key order is not reported as drift.
 */
export function canonicalJson(value) {
    return JSON.stringify(canonicalise(value));
}

function canonicalise(value) {
    if (Array.isArray(value)) return value.map(canonicalise);
    if (value === null || typeof value !== 'object') return value;
    const out = {};
    for (const key of Object.keys(value).sort())
        out[key] = canonicalise(value[key]);
    return out;
}

/** A value abbreviated enough to sit on one report line. */
function render(value) {
    const text = JSON.stringify(value) ?? String(value);
    return text.length > 80 ? `${text.slice(0, 77)}…` : text;
}

/**
 * Differing JSON paths between two documents, as `items/0/height: 1800 -> 1900`
 * or `label/en/0: added`. Bounded twice over: only `limit` paths are returned,
 * and the walk abandons a wholesale restructuring rather than enumerating every
 * leaf of it, so one rewritten manifest cannot produce a ten-thousand-line
 * report.
 */
export function diffJson(committed, live, options = {}) {
    const limit = options.limit ?? DIFF_LIMIT;
    const scanLimit = options.scanLimit ?? DIFF_SCAN_LIMIT;
    const paths = [];
    let total = 0;
    // Set only where the walk actually gives up, so a document with exactly
    // `scanLimit` genuine differences is not reported as truncated.
    let abandoned = false;

    const record = (path, change) => {
        total += 1;
        if (paths.length < limit) paths.push(`${path || '/'}: ${change}`);
    };

    const exhausted = () => {
        if (total < scanLimit) return false;
        abandoned = true;
        return true;
    };

    const walk = (a, b, path) => {
        if (exhausted()) return;
        const aKind = kindOf(a);
        const bKind = kindOf(b);
        if (aKind !== bKind) {
            record(path, `${render(a)} -> ${render(b)}`);
            return;
        }
        if (aKind === 'object') {
            const keys = [
                ...new Set([...Object.keys(a), ...Object.keys(b)]),
            ].sort();
            for (const key of keys) {
                if (exhausted()) return;
                const child = path ? `${path}/${key}` : key;
                if (!(key in b)) record(child, 'removed');
                else if (!(key in a)) record(child, 'added');
                else walk(a[key], b[key], child);
            }
            return;
        }
        if (aKind === 'array') {
            for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
                if (exhausted()) return;
                const child = path ? `${path}/${i}` : String(i);
                if (i >= b.length) record(child, 'removed');
                else if (i >= a.length) record(child, 'added');
                else walk(a[i], b[i], child);
            }
            return;
        }
        if (a !== b) record(path, `${render(a)} -> ${render(b)}`);
    };

    walk(committed, live, '');
    return { paths, total, truncated: abandoned };
}

/** A manifest's own identifier, in either IIIF spelling. */
export function documentId(document) {
    if (!document || typeof document !== 'object') return undefined;
    return document.id ?? document['@id'];
}

/**
 * What a content-state fixture's `expected` block pins that the live document no
 * longer satisfies. Empty means the fixture's assumptions still hold.
 */
export function checkFixtureExpectations(fixture, live) {
    const expected = fixture.expected ?? {};
    const problems = [];

    if (documentId(live) !== expected.manifestId) {
        problems.push(
            `manifest id is now ${render(documentId(live))}, fixture pins ${render(expected.manifestId)}`,
        );
        // A document that is not the one the fixture pins says nothing useful
        // about that document's canvases.
        return problems;
    }

    if (expected.canvasId) {
        const canvases = Array.isArray(live.items) ? live.items : [];
        if (
            !canvases.some((canvas) => documentId(canvas) === expected.canvasId)
        ) {
            problems.push(`canvas ${expected.canvasId} is no longer in items`);
        }
    }

    return problems;
}

// ---------------------------------------------------------------------------
// Reading the repository
// ---------------------------------------------------------------------------

/**
 * Vendored manifests grouped by the recipe id their filename starts with. A
 * recipe that publishes several manifests has several files here, only one of
 * which corresponds to the catalog's `manifestUrl`.
 */
function vendoredByRecipe(recipeIds) {
    const byRecipe = new Map(recipeIds.map((id) => [id, []]));
    for (const dir of VENDORED_DIRS) {
        for (const name of readdirSync(dir)) {
            if (!name.endsWith('.json')) continue;
            const id = recipeIds.find(
                (candidate) =>
                    name === `${candidate}.json` ||
                    name.startsWith(`${candidate}-`),
            );
            if (!id) continue;
            const path = join(dir, name);
            byRecipe.get(id).push({
                path,
                json: JSON.parse(readFileSync(path, 'utf8')),
            });
        }
    }
    return byRecipe;
}

/**
 * A manifest id normalised for identity comparison. `0229-behavior-ranges` is
 * vendored verbatim from a Cookbook manifest whose own `id` carries a trailing
 * space; without trimming both sides, that recipe matches no vendored file and
 * silently drops out of drift detection.
 */
function manifestKey(value) {
    return typeof value === 'string' ? value.trim() : undefined;
}

/**
 * Which vendored file, if any, is the one the catalog's `manifestUrl` names.
 */
function matchVendored(candidates, manifestUrl) {
    const wanted = manifestKey(manifestUrl);
    return candidates.find(
        (file) => manifestKey(documentId(file.json)) === wanted,
    );
}

/**
 * Repository-side accounting of the vendored manifests against the catalog.
 *
 * Purely a function of the catalog and the vendored directories, so it is
 * computed before any fetching and covers all catalogued recipes whatever
 * `--recipe`/`--limit` selected and whatever the network returned:
 *
 * - `comparable` — vendored files that are a catalogued recipe's `manifestUrl`.
 * - `pinsSiblingManifest` — vendored files under a catalogued recipe id that pin
 *   a different manifest published by that same recipe (`0010-…-manifest-ttb`,
 *   `0011-…-manifest-individuals`). Legitimate, and never compared.
 * - `unaccounted` — vendored files under a catalogued recipe id whose own id is
 *   neither of the above. A silent skip here is the failure `manifestKey` exists
 *   to prevent, so these are named individually in the report.
 */
function accountVendored(vendored) {
    let comparable = 0;
    let pinsSiblingManifest = 0;
    const unaccounted = [];

    for (const recipe of COOKBOOK_RECIPES) {
        const manifestUrl = manifestKey(recipe.manifestUrl);
        // Everything the recipe itself publishes lives beside its manifest.
        const recipeBase = manifestUrl.replace(/[^/]*$/, '');
        for (const file of vendored.get(recipe.id) ?? []) {
            const id = manifestKey(documentId(file.json));
            if (id === manifestUrl) comparable += 1;
            else if (id?.startsWith(recipeBase)) pinsSiblingManifest += 1;
            else
                unaccounted.push({
                    recipe: recipe.id,
                    file: relative(REPO_ROOT, file.path),
                    id,
                });
        }
    }

    return { comparable, pinsSiblingManifest, unaccounted };
}

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------

/**
 * Fetch and parse one URL. A transport failure, a non-OK status and unparseable
 * JSON are all "unreachable", and never throw.
 *
 * Unreachability counts as a finding and feeds the `drift` output flag: a
 * catalogued URL that cannot be read is far more often a URL the Cookbook has
 * moved or retired — exactly what this job exists to catch — than an iiif.io
 * outage. During a real outage the cost is one advisory comment on an advisory
 * issue, which is the cheaper mistake than staying quiet about a stale catalog.
 *
 * A body that is not JSON is worth reporting in detail: iiif.io answers a
 * missing recipe with a 301 to its HTML 404 page, so a stale catalog URL arrives
 * here as a 200 whose redirect target is the only evidence.
 */
async function fetchJson(url) {
    try {
        const response = await fetch(url, {
            headers: { accept: 'application/json', 'user-agent': USER_AGENT },
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!response.ok) {
            return {
                url,
                error: `HTTP ${response.status} ${response.statusText}`,
            };
        }
        const body = await response.text();
        try {
            return { url, json: JSON.parse(body) };
        } catch {
            const type = response.headers.get('content-type') ?? 'unknown';
            const redirect =
                response.url && response.url !== url
                    ? `, redirected to ${response.url}`
                    : '';
            return {
                url,
                error: `HTTP ${response.status} but the body is not JSON (content-type ${type}${redirect})`,
            };
        }
    } catch (error) {
        return {
            url,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}

/** Memoized so a fixture pinning a catalogued URL costs no second request. */
function makeFetcher() {
    const cache = new Map();
    return (url) => {
        if (!cache.has(url)) cache.set(url, fetchJson(url));
        return cache.get(url);
    };
}

/** Run `worker` over `items` with a bounded number of requests in flight. */
async function pooled(items, worker, size = CONCURRENCY) {
    let next = 0;
    const runners = Array.from(
        { length: Math.min(size, items.length) },
        async () => {
            while (next < items.length) await worker(items[next++]);
        },
    );
    await Promise.all(runners);
}

// ---------------------------------------------------------------------------
// The checks
// ---------------------------------------------------------------------------

function parseArgs(argv) {
    const options = {
        report: DEFAULT_REPORT,
        recipes: [],
        limit: undefined,
        // Opt-in only, for a human running this locally who wants a non-zero
        // exit to hang a shell `&&` off. CI must never gate on drift, so the
        // default stays 0 and the workflow does not pass this.
        failOnDrift: false,
    };
    const fail = (message) => {
        console.error(`recipe-drift: ${message}`);
        process.exit(2);
    };
    // A missing or malformed value must be loud: `--limit abc` used to fetch
    // nothing and report a confident "all clear", the worst outcome for a job
    // whose whole purpose is saying when a claim went stale.
    const value = (arg, raw) => {
        if (raw === undefined) fail(`${arg} needs a value`);
        return raw;
    };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--report') options.report = resolve(value(arg, argv[++i]));
        else if (arg === '--recipe')
            options.recipes.push(value(arg, argv[++i]));
        else if (arg === '--limit') {
            const raw = value(arg, argv[++i]);
            if (!/^[1-9][0-9]*$/.test(raw))
                fail(`--limit must be a positive integer, got "${raw}"`);
            options.limit = Number(raw);
        } else if (arg === '--fail-on-drift') options.failOnDrift = true;
        else fail(`unknown argument "${arg}"`);
    }
    return options;
}

async function run(options) {
    let recipes = COOKBOOK_RECIPES;
    if (options.recipes.length) {
        recipes = recipes.filter((recipe) =>
            options.recipes.includes(recipe.id),
        );
        const missing = options.recipes.filter(
            (id) => !COOKBOOK_RECIPES.some((recipe) => recipe.id === id),
        );
        if (missing.length) {
            console.error(
                `recipe-drift: no such recipe: ${missing.join(', ')}`,
            );
            process.exit(2);
        }
    }
    if (options.limit !== undefined) recipes = recipes.slice(0, options.limit);

    const vendored = vendoredByRecipe(
        COOKBOOK_RECIPES.map((recipe) => recipe.id),
    );
    const accounting = accountVendored(vendored);
    const fetchDocument = makeFetcher();

    const unreachable = [];
    const drifted = [];
    let compared = 0;

    await pooled(recipes, async (recipe) => {
        const result = await fetchDocument(recipe.manifestUrl);
        if (result.error) {
            unreachable.push({
                id: recipe.id,
                url: recipe.manifestUrl,
                error: result.error,
            });
            return;
        }

        const match = matchVendored(
            vendored.get(recipe.id) ?? [],
            recipe.manifestUrl,
        );
        if (!match) return;

        compared += 1;
        if (canonicalJson(match.json) === canonicalJson(result.json)) return;
        drifted.push({
            id: recipe.id,
            url: recipe.manifestUrl,
            file: relative(REPO_ROOT, match.path),
            ...diffJson(match.json, result.json),
        });
    });

    const selected = new Set(recipes.map((recipe) => recipe.id));
    const index = JSON.parse(readFileSync(CONTENT_STATE_INDEX, 'utf8'));
    const brokenFixtures = [];
    const unreachableFixtures = [];
    let fixturesChecked = 0;
    let fixturesSkipped = 0;

    const pinned = index.fixtures.filter(
        (fixture) => fixture.recipe && fixture.expected?.manifestId,
    );
    await pooled(pinned, async (fixture) => {
        if (!selected.has(fixture.recipe)) {
            fixturesSkipped += 1;
            return;
        }
        const result = await fetchDocument(fixture.expected.manifestId);
        if (result.error) {
            // Kept out of `brokenFixtures`: "N fixture assumptions broken" must
            // mean a live manifest no longer satisfies what a fixture pins, not
            // that the manifest could not be read at all.
            unreachableFixtures.push({
                id: fixture.id,
                recipe: fixture.recipe,
                url: fixture.expected.manifestId,
                error: result.error,
            });
            return;
        }
        fixturesChecked += 1;
        const problems = checkFixtureExpectations(fixture, result.json);
        if (problems.length) {
            brokenFixtures.push({
                id: fixture.id,
                recipe: fixture.recipe,
                capturedAt: fixture.capturedAt,
                problems,
            });
        }
    });

    return {
        catalogued: COOKBOOK_RECIPES.length,
        fetched: recipes.length,
        compared,
        accounting,
        fixturesChecked,
        fixturesSkipped,
        unreachable: unreachable.sort((a, b) => a.id.localeCompare(b.id)),
        drifted: drifted.sort((a, b) => a.id.localeCompare(b.id)),
        brokenFixtures: brokenFixtures.sort((a, b) => a.id.localeCompare(b.id)),
        unreachableFixtures: unreachableFixtures.sort((a, b) =>
            a.id.localeCompare(b.id),
        ),
    };
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

/** The differing paths of one drifted recipe, plus the "and N more" tail. */
function driftLines(entry) {
    const lines = [...entry.paths];
    const hidden = entry.total - entry.paths.length;
    if (hidden > 0)
        lines.push(`…and ${hidden}${entry.truncated ? '+' : ''} more`);
    else if (entry.truncated) lines.push('…and more (diff walk abandoned)');
    return lines;
}

function summaryLine(report) {
    return (
        `${report.fetched} recipes fetched, ${report.compared} compared against a ` +
        `vendored manifest — ${report.drifted.length} drifted, ` +
        `${report.unreachable.length} unreachable, ` +
        `${report.brokenFixtures.length} fixture assumptions broken ` +
        `(${report.fixturesChecked} checked, ${report.fixturesSkipped} skipped ` +
        `by --recipe/--limit, ${report.unreachableFixtures.length} unreachable). ` +
        `Across all ${report.catalogued} catalogued recipes, ` +
        `${report.accounting.comparable} vendored file(s) are a catalogued ` +
        `manifestUrl, ${report.accounting.pinsSiblingManifest} pin another ` +
        `manifest of their own recipe, and ` +
        `${report.accounting.unaccounted.length} match neither.`
    );
}

function textReport(report) {
    const lines = [];

    lines.push('Unreachable manifests');
    if (!report.unreachable.length) lines.push('  none');
    for (const entry of report.unreachable) {
        lines.push(`  ${entry.id}`, `    ${entry.url}`, `    ${entry.error}`);
    }

    lines.push('', 'Vendored-manifest drift');
    if (!report.drifted.length) lines.push('  none');
    for (const entry of report.drifted) {
        lines.push(
            `  ${entry.id} (${entry.file})`,
            ...driftLines(entry).map((line) => `    ${line}`),
        );
    }

    lines.push('', 'Vendored files matching no catalogued manifest');
    if (!report.accounting.unaccounted.length) lines.push('  none');
    for (const entry of report.accounting.unaccounted) {
        lines.push(
            `  ${entry.file} — recipe ${entry.recipe}, own id ${render(entry.id)}`,
        );
    }

    lines.push('', 'Content-state fixture assumptions');
    if (!report.brokenFixtures.length) lines.push('  none');
    for (const entry of report.brokenFixtures) {
        lines.push(
            `  ${entry.id} — recipe ${entry.recipe}, captured ${entry.capturedAt}`,
        );
        for (const problem of entry.problems) lines.push(`    ${problem}`);
    }
    for (const entry of report.unreachableFixtures) {
        lines.push(
            `  ${entry.id} — recipe ${entry.recipe}, not checked: ${entry.url} unreachable`,
            `    ${entry.error}`,
        );
    }

    lines.push('', summaryLine(report));
    return lines.join('\n');
}

function markdownReport(report) {
    const lines = ['## Cookbook recipe drift', '', summaryLine(report), ''];

    lines.push('### Unreachable manifests', '');
    if (!report.unreachable.length) lines.push('None.', '');
    for (const entry of report.unreachable) {
        lines.push(`- \`${entry.id}\` — <${entry.url}> — ${entry.error}`);
    }
    if (report.unreachable.length) lines.push('');

    lines.push('### Vendored-manifest drift', '');
    if (!report.drifted.length) lines.push('None.', '');
    for (const entry of report.drifted) {
        lines.push(
            `- \`${entry.id}\` — live <${entry.url}> differs from \`${entry.file}\`:`,
            '',
            '  ```',
            ...driftLines(entry).map((line) => `  ${line}`),
            '  ```',
            '',
        );
    }

    lines.push('### Vendored files matching no catalogued manifest', '');
    if (!report.accounting.unaccounted.length) lines.push('None.', '');
    for (const entry of report.accounting.unaccounted) {
        lines.push(
            `- \`${entry.file}\` — recipe \`${entry.recipe}\`, own id ${render(entry.id)}`,
        );
    }
    if (report.accounting.unaccounted.length) lines.push('');

    lines.push('### Content-state fixture assumptions', '');
    if (!report.brokenFixtures.length && !report.unreachableFixtures.length)
        lines.push('None.', '');
    for (const entry of report.brokenFixtures) {
        lines.push(
            `- \`${entry.id}\` — recipe \`${entry.recipe}\`, captured ${entry.capturedAt}`,
        );
        for (const problem of entry.problems) lines.push(`    - ${problem}`);
    }
    for (const entry of report.unreachableFixtures) {
        lines.push(
            `- \`${entry.id}\` — recipe \`${entry.recipe}\`, not checked: <${entry.url}> unreachable — ${entry.error}`,
        );
    }
    if (report.brokenFixtures.length || report.unreachableFixtures.length)
        lines.push('');

    lines.push(
        '_Advisory only. Nothing here fails a build; a maintainer decides whether the',
        'catalog, the vendored manifests or the fixtures should be updated._',
        '',
    );
    return lines.join('\n');
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const report = await run(options);

    console.log(textReport(report));

    writeFileSync(options.report, markdownReport(report), 'utf8');
    console.log(`\nMarkdown report: ${options.report}`);

    const drift =
        report.drifted.length > 0 ||
        report.unreachable.length > 0 ||
        report.brokenFixtures.length > 0 ||
        report.unreachableFixtures.length > 0 ||
        report.accounting.unaccounted.length > 0;

    // The workflow reads this rather than an exit code, so "drift found" and
    // "the job failed" stay separate things.
    if (process.env.GITHUB_OUTPUT) {
        appendFileSync(process.env.GITHUB_OUTPUT, `drift=${drift}\n`);
    }

    if (drift && options.failOnDrift) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
