#!/usr/bin/env node
// Packed-consumer test harness driver. Every fixture consumes only the packed tarball.

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
    assertTarballNoEmbeddedFonts,
    assertTarballPeerRanges,
    selfCheckFrameworkSubpathAssertions,
    selfCheckNoFonts,
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

// Packages packed for the fixtures below. Core first; SDK after.
const PACKAGES_TO_PACK = [
    {
        filter: 'triiiceratops',
        build: ['build:lib', 'build:testing', 'build:element'],
        tarballName: 'triiiceratops.tgz',
    },
    {
        filter: '@triiiceratops/plugin-sdk',
        build: ['build'],
        tarballName: '_triiiceratops_plugin-sdk.tgz',
    },
    {
        filter: '@triiiceratops/plugin-image-manipulation',
        build: ['build'],
        tarballName: '_triiiceratops_plugin-image-manipulation.tgz',
    },
    {
        filter: '@triiiceratops/plugin-image-export',
        build: ['build'],
        tarballName: '_triiiceratops_plugin-image-export.tgz',
    },
    {
        filter: '@triiiceratops/plugin-av',
        build: ['build'],
        tarballName: '_triiiceratops_plugin-av.tgz',
    },
    {
        filter: '@triiiceratops/plugin-pdf-export',
        build: ['build'],
        tarballName: '_triiiceratops_plugin-pdf-export.tgz',
    },
    {
        filter: '@triiiceratops/plugin-annotation-editor',
        build: ['build'],
        tarballName: '_triiiceratops_plugin-annotation-editor.tgz',
    },
];

// Fixtures: core consumers, SDK adapter fixtures, and per-plugin fixtures.
export const FIXTURES = [
    'svelte-vite',
    'sveltekit-ssr',
    'wc-esm',
    'plain-html-iife',
    'plugin-react',
    'plugin-vue',
    'plugin-lit',
    'plugin-svelte',
    'vitest-kit',
    'plugin-image-manip-svelte',
    'plugin-image-manip-iife',
    'plugin-image-manip-failure',
    'plugin-image-export-svelte',
    'plugin-image-export-iife',
    'plugin-pdf-export-svelte',
    'plugin-pdf-export-iife',
    // Unrun: journey targets the replaced Annotorious surface; re-list once rewritten.
    'plugin-annotation-conformance',
    'strict-dts',
    'docs-examples',
    'csp-svelte',
    'csp-wc-iife',
    'csp-trusted-types',
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
        // Stabilise the filename for committed lockfiles.
        const stable = join(tarballDir, pkg.tarballName);
        await run('cp', [produced, stable]);
        tarballs[pkg.filter] = stable;
        step(`${pkg.filter}: → ${pkg.tarballName}`);
    }
    return tarballs;
}

async function assertCssFromTarball(tarballPath, tarballDir) {
    heading('Tarball-level CSS assertions (triiiceratops/style.css)');
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

    const planted = selfCheckPlantedTest();
    (planted.ok ? pass : fail)(
        'contract: rejects a planted dist/foo.test.js',
        planted.detail,
    );
    results.push({ label: 'tarball-contents-planted', ok: planted.ok });
    ok = ok && planted.ok;

    const peerSelf = selfCheckPeerRangeRejectsPin();
    (peerSelf.ok ? pass : fail)(
        'contract: peer-range check rejects a pin / workspace:',
        peerSelf.detail,
    );
    results.push({ label: 'tarball-peer-range-self', ok: peerSelf.ok });
    ok = ok && peerSelf.ok;

    const subpathSelf = selfCheckFrameworkSubpathAssertions();
    (subpathSelf.ok ? pass : fail)(
        'contract: framework-subpath checks reject a missing wrapper artifact',
        subpathSelf.detail,
    );
    results.push({ label: 'tarball-subpath-self', ok: subpathSelf.ok });
    ok = ok && subpathSelf.ok;

    const fontSelf = selfCheckNoFonts();
    (fontSelf.ok ? pass : fail)(
        'contract: no-font rule rejects a planted face, file or embedded',
        fontSelf.detail,
    );
    results.push({ label: 'tarball-fonts-self', ok: fontSelf.ok });
    ok = ok && fontSelf.ok;

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

        const { ok: peerOk, checks: peerChecks } = assertTarballPeerRanges(
            tarball,
            pkg.filter,
        );
        for (const chk of peerChecks) {
            (chk.ok ? pass : fail)(chk.name, chk.detail);
        }
        results.push({ label: `tarball-peers:${pkg.filter}`, ok: peerOk });
        ok = ok && peerOk;

        const { ok: fontOk, checks: fontChecks } = assertTarballNoEmbeddedFonts(
            tarball,
            pkg.filter,
        );
        for (const chk of fontChecks) {
            (chk.ok ? pass : fail)(chk.name, chk.detail);
        }
        results.push({ label: `tarball-fonts:${pkg.filter}`, ok: fontOk });
        ok = ok && fontOk;

        // Core only: export targets backed by files, peers optional and ranged.
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

// Collect forbidden package dirs under node_modules.
function findForbiddenDeps(nodeModulesDir, forbidden, found = new Set()) {
    if (!existsSync(nodeModulesDir)) return found;
    for (const name of readdirSync(nodeModulesDir)) {
        if (name === '.bin') continue;
        const full = join(nodeModulesDir, name);
        if (name.startsWith('@')) {
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

    // Plugin-only deps must not resolve into a core-only install.
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
        // Standalone consumers must approve esbuild's postinstall for Vite.
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

// Playwright browsers keyed by fixture `browsers` list.
const BROWSER_TYPES = { chromium, firefox, webkit };

// Real GPU locally; software WebGL on CI. Firefox/WebKit use defaults.
const LAUNCH_OPTIONS = {
    chromium: process.env.CI
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
          },
    firefox: {},
    webkit: {},
};

/** Import both framework subpaths DOM-free and assert no registration side effect. */
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

    // Inject each packed tarball this fixture consumes.
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
        const browsers = cfg.browsers ?? ['chromium'];
        for (const browserName of browsers) {
            step(`${fixtureName} [${pm}] (${browserName}): serve + assert`);
            await withBrowser(
                serveRoot,
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

        // `PACKED_ONLY` filters fixtures locally; unset in CI.
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

// Importable without running the suite; only run as entrypoint.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
