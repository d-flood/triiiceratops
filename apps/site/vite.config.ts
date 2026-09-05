import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { sveltekit } from '@sveltejs/kit/vite';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

import { collisionMessage, collisions } from '../../scripts/reserved-paths.mjs';

const ROUTES_DIR = fileURLToPath(new URL('./src/routes', import.meta.url));
const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const CORE_PACKAGE_JSON = 'packages/core/package.json';

/**
 * The published version, from the repository's single source for it.
 *
 * Invoked as a subprocess rather than imported: Vite bundles this config with
 * esbuild, which chokes on that script's shebang.
 */
function publishedVersion(): string {
    return execFileSync('node', ['scripts/docs-version.mjs', '--full'], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
    }).trim();
}

/**
 * Guard 1 of the collision guard: the site's own build (and its dev server)
 * fails when a route's first path segment is a reserved sibling name.
 *
 * Derived from the route manifest — the directory names under `src/routes` — so
 * it fires on the route as it is created, not on a declaration somebody also has
 * to remember to edit. Guard 2 lives in scripts/docs-publish.mjs and compares
 * through the same module; see scripts/reserved-paths.mjs for why check 4 of the
 * URL contract cannot do this job.
 */
function routeCollisionGuard(): Plugin {
    const check = () => {
        const segments = readdirSync(ROUTES_DIR, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name)
            // Kit's own route syntax: groups, matchers and parameters do not
            // name a top-level path segment on their own.
            .filter((name) => !/^[(+[]/.test(name));
        const colliding = collisions(segments);
        if (colliding.length > 0) {
            throw new Error(collisionMessage('A marketing route', colliding));
        }
    };
    return {
        name: 'triiiceratops:route-collision-guard',
        buildStart: check,
        configureServer: check,
    };
}

/**
 * The version in the site's footer, and the date that version carries.
 *
 * The date is the commit date of the last change to the core package's version,
 * which is what "1.0.0, three weeks ago" actually means. A checkout without git
 * history falls back to the build date rather than failing the build.
 */
function versionStamp(): { version: string; date: string } {
    let date: string;
    try {
        date = execFileSync(
            'git',
            ['log', '-1', '--format=%cs', '--', CORE_PACKAGE_JSON],
            { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
        ).trim();
    } catch {
        date = '';
    }
    return {
        version: publishedVersion(),
        date: date || new Date().toISOString().slice(0, 10),
    };
}

const stamp = versionStamp();

export default defineConfig({
    plugins: [routeCollisionGuard(), sveltekit()],
    define: {
        __SITE_VERSION__: JSON.stringify(stamp.version),
        __SITE_VERSION_DATE__: JSON.stringify(stamp.date),
    },
    esbuild: {
        pure: ['console.log', 'console.debug'],
        drop: ['debugger'],
    },
    test: {
        include: ['tests/unit/**/*.test.ts'],
    },
});
