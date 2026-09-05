#!/usr/bin/env node
// Shipped-element size gate.
//
// Measures the two published Web Component artifacts — the self-contained IIFE
// (`./element`) and the ESM registration entry (`./element/register`) — as raw
// bytes, gzip level 9, and Brotli quality 11. Those are the same compression
// settings `docs/bundle-size-comparison.md` quotes; if one moves, move the
// other, or the advertised numbers and the gate drift apart.
//
// Two modes, mirroring `scripts/coverage-check.mjs`:
//   - default: compares every artifact against `size-baseline.json` and exits
//     non-zero if any measurement exceeds its budget;
//   - `--update`: rewrites `size-baseline.json` from the current build. Every
//     reduction slice re-baselines here, so "the bundle got smaller" arrives as
//     a reviewed diff rather than a claim.
//
// The failure mode is an *increase*. A deterministic build produces
// deterministic bytes, so unlike the coverage gate there is no flake to absorb.
// SLACK below is the one concession: half a kilobyte per artifact per metric,
// enough that a toolchain or dependency patch does not turn every unrelated PR
// red, and small enough that it cannot hide a reduction slice's worth of bytes.
//
// It is not headroom to spend. Landing first-party source changes that eat into
// it, rather than re-baselining them, is how a gate quietly stops gating: the
// next honest regression arrives to find the budget already consumed. Any
// deliberate size change belongs in the baseline, where a reviewer can see it.
//
// This runs as part of `pnpm build:element`; it needs built artifacts, so it
// deliberately does not run under `pnpm test`.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve } from 'node:path';
import zlib from 'node:zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const baselinePath = join(repoRoot, 'size-baseline.json');
const distDir = join(repoRoot, 'packages', 'core', 'dist');

/** Absolute byte slack allowed above the baseline, per artifact per metric. */
const SLACK = 512;

/** The published element artifacts, in `packages/core/dist`. */
const ARTIFACTS = ['triiiceratops-element.iife.js', 'triiiceratops-element.js'];

/**
 * The standing competitive budget (SPEC user story 39a).
 *
 * The per-artifact baselines above ratchet core against ITSELF, which says
 * nothing about the promise the project actually makes. That promise is about
 * the viewer a reader loads, and once audiovisual manifests are in scope that
 * is core PLUS the AV plugin — TIFY, the nearest competitor, supports audio and
 * video, so comparing core alone against it is not a comparison.
 *
 * So core may grow. What may not grow past this line is the pair. Exceeding it
 * is a CI failure rather than something discovered when the comparison document
 * is rewritten.
 *
 * `gzip` because that is what `docs/bundle-size-comparison.md` quotes and what
 * a CDN serves. The figure is TIFY's measured size under the same settings this
 * script uses; re-measure it there, not here, if it is ever refreshed.
 */
const COMPETITIVE_BUDGET = {
    competitor: 'TIFY',
    gzip: 141467,
    parts: [
        join(distDir, 'triiiceratops-element.iife.js'),
        join(repoRoot, 'packages', 'plugin-av', 'dist', 'iife.js'),
    ],
};

const METRICS = ['raw', 'gzip', 'brotli'];

const update = process.argv.includes('--update');

function measure(filePath) {
    const input = readFileSync(filePath);
    return {
        raw: input.length,
        gzip: zlib.gzipSync(input, { level: 9 }).length,
        brotli: zlib.brotliCompressSync(input, {
            params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 },
        }).length,
    };
}

const current = {};
const missing = [];
for (const name of ARTIFACTS) {
    const filePath = join(distDir, name);
    if (!existsSync(filePath)) {
        missing.push(relative(repoRoot, filePath));
        continue;
    }
    current[name] = measure(filePath);
}

if (missing.length > 0) {
    console.error(
        `size-check: element artifact(s) missing: ${missing.join(', ')}.\n` +
            `Run \`pnpm build:element\` first.`,
    );
    process.exit(1);
}

