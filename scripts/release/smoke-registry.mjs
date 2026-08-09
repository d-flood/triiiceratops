#!/usr/bin/env node
// Registry smoke test (post-publish, pre-release gate).
//
// After the promote job publishes the release manifest's tarballs (five today),
// this installs the EXACT published versions from the real npm registry into a
// throwaway minimal consumer and asserts the published packages actually resolve
// and load. It gates GitHub release creation: the release job only runs if this
// passes.
//
// It deliberately fetches from the registry (not the workspace, not the packed
// tarballs) so it exercises what a real user gets: registry metadata, tarball
// download, dependency resolution, export maps, and the no-bundler CDN asset.
//
// Coverage (SPEC "Release tests install exact registry versions ... and validate
// core, CSS, Web Component, SDK, plugins, and no-bundler assets"):
//   · core Svelte entry         (resolve 'triiiceratops')
//   · core CSS                  (resolve 'triiiceratops/style.css')
//   · Web Component entries      (resolve 'triiiceratops/element' + '/element/register')
//   · core framework subpaths    (resolve 'triiiceratops/react' + '/vue' + '/selectors' + '/testing')
//   · SDK + every framework subpath (import '@triiiceratops/plugin-sdk' + /react …)
//   · each plugin ESM entry      (import '@triiiceratops/plugin-*')
//   · no-bundler asset fetch     (HTTP GET the published element IIFE + CSS from a CDN)
//
// Framework-wrappers ticket 10 adds a second stage: one THROWAWAY CONSUMER PER
// FRAMEWORK, each installing published core plus exactly one optional peer
// (`react` OR `vue`, at the range the published package itself declares) and
// importing that subpath for real. Separate consumers are the point — they prove
// the peers are genuinely optional and independent: a React application must not
// need Vue installed, neither needs Svelte, and npm must not auto-install any of
// the three. A single combined consumer could not tell those apart.
//
// Usage:
//   node scripts/release/smoke-registry.mjs --manifest <release-manifest.json>
// The manifest is produced by pack-artifacts.mjs and carries the exact versions.

