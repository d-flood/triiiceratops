#!/usr/bin/env node
// Packed-consumer test harness driver (`pnpm test:packed`).
//
// Flow:
//   1. Build core's publishable dist.
//   2. Pack a real `.tgz` (exactly what npm would publish).
//   3. Assert tarball-level CSS (tokens, all themes, scoping, no plugin CSS).
//   4. For each fixture × each package manager (npm AND pnpm):
//        copy the fixture out of the workspace → inject the freshly packed
//        tarball → install → build → serve → assert against the built output.
//
// Every fixture consumes ONLY the packed tarball, never workspace source.
// All browser journeys use a local manifest (no network IIIF).
//
// Assertions run after the pack step, before fixtures: assert-tarball-css
// (stylesheet), assert-tarball-contents (allowlist contract for every packed
// package + planted-test self-check), and the core-only dependency-absence
// check.
// ---------------------------------------------------------------------------

import { chromium, firefox, webkit } from '@playwright/test';
import {
    existsSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertTarballCss } from './assert-tarball-css.mjs';
import {
    assertCoreExportTargets,
    assertCoreOptionalPeers,
    assertTarballContents,
    assertTarballPeerRanges,
    selfCheckFrameworkSubpathAssertions,
    selfCheckPeerRangeRejectsPin,
    selfCheckPlantedTest,
} from './assert-tarball-contents.mjs';
import {
    FIXTURES_DIR,
    REPO_ROOT,
    cleanup,
    copyFixture,
    distributeManifest,
    fail,
    heading,
    injectTarball,
    isBenignBrowserError,
    log,
    makeTempDir,
    pass,
    refreshLocalDepInLockfiles,
    run,
    serveDir,
    step,
} from './lib.mjs';

// Packages packed into tarballs for the fixtures below. Core first (its dist must
// exist before the SDK type-checks against it); the SDK follows.
//
// This is NOT the publishable set. `scripts/release/packages.mjs` lists the
// packages that reach npm; this list adds the paused
// `@triiiceratops/plugin-annotation-editor`, which still has to be packed for the
// one fixture that consumes it from a real tarball (its adapter-conformance
// suite). Packing proves the tarball's contents; it is not published.
const PACKAGES_TO_PACK = [
    {
        filter: 'triiiceratops',
        // Build steps required so the packed dist is complete. `build:testing`
        // compiles the headless `triiiceratops/testing` entry AFTER
        // `build:lib` (it needs the generated paraglide runtime + dist types).
        build: ['build:lib', 'build:testing', 'build:element'],
        tarballName: 'triiiceratops.tgz',
    },
    {
        filter: '@triiiceratops/plugin-sdk',
        // `build` = tsc; resolves `triiiceratops` types from the core dist built
        // above, so this entry must stay AFTER core.
        build: ['build'],
        tarballName: '_triiiceratops_plugin-sdk.tgz',
    },
    {
        // Tracer plugin. `build` = ESM + IIFE (vite) + types (tsc);
        // resolves `triiiceratops` and `@triiiceratops/plugin-sdk` types/dist
        // from the entries built above, so it must stay AFTER both. Other
        // plugin packages are added here the same way (AFTER the SDK).
        filter: '@triiiceratops/plugin-image-manipulation',
        build: ['build'],
        tarballName: '_triiiceratops_plugin-image-manipulation.tgz',
    },
    {
        // Image-download plugin. Same shape as the tracer: `build` =
        // ESM + IIFE (vite) + types (tsc). Its export helpers consume core's
        // `triiiceratops/image-export` seam, so it must stay AFTER core and the
        // SDK.
        filter: '@triiiceratops/plugin-image-export',
        build: ['build'],
        tarballName: '_triiiceratops_plugin-image-export.tgz',
    },
    {
        // Audiovisual plugin. `build` = ESM + IIFE + lazy IIFE chunks (vite) +
        // types (tsc), then a shared-runtime guard. Its IIFE deliberately bundles
        // no Svelte and no core utilities — it reads both off
        // `window.Triiiceratops` — so it must stay AFTER core and the SDK.
        filter: '@triiiceratops/plugin-av',
        build: ['build'],
        tarballName: '_triiiceratops_plugin-av.tgz',
    },
    {
        // Pdf-export plugin. `build` = ESM + IIFE (vite) + types (tsc);
        // it carries its own `pdf-lib` runtime dependency (outside core) and
        // resolves `triiiceratops` + `@triiiceratops/plugin-sdk` types/dist from
        // the entries built above, so it must stay AFTER both.
        filter: '@triiiceratops/plugin-pdf-export',
        build: ['build'],
        tarballName: '_triiiceratops_plugin-pdf-export.tgz',
    },
    {
        // The annotation-editor plugin. `build` = ESM + IIFE (vite) +
        // types (tsc); resolves `triiiceratops` and `@triiiceratops/plugin-sdk`
        // from the entries built above, so it must stay AFTER both. Packed but
        // NOT published (see the note above): only the viewer-free
        // `plugin-annotation-conformance` and `docs-examples` fixtures consume it.
        filter: '@triiiceratops/plugin-annotation-editor',
        build: ['build'],
        tarballName: '_triiiceratops_plugin-annotation-editor.tgz',
    },
];

