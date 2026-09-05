#!/usr/bin/env node
// `pnpm site`: build everything, then serve the built tree.
//
// This is the blessed way to look at the site. It serves the BUILT tree from a
// static server rather than a development server, so the paths between the
// marketing root, the documentation, the playground and the bare viewer are the
// real ones, and the crawl files are the ones a host would read.
//
// The narrower verbs (`build:all`, `site:serve`, `site:preview`) stay for CI and
// tighter loops; this composes them and adds the guard that keeps a green
// command from serving an incomplete site.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from './package-version.mjs';

const PUBLISHED = join(REPO_ROOT, 'apps', 'site', 'build');

function fail(message) {
    console.error(`site: ${message}`);
    process.exit(1);
}

/**
 * Refuse to serve a tree with no documentation in it.
 *
 * A green command serving a site whose `/docs/` is absent is the failure this
 * whole command exists to prevent: the missing subtree is invisible until someone
 * follows a link, which by then is in production.
 */
function requireBuiltDocs() {
    const index = join(PUBLISHED, 'docs', 'index.html');
    if (!existsSync(index)) {
        fail(
            `the build produced no documentation at ${index} — refusing to serve ` +
                'a site missing its documentation.',
        );
    }
}

/**
 * Run one of the narrower verbs, exiting with its own status.
 *
 * The child has already reported its failure on the inherited stderr, so a Node
 * stack trace on top of it would only bury the message that matters.
 */
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
