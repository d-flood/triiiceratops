// Single source of truth for the six publishable packages, in dependency order
// (core first: the SDK and every plugin type-check against core's built dist,
// so it must be built + packed before them).
//
// Shared by the release tooling so the pack step, the reproducibility check, and
// the registry smoke job never drift on which packages ship or what order they
// build in:
//   · pack-artifacts.mjs     — builds + packs the six .tgz that CI promotes
//   · verify-reproducible.mjs — two clean builds must yield identical checksums
//   · smoke-registry.mjs      — installs the exact published versions post-publish

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
);

/**
 * The six publishable packages. `build` lists the package scripts that must run
 * (in order) before packing so the packed `dist/` is complete — these mirror the
 * packed-consumer harness (`test-consumers/driver/run.mjs`) exactly, which is
 * itself part of required CI. `dir` is the package directory under `packages/`.
 */
export const PUBLISHABLE_PACKAGES = [
    {
        name: 'triiiceratops',
        dir: 'core',
        // build:testing compiles the headless `triiiceratops/testing` entry AFTER
        // build:lib (needs the generated paraglide runtime + dist types).
        build: ['build:lib', 'build:testing', 'build:element'],
    },
    { name: '@triiiceratops/plugin-sdk', dir: 'plugin-sdk', build: ['build'] },
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

/** Read a package's current version from its committed package.json. */
export function readVersion(pkg) {
    const manifest = JSON.parse(
        readFileSync(
            join(REPO_ROOT, 'packages', pkg.dir, 'package.json'),
            'utf8',
        ),
    );
    return manifest.version;
}

/**
 * The dist-tag a version publishes under.
 *
 * While the repo is in changesets "pre" mode there is NO stable release yet, so
 * the newest prerelease is exactly what a bare `npm install` (i.e. `@latest`)
 * should resolve to — publish it to `latest`. This is the ONLY lever we have:
 * the project publishes via npm OIDC trusted publishing, which sets a package's
 * dist-tag at publish time and cannot run `npm dist-tag` afterwards (that needs a
 * classic token we deliberately don't have). So the tag a version lands on is
 * decided here and baked into the release manifest.
 *
 * Once pre mode is exited, normal npm convention resumes: a prerelease
 * (`1.0.0-rc.N`) publishes under its prerelease tag (`rc`), and a stable version
 * publishes under `latest`.
 *
 * Trade-off during pre mode: because a publish sets exactly one tag, the separate
 * `rc` tag is not advanced while we point `latest` at the newest rc. That's
 * acceptable pre-1.0 (`@latest` and the newest rc are the same thing), and the
 * `rc` tag resumes tracking prereleases the moment a stable release exists.
 */
export function distTagFor(version) {
    if (existsSync(join(REPO_ROOT, '.changeset', 'pre.json'))) return 'latest';
    if (version.includes('-')) return version.split('-')[1].split('.')[0];
    return 'latest';
}
