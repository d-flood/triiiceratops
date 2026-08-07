// Shared helpers for the performance comparison harness (ticket 25).
//
// Pure, dependency-free utilities: artifact discovery + byte sizing (ESM entry
// graph walking), statistics (median), the SPEC-fixed regression thresholds and
// their comparison logic, budget-file IO + absolute-drift enforcement, git
// worktree management, and summary/table formatting.
//
// Playwright and the browser scenario driver live in `measure.mjs`; the
// orchestrator lives in `compare.mjs`. This file is imported by both so the
// measurement + comparison logic is byte-identical for the base and head SHAs.

import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PERF_DIR = resolve(fileURLToPath(new URL('.', import.meta.url)));
export const REPO_ROOT = resolve(PERF_DIR, '..', '..');
export const BUDGETS_PATH = join(REPO_ROOT, 'perf-budgets.json');

// SPEC "CI, Performance, And Release" — the fixed regression thresholds.
//  · Deterministic artifact size regression above 5% fails.
//  · Browser runtime regression fails only when the median increase is BOTH
//    above 10% AND the absolute median increase exceeds 20 ms.
export const THRESHOLDS = {
    sizeRegressionPct: 0.05,
    runtimePct: 0.1,
    runtimeAbsMs: 20,
};

// Warm-up + measured run counts per scenario. Picked for a stable median in
// headless CI: the warm-ups prime V8/JIT and the HTTP cache (the browser
// context is reused across runs), and an ODD number of measured runs yields a
// single-sample median with no interpolation. See docs/perf note in the ticket.
export const DEFAULT_WARMUPS = 3;
export const DEFAULT_RUNS = 9;

// The first-party plugins measured for ESM/IIFE size and first-activation time.
// `pkg` is the browser-runtime registry name; `toggle` is the stable toolbar
// button marker each plugin renders once activated (used as the "activated"
// signal).
// The package-name aria-label fallback lets the head-owned harness measure base
// artifacts built before Toolbar exposed the stable data-plugin-toggle marker —
// and before SDK plugins gained a `title`, when the button's accessible name
// still WAS the package name. Current builds match on the first alternative.
export const PLUGINS = [
    {
        key: 'image-manipulation',
        dir: 'packages/plugin-image-manipulation',
        pkg: '@triiiceratops/plugin-image-manipulation',
        toggle: '[data-plugin-toggle="image-manipulation"],[aria-label="@triiiceratops/plugin-image-manipulation"]',
    },
    {
        key: 'image-download',
        dir: 'packages/plugin-image-export',
        pkg: '@triiiceratops/plugin-image-export',
        toggle: '[data-plugin-toggle="image-download"],[aria-label="@triiiceratops/plugin-image-export"]',
    },
    {
        key: 'pdf-export',
        dir: 'packages/plugin-pdf-export',
        pkg: '@triiiceratops/plugin-pdf-export',
        toggle: '[data-plugin-toggle="pdf-export"],[aria-label="@triiiceratops/plugin-pdf-export"]',
    },
    {
        key: 'annotation-editor',
        dir: 'packages/plugin-annotation-editor',
        pkg: '@triiiceratops/plugin-annotation-editor',
        toggle: '[data-plugin-toggle="annotation-editor"],[aria-label="@triiiceratops/plugin-annotation-editor"]',
    },
];

// Runtime scenarios (SPEC). Interaction + plugin scenarios run with all
// first-party plugins activated AND subscribed, so subscription overhead is part
// of the measured baseline (ADR 0008).
export const RUNTIME_SCENARIOS = [
    'initial_viewer_mount',
    'local_manifest_readiness',
    'first_canvas_render',
    'theme_switch',
    'core_interaction',
    ...PLUGINS.map((p) => `activate_${p.key}`),
];

// --- logging ---------------------------------------------------------------

const c = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    dim: '\x1b[2m',
    bold: '\x1b[1m',
};
export function log(msg = '') {
    process.stdout.write(`${msg}\n`);
}
export function heading(msg) {
    log(`\n${c.bold}${msg}${c.reset}`);
}
export function step(msg) {
    log(`${c.dim}  · ${msg}${c.reset}`);
}
export function ok(msg) {
    log(`${c.green}PASS${c.reset} ${msg}`);
}
export function bad(msg) {
    log(`${c.red}FAIL${c.reset} ${msg}`);
}
export function warn(msg) {
    log(`${c.yellow}WARN${c.reset} ${msg}`);
}

