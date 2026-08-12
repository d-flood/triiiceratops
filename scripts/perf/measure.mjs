// Performance measurement for one built repo root.
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
// MEMORY is measured separately, against the generated 800-canvas
// continuous fixture rather than the two-canvas timing manifest — virtualization
// says nothing on a short manifest — and it reads the RENDERER'S OWN residency
// counters, not a browser heap metric: decoded tiles are `ImageBitmap`s living
// outside the JS heap, so a heap ceiling reads near-flat while tiles leak.
// Those counters exist only on the first-party renderer, so `memory` is `null`
// for a dist that predates it and the comparison reports the scenario as
// skipped.
//
// Which renderer a dist contains is a property of the DIST, not of this run, so
// the script detects and records it as `renderer` rather than assuming it. A
// base ref old enough to have shipped the third-party renderer reports
// `unknown`, which is what stops its numbers from being read as this renderer's.
//
// The TRACING MODE is recorded for the same reason and is enforced the same way:
// see `tracing` below and `checkTracingMode` in ./lib.mjs.
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
    ACTIVATION_MEASURED_PLUGINS,
    DEFAULT_RUNS,
    DEFAULT_WARMUPS,
    MEMORY_RUNS,
    MEMORY_WARMUPS,
    PLUGINS,
    REPO_ROOT,
    collectSizes,
    log,
    median,
    parseArgs,
    round2,
    step,
} from './lib.mjs';

// The 800-canvas continuous fixture, shared with the e2e suite rather than
// restated here: it is generated (not checked in), so the perf harness mounts
// the same middleware the dev server does and the memory scenario measures the
// exact manifest `canvas-renderer-continuous.spec.ts` asserts against.
//
// Imported from REPO_ROOT — the HEAD tree — on purpose: like the scenario bodies
// below, the fixture is measurement code and must be byte-identical for the base
// and head dist. Only the loaded dist differs.
const { CONTINUOUS_CANVAS_COUNT, CONTINUOUS_MANIFEST, fixtureMiddleware } =
    await import(
        pathToFileURL(
            join(REPO_ROOT, 'packages/core/scripts/iiifFixturePlugin.mjs'),
        ).href
    );
const { HEIGHT: FIXTURE_PAGE_HEIGHT, WIDTH: FIXTURE_PAGE_WIDTH } = await import(
    pathToFileURL(
        join(REPO_ROOT, 'packages/core/scripts/generate-grid-image.mjs'),
    ).href
);

// Playwright is a devDependency of the `test-consumers` workspace package;
// resolve it from there (anchoring the require at the driver) so this script
// needs no root dependency.
const driverRequire = createRequire(
    pathToFileURL(join(REPO_ROOT, 'test-consumers', 'driver', 'lib.mjs')).href,
);
const { chromium } = driverRequire('@playwright/test');

// Reuse the packed-harness static file server so the perf page is served
// exactly like the packed-consumer fixtures.
const { serveDir } = await import(
    pathToFileURL(join(REPO_ROOT, 'test-consumers', 'driver', 'lib.mjs')).href
);

// Software WebGL, kept so the plugin and demo graphs that still touch WebGL run
// headless without a GPU (the same flags the packed-consumer harness uses). The
// viewer's own renderer is Canvas2D and needs none of it.
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

/**
 * Which renderer the loaded dist actually mounted.
 *
 * Read from the DOM, because which renderer a dist contains is a property of the
 * built artifact: the page cannot influence it, and asking the bundle would only
 * echo whatever this script guessed.
 */
const RENDERER_FN = () =>
    new Promise((resolve) => {
        const stage = document.getElementById('stage');
        stage.innerHTML = '';
        const el = document.createElement('triiiceratops-viewer');
        el.setAttribute('manifest-id', '/manifest.json');
        el.style.cssText = 'display:block;width:600px;height:400px';
        stage.appendChild(el);
        const deadline = performance.now() + 30000;
        const poll = () => {
            const sr = el.shadowRoot;
            if (sr?.querySelector('[data-testid="canvas-renderer-root"]'))
                return resolve('canvas');
            if (performance.now() > deadline) return resolve('unknown');
            requestAnimationFrame(poll);
        };
        requestAnimationFrame(poll);
    });

