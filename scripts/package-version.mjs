#!/usr/bin/env node
// The published version, and the repository root every other script resolves
// paths from.
//
// The version shown in the site chrome is DERIVED from the core `package.json`
// version — never hand-maintained. There is no documentation version: one build
// emits one documentation tree.
//
// Usage:
//   node scripts/package-version.mjs        # prints e.g. 1.0.0-rc.36

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(HERE, '..');

// The version tracks the CORE package (`triiiceratops`), which lives in the
// pnpm workspace at packages/core — NOT the workspace root (whose version is a
// placeholder 0.0.0).
const CORE_PACKAGE_JSON = join(REPO_ROOT, 'packages', 'core', 'package.json');

/** Full version string of the core package, e.g. "1.0.0-rc.36" or "1.0.0". */
export function packageVersion() {
    const pkg = JSON.parse(readFileSync(CORE_PACKAGE_JSON, 'utf8'));
    if (!pkg.version) throw new Error('core package.json has no "version"');
    return pkg.version;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    process.stdout.write(packageVersion() + '\n');
}
