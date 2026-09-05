#!/usr/bin/env node
// Coverage floor gate.
//
// Reads every package's `coverage/coverage-summary.json` (produced by
// `pnpm test:coverage`), then either:
//   - default: compares line + branch coverage against `coverage-baseline.json`
//     and exits non-zero if either metric for any package drops below its
//     baseline (minus a small flake tolerance);
//   - `--update`: rewrites `coverage-baseline.json` from the current summaries
//     (raising — or intentionally lowering — the baseline is a normal reviewed
//     commit).
//
// The baseline is the post-cleanup floor. Coverage may not silently decrease.

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const packagesDir = join(repoRoot, 'packages');
const baselinePath = join(repoRoot, 'coverage-baseline.json');

// v8 coverage numbers can wobble by tiny fractions between runs/environments.
// A 0.5 percentage-point tolerance absorbs that noise while still catching a
// real regression (e.g. a deleted test), which moves coverage far more.
const TOLERANCE = 0.5;

const update = process.argv.includes('--update');

/** Discover workspace packages and their coverage summaries. */
function collectSummaries() {
    const result = {};
    for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const pkgJsonPath = join(packagesDir, entry.name, 'package.json');
        if (!existsSync(pkgJsonPath)) continue;
        const name = JSON.parse(readFileSync(pkgJsonPath, 'utf8')).name;
        const summaryPath = join(
            packagesDir,
            entry.name,
            'coverage',
            'coverage-summary.json',
        );
        result[name] = { summaryPath };
    }
    return result;
}

function readMetrics(summaryPath) {
    const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
    const total = summary.total;
    return {
        lines: total.lines.pct,
        branches: total.branches.pct,
    };
}

const packages = collectSummaries();
const names = Object.keys(packages).sort();

// Gather current metrics; a missing summary is a hard error (coverage not run).
const current = {};
const missing = [];
for (const name of names) {
    const { summaryPath } = packages[name];
    if (!existsSync(summaryPath)) {
        missing.push(name);
        continue;
    }
    current[name] = readMetrics(summaryPath);
}

if (missing.length > 0) {
    console.error(
        `Coverage summary missing for: ${missing.join(', ')}.\n` +
            `Run \`pnpm test:coverage\` (after \`pnpm build:all\`) first.`,
    );
    process.exit(1);
}

if (update) {
    const baseline = {};
    for (const name of names) {
        baseline[name] = {
            lines: round(current[name].lines),
            branches: round(current[name].branches),
        };
    }
    writeFileSync(baselinePath, JSON.stringify(baseline, null, 4) + '\n');
    console.log(`Wrote coverage baseline for ${names.length} package(s):`);
    for (const name of names) {
        console.log(
            `  ${name}: lines ${baseline[name].lines}%  branches ${baseline[name].branches}%`,
        );
    }
    process.exit(0);
}

if (!existsSync(baselinePath)) {
    console.error(
        `No coverage-baseline.json found. Generate it with \`pnpm coverage:baseline\`.`,
    );
    process.exit(1);
}

const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
const failures = [];

for (const name of names) {
    const base = baseline[name];
    const cur = current[name];
    if (!base) {
        failures.push(
            `${name}: no baseline entry (add one via \`pnpm coverage:baseline\`).`,
        );
        continue;
    }
    for (const metric of ['lines', 'branches']) {
        const floor = base[metric];
        const value = cur[metric];
        const status =
            value + TOLERANCE < floor ? 'FAIL' : value < floor ? 'warn' : 'ok';
        const line = `  ${name} ${metric}: ${round(value)}% (baseline ${floor}%) [${status}]`;
        if (status === 'FAIL') {
            failures.push(line.trim());
        }
        console.log(line);
    }
}

if (failures.length > 0) {
    console.error(`\nCoverage regression below baseline:`);
    for (const f of failures) console.error(`  ${f}`);
    console.error(
        `\nRestore coverage, or (if intentional) update the floor with ` +
            `\`pnpm coverage:baseline\` in a reviewed commit.`,
    );
    process.exit(1);
}

console.log(`\nCoverage floor OK for ${names.length} package(s).`);

function round(n) {
    return Math.round(n * 100) / 100;
}