/**
 * The memory scenario: acceptance scenario 4, instrumented.
 *
 * Open the 800-canvas continuous fixture, traverse the WHOLE world in `steps`
 * discrete viewport moves, stop, wait for the tile network to fall quiet, and
 * read the renderer's counters.
 *
 * The traverse is a stepped `setView` rather than a synthesized flick, and the
 * distinction matters for what is being measured. What ADR 0014 claims is that
 * residency is a pure function of viewport position, so eviction is distance-
 * based and the resident set does not depend on how the reader arrived. A stepped
 * traverse is the sharpest possible test of exactly that: it drives the planner
 * over ~800 canvases' worth of history and then asks what is still held. A real
 * flick would visit fewer intermediate positions, so it would be a *weaker*
 * probe of accumulation, and it would make the result depend on fling physics
 * and frame timing, which is not what the budget is about.
 *
 * Returns `null` when the dist has no renderer counters — a dist predating the
 * first-party renderer — which is the honest answer, not a zero.
 *
 * `folio` is the fixture's page dimensions. Not `page`: inside a Playwright
 * harness that word means the browser tab, and this body runs in one.
 *
 * The record reports `stepsCompleted` and `settled` alongside `stepsRequested`,
 * because a truncated traverse or an unsettled read yields a LOWER residency
 * figure than the real one — which would then be written as the budget, or pass
 * it. The caller rejects such a sample rather than treating it as a measurement.
 */
