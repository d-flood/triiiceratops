// Performance comparison orchestrator. Fails on size >5%, runtime >10% and >20ms.

import {
    appendFileSync,
    existsSync,
    mkdirSync,
    readFileSync,
    writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
    BUDGETS_PATH,
    REPO_ROOT,
    addWorktree,
    bad,
    buildBudgets,
    checkBudgets,
    checkTracingMode,
    compareMemory,
    compareRuntime,
    compareSizes,
    formatMemoryTable,
    formatRuntimeTable,
    formatSizeTable,
    heading,
    loadBudgets,
    log,
    ok,
    parseArgs,
    removeWorktree,
    rendererGenerationChanged,
    resolveSha,
    run,
    step,
    validateBudgets,
    warn,
} from './lib.mjs';
import { measure } from './measure.mjs';

// Core first: plugins resolve types/dist from it.
const BUILD_STEPS = [
    ['triiiceratops', 'build:lib'],
    ['triiiceratops', 'build:element'],
    ['@triiiceratops/plugin-sdk', 'build'],
    ['@triiiceratops/plugin-image-manipulation', 'build'],
    ['@triiiceratops/plugin-image-export', 'build'],
    ['@triiiceratops/plugin-pdf-export', 'build'],
    ['@triiiceratops/plugin-annotation-editor', 'build'],
    ['@triiiceratops/plugin-av', 'build', 'packages/plugin-av/package.json'],
    [
        'triiiceratops',
        'build:perf-element',
        'packages/core/package.json',
        'build:perf-element',
    ],
];

// A base predating packages/core has nothing comparable to measure; skip it.
function hasMonorepoLayout(dir) {
    return existsSync(join(dir, 'packages', 'core', 'package.json'));
}

