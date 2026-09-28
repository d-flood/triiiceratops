// Shared helpers for the performance comparison harness.

import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PERF_DIR = resolve(fileURLToPath(new URL('.', import.meta.url)));
export const REPO_ROOT = resolve(PERF_DIR, '..', '..');
export const BUDGETS_PATH = join(REPO_ROOT, 'perf-budgets.json');

// Fixed regression thresholds: size >5%; runtime >10% and >20ms; memory >10% and above floor.
export const THRESHOLDS = {
    sizeRegressionPct: 0.05,
    runtimePct: 0.1,
    runtimeAbsMs: 20,
    memoryPct: 0.1,
    memoryBytesFloorPct: 0.25,
    memoryBytesFloorMinBytes: 256 * 1024,
    memoryAbsTiles: 8,
};

/** Proportional headroom on a captured byte figure when writing its ceiling. */
export const MEMORY_BYTE_CEILING_FACTOR = 1.75;

// Odd measured-run count yields a single-sample median.
export const DEFAULT_WARMUPS = 3;
export const DEFAULT_RUNS = 9;

// Fewer memory runs: one traverse costs seconds and spread is narrow.
export const MEMORY_WARMUPS = 1;
export const MEMORY_RUNS = 3;

// First-party plugins measured for ESM/IIFE size and first-activation time.
// `toggle` is the toolbar marker used as the "activated" signal.
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
        paused: true,
        sized: false,
    },
    {
        key: 'av',
        dir: 'packages/plugin-av',
        pkg: '@triiiceratops/plugin-av',
        paused: true,
        sized: false,
    },
];

export const ACTIVATION_MEASURED_PLUGINS = PLUGINS.filter((p) => !p.paused);

// Runtime scenarios run with all first-party plugins activated and subscribed.
export const RUNTIME_SCENARIOS = [
    'initial_viewer_mount',
    'local_manifest_readiness',
    'first_canvas_render',
    'theme_switch',
    'core_interaction',
    ...ACTIVATION_MEASURED_PLUGINS.map((p) => `activate_${p.key}`),
];

/** Memory scenarios: 800-canvas traverse at pyramid and thumbnail zoom. */
export const MEMORY_SCENARIOS = [
    'continuous_800_flick',
    'continuous_800_thumbnail_flick',
];

/** The proportional byte floor a byte-counter regression must also clear. */
function memoryByteFloor(base) {
    return Math.max(
        THRESHOLDS.memoryBytesFloorMinBytes,
        base * THRESHOLDS.memoryBytesFloorPct,
    );
}

/** Memory counters and their regression floors. */
export const MEMORY_COUNTERS = [
    {
        key: 'residentTileCount',
        unit: 'tiles',
        floor: () => THRESHOLDS.memoryAbsTiles,
    },
    { key: 'requiredBytes', unit: 'bytes', floor: memoryByteFloor },
    { key: 'decodedBytes', unit: 'bytes', floor: memoryByteFloor },
];

// --- logging ---

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

// --- process running ---

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

// --- statistics ---

export function median(values) {
    if (!values.length) return NaN;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2;
}

// --- artifact sizing ---

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

/** Byte size of the ESM graph reachable via relative imports only. */
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
    for (const p of PLUGINS.filter((p) => p.sized !== false)) {
        sizes[`${p.key}:esm`] = esmEntryGraphSize(
            join(root, p.dir, 'dist/index.js'),
        );
        sizes[`${p.key}:iife`] = fileSize(join(root, p.dir, 'dist/iife.js'));
    }

    // AV chunks are file sizes, not graph totals, so lazy chunks stay visible.
    const avDist = join(root, 'packages/plugin-av/dist');
    sizes['av:esm-entry'] = fileSize(join(avDist, 'index.js'));
    sizes['av:iife'] = fileSize(join(avDist, 'iife.js'));
    sizes['av:iife-chunk-hls'] = fileSize(join(avDist, 'av-hls.js'));
    sizes['av:iife-chunk-timeline'] = fileSize(join(avDist, 'av-timeline.js'));
    sizes['av:iife-chunk-sequencer'] = fileSize(
        join(avDist, 'av-sequencer.js'),
    );
    sizes['av:iife-chunk-transcript'] = fileSize(
        join(avDist, 'av-transcript.js'),
    );

    return sizes;
}

// --- comparison ---

/** Whether two measurements came from different renderer generations. */
export function rendererGenerationChanged(base, head) {
    return base?.renderer !== head?.renderer;
}

