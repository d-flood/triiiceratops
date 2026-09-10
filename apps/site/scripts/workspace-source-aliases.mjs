// Module aliases that resolve a workspace package's published subpaths to its
// own source, derived from each package's `exports` map.
//
// Consumed by the `triiiceratops:workspace-source` plugin in
// apps/site/vite.config.ts, which applies them only when serving. See that
// plugin for what the development server gives up in exchange.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const WORKSPACE_FILE = 'pnpm-workspace.yaml';

/**
 * The workspace's package globs, read from pnpm's own workspace file.
 *
 * Only the `packages:` sequence is understood, and only the two shapes it
 * actually holds: a directory, or a directory with a single trailing `*`. A
 * hand-written list of roots here would be one more place to forget when a
 * workspace root is added.
 *
 * @param {string} repoRoot
 * @returns {string[]}
 */
function workspaceGlobs(repoRoot) {
    const text = readFileSync(join(repoRoot, WORKSPACE_FILE), 'utf8');
    const globs = [];
    let inPackages = false;
    for (const line of text.split('\n')) {
        if (/^packages:\s*$/.test(line)) {
            inPackages = true;
            continue;
        }
        if (!inPackages) continue;
        const entry = /^\s+-\s+'?([^'#\s]+)'?/.exec(line);
        if (entry) {
            globs.push(entry[1]);
            continue;
        }
        // The sequence ends at the first line that is neither an entry, a
        // comment, nor blank.
        if (line.trim() !== '' && !/^\s*#/.test(line)) inPackages = false;
    }
    if (globs.length === 0) {
        throw new Error(`No packages declared in ${WORKSPACE_FILE}`);
    }
    return globs;
}

/**
 * Every workspace package directory, absolute.
 *
 * @param {string} repoRoot
 * @returns {string[]}
 */
function packageDirs(repoRoot) {
    const dirs = [];
    for (const glob of workspaceGlobs(repoRoot)) {
        if (!glob.endsWith('/*')) {
            dirs.push(resolve(repoRoot, glob));
            continue;
        }
        const parent = resolve(repoRoot, glob.slice(0, -2));
        if (!existsSync(parent)) continue;
        for (const entry of readdirSync(parent, { withFileTypes: true })) {
            if (entry.isDirectory()) dirs.push(join(parent, entry.name));
        }
    }
    return dirs.filter((dir) => existsSync(join(dir, 'package.json')));
}

/**
 * Every string target in an `exports` value, in declaration order.
 *
 * Conditions are walked rather than resolved: whichever condition names a
 * `dist/` file, that file's source counterpart is the same source counterpart.
 *
 * @param {unknown} value
 * @returns {string[]}
 */
function targets(value) {
    if (typeof value === 'string') return [value];
    if (value === null || typeof value !== 'object') return [];
    return Object.values(value).flatMap(targets);
}

/**
 * The source file a `dist/` target was built from, or undefined for a target
 * with no source counterpart.
 *
 * Two source roots, because the workspace holds both shapes: svelte-package
 * builds `src/lib` into `dist`, while the plugins compile a flat `src`.
 *
 * @param {string} pkgDir
 * @param {string} target
 * @returns {string | undefined}
 */
function sourceFor(pkgDir, target) {
    const dist = /^\.\/dist\/(.+)$/.exec(target);
    // A target with no extension to trade — a type declaration — describes no
    // module the dev server resolves.
    if (!dist || target.endsWith('.d.ts')) return undefined;
    const rest = dist[1];
    const bases = rest.endsWith('.js')
        ? [`${rest.slice(0, -3)}.ts`, rest]
        : [rest];
    for (const root of ['src/lib', 'src']) {
        for (const base of bases) {
            const candidate = join(pkgDir, root, base);
            if (existsSync(candidate)) return candidate;
        }
    }
    return undefined;
}

/** @param {string} text */
function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Vite alias entries mapping each workspace package's published subpaths to the
 * source they are built from.
 *
 * A subpath whose target has no source counterpart — a bundled artifact, a
 * stylesheet composed at build time — gets no entry and keeps resolving through
 * the real `exports` map. So does a package whose exports already name source.
 *
 * The `find` is an anchored pattern, so an alias claims exactly the specifier it
 * was derived from. A bare string would match every subpath beneath it and
 * rewrite `triiiceratops/element` to a path inside the core entry module.
 *
 * @param {string} repoRoot
 * @returns {Array<{ find: RegExp, replacement: string }>}
 */
export function workspaceSourceAliases(repoRoot) {
    /** @type {Array<{ find: RegExp, replacement: string }>} */
    const aliases = [];
    for (const pkgDir of packageDirs(repoRoot)) {
        /** @type {{ name?: string, exports?: Record<string, unknown> }} */
        const manifest = JSON.parse(
            readFileSync(join(pkgDir, 'package.json'), 'utf8'),
        );
        const { name, exports } = manifest;
        if (!name || !exports || typeof exports !== 'object') continue;
        for (const [subpath, value] of Object.entries(exports)) {
            // A wildcard subpath names source directly in this workspace; there
            // is no pattern to derive.
            if (subpath.includes('*')) continue;
            const source = targets(value)
                .map((target) => sourceFor(pkgDir, target))
                .find(Boolean);
            if (!source) continue;
            const specifier = subpath === '.' ? name : name + subpath.slice(1);
            aliases.push({
                find: new RegExp(`^${escapeRegExp(specifier)}$`),
                replacement: source,
            });
        }
    }
    return aliases;
}