// Fixtures: core-only consumers, plus the SDK framework-adapter fixtures (each
// consumes the packed SDK subpath + a live packed `ViewerState`), plus
// per-plugin fixtures.
export const FIXTURES = [
    'svelte-vite',
    'sveltekit-ssr',
    'wc-esm',
    'plain-html-iife',
    'plugin-react',
    'plugin-vue',
    'plugin-lit',
    'plugin-svelte',
    // Plain vitest project (no Svelte tooling) exercising the SDK
    // test kit + compiled `triiiceratops/testing` entry against real state.
    'vitest-kit',
    // The image-manipulation plugin, consumed from its
    // packed tarball. `-svelte` activates the ESM entry on a real viewer and
    // asserts the renderer's canvas gets the CSS filter; `-iife` loads core + plugin
    // IIFEs in BOTH script orders; `-failure` proves plugin failure isolation
    // for a real SDK plugin.
    'plugin-image-manip-svelte',
    'plugin-image-manip-iife',
    'plugin-image-manip-failure',
    // The image-download plugin, consumed from its packed
    // tarball. `-svelte` activates the ESM entry on a real viewer, triggers an
    // export, and asserts a download-ready binary Blob is produced (async +
    // binary output validation duty); `-iife` loads core + plugin IIFEs in BOTH
    // script orders and asserts the same.
    'plugin-image-export-svelte',
    'plugin-image-export-iife',
    // The pdf-export plugin, consumed from its packed
    // tarball. `-svelte` activates the ESM entry on a real viewer and asserts a
    // real multi-page PDF export completes (download intercepted; bytes start
    // `%PDF`); `-iife` loads core + plugin IIFEs in BOTH script orders and
    // asserts the same export from the self-contained no-bundler path.
    'plugin-pdf-export-svelte',
    'plugin-pdf-export-iife',
    // The annotation-editor plugin, consumed from its packed
    // tarball. `-conformance` runs the adapter conformance suite from the packed
    // `@triiiceratops/plugin-annotation-editor/testing` subpath in a plain vitest
    // project (no Svelte tooling, no viewer) — that subpath is pure logic and is
    // unaffected by the pause, so it keeps running.
    //
    // `plugin-annotation-svelte` is GONE from this list. It drove the full
    // annotate journey through a real viewer, and the plugin cannot activate
    // on one: core provides no raw third-party viewer for the plugin's editing
    // surface to build on, so activation fails with a `PluginCompatibilityError`
    // BY DESIGN. Keeping the fixture would assert the failure we intend, which
    // is not what it is for. Its directory is retained, unrun, for the phase-2
    // drawing layer to restore. See `packages/plugin-annotation-editor/README.md`.
    'plugin-annotation-conformance',
    // Strict-TS declaration consumer. Type-checks a consumer of the
    // public viewport API against the packed core tarball under
    // `skipLibCheck: false` + `types: []`, proving core's public `.d.ts` stands
    // on its own — no ambient global, and no third-party type the consumer
    // would have to install by hand.
    'strict-dts',
    // Doc-example compilation. A non-browser fixture that type-checks
    // (`tsc --noEmit`) every `ts`/`tsx`/`js` code sample importing package code
    // (extracted from `docs/**/*.md` into its `generated/` dir by
    // `scripts/docs-examples.mjs`) against the packed tarballs of every packed
    // package, so published documentation matches what users can install.
    'docs-examples',
    // CSP + Trusted Types fixtures. Each is a packed-consumer page
    // served under a strict Content-Security-Policy (delivered via a
    // `<meta http-equiv>` in its HTML) and asserts zero `securitypolicyviolation`
    // events. `csp-svelte` (light DOM) and `csp-wc-iife` (Web Component) run on
    // all three desktop engines (chromium, firefox, webkit) via their `browsers`
    // list; `csp-trusted-types` runs on chromium only (the only engine enforcing
    // Trusted Types). They exercise the style service's nonce-aware fallback and
    // core's Trusted Types default policy.
    'csp-svelte',
    'csp-wc-iife',
    'csp-trusted-types',
    // The framework-wrapper release seam.
    // Each is a plain Vite app whose ONLY package dependency is the packed core
    // tarball plus its own framework — no Svelte, no Svelte Vite plugin, no
    // plugin SDK — and each serves three routes driven by one Playwright pass:
    // the full client contract, a server-rendered route that hydrates with zero
    // mismatch diagnostics, and a route that pre-registers a foreign
    // `<triiiceratops-viewer>` and must fail fast with a version-conflict
    // diagnostic. They share one journey (`framework-consumer-assert.mjs`).
    'framework-react',
    'framework-vue',
];

