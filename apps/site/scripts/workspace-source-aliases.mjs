// Aliases resolving workspace packages' published subpaths to source, from their `exports` maps.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const WORKSPACE_FILE = 'pnpm-workspace.yaml';

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
        if (line.trim() !== '' && !/^\s*#/.test(line)) inPackages = false;
    }
    if (globs.length === 0) {
        throw new Error(`No packages declared in ${WORKSPACE_FILE}`);
    }
    return globs;
}

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

function targets(value) {
    if (typeof value === 'string') return [value];
    if (value === null || typeof value !== 'object') return [];
    return Object.values(value).flatMap(targets);
}

function sourceFor(pkgDir, target) {
    const dist = /^\.\/dist\/(.+)$/.exec(target);
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

/** Maps each workspace package's published subpaths to the source they build from. */
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
