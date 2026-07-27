/*
 * Post-package pruning of dist/ (build-time tooling — lives in src/packaging,
 * never published). svelte-package copies EVERYTHING under src/lib, including test
 * files and demo-only chrome components that are not part of the public API and
 * that no shipped module imports. `@sveltejs/package` v2 has no exclude option,
 * so `build:lib` runs this to trim the npm tarball.
 *
 * Run directly: `node ./src/build/pruneDist.ts` (Node strips the types).
 */
import {
    readdirSync,
    statSync,
    rmSync,
    existsSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/*
 * Demo-only components. They live in src/lib/components (so the demo can import
 * them) but are never re-exported from the package and nothing shipped imports
 * them — verified: their only importers are src/demo/* and each other. Matched
 * by basename against `<name>.svelte` and its `.svelte.d.ts`.
 */
export const DEMO_ONLY_COMPONENTS = [
    'DemoHeader',
    'SettingsMenu',
    'LightDarkToggle',
] as const;

const DEMO_ONLY_RE = new RegExp(
    `^(${DEMO_ONLY_COMPONENTS.join('|')})\\.svelte(\\.d\\.ts)?$`,
);

/** True if a dist file (by basename) should not be published. */
export function isPackageExcluded(filename: string): boolean {
    // Test/spec files: *.test.js, *.test.d.ts, *.spec.ts, …
    if (/\.(test|spec)\./.test(filename)) return true;
    // Demo-only chrome components.
    if (DEMO_ONLY_RE.test(filename)) return true;
    return false;
}

/** Recursively delete excluded files under `distDir`. Returns removed paths. */
export function pruneDist(distDir: string): string[] {
    const removed: string[] = [];
    if (!existsSync(distDir)) return removed;
    const walk = (dir: string) => {
        for (const name of readdirSync(dir)) {
            const full = join(dir, name);
            if (statSync(full).isDirectory()) {
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
