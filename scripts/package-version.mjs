#!/usr/bin/env node
// The published version, derived from the core package.json.

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(HERE, '..');

// Core package, not the workspace root placeholder.
const CORE_PACKAGE_JSON = join(REPO_ROOT, 'packages', 'core', 'package.json');

/** Full version string of the core package. */
export function packageVersion() {
    const pkg = JSON.parse(readFileSync(CORE_PACKAGE_JSON, 'utf8'));
    if (!pkg.version) throw new Error('core package.json has no "version"');
    return pkg.version;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    process.stdout.write(packageVersion() + '\n');
}
