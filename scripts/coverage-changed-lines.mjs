#!/usr/bin/env node
// Changed-lines coverage report — `pnpm coverage:changed`.
//
// REPORTING, NOT GATING. This surfaces what fraction of the lines a PR actually
// changed are covered by tests. It never fails the build on a low number — the
// per-package floor gate (`pnpm coverage:check`) is the enforcement mechanism.
// This script exits non-zero ONLY on operational errors (a bad ref, or missing
// coverage data), which must fail loudly rather than silently print zeros.
//
// How it works:
//   1. `git diff <base>...HEAD` (three-dot: the diff is taken from the
//      merge-base of <base> and HEAD, i.e. only what this branch changed).
//      Added line numbers are parsed from `--unified=0` hunk headers.
//   2. Each package's `pnpm test:coverage` run already writes v8 output to
//      `packages/<pkg>/coverage/coverage-final.json` (Istanbul shape: per-file
//      `statementMap` + `s` hit counts). A source line is INSTRUMENTABLE if a
//      statement starts on it, and COVERED if any such statement was executed.
//   3. For each changed line we ask: is its file instrumented by some package?
//        · yes + line is instrumentable → counts toward covered/instrumentable
//        · yes + line not instrumentable (blank/comment) → in-scope, not counted
//        · no (config, docs, test, generated, demo — excluded by coverage
//          config) → EXCLUDED, and reported as such.
//
// Usage:
//   pnpm coverage:changed -- --base <ref>     (default: origin/$GITHUB_BASE_REF,
//                                              else main)
//   pnpm coverage:changed -- --base <ref> --head <ref>

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const packagesDir = join(repoRoot, 'packages');

/** Fail loudly on operational errors (bad ref, missing data). */
function fail(msg) {
    console.error(`coverage:changed: ${msg}`);
    process.exit(1);
}

function parseArgs(argv) {
    const args = {};
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (!a.startsWith('--')) continue;
        const key = a.slice(2);
        const next = argv[i + 1];
        if (next && !next.startsWith('--')) {
            args[key] = next;
            i++;
        } else {
            args[key] = true;
        }
    }
    return args;
}

function git(args) {
    try {
        return execFileSync('git', args, {
            cwd: repoRoot,
            encoding: 'utf8',
            maxBuffer: 64 * 1024 * 1024,
        });
    } catch (err) {
        fail(`\`git ${args.join(' ')}\` failed: ${err.message.trim()}`);
    }
}

// --- coverage data ---------------------------------------------------------

/**
 * Load every package's `coverage-final.json` and derive a per-file set of
 * instrumentable line numbers and the subset that is covered. Returns a map of
 * absolute file path -> { pkg, instrumentable: Set<number>, covered: Set<number> }.
 */
function loadCoverage() {
    const files = new Map();
    let packagesWithData = 0;

    if (!existsSync(packagesDir))
        fail(`no packages/ directory at ${packagesDir}`);

    for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const pkgJsonPath = join(packagesDir, entry.name, 'package.json');
        if (!existsSync(pkgJsonPath)) continue;
        const pkgName = JSON.parse(readFileSync(pkgJsonPath, 'utf8')).name;
        const finalPath = join(
            packagesDir,
            entry.name,
            'coverage',
            'coverage-final.json',
        );
        if (!existsSync(finalPath)) continue;
        packagesWithData++;

        let data;
        try {
            data = JSON.parse(readFileSync(finalPath, 'utf8'));
        } catch (err) {
            fail(`could not parse ${finalPath}: ${err.message}`);
        }

        for (const [rawPath, fileCov] of Object.entries(data)) {
            const abs = resolve(fileCov.path ?? rawPath);
            const { instrumentable, covered } = deriveLineCoverage(fileCov);
            // With `all: true` a file may appear in more than one package's
            // report; union the coverage so a line covered anywhere counts.
            const existing = files.get(abs);
            if (existing) {
                for (const l of instrumentable) existing.instrumentable.add(l);
                for (const l of covered) existing.covered.add(l);
            } else {
                files.set(abs, { pkg: pkgName, instrumentable, covered });
            }
        }
    }

    if (packagesWithData === 0) {
        fail(
            'no coverage-final.json found under any package. Run ' +
                '`pnpm test:coverage` (after `pnpm build:all`) first.',
        );
    }
    return files;
}

/**
 * Istanbul statement coverage -> per-line coverage. A line is instrumentable if
 * a statement starts on it; covered if the max hit count of statements starting
 * on it is > 0 (istanbul's own line-coverage derivation).
 */
function deriveLineCoverage(fileCov) {
    const instrumentable = new Set();
    const lineHits = new Map();
    const statementMap = fileCov.statementMap ?? {};
    const s = fileCov.s ?? {};
    for (const [id, loc] of Object.entries(statementMap)) {
        if (!loc || !loc.start || typeof loc.start.line !== 'number') continue;
        const line = loc.start.line;
        if (line <= 0) continue;
        instrumentable.add(line);
        const hits = s[id] ?? 0;
        const prev = lineHits.get(line) ?? 0;
        if (hits > prev) lineHits.set(line, hits);
    }
    const covered = new Set();
    for (const [line, hits] of lineHits) {
        if (hits > 0) covered.add(line);
    }
    return { instrumentable, covered };
}