// --- process running -------------------------------------------------------

export function run(cmd, args, opts = {}) {
    return new Promise((resolvePromise, reject) => {
        const child = spawn(cmd, args, {
            cwd: opts.cwd,
            env: { ...process.env, ...opts.env },
            stdio: opts.inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
            shell: false,
        });
        let out = '';
        if (!opts.inherit) {
            child.stdout.on('data', (d) => (out += d.toString()));
            child.stderr.on('data', (d) => (out += d.toString()));
        }
        const timer = opts.timeout
            ? setTimeout(() => {
                  child.kill('SIGKILL');
                  reject(
                      new Error(
                          `Timed out after ${opts.timeout}ms: ${cmd} ${args.join(' ')}`,
                      ),
                  );
              }, opts.timeout)
            : null;
        child.on('error', (err) => {
            if (timer) clearTimeout(timer);
            reject(err);
        });
        child.on('close', (code) => {
            if (timer) clearTimeout(timer);
            if (code === 0) resolvePromise(out);
            else {
                const tail = out.split('\n').slice(-40).join('\n');
                reject(
                    new Error(
                        `Command failed (exit ${code}): ${cmd} ${args.join(' ')}\n${tail}`,
                    ),
                );
            }
        });
    });
}

// --- statistics ------------------------------------------------------------

export function median(values) {
    if (!values.length) return NaN;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2;
}

// --- artifact sizing -------------------------------------------------------

export function fileSize(path) {
    return existsSync(path) ? statSync(path).size : 0;
}

function resolveModuleFile(p) {
    for (const candidate of [p, `${p}.js`, `${p}.mjs`, join(p, 'index.js')]) {
        if (existsSync(candidate) && statSync(candidate).isFile())
            return candidate;
    }
    return null;
}

/**
 * Total byte size of the static import graph reachable from an ESM entry file,
 * following only the package's OWN emitted files (relative specifiers). Bare
 * specifiers (svelte, openseadragon, …) are external runtime deps a consumer's
 * bundler provides, so they are not part of the package's shipped byte cost.
 * This is what makes `core:esm-entry-graph` meaningful even though the emitted
 * `dist/index.js` is only a thin re-export shell.
 */
export function esmEntryGraphSize(entryFile) {
    const entry = resolveModuleFile(resolve(entryFile));
    if (!entry) return 0;
    const seen = new Set();
    const stack = [entry];
    let total = 0;
    const importRe =
        /(?:import|export)\b[^'"]*?\bfrom\s*['"]([^'"]+)['"]|(?:^|[^\w$.])import\s*['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)/gm;
    while (stack.length) {
        const file = stack.pop();
        if (seen.has(file)) continue;
        seen.add(file);
        const src = readFileSync(file, 'utf8');
        total += Buffer.byteLength(src);
        importRe.lastIndex = 0;
        let m;
        while ((m = importRe.exec(src))) {
            const spec = m[1] || m[2] || m[3];
            if (!spec || !spec.startsWith('.')) continue;
            const target = resolveModuleFile(resolve(dirname(file), spec));
            if (target && !seen.has(target)) stack.push(target);
        }
    }
    return total;
}

/**
 * Per-artifact byte sizes for a built repo root. Matches the SPEC list: core
 * ESM entry graph, style.css, element IIFE, each plugin ESM + IIFE, and the SDK
 * ESM entry graph. These are exactly the published artifacts a consumer loads.
 */
export function collectSizes(root) {
    const coreDist = join(root, 'packages/core/dist');
    const sizes = {
        'core:esm-entry-graph': esmEntryGraphSize(join(coreDist, 'index.js')),
        'core:style.css': fileSize(join(coreDist, 'triiiceratops.css')),
        'core:element-iife': fileSize(
            join(coreDist, 'triiiceratops-element.iife.js'),
        ),
        'sdk:esm-entry-graph': esmEntryGraphSize(
            join(root, 'packages/plugin-sdk/dist/index.js'),
        ),
    };
    for (const p of PLUGINS) {
        sizes[`${p.key}:esm`] = esmEntryGraphSize(
            join(root, p.dir, 'dist/index.js'),
        );
        sizes[`${p.key}:iife`] = fileSize(join(root, p.dir, 'dist/iife.js'));
    }
    return sizes;
}