const PACKAGE_MANAGERS = ['npm', 'pnpm'];

const results = [];
function record(fixture, pm, ok, detail = '') {
    results.push({ label: `${fixture} [${pm}]`, ok, detail });
    (ok ? pass : fail)(`${fixture} [${pm}]`, detail);
}

export async function buildAndPack(tarballDir) {
    heading('Building + packing publishable packages');
    const tarballs = {};
    for (const pkg of PACKAGES_TO_PACK) {
        for (const script of pkg.build) {
            step(`${pkg.filter}: pnpm run ${script}`);
            await run('pnpm', ['--filter', pkg.filter, 'run', script], {
                cwd: REPO_ROOT,
                timeout: 300_000,
            });
        }
        step(`${pkg.filter}: pnpm pack`);
        const out = await run(
            'pnpm',
            [
                '--filter',
                pkg.filter,
                'exec',
                'pnpm',
                'pack',
                '--pack-destination',
                tarballDir,
            ],
            { cwd: REPO_ROOT, timeout: 120_000 },
        );
        const produced = out
            .split('\n')
            .map((l) => l.trim())
            .filter((l) => l.endsWith('.tgz'))
            .pop();
        if (!produced)
            throw new Error(`pnpm pack produced no tarball for ${pkg.filter}`);
        // Stabilise the filename so committed lockfiles reference a fixed path.
        const stable = join(tarballDir, pkg.tarballName);
        await run('cp', [produced, stable]);
        tarballs[pkg.filter] = stable;
        step(`${pkg.filter}: → ${pkg.tarballName}`);
    }
    return tarballs;
}

async function assertCssFromTarball(tarballPath, tarballDir) {
    heading('Tarball-level CSS assertions (triiiceratops/style.css)');
    // Extract just the stylesheet the consumer installs.
    await run('tar', [
        'xzf',
        tarballPath,
        '-C',
        tarballDir,
        'package/dist/triiiceratops.css',
    ]);
    const css = readFileSync(
        join(tarballDir, 'package', 'dist', 'triiiceratops.css'),
        'utf8',
    );
    const { ok, checks } = assertTarballCss(css);
    for (const chk of checks) {
        (chk.ok ? pass : fail)(`css: ${chk.name}`, chk.detail);
    }
    results.push({ label: 'tarball-css', ok, detail: '' });
    return ok;
}

