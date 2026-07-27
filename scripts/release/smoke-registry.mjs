#!/usr/bin/env node
// Registry smoke test (post-publish, pre-release gate).
//
// After the promote job publishes the six tarballs, this installs the EXACT
// published versions from the real npm registry into a throwaway minimal consumer
// and asserts the published packages actually resolve and load. It gates GitHub
// release creation: the release job only runs if this passes.
//
// It deliberately fetches from the registry (not the workspace, not the packed
// tarballs) so it exercises what a real user gets: registry metadata, tarball
// download, dependency resolution, export maps, and the no-bundler CDN asset.
//
// Coverage (SPEC "Release tests install exact registry versions ... and validate
// core, CSS, Web Component, SDK, plugins, and no-bundler assets"):
//   · core ESM entry            (import 'triiiceratops')
//   · core CSS                  (resolve 'triiiceratops/style.css')
//   · Web Component entries      (resolve 'triiiceratops/element' + '/element/register')
//   · SDK + every framework subpath (import '@triiiceratops/plugin-sdk' + /react …)
//   · each plugin ESM entry      (import '@triiiceratops/plugin-*')
//   · no-bundler asset fetch     (HTTP GET the published element IIFE + CSS from a CDN)
//
// Usage:
//   node scripts/release/smoke-registry.mjs --manifest <release-manifest.json>
// The manifest is produced by pack-artifacts.mjs and carries the exact versions.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function parseArgs(argv) {
    let manifest = null;
    let registry = process.env.SMOKE_REGISTRY || 'https://registry.npmjs.org/';
    let cdn = process.env.SMOKE_CDN || 'https://unpkg.com';
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--manifest') manifest = argv[++i];
        else if (argv[i] === '--registry') registry = argv[++i];
        else if (argv[i] === '--cdn') cdn = argv[++i];
        else throw new Error(`unknown argument: ${argv[i]}`);
    }
    if (!manifest) throw new Error('missing required --manifest <file>');
    return { manifest, registry, cdn };
}

function versionOf(pkgs, name) {
    const found = pkgs.find((p) => p.name === name);
    if (!found) throw new Error(`package not in manifest: ${name}`);
    return found.version;
}

async function main() {
    const { manifest, registry, cdn } = parseArgs(process.argv.slice(2));
    const { packages } = JSON.parse(readFileSync(manifest, 'utf8'));
    const v = (name) => versionOf(packages, name);

    const dir = mkdtempSync(join(tmpdir(), 'tri-smoke-'));
    console.log(`[smoke] consumer dir: ${dir}`);
    console.log(`[smoke] registry: ${registry}`);

    // Exact, pinned versions — no ranges. This is the release gate: the versions
    // just published are the versions installed.
    const dependencies = Object.fromEntries(packages.map((p) => [p.name, v(p.name)]));
    writeFileSync(
        join(dir, 'package.json'),
        JSON.stringify(
            { name: 'triiiceratops-registry-smoke', version: '0.0.0', private: true, type: 'module', dependencies },
            null,
            2,
        ) + '\n',
    );

    console.log('[smoke] npm install (exact published versions from the registry)');
    const install = spawnSync(
        'npm',
        ['install', '--no-audit', '--no-fund', '--loglevel=error', `--registry=${registry}`],
        { cwd: dir, stdio: 'inherit' },
    );
    if (install.status !== 0) throw new Error('npm install from registry failed');

    // Resolution + load assertions run in a child node process rooted in the
    // consumer, so every specifier resolves through the consumer's node_modules
    // exactly as a user's app would.
    const smoke = `
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const results = [];
async function check(label, fn) {
    try { await fn(); results.push([label, true, '']); }
    catch (err) { results.push([label, false, err.message]); }
}
await check('core: import triiiceratops', async () => {
    const mod = await import('triiiceratops');
    assert.ok(mod, 'core module empty');
});
await check('core: resolve style.css', () => {
    require.resolve('triiiceratops/style.css');
});
await check('core: resolve element (IIFE) + element/register', () => {
    require.resolve('triiiceratops/element');
    require.resolve('triiiceratops/element/register');
});
await check('sdk: import @triiiceratops/plugin-sdk', async () => {
    assert.ok(await import('@triiiceratops/plugin-sdk'));
});
for (const sub of ['react', 'vue', 'svelte', 'lit']) {
    await check(\`sdk: resolve /\${sub} adapter\`, () => {
        require.resolve(\`@triiiceratops/plugin-sdk/\${sub}\`);
    });
}
for (const p of ${JSON.stringify(
        packages.map((p) => p.name).filter((n) => n.startsWith('@triiiceratops/plugin-') && n !== '@triiiceratops/plugin-sdk'),
    )}) {
    await check(\`plugin: import \${p}\`, async () => {
        assert.ok(await import(p));
    });
}
let ok = true;
for (const [label, pass, detail] of results) {
    console.log((pass ? 'PASS ' : 'FAIL ') + label + (detail ? '  — ' + detail : ''));
    ok = ok && pass;
}
process.exit(ok ? 0 : 1);
`;
    writeFileSync(join(dir, 'smoke.mjs'), smoke);
    console.log('[smoke] resolving + importing published entries');
    const loaded = spawnSync('node', ['smoke.mjs'], { cwd: dir, stdio: 'inherit' });

    // No-bundler asset fetch: a plain <script src> user pulls the element IIFE and
    // CSS straight off a CDN pinned to the exact published version.
    const coreVersion = v('triiiceratops');
    const assets = [
        `${cdn}/triiiceratops@${coreVersion}/dist/triiiceratops-element.iife.js`,
        `${cdn}/triiiceratops@${coreVersion}/dist/triiiceratops.css`,
    ];
    let assetsOk = true;
    for (const url of assets) {
        try {
            const res = await fetch(url);
            const body = await res.text();
            if (!res.ok || body.length === 0) throw new Error(`status ${res.status}, ${body.length} bytes`);
            console.log(`PASS no-bundler fetch: ${url} (${body.length} bytes)`);
        } catch (err) {
            assetsOk = false;
            console.log(`FAIL no-bundler fetch: ${url} — ${err.message}`);
        }
    }

    rmSync(dir, { recursive: true, force: true });

    if (loaded.status !== 0 || !assetsOk) {
        console.error('\n::error::registry smoke test failed — NOT creating a GitHub release');
        process.exit(1);
    }
    console.log('\n[smoke] all registry smoke assertions passed.');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
