// Performance measurement for one built repo root (ticket 25).
//
// Produces a measurement object: per-artifact byte sizes + per-scenario browser
// runtime medians. The RUNTIME half drives the PACKED artifacts a user actually
// loads — the self-contained element IIFE + each plugin IIFE — served from a
// static page (no bundler), exactly the `plain-html-iife` consumer shape. The
// browser scenario logic lives here (not in each checked-out tree) so it is
// byte-identical across the base and head SHAs; only the loaded dist differs.
//
// Scenarios (SPEC):
//   initial_viewer_mount, local_manifest_readiness, first_canvas_render,
//   theme_switch, core_interaction, activate_<each plugin>.
// Interaction + plugin scenarios run with ALL first-party plugins activated and
// subscribed, so subscription overhead is part of the baseline (ADR 0008).
//
// Standalone:  node scripts/perf/measure.mjs --root <builtRepo> --out out.json \
//                  [--traces-dir dir] [--warmups N] [--runs M] [--size-only]

import {
    cpSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
    DEFAULT_RUNS,
    DEFAULT_WARMUPS,
    PLUGINS,
    REPO_ROOT,
    collectSizes,
    log,
    median,
    parseArgs,
    round2,
    step,
} from './lib.mjs';

// Playwright is a devDependency of the `test-consumers` workspace package;
// resolve it from there (anchoring the require at the driver) so this script
// needs no root dependency (keeps the ticket-21 merge surface on root
// package.json minimal).
const driverRequire = createRequire(
    pathToFileURL(join(REPO_ROOT, 'test-consumers', 'driver', 'lib.mjs')).href,
);
const { chromium } = driverRequire('@playwright/test');

// Reuse the packed-harness static file server so the perf page is served
// exactly like the packed-consumer fixtures.
const { serveDir } = await import(
    pathToFileURL(join(REPO_ROOT, 'test-consumers', 'driver', 'lib.mjs')).href
);

// Software WebGL so OpenSeadragon's drawer paints headless without a GPU (same
// flags the packed-consumer harness uses).
const LAUNCH = {
    args: [
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
    ],
};