async function assertContentsFromTarballs(tarballs) {
    heading('Tarball content contract (allowlist, every packed package)');
    let ok = true;

    // One-time guard that the allowlist actually rejects a planted test file.
    const planted = selfCheckPlantedTest();
    (planted.ok ? pass : fail)(
        'contract: rejects a planted dist/foo.test.js',
        planted.detail,
    );
    results.push({ label: 'tarball-contents-planted', ok: planted.ok });
    ok = ok && planted.ok;

    // One-time guard that the peer-range check rejects an exact pin /
    // residual `workspace:` and accepts a caret/tilde range.
    const peerSelf = selfCheckPeerRangeRejectsPin();
    (peerSelf.ok ? pass : fail)(
        'contract: peer-range check rejects a pin / workspace:',
        peerSelf.detail,
    );
    results.push({ label: 'tarball-peer-range-self', ok: peerSelf.ok });
    ok = ok && peerSelf.ok;

    // One-time guard that the framework-subpath
    // assertions below reject a missing `dist/react.js` and a `./vue` subpath
    // that lost its `types` condition.
    const subpathSelf = selfCheckFrameworkSubpathAssertions();
    (subpathSelf.ok ? pass : fail)(
        'contract: framework-subpath checks reject a missing wrapper artifact',
        subpathSelf.detail,
    );
    results.push({ label: 'tarball-subpath-self', ok: subpathSelf.ok });
    ok = ok && subpathSelf.ok;

    for (const pkg of PACKAGES_TO_PACK) {
        const tarball = tarballs[pkg.filter];
        const { ok: pkgOk, checks } = assertTarballContents(
            tarball,
            pkg.filter,
        );
        for (const chk of checks) {
            (chk.ok ? pass : fail)(chk.name, chk.detail);
        }
        results.push({ label: `tarball-contents:${pkg.filter}`, ok: pkgOk });
        ok = ok && pkgOk;

        // Published peers must be ranges, not exact pins — an exact pin from
        // `workspace:*` would mismatch on every core patch.
        const { ok: peerOk, checks: peerChecks } = assertTarballPeerRanges(
            tarball,
            pkg.filter,
        );
        for (const chk of peerChecks) {
            (chk.ok ? pass : fail)(chk.name, chk.detail);
        }
        results.push({ label: `tarball-peers:${pkg.filter}`, ok: peerOk });
        ok = ok && peerOk;

        // Core only: the export map must be
        // backed by real files (the framework wrappers among them) and the
        // framework peers must be optional, ranged, and absent from
        // `dependencies`.
        if (pkg.filter !== 'triiiceratops') continue;

        const { ok: targetsOk, checks: targetChecks } = assertCoreExportTargets(
            tarball,
            pkg.filter,
        );
        for (const chk of targetChecks) {
            (chk.ok ? pass : fail)(chk.name, chk.detail);
        }
        results.push({
            label: `tarball-export-targets:${pkg.filter}`,
            ok: targetsOk,
        });
        ok = ok && targetsOk;

        const { ok: optionalOk, checks: optionalChecks } =
            assertCoreOptionalPeers(tarball, pkg.filter);
        for (const chk of optionalChecks) {
            (chk.ok ? pass : fail)(chk.name, chk.detail);
        }
        results.push({
            label: `tarball-optional-peers:${pkg.filter}`,
            ok: optionalOk,
        });
        ok = ok && optionalOk;
    }
    return ok;
}

// Recursively collect the names of any forbidden package directories resolved
// under a `node_modules` tree. Detects both flat (`node_modules/pdf-lib`) and
// nested (`.../node_modules/@annotorious/…`) placements.
function findForbiddenDeps(nodeModulesDir, forbidden, found = new Set()) {
    if (!existsSync(nodeModulesDir)) return found;
    for (const name of readdirSync(nodeModulesDir)) {
        if (name === '.bin') continue;
        const full = join(nodeModulesDir, name);
        if (name.startsWith('@')) {
            // Scope dir: a forbidden scope (e.g. @annotorious) is a direct hit;
            // otherwise descend into each scoped package.
            if (forbidden.has(name)) {
                found.add(name);
                continue;
            }
            for (const scoped of readdirSync(full)) {
                if (forbidden.has(`${name}/${scoped}`))
                    found.add(`${name}/${scoped}`);
                findForbiddenDeps(
                    join(full, scoped, 'node_modules'),
                    forbidden,
                    found,
                );
            }
            continue;
        }
        if (forbidden.has(name)) found.add(name);
        findForbiddenDeps(join(full, 'node_modules'), forbidden, found);
    }
    return found;
}