async function buildRoot(root) {
    step(`install (${root})`);
    await run('pnpm', ['install', '--no-frozen-lockfile'], {
        cwd: root,
        timeout: 600_000,
    });
    for (const [filter, script, packageJson, requiredScript] of BUILD_STEPS) {
        if (packageJson) {
            const packagePath = join(root, packageJson);
            if (!existsSync(packagePath)) continue;
            if (
                requiredScript &&
                !JSON.parse(readFileSync(packagePath, 'utf8')).scripts?.[
                    requiredScript
                ]
            ) {
                continue;
            }
        }
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
            tracesDir: opts.noTraces
                ? undefined
                : join(opts.outDir, 'traces', label),
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
        tracesDir: opts.noTraces
            ? undefined
            : join(opts.outDir, 'traces', label),
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
        // Tracing distorts medians unevenly, so captures and enforcing runs omit it.
        noTraces: Boolean(args['no-traces'] || args['update-budgets']),
    };
    mkdirSync(opts.outDir, { recursive: true });

    let base, head;
    let preRestructureBase = false;
    if (args['head-root']) {
        head = await measureRoot(String(args['head-root']), 'head', opts);
        base = args['base-root']
            ? await measureRoot(String(args['base-root']), 'base', opts)
            : { ...head, samePlaceholder: true };
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

    // ── Comparison ──
    const rendererGenerationBoundary =
        !opts.sizeOnly && rendererGenerationChanged(base, head);
    const comparisonBase = rendererGenerationBoundary ? head : base;
    const accepted = loadBudgets()?.acceptedSizeIncreases ?? {};
    const size = compareSizes(comparisonBase.sizes, head.sizes, accepted);
    const runtime = opts.sizeOnly
        ? { rows: [], regressed: false }
        : compareRuntime(comparisonBase.runtime, head.runtime);
    const memory = opts.sizeOnly
        ? { rows: [], regressed: false }
        : compareMemory(comparisonBase.memory, head.memory);

    const budgets = loadBudgets();
    const budgetFailures = budgets
        ? checkBudgets(budgets, head, { skipMemory: opts.sizeOnly })
        : [];
    const schemaProblems = budgets ? validateBudgets(budgets) : [];
    const tracingProblem = budgets ? checkTracingMode(budgets, head) : null;

    // ── Summary ──
    const out = [];
    out.push('## Performance comparison');
    out.push('');
    out.push(
        `Base: \`${base.ref ?? base.root ?? 'head'}\` · Head: \`${head.ref ?? head.root}\``,
    );
    out.push(
        `Warm-ups: ${head.warmups} · Measured runs: ${head.runs} · Median-vs-median.`,
    );
    if (!opts.sizeOnly) {
        out.push(
            `Renderer — base: \`${base.renderer ?? 'unknown'}\` · head: \`${head.renderer ?? 'unknown'}\``,
        );
    }
    out.push('');
    if (preRestructureBase) {
        out.push(
            `> Base \`${String(base.sha).slice(0, 10)}\` predates the pnpm-workspace restructure (no \`packages/core\`) — a size/runtime diff against it would be meaningless. Skipping the base-vs-head comparison; only the absolute budget ceilings below are enforced.`,
        );
        out.push('');
    }
    if (rendererGenerationBoundary) {
        out.push(
            `> Renderer generation changed from \`${base.renderer ?? 'unknown'}\` to \`${head.renderer ?? 'unknown'}\` — size, runtime and memory differentials are not comparable. Skipping the base-vs-head gates; only the head's absolute budget ceilings below are enforced.`,
        );
        out.push('');
    }
    out.push('### Artifact sizes (fail on deterministic > 5% increase)');
    out.push(formatSizeTable(size.rows));
    out.push('');
    for (const r of size.rows.filter((r) => r.exempt)) {
        out.push(
            `> Accepted increase for \`${r.key}\` (\`acceptedSizeIncreases\` in \`perf-budgets.json\`, head ≤ ${accepted[r.key].headBytes} bytes): ${r.reason}`,
        );
    }
    if (size.rows.some((r) => r.exempt)) out.push('');
    if (!opts.sizeOnly) {
        out.push(
            '### Runtime medians (fail on > 10% AND > 20 ms increase per scenario)',
        );
        out.push(formatRuntimeTable(runtime.rows));
        out.push('');
        out.push(
            '### Renderer memory counters (fail on > 10% AND above the absolute floor)',
        );
        if (memory.rows.length) {
            out.push(formatMemoryTable(memory.rows));
            if (memory.rows.some((r) => r.skipped)) {
                out.push('');
                out.push(
                    '> Skipped rows have counters on one side only — the residency counters exist only on the first-party renderer, so a comparison against a base that predates it has nothing to diff. The absolute ceilings below still apply.',
                );
            }
        } else {
            out.push(
                '> No renderer memory counters on the head dist — see the renderer line above.',
            );
        }
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
        for (const p of schemaProblems) {
            out.push(`- FAIL \`perf-budgets.json\` schema: ${p}`);
        }
        if (tracingProblem) {
            out.push(
                `- ${tracingProblem.kind === 'mismatch' ? 'FAIL' : 'WARN'} ${tracingProblem.message}`,
            );
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
        rendererGenerationBoundary,
        renderer: { base: base.renderer, head: head.renderer },
        size,
        runtime,
        memory,
        budgetFailures,
        schemaProblems,
        tracing: {
            budgets: budgets?.tracing ?? null,
            head: head.tracing ?? null,
        },
        tracingProblem,
        thresholds: (loadBudgets() || {}).thresholds,
    };
    writeFileSync(
        join(opts.outDir, 'report.json'),
        JSON.stringify(report, null, 2),
    );

    emitSummary(out.join('\n'));

    // ── Verdict ──
    heading('Verdict');
    let failed = false;
    if (preRestructureBase || rendererGenerationBoundary) {
        warn(
            preRestructureBase
                ? 'base predates the workspace restructure — differential gates skipped'
                : 'renderer generation changed — differential gates skipped',
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
            if (memory.regressed) {
                bad('renderer memory regression (> 10% AND above the floor)');
                failed = true;
            } else ok('renderer memory counters within threshold');
        }
    }
    if (budgets) {
        if (budgetFailures.length) {
            bad(`budget ceiling(s) exceeded: ${budgetFailures.length}`);
            failed = true;
        } else ok('within committed budget ceilings');
        if (schemaProblems.length) {
            bad(
                `perf-budgets.json does not satisfy its own schema: ${schemaProblems.join('; ')}`,
            );
            failed = true;
        } else ok('perf-budgets.json satisfies its schema');
        if (tracingProblem?.kind === 'mismatch') {
            bad(tracingProblem.message);
            failed = true;
        } else if (tracingProblem) {
            warn(tracingProblem.message);
        } else if (head.tracing) {
            ok(`tracing mode matches the budget capture (\`${head.tracing}\`)`);
        }
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
