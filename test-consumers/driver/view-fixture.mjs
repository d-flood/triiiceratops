#!/usr/bin/env node
// Ad-hoc fixture viewer — NOT part of `pnpm test:packed`.
//
// Runs the same setup the packed-consumer harness runs for one fixture
// (build + pack real tarballs, install the fixture against them, build it),
// then serves the built output on a local port and leaves it running so you
// can open it in your own browser and click around. Nothing gets cleaned up
// until you Ctrl+C — no Playwright involved.
//
// Usage:
//   node test-consumers/driver/view-fixture.mjs <fixture-name> [--pm=pnpm|npm]
//   pnpm --filter @triiiceratops/test-consumers exec node driver/view-fixture.mjs plugin-react
//
// Run without arguments to list known fixtures.
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { FIXTURES, buildAndPack, installFixture } from './run.mjs';
import {
    FIXTURES_DIR,
    copyFixture,
    distributeManifest,
    heading,
    injectTarball,
    log,
    makeTempDir,
    refreshLocalDepInLockfiles,
    run,
    serveDir,
    step,
} from './lib.mjs';

const [, , fixtureName, ...rest] = process.argv;
const pmFlag = rest.find((a) => a.startsWith('--pm='));
const pm = pmFlag ? pmFlag.slice('--pm='.length) : 'pnpm';

if (!fixtureName || !FIXTURES.includes(fixtureName)) {
    log(
        `Usage: node view-fixture.mjs <fixture-name> [--pm=pnpm|npm]\n\nKnown fixtures:\n  ${FIXTURES.join('\n  ')}`,
    );
    process.exit(fixtureName ? 1 : 0);
}
if (pm !== 'npm' && pm !== 'pnpm') {
    log(`--pm must be "npm" or "pnpm", got "${pm}"`);
    process.exit(1);
}

const tarballDir = makeTempDir('tri-view-packed-');
const workRoot = makeTempDir('tri-view-consumer-');

heading('Building + packing publishable packages (can take a few minutes)');
const tarballs = await buildAndPack(tarballDir);

const cfg = (
    await import(
        pathToFileURL(join(FIXTURES_DIR, fixtureName, 'harness.mjs')).href
    )
).default;

heading(`Setting up "${fixtureName}" [${pm}]`);
const fixtureDir = copyFixture(fixtureName, workRoot);

const tarballDeps = cfg.tarballs ?? ['triiiceratops'];
for (const dep of tarballDeps) {
    if (!tarballs[dep]) {
        throw new Error(`fixture "${fixtureName}" needs unpacked "${dep}"`);
    }
    injectTarball(fixtureDir, tarballs[dep], dep);
    refreshLocalDepInLockfiles(fixtureDir, dep);
}
distributeManifest(fixtureDir, cfg.manifestTarget);

step(`install (${pm})`);
await installFixture(pm, fixtureDir);

if (cfg.buildScript) {
    step(`${pm} run ${cfg.buildScript}`);
    await run(pm, ['run', cfg.buildScript], {
        cwd: fixtureDir,
        timeout: 300_000,
    });
}

const serveRoot = join(fixtureDir, cfg.serveDir);
const server = await serveDir(serveRoot);

heading(`Serving "${fixtureName}" — open in your browser:`);
log(`\n  ${server.baseURL}/\n`);
log(`(fixture dir, if you want to poke at the installed package: ${fixtureDir})`);
log('Press Ctrl+C to stop.\n');

process.on('SIGINT', async () => {
    await server.close();
    process.exit(0);
});