const MEMORY_FN = async ({
    manifest,
    folio,
    projectedPageSize,
    readAtFraction,
    steps,
    quietMs,
    timeout,
}) => {
    const stage = document.getElementById('stage');
    stage.innerHTML = '';
    const el = document.createElement('triiiceratops-viewer');
    el.setAttribute('manifest-id', manifest);
    el.style.cssText = 'display:block;width:900px;height:700px';
    stage.appendChild(el);

    const deadline = performance.now() + timeout;
    const raf = () => new Promise((r) => requestAnimationFrame(r));

    // Wait for the surface AND its instrumentation. Absence is a renderer
    // answer, not a timeout to throw on.
    let handle = null;
    for (;;) {
        const surface = el.shadowRoot?.querySelector(
            '[data-testid="canvas-renderer-surface"]',
        );
        handle = surface?.__triiiceratopsRenderer ?? null;
        if (handle) break;
        if (performance.now() > deadline) return null;
        await raf();
    }

    // Fit the world to learn its extent in world units. The fixture is wider
    // than it is tall by three orders of magnitude, so the fitted scale is set
    // by x and `width / scale` is the world's width.
    await handle.fit();
    const world = handle.getView();
    const worldWidth = world.width / world.scale;
    const left = world.centre.x - worldWidth / 2;

    // The zoom is chosen by the PROJECTED PAGE SIZE it produces, because that
    // is the quantity the planner tiers on — orientation-invariantly, as
    // sqrt(w x h) in CSS pixels (ADR 0014). Naming the target size rather than a
    // scale is what makes "this scenario measures the pyramid tier" checkable
    // against the thresholds instead of being a magic number.
    const scale = projectedPageSize / Math.sqrt(folio.width * folio.height);

    let stepsCompleted = 0;
    for (let i = 1; i <= steps; i++) {
        await handle.setView({
            centre: { x: left + (worldWidth * i) / steps, y: world.centre.y },
            scale,
        });
        stepsCompleted = i;
        if (performance.now() > deadline) break;
    }

    // Come back off the far edge before reading. The last step of the traverse
    // sits at the world's right boundary, which is the LEAST populated viewport
    // of the whole run — the residency window is half outside the world there, so
    // reading it understates the resident set by roughly half. An interior
    // position is the state a reader is actually in.
    await handle.setView({
        centre: { x: left + worldWidth * readAtFraction, y: world.centre.y },
        scale,
    });

    // Stop, then wait for quiescence rather than a fixed sleep: the reading is
    // "what is held once the renderer has finished settling", and a fixed sleep
    // either wastes time or reads mid-decode.
    let last = handle.getStats().tileRequestCount;
    let quietSince = performance.now();
    let settled = false;
    while (performance.now() < deadline) {
        await raf();
        const now = handle.getStats().tileRequestCount;
        if (now !== last) {
            last = now;
            quietSince = performance.now();
        } else if (
            performance.now() - quietSince > quietMs &&
            !handle.isMoving()
        ) {
            settled = true;
            break;
        }
    }

    const stats = handle.getStats();
    const residency = handle.getResidency();
    return {
        ...stats,
        // Canvas-tier occupancy alongside the tile counters, so a budget failure
        // says whether too many canvases are pyramid-tier or one canvas is
        // holding too many levels.
        pyramidCanvasCount: residency.pyramid.length,
        thumbnailCanvasCount: residency.thumbnail.length,
        boxCanvasCount: residency.boxCount,
        stepsRequested: steps,
        stepsCompleted,
        settled,
        projectedPageSize,
        readAtFraction,
    };
};

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

    // The 800-canvas fixture is generated, so it is mounted as a middleware
    // ahead of the static dist rather than written to disk.
    const server = await serveDir(webRoot, { middleware: fixtureMiddleware() });
    const baseURL = server.baseURL;
    const browser = await chromium.launch(LAUNCH);
    const context = await browser.newContext();
    const runtime = {};
    let renderer = 'unknown';
    let memory = null;
    // EVERY plugin is registered, so the paused one's registration and its
    // fail-closed capability check stay part of the measured baseline (ADR 0008).
    // Only the ones that actually mount a button are WAITED on — the paused
    // plugin installs none, so waiting for it never resolves.
    const pluginPkgs = PLUGINS.map((p) => p.pkg);
    const toggles = ACTIVATION_MEASURED_PLUGINS.map((p) => p.toggle);

    if (tracesDir) {
        mkdirSync(tracesDir, { recursive: true });
        await context.tracing.start({ screenshots: false, snapshots: true });
    }

    try {
        step('renderer probe');
        renderer = await attempt(context, baseURL, (page) =>
            page.evaluate(RENDERER_FN),
        );
        log(`    renderer: ${renderer}`);

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

        // First activation of each plugin that mounts one.
        for (const p of ACTIVATION_MEASURED_PLUGINS) {
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

        // The renderer probe already told us whether the counters can exist, so
        // don't open an 800-canvas manifest twice to rediscover it: on a dist
        // without them every scenario would traverse the whole world and then
        // wait out its 180 s timeout looking for instrumentation that is not in
        // the bundle.
        if (renderer === 'canvas') {
            memory = await measureMemoryScenario(context, baseURL);
        } else {
            step(
                `memory: skipped — this dist mounted \`${renderer}\`, which has no residency counters`,
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
    return { runtime, renderer, memory };
}

/**
 * How far across the 800-canvas world the memory traverse steps.
 *
 * 160 steps over 800 canvases advances ~5 canvases a step, which is wider than
 * the residency margin — so every step retires the previous position's resident
 * set entirely. That is the condition under which accumulation, if it existed,
 * would be unmissable.
 */
const MEMORY_STEPS = 160;
/** Consecutive quiet time (no new tile request) that counts as settled. */
const MEMORY_QUIET_MS = 500;
/**
 * Where in the world the settled reading is taken, as a fraction of its width.
 *
 * Not the right edge the traverse ends on: there the residency window is half
 * outside the world, so it is the least-populated viewport of the entire run and
 * a reading taken there understates the resident set. 0.75 is well past the
 * traversed history and fully interior.
 */
const MEMORY_READ_AT_FRACTION = 0.75;

/**
 * The memory scenarios, one per residency tier the traverse can be conducted in.
 *
 * Every canvas in the fixture is the same size, so a single zoom puts the whole
 * river in ONE tier — which means one scenario cannot cover both residency paths
 * ADR 0014 describes, and measuring only the zoomed-in one would leave the
 * thumbnail ladder unbudgeted.
 *
 * Sizes are projected page size in CSS px, against the shipped thresholds
 * (`pyramidThreshold` 320, `boxThreshold` 24 in `renderer/rendererDefaults.ts`):
 *   · 810 — comfortably above 320: the river is pyramid-tier and costs tiles.
 *           This is reading zoom, roughly one page filling a 700 px-tall viewport.
 *   · 156 — between 24 and 320: the river is thumbnail-tier, which is acceptance
 *           scenario 4's "no empty river" state and the only one in which the
 *           resolved-thumbnail half of the required set is resident at all.
 *
 * `expectPyramidCanvases` states which tier the scenario is supposed to be
 * measuring, and it is checked rather than assumed: the zoom is derived from the
 * shipped thresholds, so a threshold change would silently turn the thumbnail
 * scenario into a second pyramid scenario and leave the thumbnail ladder
 * unbudgeted again while every number still looked plausible.
 */
const MEMORY_SCENARIO_SPECS = [
    {
        key: 'continuous_800_flick',
        projectedPageSize: 810,
        expectPyramidCanvases: true,
    },
    {
        key: 'continuous_800_thumbnail_flick',
        projectedPageSize: 156,
        expectPyramidCanvases: false,
    },
];

async function measureMemoryScenario(context, baseURL) {
    const memory = {};
    for (const spec of MEMORY_SCENARIO_SPECS) {
        step(
            `memory: ${CONTINUOUS_CANVAS_COUNT}-canvas traverse at ${spec.projectedPageSize} px projected (${spec.key})`,
        );
        const samples = [];
        for (let i = 0; i < MEMORY_WARMUPS + MEMORY_RUNS; i++) {
            const value = await attempt(context, baseURL, (page) =>
                page.evaluate(MEMORY_FN, {
                    manifest: CONTINUOUS_MANIFEST,
                    folio: {
                        width: FIXTURE_PAGE_WIDTH,
                        height: FIXTURE_PAGE_HEIGHT,
                    },
                    projectedPageSize: spec.projectedPageSize,
                    readAtFraction: MEMORY_READ_AT_FRACTION,
                    steps: MEMORY_STEPS,
                    quietMs: MEMORY_QUIET_MS,
                    timeout: 180_000,
                }),
            );
            if (value === null) {
                log('    no renderer counters on this dist — memory skipped');
                return null;
            }
            // A truncated traverse or an unsettled read is NOT a measurement: it
            // reports fewer resident tiles and fewer decoded bytes than the real
            // settled state, so accepting it would either write a budget the
            // renderer cannot actually meet or let a real regression pass under
            // one. Tile service is CPU-bound in this harness (the fixture encodes
            // every PNG synchronously in-process, on the same box as the
            // browser), so this is a live risk, not a theoretical one.
            if (value.stepsCompleted !== value.stepsRequested) {
                throw new Error(
                    `memory scenario ${spec.key}: traverse truncated at ` +
                        `${value.stepsCompleted}/${value.stepsRequested} steps ` +
                        `(the 180 s budget ran out) — a partial traverse reads ` +
                        `LOWER than the settled state, so the sample is unusable`,
                );
            }
            if (!value.settled) {
                throw new Error(
                    `memory scenario ${spec.key}: never reached ` +
                        `${MEMORY_QUIET_MS} ms of tile quiescence before the ` +
                        `180 s deadline — the reading would be mid-decode and ` +
                        `understate residency`,
                );
            }
            const isPyramid = value.pyramidCanvasCount > 0;
            if (isPyramid !== spec.expectPyramidCanvases) {
                throw new Error(
                    `memory scenario ${spec.key}: expected ` +
                        `${spec.expectPyramidCanvases ? 'pyramid-tier' : 'no pyramid-tier'} ` +
                        `canvases at ${spec.projectedPageSize} px projected, got ` +
                        `pyramidCanvasCount ${value.pyramidCanvasCount} / ` +
                        `thumbnail ${value.thumbnailCanvasCount} — the residency ` +
                        `thresholds moved and this scenario no longer measures ` +
                        `the tier it is named for`,
                );
            }
            if (i >= MEMORY_WARMUPS) samples.push(value);
        }

        // Median each NUMERIC counter independently: this is a settled-state
        // reading, so a per-counter median is the robust summary and no counter
        // is derived from another. `settled` is a boolean and every sample had to
        // be `true` to get here, so it is asserted rather than averaged.
        const result = {};
        for (const key of Object.keys(samples[0])) {
            if (typeof samples[0][key] !== 'number') continue;
            result[key] = median(samples.map((s) => s[key]));
        }
        result.settled = true;
        result.samples = samples;
        log(
            `    ${spec.key}: residentTileCount ${result.residentTileCount}, ` +
                `requiredBytes ${result.requiredBytes} (${(result.requiredBytes / 1048576).toFixed(1)} MiB), ` +
                `decodedBytes ${result.decodedBytes} (${(result.decodedBytes / 1048576).toFixed(1)} MiB), ` +
                `budget ${result.byteBudget}, pyramid ${result.pyramidCanvasCount} / ` +
                `thumbnail ${result.thumbnailCanvasCount} / box ${result.boxCanvasCount}, ` +
                `steps ${result.stepsCompleted}/${result.stepsRequested}, settled`,
        );
        memory[spec.key] = result;
    }
    return memory;
}

export async function measure(root, opts = {}) {
    const warmups = opts.warmups ?? DEFAULT_WARMUPS;
    const runs = opts.runs ?? DEFAULT_RUNS;
    const sizes = collectSizes(root);
    const browserResult = opts.sizeOnly
        ? { runtime: {}, renderer: 'unknown', memory: null }
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
        // Whether Playwright tracing was on for the timed runs. Recorded for
        // the same reason as `renderer`: it changes what the numbers MEAN, not
        // just their noise. Tracing's DOM snapshots are not evenly distributed
        // across scenarios (a style install pays for a whole snapshot), so a
        // traced median and an untraced ceiling are not comparable quantities
        // and `compare.mjs` refuses to enforce one against the other. A
        // `--size-only` run timed nothing, so it has no tracing mode.
        tracing: opts.sizeOnly ? null : opts.tracesDir ? 'playwright' : 'off',
        renderer: browserResult.renderer,
        runtime: browserResult.runtime,
        memory: browserResult.memory,
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