async function assertCoreOnlyDeps(coreTarball, workRoot) {
    heading('Core-only dependency assertion (no plugin-only deps)');
    const fixtureDir = join(workRoot, 'core-only-deps');
    mkdirSync(fixtureDir, { recursive: true });
    writeFileSync(
        join(fixtureDir, 'package.json'),
        JSON.stringify(
            {
                name: 'core-only-deps-fixture',
                version: '0.0.0',
                private: true,
                dependencies: { triiiceratops: `file:${coreTarball}` },
            },
            null,
            2,
        ) + '\n',
    );
    step('core-only: npm install triiiceratops alone');
    await run(
        'npm',
        ['install', '--no-audit', '--no-fund', '--loglevel=error'],
        {
            cwd: fixtureDir,
            timeout: 300_000,
        },
    );

    // Plugin-only runtime deps that MUST NOT resolve into a core-only install.
    const forbidden = new Set(['@annotorious', 'pdf-lib', 'phosphor-svelte']);
    const found = findForbiddenDeps(
        join(fixtureDir, 'node_modules'),
        forbidden,
    );
    const ok = found.size === 0;
    (ok ? pass : fail)(
        'core-only: annotorious / pdf-lib / phosphor-svelte absent',
        ok ? '' : `resolved: ${[...found].join(', ')}`,
    );
    results.push({ label: 'core-only-deps', ok });
    return ok;
}

export async function installFixture(pm, fixtureDir) {
    if (pm === 'npm') {
        await run(
            'npm',
            ['install', '--no-audit', '--no-fund', '--loglevel=error'],
            {
                cwd: fixtureDir,
                timeout: 300_000,
            },
        );
    } else {
        // pnpm 11 requires each standalone consumer to explicitly approve
        // esbuild's postinstall script, which Vite-based fixtures require.
        writeFileSync(
            join(fixtureDir, 'pnpm-workspace.yaml'),
            'allowBuilds:\n  esbuild: true\n',
        );
        await run(
            'pnpm',
            [
                'install',
                '--no-frozen-lockfile',
                '--config.confirmModulesPurge=false',
            ],
            { cwd: fixtureDir, timeout: 300_000 },
        );
    }
}

// Playwright browser types, keyed by the name a fixture declares in its
// `browsers` list. Desktop-CSP fixtures run on all three engines;
// every other fixture defaults to chromium only (see runFixture).
const BROWSER_TYPES = { chromium, firefox, webkit };

// Launch options per engine. Chromium gets software WebGL (SwiftShader) so any
// WebGL a fixture's graph touches works in headless CI without a GPU; firefox
// and webkit reject those Chromium flags, so they launch with defaults.
const LAUNCH_OPTIONS = {
    chromium: {
        args: [
            '--use-gl=angle',
            '--use-angle=swiftshader',
            '--enable-unsafe-swiftshader',
        ],
    },
    firefox: {},
    webkit: {},
};

/**
 * The one genuinely DOM-free case. Import both packed framework
 * subpaths in plain Node — no `window`, no `document`, no `customElements` —
 * and assert evaluation succeeds with no registration side effect. It needs the
 * optional `react` and `vue` peers resolvable, but no fixture: the whole
 * assertion is a single Node script.
 */
