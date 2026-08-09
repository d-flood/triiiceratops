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
//  · Renderer memory regression fails only when a counter's increase is BOTH
//    above 10% AND above an absolute floor (bytes or tiles), so ordinary
//    decode-timing jitter in the settle window does not flake.
//
// The byte floor is PROPORTIONAL to the scenario being compared, not a flat
// figure. A flat floor has to be sized for the largest scenario and then
// swallows the smallest one whole: at 4 MiB it was 4.2x the entire
// thumbnail-tier measurement, so a regression from thumbnail rung 256 to rung
// 512 — a 4x increase in decoded bytes, exactly what the size ladder exists to
// prevent — cleared every gate. A fraction of the scenario's own baseline scales
// with what is being measured, and the small absolute minimum keeps a
// near-zero baseline from making the gate hair-trigger.
export const THRESHOLDS = {
    sizeRegressionPct: 0.05,
    runtimePct: 0.1,
    runtimeAbsMs: 20,
    memoryPct: 0.1,
    memoryBytesFloorPct: 0.25,
    memoryBytesFloorMinBytes: 256 * 1024,
    memoryAbsTiles: 8,
};

/**
 * Headroom on a captured byte figure when writing its absolute ceiling.
 *
 * Proportional for the same reason the regression floor is: an additive floor
 * large enough for the pyramid tier is larger than the whole thumbnail-tier
 * measurement, which makes that scenario's ceiling unfailable. 75% absorbs the
 * observed spread of the opportunistic cache across settle windows (the widest
 * seen is ~9%) while still failing a tier or rung regression, which is an
 * order-of-magnitude effect rather than a percentage one.
 */
export const MEMORY_BYTE_CEILING_FACTOR = 1.75;

// Warm-up + measured run counts per scenario. Picked for a stable median in
// headless CI: the warm-ups prime V8/JIT and the HTTP cache (the browser
// context is reused across runs), and an ODD number of measured runs yields a
// single-sample median with no interpolation. See docs/perf note in the ticket.
export const DEFAULT_WARMUPS = 3;
export const DEFAULT_RUNS = 9;

// The memory scenario runs far fewer times: it opens an 800-canvas manifest and
// traverses the whole world, so one run costs seconds rather than milliseconds.
// It is also a settled-state reading rather than a race against a clock, so its
// spread is much narrower than a timing median's and three runs suffice.
export const MEMORY_WARMUPS = 1;
export const MEMORY_RUNS = 3;

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
        paused: true,
    },
];

/**
 * Plugins whose ACTIVATION cannot be measured, and why.
 *
 * `@triiiceratops/plugin-annotation-editor` is paused and unpublished: it still
 * declares the retired `osd@5` capability, so registering it fails closed with a
 * structured `PluginCompatibilityError` and installs **no toolbar button at all**
 * — see its README, "What you see if you register it anyway". The activation
 * signal every plugin scenario waits on is that button, so the scenario cannot
 * complete, and neither can `theme_switch` or `core_interaction`, which wait for
 * every plugin to be up before they measure anything.
 *
 * This is renderer-independent (`RENDERER_AVAILABLE_FOR_ANNOTORIOUS` is a
 * hardcoded `false`), so it is not a consequence of the renderer swap; the pause
 * landed after the last budget capture and left this harness measuring a button
 * that no longer exists.
 *
 * Its ARTIFACTS are still sized — the package still builds and its bytes are
 * still real — so only the runtime scenario is dropped.
 */
export const ACTIVATION_MEASURED_PLUGINS = PLUGINS.filter((p) => !p.paused);

// Runtime scenarios (SPEC). Interaction + plugin scenarios run with all
// first-party plugins activated AND subscribed, so subscription overhead is part
// of the measured baseline (ADR 0008).
export const RUNTIME_SCENARIOS = [
    'initial_viewer_mount',
    'local_manifest_readiness',
    'first_canvas_render',
    'theme_switch',
    'core_interaction',
    ...ACTIVATION_MEASURED_PLUGINS.map((p) => `activate_${p.key}`),
];

