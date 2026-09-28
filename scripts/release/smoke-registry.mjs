#!/usr/bin/env node
// Post-publish registry smoke test. Installs exact published versions and asserts they resolve and load.

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

/** Published plugins whose ESM entry needs a bundler; asserted by resolution, not import. */
const BUNDLER_ONLY_PLUGINS = new Set(['@triiiceratops/plugin-av']);

/** Core's framework wrapper subpaths and the exports each must deliver. */
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

const INSTALL_ATTEMPTS = 6;
const INSTALL_RETRY_MS = 20_000;

/** Sleep synchronously. */
function sleepSync(ms) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** npm install with retries for registry propagation lag. */
function npmInstall(dir, registry, label) {
    for (let attempt = 1; ; attempt++) {
        const install = spawnSync(
            'npm',
            [
                'install',
                '--no-audit',
                '--no-fund',
                '--prefer-online',
                '--loglevel=error',
                `--registry=${registry}`,
            ],
            { cwd: dir, stdio: 'inherit' },
        );
        if (install.status === 0) return;
        if (attempt === INSTALL_ATTEMPTS)
            throw new Error(
                `npm install from registry failed after ${INSTALL_ATTEMPTS} attempts (${label})`,
            );
        console.log(
            `[smoke] npm install failed (${label}), attempt ${attempt}/${INSTALL_ATTEMPTS} — retrying in ${INSTALL_RETRY_MS / 1000}s`,
        );
        sleepSync(INSTALL_RETRY_MS);
    }
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
 * Install core plus one optional peer, then import that framework subpath DOM-free.
 * Proves the peers are optional and the wrapper is SSR-safe.
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

        // Peers are optional: the other framework must not be pulled in.
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
    const publishedPlugins = packages
        .map((p) => p.name)
        .filter(
            (n) =>
                n.startsWith('@triiiceratops/plugin-') &&
                n !== '@triiiceratops/plugin-sdk',
        );

    const dir = mkdtempSync(join(tmpdir(), 'tri-smoke-'));
    console.log(`[smoke] consumer dir: ${dir}`);
    console.log(`[smoke] registry: ${registry}`);

    // Pinned versions: the versions just published are the versions installed.
    const dependencies = Object.fromEntries(
        packages.map((p) => [p.name, v(p.name)]),
    );
    writeConsumerManifest(dir, 'triiiceratops-registry-smoke', dependencies);

    console.log(
        '[smoke] npm install (exact published versions from the registry)',
    );
    npmInstall(dir, registry, `all ${packages.length} published packages`);

    // Peer ranges come from the published core itself, so they cannot drift.
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

    // Assertions run in a child process rooted in the consumer.
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
// The framework subpaths must RESOLVE from a
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
        publishedPlugins.filter((n) => !BUNDLER_ONLY_PLUGINS.has(n)),
    )}) {
    await check(\`plugin: import \${p}\`, async () => {
        assert.ok(await import(p));
    });
}
// Resolve-only, for the same reason core's own root entry is resolve-only above:
// these entries import \`triiiceratops\` (the Svelte library entry), which only a
// consumer's bundler compiles. Resolution still proves the export map, the
// tarball and the dependency tree; the IMPORT is proven by the packed-consumer
// bundler fixtures in test-consumers/.
for (const p of ${JSON.stringify(
        publishedPlugins.filter((n) => BUNDLER_ONLY_PLUGINS.has(n)),
    )}) {
    await check(\`plugin: resolve \${p} (bundler-only entry)\`, () => {
        import.meta.resolve(p);
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

    // One consumer per framework proves peers are independent.
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

    // No-bundler assets straight off a CDN pinned to the published version.
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
