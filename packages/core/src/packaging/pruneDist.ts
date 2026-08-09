/*
 * Post-package pruning of dist/ (build-time tooling — lives in src/packaging,
 * never published). svelte-package copies EVERYTHING under src/lib, including test
 * files and demo-only chrome components that are not part of the public API and
 * that no shipped module imports. `@sveltejs/package` v2 has no exclude option,
 * so `build:lib` runs this to trim the npm tarball.
 *
 * Run directly: `node ./src/build/pruneDist.ts` (Node strips the types).
 */
import { readdirSync, statSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/*
 * Demo-only and test-host components. They live in src/lib/components (so the
 * demo and component tests can import them) but are never re-exported from the
 * package and nothing shipped imports them — verified: their only importers are
 * src/demo/* , *.test.* , and each other. Matched by basename against
 * `<name>.svelte` and its `.svelte.d.ts`.
 */
export const DEMO_ONLY_COMPONENTS = [
    'DemoHeader',
    'SettingsMenu',
    'LightDarkToggle',
] as const;

/*
 * Test-host components are matched by SUFFIX, not enumerated. An explicit list
 * drifted: `assert-tarball-contents.mjs` forbids anything matching `TestHost`,
 * this list named only the one that existed when it was written, and the next
 * `…TestHost.svelte` therefore reached the tarball and failed that assertion
 * instead of being pruned. One rule, spelled the same way on both sides.
 */
const TEST_HOST_SUFFIX = 'TestHost';

/*
 * Directories (relative to dist/) holding internal test fixtures and mock
 * utilities. svelte-package copies src/lib/test/** verbatim, but nothing shipped
 * imports it — those helpers back only *.test.* files, which are pruned above.
 */
export const EXCLUDED_DIRS = ['test'] as const;

/*
 * Directory basenames pruned wherever they appear in the tree. Unlike
 * EXCLUDED_DIRS (top-level paths), these sit next to the source they back:
 * `state/__golden__` holds the committed behavioral-golden snapshots, read only
 * by *.test.* files, which are themselves pruned below.
 */
export const EXCLUDED_DIR_NAMES = ['__golden__'] as const;

const DEMO_ONLY_RE = new RegExp(
    `^(${DEMO_ONLY_COMPONENTS.join('|')})\\.svelte(\\.d\\.ts)?$`,
);

const TEST_HOST_RE = new RegExp(
    `^\\w*${TEST_HOST_SUFFIX}\\.svelte(\\.d\\.ts)?$`,
);

/** True if a dist file (by basename) should not be published. */
export function isPackageExcluded(filename: string): boolean {
    // Test/spec files: *.test.js, *.test.d.ts, *.spec.ts, …
    if (/\.(test|spec)\./.test(filename)) return true;
    // Demo-only chrome and test-host components.
    if (DEMO_ONLY_RE.test(filename)) return true;
    if (TEST_HOST_RE.test(filename)) return true;
    return false;
}

/** Recursively delete excluded files under `distDir`. Returns removed paths. */
export function pruneDist(distDir: string): string[] {
    const removed: string[] = [];
    if (!existsSync(distDir)) return removed;
    // Drop whole excluded directories first (test fixtures / mock utilities).
    for (const dir of EXCLUDED_DIRS) {
        const full = join(distDir, dir);
        if (existsSync(full)) {
            rmSync(full, { recursive: true, force: true });
            removed.push(full);
        }
    }
    const walk = (dir: string) => {
        for (const name of readdirSync(dir)) {
            const full = join(dir, name);
            if (statSync(full).isDirectory()) {
                if ((EXCLUDED_DIR_NAMES as readonly string[]).includes(name)) {
                    rmSync(full, { recursive: true, force: true });
                    removed.push(full);
                    continue;
                }
                walk(full);
            } else if (isPackageExcluded(name)) {
                rmSync(full);
                removed.push(full);
            }
        }
    };
    walk(distDir);
    return removed;
}

// CLI entry: prune ./dist relative to the repo root (this file is src/build/).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    const distDir = fileURLToPath(new URL('../../dist', import.meta.url));
    const removed = pruneDist(distDir);
    console.log(
        `prune-dist: removed ${removed.length} test/demo-only file(s) from dist/`,
    );
}