/**
 * Memory scenarios, keyed the way `runtime` is.
 *
 * Both open the generated 800-canvas continuous fixture, traverse the whole
 * world in steps, stop, wait for the network to fall quiet, and read the
 * renderer's own residency counters. They differ only in zoom, and therefore in
 * which residency tier the river is in: pyramid (tiles) and thumbnail (the
 * resolved-thumbnail rung). Every canvas in the fixture is the same size, so one
 * zoom cannot cover both.
 *
 * The gate is deliberately NOT a browser heap metric. Decoded tiles are
 * `ImageBitmap`s, which live outside the JS heap, so `performance.memory` reads
 * near-flat while tiles accumulate — a heap ceiling on this scenario would be an
 * assertion that cannot fail. `residentTileCount` is the load-bearing counter
 * because the required set is never evicted: if the canvas tier stopped gating
 * level residency (ADR 0014), the traversed history accumulates there and no
 * byte budget can trim it.
 */
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

/**
 * The counters a memory scenario is budgeted on, and the absolute floor each
 * one's regression must also clear (a function of the base reading, so a small
 * scenario is not swallowed by a floor sized for a large one).
 *
 * `decodedBytes` is meaningful only while its ceiling sits BELOW the scenario's
 * `byteBudget`: above that, `trim()` already guarantees the bound and the
 * assertion would be vacuous. `checkBudgets` reports that as a failure of the
 * budget file rather than silently passing.
 *
 * `requiredBytes` is budgeted alongside it because it is the only one of the
 * three that moves when the residency TIER or the thumbnail RUNG changes and
 * nothing else does. `residentTileCount` counts tiles, so a rung regression that
 * resolves the same canvases at twice the size leaves it untouched; `decodedBytes`
 * includes the opportunistic cache, which is where the settle-window jitter
 * lives. The required set is a pure function of viewport position and tier
 * (ADR 0014), so its byte total is the sharpest reading of "the same view now
 * costs more pixels".
 */
export const MEMORY_COUNTERS = [
    {
        key: 'residentTileCount',
        unit: 'tiles',
        floor: () => THRESHOLDS.memoryAbsTiles,
    },
    { key: 'requiredBytes', unit: 'bytes', floor: memoryByteFloor },
    { key: 'decodedBytes', unit: 'bytes', floor: memoryByteFloor },
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
 * specifiers (svelte, …) are external runtime deps a consumer's
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

/**
 * Compare renderer memory counters. A counter regresses only when BOTH the
 * increase exceeds `memoryPct` AND the absolute increase exceeds that counter's
 * floor — the same double gate the runtime medians use, for the same reason.
 *
 * A scenario missing from either side yields a `skipped` row rather than a pass:
 * the counters exist only on the first-party renderer, so a base that predates
 * it has nothing to diff against and pretending otherwise would report "ok" for
 * a comparison that never happened.
 *
 * `null` — not merely `undefined` — is the shape a measurement uses for "this
 * dist has no counters", so both sides are coerced rather than defaulted: an ES
 * default parameter fires only on `undefined`, and `Object.keys(null)` throws.
 */
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
 *
 * `baselineRef` defaults to what the MEASUREMENT says it measured, never to the
 * previous file's value: inheriting it makes one stale literal self-perpetuating,
 * so every later regeneration keeps naming a ref whose build cannot produce the
 * numbers in the file. A `--head-root` capture has no ref at all, and
 * `working-tree` is the honest answer for it.
 */
export function buildBudgets(
    measurement,
    baselineRef = measurement.sha ?? measurement.ref ?? 'working-tree',
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
    // Tile-count ceilings carry the runtime-style 50% + floor headroom. BYTE
    // ceilings are purely proportional (see MEMORY_BYTE_CEILING_FACTOR): an
    // additive floor sized for the pyramid tier exceeds the whole thumbnail-tier
    // measurement and makes that ceiling unfailable.
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
            // Recorded, not enforced: the ceiling above is only a real assertion
            // while it stays below this, because the scheduler's `trim()`
            // already bounds `decodedBytes` by it.
            byteBudget: val.byteBudget,
        };
    }

    return {
        $schema: './scripts/perf/perf-budgets.schema.json',
        baselineRef,
        // Which renderer produced these numbers, detected from the measured
        // dist. Recorded so a capture taken against an artifact that predates
        // the first-party renderer cannot be filed as this renderer's ceilings.
        ...(measurement.renderer ? { renderer: measurement.renderer } : {}),
        // Which TRACING MODE produced the runtime medians these ceilings are
        // derived from. Recorded for the same reason as `renderer`: it decides
        // what the numbers mean. Enforced by `checkTracingMode`, so the
        // "capture untraced, enforce untraced" pairing is a property of the file
        // rather than a convention the next caller has to remember.
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
        // Always emitted, even empty. The schema requires the key, and a
        // `--size-only` capture that dropped it wrote a file its own schema
        // rejected; an explicit `{}` says "no memory measured" where an absent
        // key said nothing at all.
        memory,
    };
}

