/*
 * A first-party plugin's default ESM and IIFE builds bundle Svelte and must
 * import no `svelte/internal`; its `dist/svelte/` build must import Svelte and
 * bundle none. The runtime marker must stay in the default builds, or a Svelte
 * rename would leave the `dist/svelte/` check passing vacuously.
 *
 * Run from a plugin's package directory: `node ../core/src/packaging/pluginDistCheck.ts`.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RUNTIME_MARKER = 'effect_update_depth_exceeded';

const SVELTE_DIR = 'svelte';

const INTERNAL_IMPORT =
    /(?:\bfrom\s*|\bimport\s*\(?\s*)["']svelte\/internal(?:\/[^"']*)?["']/;
const SVELTE_IMPORT =
    /(?:\bfrom\s*|\bimport\s*\(?\s*)["']svelte(?:\/[^"']*)?["']/;

function jsFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true, recursive: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
        .map((entry) => join(entry.parentPath, entry.name))
        .sort();
}

/** Every problem with a built plugin's `dist/`; empty when it is clean. */
export function checkPluginDist(packageDir: string): string[] {
    const dist = join(packageDir, 'dist');
    const shared = join(dist, SVELTE_DIR);
    const files = jsFiles(dist).map((path) => ({
        name: relative(dist, path).split('\\').join('/'),
        text: readFileSync(path, 'utf8'),
    }));
    const inShared = (name: string) => name.startsWith(`${SVELTE_DIR}/`);
    const bundled = files.filter((f) => !inShared(f.name));
    const svelte = files.filter((f) => inShared(f.name));
    const problems: string[] = [];

    for (const file of bundled) {
        if (INTERNAL_IMPORT.test(file.text)) {
            problems.push(`${file.name} imports svelte/internal`);
        }
    }
    if (!bundled.some((f) => f.text.includes(RUNTIME_MARKER))) {
        problems.push(
            `no default build contains the runtime marker \`${RUNTIME_MARKER}\`; Svelte renamed it, so pick a new one`,
        );
    }

    if (svelte.length === 0) {
        problems.push(`${relative(packageDir, shared)} holds no build`);
    }
    for (const file of svelte) {
        if (file.text.includes(RUNTIME_MARKER)) {
            problems.push(`${file.name} bundles the Svelte runtime`);
        }
    }
    if (svelte.length > 0 && !svelte.some((f) => SVELTE_IMPORT.test(f.text))) {
        problems.push(`the ${SVELTE_DIR}/ build imports no svelte module`);
    }

    return problems;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    const problems = checkPluginDist(process.cwd());
    if (problems.length > 0) {
        throw new Error(
            `Plugin dist check failed:\n${problems.map((p) => `- ${p}`).join('\n')}`,
        );
    }
    console.log(
        'plugin-dist: default builds carry no svelte/internal import; the svelte build imports its runtime',
    );
}
