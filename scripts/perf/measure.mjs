// Performance measurement for one built repo root.

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

// 800-canvas continuous fixture, shared with the e2e suite.
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

// Playwright resolved from test-consumers so this script needs no root dependency.
const driverRequire = createRequire(
    pathToFileURL(join(REPO_ROOT, 'test-consumers', 'driver', 'lib.mjs')).href,
);
const { chromium } = driverRequire('@playwright/test');

// Reuse the packed-harness static file server so the perf page is served
// exactly like the packed-consumer fixtures.
const { serveDir } = await import(
    pathToFileURL(join(REPO_ROOT, 'test-consumers', 'driver', 'lib.mjs')).href
);

// Real GPU locally; software WebGL on CI, which has no GPU.
const LAUNCH = process.env.CI
    ? {
          args: [
              '--use-gl=angle',
              '--use-angle=swiftshader',
              '--enable-unsafe-swiftshader',
          ],
      }
    : {
          channel: 'chromium',
          args: [
              '--use-angle=vulkan',
              '--enable-features=Vulkan',
              '--ignore-gpu-blocklist',
              '--enable-gpu-rasterization',
          ],
      };

// Two-canvas local manifest; the second canvas makes navigation a real state change.
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

function perfPage(plugins) {
    const scripts = [
        '/node_modules/triiiceratops/dist/triiiceratops-element.iife.js',
        ...plugins.map((p) => `/node_modules/${p.pkg}/dist/iife.js`),
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

/** Copy built dist into a served node_modules layout. */
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
    const perfElement = join(
        root,
        'packages/core/.svelte-kit/perf-dist/triiiceratops-perf-element.iife.js',
    );
    if (existsSync(perfElement)) {
        cpSync(
            perfElement,
            join(
                webRoot,
                'node_modules/triiiceratops/dist/triiiceratops-element.iife.js',
            ),
        );
    }
    const availablePlugins = PLUGINS.filter((p) =>
        existsSync(join(root, p.dir, 'dist')),
    );
    for (const p of availablePlugins) copyDist(p.dir, p.pkg);
    writeFileSync(join(webRoot, 'index.html'), perfPage(availablePlugins));
    writeFileSync(
        join(webRoot, 'manifest.json'),
        JSON.stringify(perfManifest()),
    );
}

// ── Browser-side scenario bodies ──

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

/** Traverses the 800-canvas world, waits for quiescence, reads renderer counters. */
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

    // Absence is a renderer answer, not a timeout.
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

    await handle.fit();
    const world = handle.getView();
    const worldWidth = world.width / world.scale;
    const left = world.centre.x - worldWidth / 2;

    // Zoom by projected page size, the quantity the planner tiers on.
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

    // Read from an interior position: the far edge understates residency by half.
    await handle.setView({
        centre: { x: left + worldWidth * readAtFraction, y: world.centre.y },
        scale,
    });

    // Wait for quiescence rather than a fixed sleep.
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

// ── Runtime driver ──

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
    const webRoot = mkdtempSync(join(tmpdir(), 'tri-perf-web-'));
    stageWebRoot(root, webRoot);

    const server = await serveDir(webRoot, { middleware: fixtureMiddleware() });
    const baseURL = server.baseURL;
    const browser = await chromium.launch(LAUNCH);
    const context = await browser.newContext();
    const runtime = {};
    let renderer = 'unknown';
    let memory = null;
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

/** Steps advance ~5 canvases, wider than the residency margin. */
const MEMORY_STEPS = 160;
/** Quiet time that counts as settled. */
const MEMORY_QUIET_MS = 500;
/** Interior read position; the far edge understates residency. */
const MEMORY_READ_AT_FRACTION = 0.75;

/** One scenario per residency tier (pyramid 810px, thumbnail 156px). */
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
            // A partial or unsettled read understates residency; reject it.
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
        // Traced and untraced medians are not comparable; record the mode.
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
