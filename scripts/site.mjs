#!/usr/bin/env node
// `pnpm site`: build everything, then serve the built tree.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from './package-version.mjs';

const PUBLISHED = join(REPO_ROOT, 'apps', 'site', 'build');

function fail(message) {
    console.error(`site: ${message}`);
    process.exit(1);
}

/** Refuse to serve a tree with no documentation in it. */
function requireBuiltDocs() {
    const index = join(PUBLISHED, 'docs', 'index.html');
    if (!existsSync(index)) {
        fail(
            `the build produced no documentation at ${index} — refusing to serve ` +
                'a site missing its documentation.',
        );
    }
}

function run(script) {
    const result = spawnSync('pnpm', [script], {
        stdio: 'inherit',
        cwd: REPO_ROOT,
    });
    if (result.error)
        fail(`could not run \`pnpm ${script}\`: ${result.error.message}`);
    if (result.status !== 0) process.exit(result.status ?? 1);
}

function main() {
    run('build:all');
    requireBuiltDocs();
    run('site:serve');
}

main();