/** Size regression is a deterministic increase above 5%; missing artifacts fail. */
export function compareSizes(base, head, accepted = {}) {
    const rows = [];
    let regressed = false;
    for (const key of new Set([...Object.keys(base), ...Object.keys(head)])) {
        const b = base[key] ?? 0;
        const h = head[key] ?? 0;
        const deltaBytes = h - b;
        const pct = b > 0 ? deltaBytes / b : h > 0 ? Infinity : 0;
        const exemption = accepted[key];
        const exempt = Boolean(exemption) && h <= exemption.headBytes;
        const missing = b > 0 && h === 0;
        const fail = missing || (pct > THRESHOLDS.sizeRegressionPct && !exempt);
        if (fail) regressed = true;
        rows.push({
            key,
            base: b,
            head: h,
            deltaBytes,
            pct,
            fail,
            ...(missing ? { missing: true } : {}),
            ...(exempt ? { exempt: true, reason: exemption.reason } : {}),
        });
    }
    return { rows, regressed };
}

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

/** Missing counters yield `skipped`, never a pass. */
export function compareMemory(baseMemory, headMemory) {
    const base = baseMemory ?? {};
    const head = headMemory ?? {};
    const rows = [];
    let regressed = false;
    for (const scenario of Object.keys(head)) {
        for (const { key, floor, unit } of MEMORY_COUNTERS) {
            const b = base[scenario]?.[key];
            const h = head[scenario]?.[key];
            if (!Number.isFinite(b) || !Number.isFinite(h)) {
                rows.push({ key: `${scenario}.${key}`, unit, skipped: true });
                continue;
            }
            const delta = h - b;
            const p = b > 0 ? delta / b : h > 0 ? Infinity : 0;
            const fail = p > THRESHOLDS.memoryPct && delta > floor(b);
            if (fail) regressed = true;
            rows.push({
                key: `${scenario}.${key}`,
                unit,
                base: b,
                head: h,
                delta,
                pct: p,
                fail,
            });
        }
    }
    return { rows, regressed };
}

// --- budgets ---

export function loadBudgets() {
    if (!existsSync(BUDGETS_PATH)) return null;
    return JSON.parse(readFileSync(BUDGETS_PATH, 'utf8'));
}

/** Build a budget file from head measurements. */
export function buildBudgets(
    measurement,
    baselineRef = measurement.sha ?? measurement.ref ?? 'working-tree',
    acceptedSizeIncreases = loadBudgets()?.acceptedSizeIncreases,
) {
    const size = {};
    for (const [key, bytes] of Object.entries(measurement.sizes)) {
        if (!Number.isFinite(bytes) || bytes <= 0) {
            throw new Error(
                `cannot capture a budget for missing artifact \`${key}\` (${bytes} bytes)`,
            );
        }
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
            ceilingMs: round2(m * 1.5 + 50),
        };
    }
    // Byte ceilings stay proportional so the thumbnail tier keeps a real ceiling.
    const memory = {};
    for (const [key, val] of Object.entries(measurement.memory ?? {})) {
        if (!val) continue;
        memory[key] = {
            residentTileCount: val.residentTileCount,
            ceilingResidentTileCount: Math.ceil(
                val.residentTileCount * 1.5 + THRESHOLDS.memoryAbsTiles,
            ),
            requiredBytes: val.requiredBytes,
            ceilingRequiredBytes: Math.ceil(
                val.requiredBytes * MEMORY_BYTE_CEILING_FACTOR,
            ),
            decodedBytes: val.decodedBytes,
            ceilingDecodedBytes: Math.ceil(
                val.decodedBytes * MEMORY_BYTE_CEILING_FACTOR,
            ),
            // `trim()` already bounds `decodedBytes`; recorded for the vacuity check.
            byteBudget: val.byteBudget,
        };
    }

    return {
        $schema: './scripts/perf/perf-budgets.schema.json',
        baselineRef,
        ...(measurement.renderer ? { renderer: measurement.renderer } : {}),
        ...(measurement.tracing ? { tracing: measurement.tracing } : {}),
        capturedAt: new Date().toISOString(),
        note:
            'Accepted post-cleanup absolute ceilings. base-vs-head comparison ' +
            'is enforced by scripts/perf/compare.mjs; this file guards absolute ' +
            'drift and is regenerated (reviewed) when a cost increase is ' +
            'intentional. Size ceilings = captured bytes +5%; runtime ceilings ' +
            'carry noise headroom over the captured median; byte ceilings are ' +
            'proportional (x1.75) so a small scenario is not swallowed by an ' +
            'additive floor sized for a large one. ' +
            'baselineRef names the commit that was MEASURED, which for a ' +
            'working-tree capture is not a released tag. Reproduce a capture ' +
            'with an ordinary build of that commit: the first-party Canvas2D ' +
            'renderer is the only renderer, so no environment variable ' +
            'selects it.',
        thresholds: THRESHOLDS,
        size,
        ...(acceptedSizeIncreases && Object.keys(acceptedSizeIncreases).length
            ? { acceptedSizeIncreases }
            : {}),
        runtime,
        memory,
    };
}

