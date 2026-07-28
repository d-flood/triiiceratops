// Performance comparison orchestrator (ticket 25) — `pnpm perf:compare`.
//
// Builds the base SHA and the head SHA on the SAME runner (same Node, same
// browser build), measures each with the identical head-owned measurement code
// (scripts/perf/measure.mjs), compares medians, and fails on regression beyond
// the SPEC thresholds:
//   · deterministic artifact size increase > 5%          → fail
//   · runtime median increase > 10% AND absolute > 20 ms → fail (per scenario)
// It ALSO enforces perf-budgets.json (committed absolute ceilings), which fails
// even when base == head — guarding absolute drift independently of the diff.
//
// Usage:
//   pnpm perf:compare --base <sha> --head <sha> [--out-dir dir]
//                     [--warmups N] [--runs M] [--size-only]
//   pnpm perf:compare --base-root <builtDir> --head-root <builtDir>   (no git)
//   pnpm perf:compare --head-root <builtDir>                          (base==head)
//   pnpm perf:compare ... --update-budgets   (capture/refresh perf-budgets.json)
//
// Raw measurement JSON + Playwright traces are written under --out-dir
// (default: perf-results/) for upload as CI artifacts.

import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
    BUDGETS_PATH,
    REPO_ROOT,
    addWorktree,
    bad,
    buildBudgets,
    checkBudgets,
    compareRuntime,
    compareSizes,
    formatRuntimeTable,
    formatSizeTable,
    heading,
    loadBudgets,
    log,
    ok,
    parseArgs,
    removeWorktree,
    resolveSha,
    run,
    step,
    warn,
} from './lib.mjs';
import { measure } from './measure.mjs';

// Minimal build required for the measured artifacts. Order matters: core dist
// first (plugins + SDK resolve `triiiceratops` types/dist from it), then the
// SDK, then the plugins.
const BUILD_STEPS = [
    ['triiiceratops', 'build:lib'],
    ['triiiceratops', 'build:element'],
    ['@triiiceratops/plugin-sdk', 'build'],
    ['@triiiceratops/plugin-image-manipulation', 'build'],
    ['@triiiceratops/plugin-image-export', 'build'],
    ['@triiiceratops/plugin-pdf-export', 'build'],
    ['@triiiceratops/plugin-annotation-editor', 'build'],
];

// The 1.0 workspace restructure (ticket 21) moved the measured packages under
// packages/. A `--base` SHA from before that restructure has no packages/core
// to build or size — the BUILD_STEPS paths don't exist there at all, so a
// base-vs-head diff against it is meaningless, not just unbuildable. Detect
// that up front and skip the base measurement rather than failing the build.
function hasMonorepoLayout(dir) {
    return existsSync(join(dir, 'packages', 'core', 'package.json'));
}

async function buildRoot(root) {
    step(`install (${root})`);
    await run('pnpm', ['install', '--no-frozen-lockfile'], {
        cwd: root,
        timeout: 600_000,
    });
    for (const [filter, script] of BUILD_STEPS) {
        step(`build ${filter} ${script}`);
        await run('pnpm', ['--filter', filter, 'run', script], {
            cwd: root,
            timeout: 600_000,
        });
    }
}

async function measureSha(
    ref,
    label,
    opts,
    { skipIfPreRestructure = false } = {},
) {
    const sha = await resolveSha(ref);
    const dir = join(opts.outDir, `worktree-${label}-${sha.slice(0, 10)}`);
    heading(`Measuring ${label}: ${ref} (${sha})`);
    await addWorktree(dir, sha);
    try {
        if (skipIfPreRestructure && !hasMonorepoLayout(dir)) {
            warn(
                `${label} ${sha.slice(0, 10)} predates the pnpm-workspace restructure (no packages/core) — skipping measurement.`,
            );
            return null;
        }
        if (!opts.noBuild) await buildRoot(dir);
        const m = await measure(dir, {
            warmups: opts.warmups,
            runs: opts.runs,
            sizeOnly: opts.sizeOnly,
            tracesDir: join(opts.outDir, 'traces', label),
        });
        m.ref = ref;
        m.sha = sha;
        return m;
    } finally {
        await removeWorktree(dir);
    }
}

async function measureRoot(root, label, opts) {
    heading(`Measuring ${label}: ${root}`);
    const m = await measure(root, {
        warmups: opts.warmups,
        runs: opts.runs,
        sizeOnly: opts.sizeOnly,
        tracesDir: join(opts.outDir, 'traces', label),
    });
    m.root = root;
    return m;
}

