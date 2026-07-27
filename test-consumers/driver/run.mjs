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
// ── Seams for later tickets ────────────────────────────────────────────────
//  · PACKAGES_TO_PACK: ticket 12/13/15–17 add the SDK + plugin packages here.
//  · FIXTURES: ticket 12 (plugin fixtures), 13 (adapter), 15–17 (per-plugin),
//    and the SDK-adapter fixtures append to this list.
//  · Ticket 20 assertions run after the pack step, before fixtures:
//    assert-tarball-css (stylesheet), assert-tarball-contents (allowlist contract
//    for all six packages + planted-test self-check), and the core-only
//    dependency-absence check.
// ---------------------------------------------------------------------------

import { chromium } from '@playwright/test';
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
    assertTarballContents,
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

// Publishable packages packed into tarballs. Core first (its dist must exist
// before the SDK type-checks against it); the SDK (ticket 13) follows. Plugin
// packages join here in later tickets.
const PACKAGES_TO_PACK = [
    {
        filter: 'triiiceratops',
        // Build steps required so the packed dist is complete. `build:testing`
        // (ticket 14) compiles the headless `triiiceratops/testing` entry AFTER
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
        // Ticket 12 tracer plugin. `build` = ESM + IIFE (vite) + types (tsc);
        // resolves `triiiceratops` and `@triiiceratops/plugin-sdk` types/dist
        // from the entries built above, so it must stay AFTER both. Tickets
        // 15–17 add their plugin packages here the same way (AFTER the SDK).
        filter: '@triiiceratops/plugin-image-manipulation',
        build: ['build'],
        tarballName: '_triiiceratops_plugin-image-manipulation.tgz',
    },
    {
        // Ticket 15 image-download plugin. Same shape as the tracer: `build` =
        // ESM + IIFE (vite) + types (tsc). Its export helpers consume core's
        // `triiiceratops/image-export` seam, so it must stay AFTER core and the
        // SDK.
        filter: '@triiiceratops/plugin-image-download',
        build: ['build'],
        tarballName: '_triiiceratops_plugin-image-download.tgz',
    },
    {
        // Ticket 16 pdf-export plugin. `build` = ESM + IIFE (vite) + types (tsc);
        // it carries its own `pdf-lib` runtime dependency (moved out of core) and
        // resolves `triiiceratops` + `@triiiceratops/plugin-sdk` types/dist from
        // the entries built above, so it must stay AFTER both.
        filter: '@triiiceratops/plugin-pdf-export',
        build: ['build'],
        tarballName: '_triiiceratops_plugin-pdf-export.tgz',
    },
    {
        // Ticket 17: the annotation-editor plugin. `build` = ESM + IIFE (vite) +
        // types (tsc); resolves `triiiceratops` and `@triiiceratops/plugin-sdk`
        // from the entries built above, so it must stay AFTER both.
        filter: '@triiiceratops/plugin-annotation-editor',
        build: ['build'],
        tarballName: '_triiiceratops_plugin-annotation-editor.tgz',
    },
];