async function assertFrameworkNodeImport(coreTarball, workRoot) {
    heading('Framework subpaths import in Node with no browser globals');
    const dir = join(workRoot, 'framework-node-import');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
        join(dir, 'package.json'),
        JSON.stringify(
            {
                name: 'framework-node-import',
                version: '0.0.0',
                private: true,
                type: 'module',
                dependencies: {
                    react: '19.2.7',
                    triiiceratops: `file:${coreTarball}`,
                    vue: '3.5.40',
                },
            },
            null,
            2,
        ) + '\n',
    );
    writeFileSync(
        join(dir, 'probe.mjs'),
        `
for (const name of ['window', 'document', 'customElements']) {
    if (typeof globalThis[name] !== 'undefined') {
        throw new Error('probe started with a browser \`' + name + '\` global');
    }
}

const react = await import('triiiceratops/react');
const vue = await import('triiiceratops/vue');

const reactExports = [
    'TriiiceratopsViewer',
    'useViewer',
    'useViewerHandle',
    'useViewerSelector',
    'ViewerProvider',
    'TriiiceratopsElementVersionError',
    'VIEWER_ELEMENT_TAG',
];
const vueExports = [
    'TriiiceratopsViewer',
    'provideViewer',
    'useViewer',
    'useViewerSelector',
    'ViewerProvider',
    'TriiiceratopsElementVersionError',
    'VIEWER_ELEMENT_TAG',
];
for (const name of reactExports) {
    if (react[name] === undefined) throw new Error('triiiceratops/react is missing ' + name);
}
for (const name of vueExports) {
    if (vue[name] === undefined) throw new Error('triiiceratops/vue is missing ' + name);
}
if (react.default !== undefined) throw new Error('triiiceratops/react has a default export');
if (vue.default !== undefined) throw new Error('triiiceratops/vue has a default export');

// No registration side effect: no registry was created, and the browser
// runtime namespace the element bundle installs was never bootstrapped.
for (const name of ['window', 'document', 'customElements']) {
    if (typeof globalThis[name] !== 'undefined') {
        throw new Error('importing a framework subpath created a \`' + name + '\` global');
    }
}
if (globalThis.Triiiceratops !== undefined) {
    throw new Error('importing a framework subpath bootstrapped the browser runtime');
}
console.log('framework subpaths import cleanly in Node');
`.trimStart(),
    );

    let ok = true;
    let detail = '';
    try {
        step('framework-node-import: npm install (tarball + react + vue)');
        await run(
            'npm',
            ['install', '--no-audit', '--no-fund', '--loglevel=error'],
            { cwd: dir, timeout: 300_000 },
        );
        step('framework-node-import: node probe.mjs');
        await run('node', ['probe.mjs'], { cwd: dir, timeout: 120_000 });
    } catch (err) {
        ok = false;
        detail = err.message.split('\n').slice(0, 6).join(' | ');
    }
    (ok ? pass : fail)(
        'node-import: triiiceratops/react + /vue evaluate with no browser globals',
        detail,
    );
    results.push({ label: 'framework-node-import', ok, detail });
    return ok;
}

async function withBrowser(rootDir, fn, browserName = 'chromium') {
    const server = await serveDir(rootDir);
    const browserType = BROWSER_TYPES[browserName];
    if (!browserType) throw new Error(`unknown browser "${browserName}"`);
    const browser = await browserType.launch(LAUNCH_OPTIONS[browserName] ?? {});
    const context = await browser.newContext();
    const page = await context.newPage();
    const consoleMessages = [];
    const pageErrors = [];
    page.on('console', (m) =>
        consoleMessages.push({ type: m.type(), text: m.text() }),
    );
    page.on('pageerror', (e) => {
        // Drop environment-specific GPU/WebGL noise; keep real consumer errors.
        if (!isBenignBrowserError(e.message)) pageErrors.push(e);
    });
    try {
        return await fn({
            page,
            baseURL: server.baseURL,
            consoleMessages,
            pageErrors,
            browserName,
        });
    } finally {
        await browser.close();
        await server.close();
    }
}

