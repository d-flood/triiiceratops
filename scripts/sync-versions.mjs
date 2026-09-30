/** Rewrites version literals that track a package manifest. */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from './package-version.mjs';

/** Each site names a package version and the literal to replace; must match exactly once. */
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
        file: 'packages/plugin-annotation-editor/src/identity.ts',
        pkg: 'packages/plugin-annotation-editor',
        pattern: /(?<=^ {4}version: ')[^']+(?=',$)/m,
    },
    {
        file: 'packages/plugin-image-export/src/identity.ts',
        pkg: 'packages/plugin-image-export',
        pattern: /(?<=^ {4}version: ')[^']+(?=',$)/m,
    },
    {
        file: 'packages/plugin-image-manipulation/src/plugin.ts',
        pkg: 'packages/plugin-image-manipulation',
        pattern: /(?<=^ {4}version: ')[^']+(?=',$)/m,
    },
    {
        file: 'packages/plugin-pdf-export/src/identity.ts',
        pkg: 'packages/plugin-pdf-export',
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