// Two-canvas local manifest (data-URI images, no network). The second canvas
// makes `core_interaction` (next-canvas navigation) a real state change.
function perfManifest() {
    const canvas = (n, fill) => ({
        id: `canvas/p${n}`,
        type: 'Canvas',
        height: 100,
        width: 100,
        items: [
            {
                id: `page/p${n}/1`,
                type: 'AnnotationPage',
                items: [
                    {
                        id: `annotation/p${n}-image`,
                        type: 'Annotation',
                        motivation: 'painting',
                        body: {
                            id: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect width='100' height='100' fill='%23${fill}'/%3E%3C/svg%3E`,
                            type: 'Image',
                            format: 'image/svg+xml',
                            height: 100,
                            width: 100,
                        },
                        target: `canvas/p${n}`,
                    },
                ],
            },
        ],
    });
    return {
        '@context': 'http://iiif.io/api/presentation/3/context.json',
        id: '/manifest.json',
        type: 'Manifest',
        label: { en: ['Performance harness manifest'] },
        items: [canvas(1, 'f8fafc'), canvas(2, '2563eb')],
    };
}

// The measurement page: loads the packed core element IIFE + every plugin IIFE,
// exactly like a no-bundler consumer.
function perfPage() {
    const scripts = [
        '/node_modules/triiiceratops/dist/triiiceratops-element.iife.js',
        ...PLUGINS.map((p) => `/node_modules/${p.pkg}/dist/iife.js`),
    ];
    return `<!doctype html>
<html lang="en">
<head><meta charset="UTF-8" />
<title>triiiceratops perf harness</title>
<style>html,body{margin:0}#stage{position:absolute;inset:0}</style>
${scripts.map((s) => `<script src="${s}"></script>`).join('\n')}
</head>
<body><div id="stage"></div></body>
</html>`;
}

/** Copy built dist into a served node_modules layout mirroring a real install. */
function stageWebRoot(root, webRoot) {
    const copyDist = (fromPkgDir, toNodeModulesPath) => {
        const from = join(root, fromPkgDir, 'dist');
        const to = join(webRoot, 'node_modules', toNodeModulesPath, 'dist');
        if (!existsSync(from)) {
            throw new Error(
                `missing built dist: ${from} (build the SHA first)`,
            );
        }
        mkdirSync(to, { recursive: true });
        cpSync(from, to, { recursive: true });
    };
    copyDist('packages/core', 'triiiceratops');
    for (const p of PLUGINS) copyDist(p.dir, p.pkg);
    writeFileSync(join(webRoot, 'index.html'), perfPage());
    writeFileSync(
        join(webRoot, 'manifest.json'),
        JSON.stringify(perfManifest()),
    );
}

// ── Browser-side scenario bodies ───────────────────────────────────────────
// Each runs inside the page and returns elapsed milliseconds via
// performance.now(). They are passed to page.evaluate so the exact same code
// runs against the base and head dist.

// Fresh load session: measures mount, manifest readiness, and first canvas
// render as three phases of ONE real page load.
const SESSION_FN = () =>
    new Promise((resolve, reject) => {
        const stage = document.getElementById('stage');
        stage.innerHTML = '';
        const el = document.createElement('triiiceratops-viewer');
        el.setAttribute('manifest-id', '/manifest.json');
        el.style.cssText = 'display:block;width:600px;height:400px';
        const result = { mount: null, manifest: null, canvas: null };
        const t0 = performance.now();
        el.addEventListener('manifestchange', () => {
            if (result.manifest == null)
                result.manifest = performance.now() - t0;
        });
        const deadline = t0 + 30000;
        const poll = () => {
            const now = performance.now();
            const sr = el.shadowRoot;
            if (result.mount == null && sr && sr.childElementCount > 0)
                result.mount = now - t0;
            if (result.canvas == null && sr && sr.querySelector('canvas'))
                result.canvas = now - t0;
            const done =
                result.mount != null &&
                result.manifest != null &&
                result.canvas != null;
            if (done) return resolve(result);
            if (now > deadline) {
                if (result.mount == null) result.mount = now - t0;
                if (result.manifest == null) result.manifest = now - t0;
                if (result.canvas == null)
                    return reject(new Error('canvas never rendered'));
                return resolve(result);
            }
            requestAnimationFrame(poll);
        };
        stage.appendChild(el);
        requestAnimationFrame(poll);
    });

// Build a viewer, activate + subscribe all plugins, wait until ready. Returns
// the element handle id on window for the follow-up interaction measurement.
const READY_WITH_PLUGINS_FN = ({ pluginPkgs, toggles }) =>
    new Promise((resolve, reject) => {
        const stage = document.getElementById('stage');
        stage.innerHTML = '';
        const el = document.createElement('triiiceratops-viewer');
        el.setAttribute('manifest-id', '/manifest.json');
        el.setAttribute('theme', 'light');
        el.style.cssText = 'display:block;width:600px;height:400px';
        stage.appendChild(el);
        const t0 = performance.now();
        const deadline = t0 + 30000;
        const waitCanvas = () => {
            const sr = el.shadowRoot;
            if (sr && sr.querySelector('canvas')) return activate();
            if (performance.now() > deadline)
                return reject(new Error('canvas never rendered'));
            requestAnimationFrame(waitCanvas);
        };
        const activate = () => {
            const reg = window.Triiiceratops.plugins;
            el.plugins = pluginPkgs.map((p) => reg.get(p)).filter(Boolean);
            // Wait until every plugin has mounted its toolbar toggle (activated
            // AND subscribed) so subscription overhead is live for the follow-up
            // interaction measurement.
            const waitToggles = () => {
                const sr = el.shadowRoot;
                const allUp =
                    sr && toggles.every((sel) => sr.querySelector(sel));
                if (allUp) {
                    window.__perfEl = el;
                    return resolve(true);
                }
                if (performance.now() > deadline)
                    return reject(new Error('plugins never activated'));
                requestAnimationFrame(waitToggles);
            };
            waitToggles();
        };
        waitCanvas();
    });

// Theme switch on the ready+subscribed viewer: light -> dark, timed to the first
// frame where the themed token actually changes.
const THEME_FN = () =>
    new Promise((resolve, reject) => {
        const el = window.__perfEl;
        const root = () => el.shadowRoot.querySelector('[data-theme]');
        const readVar = () =>
            root()
                ? getComputedStyle(root())
                      .getPropertyValue('--tri-color-neutral')
                      .trim()
                : '';
        const before = readVar();
        const t0 = performance.now();
        el.theme = 'dark';
        const deadline = t0 + 5000;
        const poll = () => {
            if (readVar() && readVar() !== before)
                return resolve(performance.now() - t0);
            if (performance.now() > deadline)
                return reject(new Error('theme never applied'));
            requestAnimationFrame(poll);
        };
        requestAnimationFrame(poll);
    });

// Core interaction on the ready+subscribed viewer: click next-canvas, timed to
// the canvaschange event (post reactive + subscriber flush).
const INTERACTION_FN = () =>
    new Promise((resolve, reject) => {
        const el = window.__perfEl;
        const btn = el.shadowRoot.querySelector('[aria-label="Next Canvas"]');
        if (!btn) return reject(new Error('next-canvas control not found'));
        const t0 = performance.now();
        el.addEventListener(
            'canvaschange',
            () => resolve(performance.now() - t0),
            { once: true },
        );
        btn.click();
        setTimeout(() => reject(new Error('canvaschange never fired')), 5000);
    });

// First activation of a single plugin on a ready viewer.
const ACTIVATE_FN = ({ pkg, toggle }) =>
    new Promise((resolve, reject) => {
        const stage = document.getElementById('stage');
        stage.innerHTML = '';
        const el = document.createElement('triiiceratops-viewer');
        el.setAttribute('manifest-id', '/manifest.json');
        el.style.cssText = 'display:block;width:600px;height:400px';
        stage.appendChild(el);
        const deadline = performance.now() + 30000;
        const waitCanvas = () => {
            const sr = el.shadowRoot;
            if (sr && sr.querySelector('canvas')) return doActivate();
            if (performance.now() > deadline)
                return reject(new Error('canvas never rendered'));
            requestAnimationFrame(waitCanvas);
        };
        const doActivate = () => {
            const factory = window.Triiiceratops.plugins.get(pkg);
            if (!factory)
                return reject(new Error(`plugin not registered: ${pkg}`));
            const t0 = performance.now();
            el.plugins = [factory];
            const poll = () => {
                if (el.shadowRoot && el.shadowRoot.querySelector(toggle))
                    return resolve(performance.now() - t0);
                if (performance.now() > deadline)
                    return reject(new Error('plugin toggle never mounted'));
                requestAnimationFrame(poll);
            };
            poll();
        };
        waitCanvas();
    });

// ── Runtime driver ─────────────────────────────────────────────────────────

// One measured run in a fresh page, retried on transient Playwright faults
// (e.g. "execution context destroyed" navigation races). Page errors are the
// benign headless GPU/WebGL noise the packed harness already filters — perf
// runs measure timing, not correctness — so they are ignored here.
async function attempt(context, baseURL, work, tries = 3) {
    let lastErr;
    for (let t = 0; t < tries; t++) {
        const page = await context.newPage();
        page.on('pageerror', () => {});
        try {
            await page.goto(`${baseURL}/`, { waitUntil: 'load' });
            return await work(page);
        } catch (err) {
            lastErr = err;
        } finally {
            await page.close().catch(() => {});
        }
    }
    throw lastErr;
}

async function runRepeated(context, baseURL, label, fn, arg, warmups, runs) {
    const samples = [];
    for (let i = 0; i < warmups + runs; i++) {
        const value = await attempt(context, baseURL, (page) =>
            page.evaluate(fn, arg),
        );
        if (i >= warmups) samples.push(value);
    }
    log(
        `    ${label}: median ${round2(median(samples))} ms  (n=${runs}, ` +
            `min ${round2(Math.min(...samples))}, max ${round2(Math.max(...samples))})`,
    );
    return { median: median(samples), samples: samples.map(round2) };
}

async function measureRuntime(root, { warmups, runs, tracesDir }) {
    // Stage the served web root in an OS temp dir so measuring a live repo
    // checkout (e.g. --head-root "$PWD") never pollutes the working tree.
    const webRoot = mkdtempSync(join(tmpdir(), 'tri-perf-web-'));
    stageWebRoot(root, webRoot);

    const server = await serveDir(webRoot);
    const baseURL = server.baseURL;
    const browser = await chromium.launch(LAUNCH);
    const context = await browser.newContext();
    const runtime = {};
    const pluginPkgs = PLUGINS.map((p) => p.pkg);
    const toggles = PLUGINS.map((p) => p.toggle);

    if (tracesDir) {
        mkdirSync(tracesDir, { recursive: true });
        await context.tracing.start({ screenshots: false, snapshots: true });
    }

    try {
        // Load-session phases (mount / manifest readiness / first canvas render)
        // measured together from one real load, repeated.
        step('load session (mount, manifest readiness, first canvas render)');
        const sessSamples = { mount: [], manifest: [], canvas: [] };
        for (let i = 0; i < warmups + runs; i++) {
            const r = await attempt(context, baseURL, (page) =>
                page.evaluate(SESSION_FN),
            );
            if (i >= warmups) {
                sessSamples.mount.push(r.mount);
                sessSamples.manifest.push(r.manifest);
                sessSamples.canvas.push(r.canvas);
            }
        }
        runtime.initial_viewer_mount = {
            median: median(sessSamples.mount),
            samples: sessSamples.mount.map(round2),
        };
        runtime.local_manifest_readiness = {
            median: median(sessSamples.manifest),
            samples: sessSamples.manifest.map(round2),
        };
        runtime.first_canvas_render = {
            median: median(sessSamples.canvas),
            samples: sessSamples.canvas.map(round2),
        };
        for (const k of [
            'initial_viewer_mount',
            'local_manifest_readiness',
            'first_canvas_render',
        ]) {
            log(`    ${k}: median ${round2(runtime[k].median)} ms (n=${runs})`);
        }

        // Interaction scenarios: fresh viewer per run with all plugins
        // activated + subscribed, then measure just the interaction.
        step('theme switch (plugins activated + subscribed)');
        const themeSamples = [];
        const interSamples = [];
        for (let i = 0; i < warmups + runs; i++) {
            const { t, x } = await attempt(context, baseURL, async (page) => {
                await page.evaluate(READY_WITH_PLUGINS_FN, {
                    pluginPkgs,
                    toggles,
                });
                const t = await page.evaluate(THEME_FN);
                const x = await page.evaluate(INTERACTION_FN);
                return { t, x };
            });
            if (i >= warmups) {
                themeSamples.push(t);
                interSamples.push(x);
            }
        }
        runtime.theme_switch = {
            median: median(themeSamples),
            samples: themeSamples.map(round2),
        };
        runtime.core_interaction = {
            median: median(interSamples),
            samples: interSamples.map(round2),
        };
        log(
            `    theme_switch: median ${round2(runtime.theme_switch.median)} ms`,
        );
        log(
            `    core_interaction: median ${round2(runtime.core_interaction.median)} ms`,
        );

        // First activation of each plugin.
        for (const p of PLUGINS) {
            step(`first activation: ${p.key}`);
            runtime[`activate_${p.key}`] = await runRepeated(
                context,
                baseURL,
                `activate_${p.key}`,
                ACTIVATE_FN,
                { pkg: p.pkg, toggle: p.toggle },
                warmups,
                runs,
            );
        }
    } finally {
        if (tracesDir) {
            await context.tracing.stop({
                path: join(tracesDir, 'perf-trace.zip'),
            });
        }
        await browser.close();
        await server.close();
        rmSync(webRoot, { recursive: true, force: true });
    }
    return runtime;
}

export async function measure(root, opts = {}) {
    const warmups = opts.warmups ?? DEFAULT_WARMUPS;
    const runs = opts.runs ?? DEFAULT_RUNS;
    const sizes = collectSizes(root);
    const runtime = opts.sizeOnly
        ? {}
        : await measureRuntime(root, {
              warmups,
              runs,
              tracesDir: opts.tracesDir,
          });
    return {
        root,
        capturedAt: new Date().toISOString(),
        warmups,
        runs,
        sizes,
        runtime,
    };
}

// Standalone entry.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const args = parseArgs(process.argv.slice(2));
    const root = args.root ? String(args.root) : REPO_ROOT;
    const result = await measure(root, {
        warmups: args.warmups ? Number(args.warmups) : undefined,
        runs: args.runs ? Number(args.runs) : undefined,
        sizeOnly: Boolean(args['size-only']),
        tracesDir: args['traces-dir'] ? String(args['traces-dir']) : undefined,
    });
    if (args.out) {
        writeFileSync(String(args.out), JSON.stringify(result, null, 2));
        log(`\nwrote ${args.out}`);
    } else {
        log(JSON.stringify(result, null, 2));
    }
}