// --- comparison ------------------------------------------------------------

/**
 * Compare per-artifact sizes. A deterministic increase above 5% is a regression
 * (SPEC). Missing artifacts (0 bytes on head where base had bytes) also fail.
 *
 * `accepted` is the optional `acceptedSizeIncreases` map from perf-budgets.json:
 * a reviewed, committed exemption for an intentional cost shift the base
 * measurement cannot represent — work moving out of an external dependency (a
 * bare specifier, never counted in an entry graph) into first-party code. An
 * exempt artifact is excused from the delta gate only while its head size stays
 * at or below the accepted `headBytes`, so further growth still fails.
 */
export function compareSizes(base, head, accepted = {}) {
    const rows = [];
    let regressed = false;
    for (const key of Object.keys(head)) {
        const b = base[key] ?? 0;
        const h = head[key] ?? 0;
        const deltaBytes = h - b;
        const pct = b > 0 ? deltaBytes / b : h > 0 ? Infinity : 0;
        const exemption = accepted[key];
        const exempt = Boolean(exemption) && h <= exemption.headBytes;
        const fail = pct > THRESHOLDS.sizeRegressionPct && !exempt;
        if (fail) regressed = true;
        rows.push({
            key,
            base: b,
            head: h,
            deltaBytes,
            pct,
            fail,
            ...(exempt ? { exempt: true, reason: exemption.reason } : {}),
        });
    }
    return { rows, regressed };
}

/**
 * Compare runtime medians. A scenario regresses only when BOTH conditions hold:
 * median increase > 10% AND absolute median increase > 20 ms (SPEC double gate).
 */
export function compareRuntime(base, head) {
    const rows = [];
    let regressed = false;
    for (const key of Object.keys(head)) {
        const b = base[key]?.median ?? NaN;
        const h = head[key]?.median ?? NaN;
        const deltaMs = h - b;
        const pct = b > 0 ? deltaMs / b : 0;
        const fail =
            Number.isFinite(b) &&
            Number.isFinite(h) &&
            pct > THRESHOLDS.runtimePct &&
            deltaMs > THRESHOLDS.runtimeAbsMs;
        if (fail) regressed = true;
        rows.push({ key, base: b, head: h, deltaMs, pct, fail });
    }
    return { rows, regressed };
}

// --- budgets (absolute drift) ----------------------------------------------

export function loadBudgets() {
    if (!existsSync(BUDGETS_PATH)) return null;
    return JSON.parse(readFileSync(BUDGETS_PATH, 'utf8'));
}

/**
 * Build a budget file from a set of head measurements. Size ceilings allow the
 * SPEC 5% drift; runtime ceilings carry generous headroom over the captured
 * median so ordinary headless-CI timing noise does not flake, while gross
 * regressions still trip the base-vs-head gate. Intentional cost increases are
 * accepted by regenerating this committed file in the PR (reviewed budget bump).
 *
 * Any `acceptedSizeIncreases` already committed are carried forward — they
 * exempt an artifact from the base-vs-head delta gate, which regenerating
 * absolute ceilings does not address, so a recapture must not silently drop them.
 */
export function buildBudgets(
    measurement,
    baselineRef = '1.0.0-rc.25',
    acceptedSizeIncreases = loadBudgets()?.acceptedSizeIncreases,
) {
    const size = {};
    for (const [key, bytes] of Object.entries(measurement.sizes)) {
        size[key] = {
            bytes,
            ceilingBytes: Math.ceil(bytes * (1 + THRESHOLDS.sizeRegressionPct)),
        };
    }
    const runtime = {};
    for (const [key, val] of Object.entries(measurement.runtime)) {
        const m = val.median;
        runtime[key] = {
            medianMs: round2(m),
            // Headroom: 50% + 50ms over the captured median tolerates CI noise
            // yet still catches a gross absolute regression.
            ceilingMs: round2(m * 1.5 + 50),
        };
    }
    return {
        $schema: './scripts/perf/perf-budgets.schema.json',
        baselineRef,
        capturedAt: new Date().toISOString(),
        note:
            'Accepted post-cleanup absolute ceilings. base-vs-head comparison ' +
            'is enforced by scripts/perf/compare.mjs; this file guards absolute ' +
            'drift and is regenerated (reviewed) when a cost increase is ' +
            'intentional. Size ceilings = captured bytes +5%; runtime ceilings ' +
            'carry noise headroom over the captured median.',
        thresholds: THRESHOLDS,
        size,
        ...(acceptedSizeIncreases && Object.keys(acceptedSizeIncreases).length
            ? { acceptedSizeIncreases }
            : {}),
        runtime,
    };
}

