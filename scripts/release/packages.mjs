// Publishable packages in dependency order. Shared by the release tooling.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
);

/** The publishable packages. `dir` is the directory under `packages/`. */
export const PUBLISHABLE_PACKAGES = [
    {
        name: 'triiiceratops',
        dir: 'core',
        build: ['build:lib', 'build:testing', 'build:element'],
    },
    { name: '@triiiceratops/plugin-sdk', dir: 'plugin-sdk', build: ['build'] },
    {
        name: '@triiiceratops/plugin-av',
        dir: 'plugin-av',
        build: ['build'],
    },
    {
        name: '@triiiceratops/plugin-image-manipulation',
        dir: 'plugin-image-manipulation',
        build: ['build'],
    },
    {
        name: '@triiiceratops/plugin-image-export',
        dir: 'plugin-image-export',
        build: ['build'],
    },
    {
        name: '@triiiceratops/plugin-pdf-export',
        dir: 'plugin-pdf-export',
        build: ['build'],
    },
    {
        name: '@triiiceratops/plugin-annotation-editor',
        dir: 'plugin-annotation-editor',
        build: ['build'],
    },
];

/** Read a package's version from its committed package.json. */
export function readVersion(pkg) {
    const manifest = JSON.parse(
        readFileSync(
            join(REPO_ROOT, 'packages', pkg.dir, 'package.json'),
            'utf8',
        ),
    );
    return manifest.version;
}

/** The dist-tag a version publishes under. In changesets pre mode everything lands on `latest`. */
export function distTagFor(version) {
    if (existsSync(join(REPO_ROOT, '.changeset', 'pre.json'))) return 'latest';
    if (version.includes('-')) return version.split('-')[1].split('.')[0];
    return 'latest';
}
