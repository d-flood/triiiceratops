#!/usr/bin/env node
// `pnpm site`: build everything, assemble the published tree, serve it.
//
// This is the blessed way to look at the site. It serves the ASSEMBLED tree from
// a static server rather than a development server with proxied siblings, so the
// relative paths between the marketing root, the documentation, the playground
// and the bare viewer are the real ones. A proxy layer would be a second
// definition of the site that can be correct while the real one is broken.
//
// The narrower verbs (`site:build`, `site:serve`, `site:preview`) stay for CI and
// tighter loops; this composes them and adds the two guards that keep a green
// command from serving an incomplete site.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT, docsVersion } from './docs-version.mjs';

// The documentation generator is a globally installed tool — see the README's
// Development section and .github/workflows/docs.yml, which install it this way.
const GENERATOR = 'zensical';
const PUBLISHED = join(REPO_ROOT, 'published');

function fail(message) {
    console.error(`site: ${message}`);
    process.exit(1);
}

/**
 * Refuse to start before the documentation generator is on PATH.
 *
 * Checked up front rather than left to the build: the failure otherwise arrives
 * as a bare ENOENT several minutes into `build:all`, naming a binary the reader
 * has no reason to recognise.
 */
function requireGenerator() {
    const probe = spawnSync(GENERATOR, ['--version'], { stdio: 'ignore' });
    if (probe.error) {
        fail(
            `the documentation generator \`${GENERATOR}\` is not on PATH.\n` +
                `  It is a globally installed Python tool: \`pip install ${GENERATOR}\`\n` +
                '  (see the Development section of README.md).',
        );
    }
}

/**
 * Refuse to serve a tree with no documentation in it.
 *
 * A green command serving a site whose `/docs/` is absent is the failure this
 * whole command exists to prevent: the missing subtree is invisible until someone
 * follows a link, which by then is in production.
 */
function requireAssembledDocs() {
    const version = docsVersion();
    const index = join(PUBLISHED, 'docs', version, 'index.html');
    if (!existsSync(index)) {
        fail(
            `assembly produced no documentation at ${index} — refusing to serve ` +
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
    requireGenerator();
    run('site:build');
    requireAssembledDocs();
    run('site:serve');
}

main();