/**
 * Enforce absolute ceilings against a head measurement — fails even when
 * base == head (a no-op change cannot drift the artifacts past the committed
 * budget). Returns the offending rows.
 */
export function checkBudgets(budgets, measurement) {
    const failures = [];
    for (const [key, bytes] of Object.entries(measurement.sizes)) {
        const budget = budgets.size?.[key];
        if (!budget) continue;
        if (bytes > budget.ceilingBytes) {
            failures.push({
                kind: 'size',
                key,
                value: bytes,
                ceiling: budget.ceilingBytes,
            });
        }
    }
    for (const [key, val] of Object.entries(measurement.runtime)) {
        const budget = budgets.runtime?.[key];
        if (!budget) continue;
        if (val.median > budget.ceilingMs) {
            failures.push({
                kind: 'runtime',
                key,
                value: round2(val.median),
                ceiling: budget.ceilingMs,
            });
        }
    }
    return failures;
}

// --- git worktrees ---------------------------------------------------------

export async function addWorktree(dir, ref) {
    await run('git', ['worktree', 'add', '--detach', '--force', dir, ref], {
        cwd: REPO_ROOT,
        timeout: 120_000,
    });
}

export async function removeWorktree(dir) {
    try {
        await run('git', ['worktree', 'remove', '--force', dir], {
            cwd: REPO_ROOT,
            timeout: 60_000,
        });
    } catch {
        rmSync(dir, { recursive: true, force: true });
    }
}

export async function resolveSha(ref) {
    const out = await run('git', ['rev-parse', ref], { cwd: REPO_ROOT });
    return out.trim();
}

// --- formatting ------------------------------------------------------------

export function round2(n) {
    return Math.round(n * 100) / 100;
}
function kib(bytes) {
    return `${(bytes / 1024).toFixed(1)} KiB`;
}
function pct(p) {
    if (!Number.isFinite(p)) return 'new';
    const s = (p * 100).toFixed(2);
    return `${p >= 0 ? '+' : ''}${s}%`;
}

export function formatSizeTable(rows) {
    const lines = [
        '| Artifact | Base | Head | Δ bytes | Δ % | |',
        '| --- | ---: | ---: | ---: | ---: | :--: |',
    ];
    for (const r of rows) {
        lines.push(
            `| \`${r.key}\` | ${kib(r.base)} | ${kib(r.head)} | ${
                r.deltaBytes >= 0 ? '+' : ''
            }${r.deltaBytes} | ${pct(r.pct)} | ${
                r.fail ? 'FAIL' : r.exempt ? 'accepted' : 'ok'
            } |`,
        );
    }
    return lines.join('\n');
}

export function formatRuntimeTable(rows) {
    const lines = [
        '| Scenario | Base median | Head median | Δ ms | Δ % | |',
        '| --- | ---: | ---: | ---: | ---: | :--: |',
    ];
    for (const r of rows) {
        lines.push(
            `| \`${r.key}\` | ${round2(r.base)} ms | ${round2(r.head)} ms | ${
                r.deltaMs >= 0 ? '+' : ''
            }${round2(r.deltaMs)} | ${pct(r.pct)} | ${r.fail ? 'FAIL' : 'ok'} |`,
        );
    }
    return lines.join('\n');
}

// --- misc ------------------------------------------------------------------

export function parseArgs(argv) {
    const args = {};
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a.startsWith('--')) {
            const key = a.slice(2);
            const next = argv[i + 1];
            if (next && !next.startsWith('--')) {
                args[key] = next;
                i++;
            } else {
                args[key] = true;
            }
        }
    }
    return args;
}