// --- diff parsing ----------------------------------------------------------

/**
 * Parse `git diff --unified=0 <base>...HEAD` into a map of new-file path ->
 * Set<number> of added line numbers. Deleted files (+++ /dev/null) are skipped.
 */
function changedLinesByFile(base, head) {
    const diff = git([
        'diff',
        '--unified=0',
        '--no-color',
        '--diff-filter=d', // ignore fully-deleted files
        `${base}...${head}`,
    ]);
    const byFile = new Map();
    let current = null;
    for (const line of diff.split('\n')) {
        if (line.startsWith('+++ ')) {
            const p = line.slice(4).trim();
            if (p === '/dev/null') {
                current = null;
                continue;
            }
            // Strip the `b/` prefix git adds.
            current = new Set();
            byFile.set(p.startsWith('b/') ? p.slice(2) : p, current);
            continue;
        }
        if (line.startsWith('@@') && current) {
            // @@ -a,b +c,d @@  -> added lines c..c+d-1 (d defaults to 1).
            const m = /@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
            if (!m) continue;
            const start = Number(m[1]);
            const count = m[2] === undefined ? 1 : Number(m[2]);
            for (let i = 0; i < count; i++) current.add(start + i);
        }
    }
    return byFile;
}

// --- report ----------------------------------------------------------------

function main() {
    const args = parseArgs(process.argv.slice(2));

    let base = args.base;
    if (!base || base === true) {
        base = process.env.GITHUB_BASE_REF
            ? `origin/${process.env.GITHUB_BASE_REF}`
            : 'main';
    }
    const head = typeof args.head === 'string' ? args.head : 'HEAD';

    // Validate the refs up front so a typo fails loudly rather than as an empty
    // (misleading zero) report.
    if (!git(['rev-parse', '--verify', '--quiet', `${base}^{commit}`])) {
        fail(`base ref not found: ${base}`);
    }
    if (!git(['rev-parse', '--verify', '--quiet', `${head}^{commit}`])) {
        fail(`head ref not found: ${head}`);
    }

    const coverage = loadCoverage();
    const changed = changedLinesByFile(base, head);

    // Per-package tallies plus an excluded (out-of-scope) counter.
    const perPkg = new Map(); // pkg -> { covered, instrumentable }
    let excludedLines = 0; // changed lines in files outside coverage scope
    let excludedFiles = 0;
    let inScopeUninstrumented = 0; // changed lines in covered files, not instrumentable

    const bump = (pkg) => {
        if (!perPkg.has(pkg))
            perPkg.set(pkg, { covered: 0, instrumentable: 0 });
        return perPkg.get(pkg);
    };

    for (const [file, lines] of changed) {
        const abs = resolve(repoRoot, file);
        const cov = coverage.get(abs);
        if (!cov) {
            excludedFiles++;
            excludedLines += lines.size;
            continue;
        }
        const tally = bump(cov.pkg);
        for (const line of lines) {
            if (cov.instrumentable.has(line)) {
                tally.instrumentable++;
                if (cov.covered.has(line)) tally.covered++;
            } else {
                inScopeUninstrumented++;
            }
        }
    }

    // Emit a GitHub-flavoured markdown report (renders in job summaries; still
    // readable as plain text on a terminal).
    const out = [];
    out.push('## Changed-lines coverage');
    out.push('');
    out.push(
        `Base: \`${base}\`  ·  Head: \`${head}\`  (diff: \`${base}...${head}\`)`,
    );
    out.push('');
    out.push('| Package | Covered | Instrumentable | % |');
    out.push('| --- | ---: | ---: | ---: |');

    let totalCovered = 0;
    let totalInstrumentable = 0;
    const pkgNames = [...perPkg.keys()].sort();
    for (const pkg of pkgNames) {
        const { covered, instrumentable } = perPkg.get(pkg);
        totalCovered += covered;
        totalInstrumentable += instrumentable;
        out.push(
            `| \`${pkg}\` | ${covered} | ${instrumentable} | ${pctStr(covered, instrumentable)} |`,
        );
    }
    if (pkgNames.length === 0) {
        out.push('| _(no changed lines in instrumented source)_ |  |  |  |');
    }
    out.push(
        `| **Total** | **${totalCovered}** | **${totalInstrumentable}** | **${pctStr(totalCovered, totalInstrumentable)}** |`,
    );
    out.push('');
    out.push(
        `Excluded (changed lines in ${excludedFiles} file(s) outside coverage ` +
            `scope — configs, docs, tests, generated/demo code): **${excludedLines}**`,
    );
    if (inScopeUninstrumented > 0) {
        out.push('');
        out.push(
            `In-scope but non-instrumentable (blank/comment/type-only changed ` +
                `lines in instrumented files): ${inScopeUninstrumented}`,
        );
    }
    out.push('');

    // Print the report to stdout as GitHub-flavoured markdown. The CI step pipes
    // this into $GITHUB_STEP_SUMMARY (see .github/workflows/test.yml); locally it
    // is readable as plain text.
    console.log(out.join('\n'));
}

function pctStr(covered, instrumentable) {
    if (instrumentable === 0) return 'n/a';
    return `${((covered / instrumentable) * 100).toFixed(1)}%`;
}

main();