import { spawnSync } from 'node:child_process';
import {
    existsSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
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

/**
 * Core's framework wrapper subpaths, and the named exports each must deliver.
 * The peer RANGE is not hard-coded — it is read out of the published package's
 * own `peerDependencies` so the smoke can never install a version the release
 * does not actually claim to support.
 */
const FRAMEWORK_SUBPATHS = [
    {
        subpath: 'triiiceratops/react',
        peer: 'react',
        forbiddenPeers: ['vue', 'svelte'],
        exports: [
            'TriiiceratopsViewer',
            'useViewer',
            'useViewerHandle',
            'useViewerSelector',
            'ViewerProvider',
            'VIEWER_ELEMENT_TAG',
        ],
    },
    {
        subpath: 'triiiceratops/vue',
        peer: 'vue',
        forbiddenPeers: ['react', 'svelte'],
        exports: [
            'provideViewer',
            'TriiiceratopsViewer',
            'useViewer',
            'useViewerSelector',
            'ViewerProvider',
            'VIEWER_ELEMENT_TAG',
        ],
    },
];

/** npm install into `dir` from `registry`. Throws on a non-zero exit. */
function npmInstall(dir, registry, label) {
    const install = spawnSync(
        'npm',
        [
            'install',
            '--no-audit',
            '--no-fund',
            '--loglevel=error',
            `--registry=${registry}`,
        ],
        { cwd: dir, stdio: 'inherit' },
    );
    if (install.status !== 0)
        throw new Error(`npm install from registry failed (${label})`);
}

function writeConsumerManifest(dir, name, dependencies) {
    writeFileSync(
        join(dir, 'package.json'),
        JSON.stringify(
            {
                name,
                version: '0.0.0',
                private: true,
                type: 'module',
                dependencies,
            },
            null,
            2,
        ) + '\n',
    );
}

/**
 * Install published core plus ONE optional peer, then import that framework
 * subpath for real in plain Node.
 *
 * Importing (not merely resolving) is what makes this a release gate: it
 * evaluates the published module graph with no `window`, `document`, or
 * `customElements`, which is the SSR-safety promise, and it fails if the wrapper
 * reaches for a package the consumer did not install. Returns true on success.
 */
function smokeFrameworkSubpath({ entry, registry, coreVersion, peerRange }) {
    const dir = mkdtempSync(join(tmpdir(), `tri-smoke-${entry.peer}-`));
    console.log(`\n[smoke:${entry.peer}] consumer dir: ${dir}`);

    try {
        writeConsumerManifest(dir, `triiiceratops-smoke-${entry.peer}`, {
            triiiceratops: coreVersion,
            [entry.peer]: peerRange,
        });
        npmInstall(dir, registry, entry.subpath);

        // The optional peers really are optional: npm must not have pulled in
        // the other framework, and never Svelte.
        let peersOk = true;
        for (const forbidden of entry.forbiddenPeers) {
            const installed = existsSync(
                join(dir, 'node_modules', forbidden, 'package.json'),
            );
            if (installed) peersOk = false;
            console.log(
                `${installed ? 'FAIL' : 'PASS'} ${entry.subpath}: ${forbidden} not installed`,
            );
        }

        const probe = `
import assert from 'node:assert/strict';
for (const g of ['window', 'document', 'customElements']) {
    assert.equal(g in globalThis, false, g + ' is present — this probe must run DOM-free');
}
const mod = await import(${JSON.stringify(entry.subpath)});
for (const name of ${JSON.stringify(entry.exports)}) {
    assert.ok(name in mod, 'missing named export: ' + name);
}
assert.equal('default' in mod, false, ${JSON.stringify(entry.subpath)} + ' must have no default export');
assert.equal('Triiiceratops' in globalThis, false, 'importing the wrapper registered a browser runtime');
console.log('PASS ${entry.subpath}: imported DOM-free with ${entry.exports.length} named exports');
`;
        writeFileSync(join(dir, 'probe.mjs'), probe);
        const loaded = spawnSync('node', ['probe.mjs'], {
            cwd: dir,
            stdio: 'inherit',
        });
        if (loaded.status !== 0)
            console.log(
                `FAIL ${entry.subpath}: import probe exited ${loaded.status}`,
            );

        return peersOk && loaded.status === 0;
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
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
    const dependencies = Object.fromEntries(
        packages.map((p) => [p.name, v(p.name)]),
    );
    writeConsumerManifest(dir, 'triiiceratops-registry-smoke', dependencies);

    console.log(
        '[smoke] npm install (exact published versions from the registry)',
    );
    npmInstall(dir, registry, `all ${packages.length} published packages`);

    // The published core's own peer metadata drives the per-framework stage
    // below, so the smoke installs exactly the versions the release claims to
    // support and cannot drift from `packages/core/package.json`.
    const installedCore = JSON.parse(
        readFileSync(
            join(dir, 'node_modules', 'triiiceratops', 'package.json'),
            'utf8',
        ),
    );
    const corePeers = installedCore.peerDependencies ?? {};
    const corePeerMeta = installedCore.peerDependenciesMeta ?? {};

    let peerMetaOk = true;
    for (const peer of ['react', 'svelte', 'vue']) {
        const declared = typeof corePeers[peer] === 'string';
        const optional = corePeerMeta[peer]?.optional === true;
        // Not installed HERE either: this consumer depends on every published
        // package in the manifest and nothing else, so npm auto-installing a peer
        // would show up as a resolved directory.
        const absent = !existsSync(
            join(dir, 'node_modules', peer, 'package.json'),
        );
        const ok = declared && optional && absent;
        peerMetaOk = peerMetaOk && ok;
        console.log(
            `${ok ? 'PASS' : 'FAIL'} core: ${peer} is a declared OPTIONAL peer and is not installed` +
                (ok
                    ? ''
                    : `  — declared=${declared} optional=${optional} absent=${absent}`),
        );
    }

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
await check('core: resolve triiiceratops', () => {
    // The root entry is a Svelte library entry: consumer bundlers compile its
    // .svelte modules, while plain Node can only validate the export target.
    import.meta.resolve('triiiceratops');
});
await check('core: resolve style.css', () => {
    require.resolve('triiiceratops/style.css');
});
await check('core: resolve element (IIFE) + element/register', () => {
    require.resolve('triiiceratops/element');
    require.resolve('triiiceratops/element/register');
});
// Framework-wrappers ticket 10: the framework subpaths must RESOLVE from a
// consumer that installed no optional peer at all — resolution is the export
// map, not the peer. The IMPORT of each is exercised per-framework below, in a
// consumer that installed exactly one peer.
for (const sub of ['react', 'vue', 'selectors', 'testing']) {
    await check(\`core: resolve triiiceratops/\${sub}\`, () => {
        import.meta.resolve(\`triiiceratops/\${sub}\`);
    });
}
await check('sdk: import @triiiceratops/plugin-sdk', async () => {
    assert.ok(await import('@triiiceratops/plugin-sdk'));
});
for (const sub of ['react', 'vue', 'svelte', 'lit']) {
    await check(\`sdk: resolve /\${sub} adapter\`, () => {
        import.meta.resolve(\`@triiiceratops/plugin-sdk/\${sub}\`);
    });
}
for (const p of ${JSON.stringify(
        packages
            .map((p) => p.name)
            .filter(
                (n) =>
                    n.startsWith('@triiiceratops/plugin-') &&
                    n !== '@triiiceratops/plugin-sdk',
            ),
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
    const loaded = spawnSync('node', ['smoke.mjs'], {
        cwd: dir,
        stdio: 'inherit',
    });

    const coreVersion = v('triiiceratops');

    // One consumer per framework: published core + exactly one optional peer.
    let frameworksOk = true;
    for (const entry of FRAMEWORK_SUBPATHS) {
        const peerRange = corePeers[entry.peer];
        if (typeof peerRange !== 'string') {
            frameworksOk = false;
            console.log(
                `FAIL ${entry.subpath}: published core declares no \`${entry.peer}\` peer range`,
            );
            continue;
        }
        frameworksOk =
            smokeFrameworkSubpath({
                entry,
                registry,
                coreVersion,
                peerRange,
            }) && frameworksOk;
    }

    // No-bundler asset fetch: a plain <script src> user pulls the element IIFE and
    // CSS straight off a CDN pinned to the exact published version.
    const assets = [
        `${cdn}/triiiceratops@${coreVersion}/dist/triiiceratops-element.iife.js`,
        `${cdn}/triiiceratops@${coreVersion}/dist/triiiceratops.css`,
    ];
    let assetsOk = true;
    for (const url of assets) {
        try {
            const res = await fetch(url);
            const body = await res.text();
            if (!res.ok || body.length === 0)
                throw new Error(`status ${res.status}, ${body.length} bytes`);
            console.log(`PASS no-bundler fetch: ${url} (${body.length} bytes)`);
        } catch (err) {
            assetsOk = false;
            console.log(`FAIL no-bundler fetch: ${url} — ${err.message}`);
        }
    }

    rmSync(dir, { recursive: true, force: true });

    if (loaded.status !== 0 || !assetsOk || !peerMetaOk || !frameworksOk) {
        console.error(
            '\n::error::registry smoke test failed — NOT creating a GitHub release',
        );
        process.exit(1);
    }
    console.log('\n[smoke] all registry smoke assertions passed.');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
