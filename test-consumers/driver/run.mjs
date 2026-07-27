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
//  · assert-tarball-css / core-only dependency-absence (ticket 20) hooks in
//    after the pack step, before fixtures.
// ---------------------------------------------------------------------------

import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertTarballCss } from './assert-tarball-css.mjs';
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
        // Build steps required so the packed dist is complete.
        build: ['build:lib', 'build:element', 'build:plugins-iife'],
        tarballName: 'triiiceratops.tgz',
    },
    {
        filter: '@triiiceratops/plugin-sdk',
        // `build` = tsc; resolves `triiiceratops` types from the core dist built
        // above, so this entry must stay AFTER core.
        build: ['build'],
        tarballName: '_triiiceratops_plugin-sdk.tgz',
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