function emitSummary(md) {
    log(md);
    const file = process.env.GITHUB_STEP_SUMMARY;
    if (file) appendFileSync(file, `${md}\n`);
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const opts = {
        outDir: join(
            REPO_ROOT,
            args['out-dir'] ? String(args['out-dir']) : 'perf-results',
        ),
        warmups: args.warmups ? Number(args.warmups) : undefined,
        runs: args.runs ? Number(args.runs) : undefined,
        sizeOnly: Boolean(args['size-only']),
        noBuild: Boolean(args['no-build']),
    };
    mkdirSync(opts.outDir, { recursive: true });

    // Resolve the two measurements (git SHAs or pre-built roots).
    let base, head;
    let preRestructureBase = false;
    if (args['head-root']) {
        head = await measureRoot(String(args['head-root']), 'head', opts);
        base = args['base-root']
            ? await measureRoot(String(args['base-root']), 'base', opts)
            : { ...head, samePlaceholder: true }; // base == head (no-op)
    } else if (args.base && args.head) {
        const baseSha = await resolveSha(String(args.base));
        const headSha = await resolveSha(String(args.head));
        if (baseSha === headSha) {
            warn('base SHA == head SHA — measuring once (no-op comparison).');
            head = await measureSha(String(args.head), 'head', opts);
            base = { ...head };
        } else {
            base = await measureSha(String(args.base), 'base', opts, {
                skipIfPreRestructure: true,
            });
            head = await measureSha(String(args.head), 'head', opts);
            if (base === null) {
                preRestructureBase = true;
                base = { ...head, ref: args.base, sha: baseSha };
            }
        }
    } else {
        bad(
            'usage: perf:compare --base <sha> --head <sha>  (or --base-root/--head-root)',
        );
        process.exit(2);
    }

    writeFileSync(
        join(opts.outDir, 'base.json'),
        JSON.stringify(base, null, 2),
    );
    writeFileSync(
        join(opts.outDir, 'head.json'),
        JSON.stringify(head, null, 2),
    );

    // Optionally (re)capture the committed budget file from head.
    if (args['update-budgets']) {
        const budgets = buildBudgets(
            head,
            args['baseline-ref'] ? String(args['baseline-ref']) : undefined,
        );
        writeFileSync(BUDGETS_PATH, JSON.stringify(budgets, null, 4) + '\n');
        ok(`wrote ${BUDGETS_PATH}`);
    }

    // ── Comparison ─────────────────────────────────────────────────────────
    const size = compareSizes(base.sizes, head.sizes);
    const runtime = opts.sizeOnly
        ? { rows: [], regressed: false }
        : compareRuntime(base.runtime, head.runtime);

    const budgets = loadBudgets();
    const budgetFailures = budgets ? checkBudgets(budgets, head) : [];

    // ── Summary ──────────────────────────────────────────────────────────--
    const out = [];
    out.push('## Performance comparison');
    out.push('');
    out.push(
        `Base: \`${base.ref ?? base.root ?? 'head'}\` · Head: \`${head.ref ?? head.root}\``,
    );
    out.push(
        `Warm-ups: ${head.warmups} · Measured runs: ${head.runs} · Median-vs-median.`,
    );
    out.push('');
    if (preRestructureBase) {
        out.push(
            `> Base \`${String(base.sha).slice(0, 10)}\` predates the pnpm-workspace restructure (no \`packages/core\`) — a size/runtime diff against it would be meaningless. Skipping the base-vs-head comparison; only the absolute budget ceilings below are enforced.`,
        );
        out.push('');
    }
    out.push('### Artifact sizes (fail on deterministic > 5% increase)');
    out.push(formatSizeTable(size.rows));
    out.push('');
    if (!opts.sizeOnly) {
        out.push(
            '### Runtime medians (fail on > 10% AND > 20 ms increase per scenario)',
        );
        out.push(formatRuntimeTable(runtime.rows));
        out.push('');
    }
    if (budgets) {
        out.push(
            `### Budget ceilings (\`perf-budgets.json\`, baseline \`${budgets.baselineRef}\`)`,
        );
        if (budgetFailures.length) {
            for (const f of budgetFailures) {
                out.push(
                    `- FAIL \`${f.key}\` (${f.kind}): ${f.value} > ceiling ${f.ceiling}`,
                );
            }
        } else {
            out.push('- All artifacts within committed absolute ceilings.');
        }
        out.push('');
    } else {
        out.push(
            '> No `perf-budgets.json` present — run with `--update-budgets` to capture it.',
        );
        out.push('');
    }

    const report = {
        base: { ref: base.ref, sha: base.sha, root: base.root },
        head: { ref: head.ref, sha: head.sha, root: head.root },
        preRestructureBase,
        size,
        runtime,
        budgetFailures,
        thresholds: (loadBudgets() || {}).thresholds,
    };
    writeFileSync(
        join(opts.outDir, 'report.json'),
        JSON.stringify(report, null, 2),
    );

    emitSummary(out.join('\n'));

    // ── Verdict ──────────────────────────────────────────────────────────--
    heading('Verdict');
    let failed = false;
    if (preRestructureBase) {
        warn(
            'base predates the workspace restructure — size/runtime diff skipped',
        );
    } else {
        if (size.regressed) {
            bad('artifact size regression (> 5%)');
            failed = true;
        } else ok('artifact sizes within +5%');
        if (!opts.sizeOnly) {
            if (runtime.regressed) {
                bad('runtime regression (> 10% AND > 20 ms)');
                failed = true;
            } else ok('runtime medians within threshold');
        }
    }
    if (budgets) {
        if (budgetFailures.length) {
            bad(`budget ceiling(s) exceeded: ${budgetFailures.length}`);
            failed = true;
        } else ok('within committed budget ceilings');
    } else {
        warn('no committed perf-budgets.json to enforce');
    }

    log(`\nArtifacts written to ${opts.outDir}`);
    process.exit(failed ? 1 : 0);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