/** Check a budget file against its schema's `required` lists. */
export function validateBudgets(
    budgets,
    schemaPath = join(PERF_DIR, 'perf-budgets.schema.json'),
) {
    if (!existsSync(schemaPath)) return [`missing schema: ${schemaPath}`];
    const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
    const problems = [];
    for (const key of schema.required ?? []) {
        if (budgets?.[key] === undefined) problems.push(`missing \`${key}\``);
    }
    for (const [section, spec] of Object.entries(schema.properties ?? {})) {
        const value = budgets?.[section];
        if (value === undefined) continue;
        for (const key of spec.required ?? []) {
            if (value[key] === undefined)
                problems.push(`missing \`${section}.${key}\``);
        }
        for (const key of spec.additionalProperties?.required ?? []) {
            for (const [name, entry] of Object.entries(value)) {
                if (entry?.[key] === undefined)
                    problems.push(`missing \`${section}.${name}.${key}\``);
            }
        }
    }
    return problems;
}

/** Refuse ceilings enforced against a different tracing mode. */
export function checkTracingMode(budgets, measurement) {
    if (!measurement?.tracing) return null;
    const recorded = budgets?.tracing;
    if (!recorded) {
        return {
            kind: 'unrecorded',
            message:
                'perf-budgets.json records no `tracing` mode, so it cannot be ' +
                'checked against this run (measured: ' +
                `\`${measurement.tracing}\`). Re-capture with --update-budgets.`,
        };
    }
    if (recorded === measurement.tracing) return null;
    return {
        kind: 'mismatch',
        message:
            `tracing mode mismatch — perf-budgets.json ceilings were captured with tracing \`${recorded}\`, ` +
            `this run measured with tracing \`${measurement.tracing}\`. Runtime medians and ceilings must be the ` +
            `same kind of number: ${
                measurement.tracing === 'playwright'
                    ? 'pass `--no-traces` on the enforcing run'
                    : 're-capture the budgets with `--update-budgets --no-traces`'
            }.`,
    };
}

/** Enforce absolute ceilings against a head measurement. */
export function checkBudgets(
    budgets,
    measurement,
    { skipMemory = false } = {},
) {
    const failures = [];
    for (const [key, budget] of Object.entries(budgets.size ?? {})) {
        const bytes = measurement.sizes?.[key];
        if (!Number.isFinite(bytes) || bytes <= 0) {
            failures.push({
                kind: 'size',
                key: `${key} (missing)`,
                value: bytes ?? 'none',
                ceiling: budget.ceilingBytes,
            });
            continue;
        }
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
    if (skipMemory) return failures;
    for (const scenario of Object.keys(measurement.memory ?? {})) {
        if (!budgets.memory?.[scenario]) {
            failures.push({
                kind: 'memory',
                key: `${scenario} (measured but unbudgeted)`,
                value: 'no ceiling',
                ceiling: 'none',
            });
        }
    }
    for (const [scenario, budget] of Object.entries(budgets.memory ?? {})) {
        const val = measurement.memory?.[scenario];
        if (!val) {
            // Missing counters fail: a renderer that never mounted must not pass.
            failures.push({
                kind: 'memory',
                key: `${scenario} (not measured)`,
                value: 'none',
                ceiling: budget.ceilingResidentTileCount,
            });
            continue;
        }
        // A ceiling above `trim()`'s own bound is vacuous; report it as failure.
        if (
            Number.isFinite(val.byteBudget) &&
            budget.ceilingDecodedBytes >= val.byteBudget
        ) {
            failures.push({
                kind: 'memory',
                key: `${scenario}.ceilingDecodedBytes (vacuous)`,
                value: budget.ceilingDecodedBytes,
                ceiling: val.byteBudget,
            });
        }
        for (const { key: counter } of MEMORY_COUNTERS) {
            const ceiling =
                budget[`ceiling${counter[0].toUpperCase()}${counter.slice(1)}`];
            if (!Number.isFinite(ceiling)) continue;
            if (val[counter] > ceiling) {
                failures.push({
                    kind: 'memory',
                    key: `${scenario}.${counter}`,
                    value: val[counter],
                    ceiling,
                });
            }
        }
    }
    return failures;
}

// --- git worktrees ---

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

// --- formatting ---

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

export function formatMemoryTable(rows) {
    const show = (row, value) =>
        row.unit === 'bytes' ? kib(value) : String(value);
    const lines = [
        '| Counter | Base | Head | Δ | Δ % | |',
        '| --- | ---: | ---: | ---: | ---: | :--: |',
    ];
    for (const r of rows) {
        if (r.skipped) {
            lines.push(`| \`${r.key}\` | — | — | — | — | skipped |`);
            continue;
        }
        lines.push(
            `| \`${r.key}\` | ${show(r, r.base)} | ${show(r, r.head)} | ${
                r.delta >= 0 ? '+' : ''
            }${show(r, r.delta)} | ${pct(r.pct)} | ${r.fail ? 'FAIL' : 'ok'} |`,
        );
    }
    return lines.join('\n');
}

// --- misc ---

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
