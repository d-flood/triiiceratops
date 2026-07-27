#!/usr/bin/env node
// Single source of truth for the published documentation version (ticket 39).
//
// The version shown in the site chrome and the version subdirectory a release
// publishes into are both DERIVED from the core `package.json` version — never
// hand-maintained. Ticket 26 shipped a version-stamped single site using a
// hardcoded "1.0 release line" string; this replaces that string with a value
// computed at the docs build.
//
// Usage:
//   node scripts/docs-version.mjs            # prints the docs version (e.g. 1.0)
//   node scripts/docs-version.mjs --full     # prints the full package version

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(HERE, '..');

// The docs version tracks the CORE package (`triiiceratops`), which lives in the
// pnpm workspace at packages/core — NOT the workspace root (whose version is a
// placeholder 0.0.0).
const CORE_PACKAGE_JSON = join(REPO_ROOT, 'packages', 'core', 'package.json');

/** Full version string of the core package, e.g. "1.0.0-rc.25" or "1.0.0". */
export function packageVersion() {
    const pkg = JSON.parse(readFileSync(CORE_PACKAGE_JSON, 'utf8'));
    if (!pkg.version) throw new Error('core package.json has no "version"');
    return pkg.version;
}

/**
 * The documentation version directory: `major.minor` of the package version.
 *
 * Patch and RC releases refresh their minor line's docs in place (1.0.0,
 * 1.0.1, 1.0.0-rc.25 → "1.0"); a new minor (1.1.x) publishes alongside "1.0"
 * without touching it. This is what satisfies the contract "a deploy of v1.1
 * docs must not touch /1.0/".
 */
export function docsVersion(version = packageVersion()) {
    const m = /^(\d+)\.(\d+)\./.exec(version);
    if (!m) throw new Error(`unrecognised version string: ${version}`);
    return `${m[1]}.${m[2]}`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const out = process.argv.includes('--full')
        ? packageVersion()
        : docsVersion();
    process.stdout.write(out + '\n');
}