// Fixtures. Ticket 11 seeded the core-only consumers; ticket 13 appends the SDK
// framework-adapter fixtures (each consumes the packed SDK subpath + a live
// packed `ViewerState`). Later tickets append per-plugin fixtures.
const FIXTURES = [
    'svelte-vite',
    'sveltekit-ssr',
    'wc-esm',
    'plain-html-iife',
    'plugin-react',
    'plugin-vue',
    'plugin-lit',
    'plugin-svelte',
    // Ticket 14: plain vitest project (no Svelte tooling) exercising the SDK
    // test kit + compiled `triiiceratops/testing` entry against real state.
    'vitest-kit',
    // Ticket 12: the migrated image-manipulation plugin, consumed from its
    // packed tarball. `-svelte` activates the ESM entry on a real viewer and
    // asserts the OSD canvas gets the CSS filter; `-iife` loads core + plugin
    // IIFEs in BOTH script orders; `-failure` proves plugin failure isolation
    // (ticket 09) for a real SDK plugin.
    'plugin-image-manip-svelte',
    'plugin-image-manip-iife',
    'plugin-image-manip-failure',
    // Ticket 15: the migrated image-download plugin, consumed from its packed
    // tarball. `-svelte` activates the ESM entry on a real viewer, triggers an
    // export, and asserts a download-ready binary Blob is produced (async +
    // binary output validation duty); `-iife` loads core + plugin IIFEs in BOTH
    // script orders and asserts the same.
    'plugin-image-download-svelte',
    'plugin-image-download-iife',
    // Ticket 16: the migrated pdf-export plugin, consumed from its packed
    // tarball. `-svelte` activates the ESM entry on a real viewer and asserts a
    // real multi-page PDF export completes (download intercepted; bytes start
    // `%PDF`); `-iife` loads core + plugin IIFEs in BOTH script orders and
    // asserts the same export from the self-contained no-bundler path.
    'plugin-pdf-export-svelte',
    'plugin-pdf-export-iife',
    // Ticket 17: the migrated annotation-editor plugin, consumed from its packed
    // tarball. `-svelte` drives the full annotate journey (create a point + a
    // region, edit a body, undo, redo, reload) against the packed
    // `LocalStorageAdapter`, asserting persisted annotations render via the
    // read-only overlay while Annotorious holds only the edited one.
    // `-conformance` runs the adapter conformance suite from the packed
    // `@triiiceratops/plugin-annotation-editor/testing` subpath in a plain vitest
    // project (no Svelte tooling).
    'plugin-annotation-svelte',
    'plugin-annotation-conformance',
];

const PACKAGE_MANAGERS = ['npm', 'pnpm'];

const results = [];
function record(fixture, pm, ok, detail = '') {
    results.push({ label: `${fixture} [${pm}]`, ok, detail });
    (ok ? pass : fail)(`${fixture} [${pm}]`, detail);
}

async function buildAndPack(tarballDir) {
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
    heading('Tarball content contract (allowlist, all six packages)');
    let ok = true;

    // One-time guard that the allowlist actually rejects a planted test file.
    const planted = selfCheckPlantedTest();
    (planted.ok ? pass : fail)(
        'contract: rejects a planted dist/foo.test.js',
        planted.detail,
    );
    results.push({ label: 'tarball-contents-planted', ok: planted.ok });
    ok = ok && planted.ok;

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
                if (forbidden.has(`${name}/${scoped}`)) found.add(`${name}/${scoped}`);
                findForbiddenDeps(join(full, scoped, 'node_modules'), forbidden, found);
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
    await run('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error'], {
        cwd: fixtureDir,
        timeout: 300_000,
    });

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

async function installFixture(pm, fixtureDir) {
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
        await run(
            'pnpm',
            [
                'install',
                '--ignore-workspace',
                '--no-frozen-lockfile',
                '--config.confirmModulesPurge=false',
            ],
            { cwd: fixtureDir, timeout: 300_000 },
        );
    }
}

async function withBrowser(rootDir, fn) {
    const server = await serveDir(rootDir);
    // Software WebGL (SwiftShader) so OpenSeadragon's WebGL drawer works in
    // headless CI without a GPU.
    const browser = await chromium.launch({
        args: [
            '--use-gl=angle',
            '--use-angle=swiftshader',
            '--enable-unsafe-swiftshader',
        ],
    });
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

    if (cfg.buildScript) {
        step(`${fixtureName} [${pm}]: ${pm} run ${cfg.buildScript}`);
        await run(pm, ['run', cfg.buildScript], {
            cwd: fixtureDir,
            timeout: 300_000,
        });
    }

    const serveRoot = join(fixtureDir, cfg.serveDir);
    step(`${fixtureName} [${pm}]: serve + assert`);
    if (cfg.browser) {
        await withBrowser(serveRoot, (ctx) => cfg.assert(ctx));
    } else {
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

        for (const fixtureName of FIXTURES) {
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

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