/**
 * Check a budget file against its own schema's `required` lists.
 *
 * Deliberately not a full JSON-Schema implementation and deliberately not a new
 * dependency: what actually went wrong was a `required` key the generator did not
 * emit, and reading the schema's own `required` arrays catches exactly that class
 * without anything to keep in sync. Returns human-readable problems; empty means
 * consistent.
 */
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

/**
 * Refuse to enforce runtime ceilings against a measurement taken in a different
 * TRACING MODE than the one that produced them.
 *
 * Playwright tracing is not a uniform tax: its DOM snapshots make
 * `activate_image-manipulation` 5.7 ms untraced and 64.6 ms traced on the same
 * build, while the load phases barely move. Ceilings are therefore captured
 * `--no-traces`, and the enforcing run must pass `--no-traces` too — otherwise
 * the job fails on the cost of observing, not on a regression, and the only
 * thing standing between the two is that whoever wrote the workflow remembered
 * the flag. This makes it a checked property of the budget file.
 *
 * Returns a human-readable problem, or `null` when the modes agree. A budget
 * file with no `tracing` field predates the record and cannot be checked: that
 * is a warning for the caller, not a silent pass, hence the distinct
 * `unrecorded` kind.
 */
export function checkTracingMode(budgets, measurement) {
    // Nothing was timed, so no runtime ceiling is being enforced.
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

/**
 * Enforce absolute ceilings against a head measurement — fails even when
 * base == head (a no-op change cannot drift the artifacts past the committed
 * budget). Returns the offending rows.
 */
export function checkBudgets(
    budgets,
    measurement,
    { skipMemory = false } = {},
) {
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
    // `--size-only` never opened a browser, so it has no memory reading and no
    // opinion about one. Reporting the memory ceilings as failures there would
    // make that mode permanently red and train the reader to ignore the section
    // that matters in a full run.
    if (skipMemory) return failures;
    // A scenario the head MEASURED but the budget file does not cover is
    // unenforced, which is the failure mode an always-emitted (possibly empty)
    // `memory` key would otherwise hide: schema-valid and toothless.
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
            // A budgeted memory scenario that produced no counters is a failure,
            // not a skip. The counters live on the renderer itself, so a silent
            // pass here is precisely how a build whose renderer never mounted
            // would sail through the memory gate.
            failures.push({
                kind: 'memory',
                key: `${scenario} (not measured)`,
                value: 'none',
                ceiling: budget.ceilingResidentTileCount,
            });
            continue;
        }
        // The byte ceiling asserts nothing once it exceeds the ceiling the
        // scheduler's own `trim()` already enforces, so say so out loud rather
        // than reporting a pass.
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