if (update) {
    const baseline = {};
    for (const name of ARTIFACTS) baseline[name] = current[name];
    writeFileSync(baselinePath, JSON.stringify(baseline, null, 4) + '\n');
    console.log(`Wrote size baseline for ${ARTIFACTS.length} artifact(s):`);
    for (const name of ARTIFACTS) {
        console.log(`  ${name}: ${format(baseline[name])}`);
    }
    process.exit(0);
}

if (!existsSync(baselinePath)) {
    console.error(
        `No size-baseline.json found. Generate it with \`pnpm size:baseline\`.`,
    );
    process.exit(1);
}

const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
const failures = [];

for (const name of ARTIFACTS) {
    const base = baseline[name];
    const cur = current[name];
    if (!base) {
        failures.push(
            `${name}: no baseline entry (add one via \`pnpm size:baseline\`).`,
        );
        continue;
    }
    for (const metric of METRICS) {
        const budget = base[metric] + SLACK;
        const value = cur[metric];
        const status =
            value > budget ? 'FAIL' : value > base[metric] ? 'warn' : 'ok';
        const line =
            `  ${name} ${metric}: ${value} bytes ` +
            `(baseline ${base[metric]}, budget ${budget}) [${status}]`;
        if (status === 'FAIL') {
            failures.push(
                `${name} ${metric}: measured ${value} bytes, budget ${budget} bytes ` +
                    `(baseline ${base[metric]} + ${SLACK} slack) — over by ${value - budget}.`,
            );
        }
        console.log(line);
    }
}

if (failures.length > 0) {
    console.error(`\nElement artifact grew beyond its budget:`);
    for (const f of failures) console.error(`  ${f}`);
    console.error(
        `\nShrink the artifact, or (if the growth is intended) re-record the ` +
            `budget with \`pnpm size:baseline\` in a reviewed commit.`,
    );
    process.exit(1);
}

console.log(`\nElement size OK for ${ARTIFACTS.length} artifact(s).`);

// ---- The standing competitive budget -------------------------------------

const requirePair = process.argv.includes('--require-pair');
const builtParts = COMPETITIVE_BUDGET.parts.filter((p) => existsSync(p));

if (builtParts.length < COMPETITIVE_BUDGET.parts.length) {
    const absent = COMPETITIVE_BUDGET.parts
        .filter((p) => !existsSync(p))
        .map((p) => relative(repoRoot, p));
    const message =
        `Competitive budget vs ${COMPETITIVE_BUDGET.competitor}: NOT CHECKED — ` +
        `not built: ${absent.join(', ')}.`;
    if (requirePair) {
        console.error(
            `\n${message}\nThis run demanded the pair (\`--require-pair\`); ` +
                `build every part first.`,
        );
        process.exit(1);
    }
    // `pnpm build:element` builds core alone, so a skip here is the ordinary
    // case rather than a problem. `build:all` passes `--require-pair`, which is
    // where the budget is actually enforced.
    console.log(`\n${message}`);
} else {
    const total = builtParts.reduce((sum, p) => sum + measure(p).gzip, 0);
    const parts = builtParts
        .map((p) => `${relative(repoRoot, p)} ${measure(p).gzip}`)
        .join(' + ');
    console.log(
        `\nCompetitive budget vs ${COMPETITIVE_BUDGET.competitor} (gzip): ` +
            `${total} of ${COMPETITIVE_BUDGET.gzip} ` +
            `(${COMPETITIVE_BUDGET.gzip - total} to spare)\n  ${parts}`,
    );
    if (total > COMPETITIVE_BUDGET.gzip) {
        console.error(
            `\nThe viewer a reader loads is now larger than ` +
                `${COMPETITIVE_BUDGET.competitor}: ${total} gzip against ` +
                `${COMPETITIVE_BUDGET.gzip}, over by ` +
                `${total - COMPETITIVE_BUDGET.gzip}.\n` +
                `Core may grow; the pair may not grow past this line. Shrink ` +
                `either part — this budget is not re-recorded to accommodate ` +
                `growth.`,
        );
        process.exit(1);
    }
}

function format({ raw, gzip, brotli }) {
    return `raw ${raw}  gzip ${gzip}  brotli ${brotli}`;
}