async function runFixture(fixtureName, pm, tarballs, workRoot) {
    const cfg = (
        await import(
            pathToFileURL(join(FIXTURES_DIR, fixtureName, 'harness.mjs')).href
        )
    ).default;

    const destRoot = join(workRoot, `${fixtureName}-${pm}`);
    const fixtureDir = copyFixture(fixtureName, destRoot);

    // Inject each packed tarball this fixture consumes (default: core only).
    const tarballDeps = cfg.tarballs ?? ['triiiceratops'];
    for (const dep of tarballDeps) {
        if (!tarballs[dep]) {
            throw new Error(`fixture "${fixtureName}" needs unpacked "${dep}"`);
        }
        injectTarball(fixtureDir, tarballs[dep], dep);
        refreshLocalDepInLockfiles(fixtureDir, dep);
    }
    distributeManifest(fixtureDir, cfg.manifestTarget);

    step(`${fixtureName} [${pm}]: install`);
    await installFixture(pm, fixtureDir);

    // An optional type-check step, run BEFORE the build and reported as its own
    // step so a compile failure is not mistaken for a bundler failure. The
    // framework fixtures use it for the headline promise: `tsc` with
    // `skipLibCheck: false` and no Svelte installed, so a Svelte type leaking
    // into `triiiceratops/react` / `/vue` / `/selectors` / `/testing` fails the
    // packed run rather than waiting for a human to notice.
    if (cfg.checkScript) {
        step(`${fixtureName} [${pm}]: ${pm} run ${cfg.checkScript}`);
        await run(pm, ['run', cfg.checkScript], {
            cwd: fixtureDir,
            timeout: 300_000,
        });
    }

    if (cfg.buildScript) {
        step(`${fixtureName} [${pm}]: ${pm} run ${cfg.buildScript}`);
        await run(pm, ['run', cfg.buildScript], {
            cwd: fixtureDir,
            timeout: 300_000,
        });
    }

    const serveRoot = join(fixtureDir, cfg.serveDir);
    if (cfg.browser) {
        // Most fixtures run on chromium only; CSP fixtures declare a
        // wider `browsers` list and run their assertion once per engine.
        const browsers = cfg.browsers ?? ['chromium'];
        for (const browserName of browsers) {
            step(`${fixtureName} [${pm}] (${browserName}): serve + assert`);
            await withBrowser(
                serveRoot,
                // `fixtureDir` lets a browser fixture also assert on what the
                // package manager actually installed (no Svelte
                // package, no Svelte Vite plugin, no plugin SDK).
                (ctx) => cfg.assert({ ...ctx, fixtureDir, serveRoot }),
                browserName,
            );
        }
    } else {
        step(`${fixtureName} [${pm}]: serve + assert`);
        await cfg.assert({ fixtureDir });
    }
}

async function main() {
    const packDir = makeTempDir('tri-packed-');
    const workRoot = makeTempDir('tri-consumers-');
    let allOk = true;
    try {
        const tarballs = await buildAndPack(packDir);
        const cssOk = await assertCssFromTarball(
            tarballs.triiiceratops,
            packDir,
        );
        allOk = allOk && cssOk;

        const contentsOk = await assertContentsFromTarballs(tarballs);
        allOk = allOk && contentsOk;

        const coreDepsOk = await assertCoreOnlyDeps(
            tarballs.triiiceratops,
            workRoot,
        );
        allOk = allOk && coreDepsOk;

        const nodeImportOk = await assertFrameworkNodeImport(
            tarballs.triiiceratops,
            workRoot,
        );
        allOk = allOk && nodeImportOk;

        // Optional local dev filter: `PACKED_ONLY=csp-svelte,csp-wc-iife` runs a
        // subset. Unset in CI, so the full suite always runs there.
        const only = process.env.PACKED_ONLY
            ? new Set(process.env.PACKED_ONLY.split(','))
            : null;
        const fixtures = only ? FIXTURES.filter((f) => only.has(f)) : FIXTURES;

        for (const fixtureName of fixtures) {
            heading(`Fixture: ${fixtureName}`);
            for (const pm of PACKAGE_MANAGERS) {
                try {
                    await runFixture(fixtureName, pm, tarballs, workRoot);
                    record(fixtureName, pm, true);
                } catch (err) {
                    allOk = false;
                    record(fixtureName, pm, false, err.message.split('\n')[0]);
                    log(err.message);
                }
            }
        }
    } finally {
        cleanup(packDir);
        cleanup(workRoot);
    }

    heading('Summary');
    for (const r of results) (r.ok ? pass : fail)(r.label, r.detail);
    const failed = results.filter((r) => !r.ok);
    if (failed.length || !allOk) {
        log(`\n${failed.length} check(s) failed.`);
        process.exit(1);
    }
    log('\nAll packed-consumer checks passed.');
    process.exit(0);
}

// Guarded so `view-fixture.mjs` (and anything else) can import the pieces
// above — buildAndPack, installFixture, FIXTURES — without triggering the
// full suite as an import side effect. Only run when this file is the
// process entrypoint (`node run.mjs`, i.e. `pnpm test:packed`).
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
