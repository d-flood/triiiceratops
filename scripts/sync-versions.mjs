/**
 * Rewrites the version literals that have to track a package manifest.
 *
 * These are literals rather than `package.json` imports deliberately: `api.ts`
 * is bundled into the element and `competitors.ts` into the site, where a JSON
 * import would carry a whole manifest in to quote one field of it. Reading the
 * version at runtime is therefore out, and the literal is rewritten instead.
 *
 * Runs as part of `changeset version` (see the root `version:packages` script),
 * so a rewritten literal lands in the same "Version Packages" commit that bumps
 * the manifests and can never disagree with one on `main`. The three tests that
 * assert the agreement — `api.version.test.ts`, `conformance.test.ts`,
 * `measured.test.ts` — stay the backstop for a site this list doesn't know.
 *
 * Usage:
 *   node scripts/sync-versions.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from './package-version.mjs';

/**
 * Each site names the package whose version governs it and a pattern whose one
 * capture group is the literal to replace. A pattern that does not match
 * exactly once is a hard error: it means the constant was renamed or duplicated
 * and this script would otherwise silently stop maintaining it.
 */
const SITES = [
    {
        file: 'packages/core/src/lib/plugin/api.ts',
        pkg: 'packages/core',
        pattern: /(?<=^export const CORE_VERSION = ')[^']+(?=';$)/m,
    },
    {
        file: 'packages/plugin-av/src/identity.ts',
        pkg: 'packages/plugin-av',
        pattern: /(?<=^ {4}version: ')[^']+(?=',$)/m,
    },
    {
        file: 'packages/comparison/src/competitors.ts',
        pkg: 'packages/core',
        pattern: /(?<=^const TRIIICERATOPS_VERSION = ')[^']+(?=';$)/m,
    },
    {
        file: 'packages/comparison/src/competitors.ts',
        pkg: 'packages/plugin-av',
        pattern: /(?<=^const PLUGIN_AV_VERSION = ')[^']+(?=';$)/m,
    },
];

function versionOf(pkgDir) {
    const manifest = join(REPO_ROOT, pkgDir, 'package.json');
    const { version } = JSON.parse(readFileSync(manifest, 'utf8'));
    if (!version) throw new Error(`${pkgDir}/package.json has no "version"`);
    return version;
}

let changed = 0;
for (const site of SITES) {
    const path = join(REPO_ROOT, site.file);
    const source = readFileSync(path, 'utf8');

    const matches = source.match(new RegExp(site.pattern, 'gm'));
    if (matches?.length !== 1) {
        throw new Error(
            `${site.file}: expected 1 match for ${site.pattern}, found ${matches?.length ?? 0}. ` +
                `The constant moved or was renamed — update scripts/sync-versions.mjs.`,
        );
    }

    const want = versionOf(site.pkg);
    if (matches[0] === want) continue;

    writeFileSync(path, source.replace(site.pattern, want));
    console.log(`sync-versions: ${site.file} ${matches[0]} -> ${want}`);
    changed += 1;
}

console.log(
    changed === 0
        ? `sync-versions: ${SITES.length} version literal(s) already match their manifest.`
        : `sync-versions: rewrote ${changed} of ${SITES.length} version literal(s).`,
);
