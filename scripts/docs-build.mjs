#!/usr/bin/env node
// Build the docs site with the release version stamped into the chrome.
// This is the engine behind `pnpm docs:build`.
//
// The committed `zensical.toml` stays version-agnostic (developer preview). At
// build time we derive the version from the core package.json and write an
// *effective* config that injects it into `[project.extra]`; `overrides/main.html`
// renders the version banner from those keys. For a versioned publish
// (`--version X.Y`) the `site_url` is additionally suffixed with `docs/<version>/`
// — the path the documentation publishes at, see docs-publish.mjs — so canonical
// URLs and the sitemap are correct for that subdirectory, and the banner links to
// the other published versions.
//
// Usage:
//   node scripts/docs-build.mjs                 # unversioned developer build
//   node scripts/docs-build.mjs --version 1.0   # versioned build for publishing
//   node scripts/docs-build.mjs --no-strict     # (tests/preview) don't fail on warnings

import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT, docsVersion, packageVersion } from './docs-version.mjs';

// The canonical site root. Must match `site_url` in zensical.toml.
const BASE_URL = 'https://triiiceratops.org/';
const EFFECTIVE_CONFIG = join(REPO_ROOT, '.zensical.effective.toml');

function parseArgs(argv) {
    const args = { versioned: false, strict: true, clean: true };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--version') {
            args.versioned = true;
            args.version = argv[++i];
        } else if (a === '--versioned') {
            args.versioned = true;
        } else if (a === '--no-strict') {
            args.strict = false;
        } else if (a === '--no-clean') {
            args.clean = false;
        } else {
            throw new Error(`unknown argument: ${a}`);
        }
    }
    return args;
}

/** Insert dotted `[project.extra]` keys immediately after the `[project]` header. */
function withExtra(toml, extra) {
    const injected = Object.entries(extra)
        .map(([k, v]) => `extra.${k} = ${JSON.stringify(v)}`)
        .join('\n');
    if (!/^\[project\]\s*$/m.test(toml)) {
        throw new Error('zensical.toml: [project] table header not found');
    }
    return toml.replace(/^\[project\]\s*$/m, (m) => `${m}\n${injected}`);
}

/** Produce the effective config text for the given options. Exported for tests. */
export function effectiveConfig(base, { versioned, version, fullVersion }) {
    const extra = { docs_version: version, docs_full_version: fullVersion };
    let toml = base;
    if (versioned) {
        const url = `${BASE_URL}docs/${version}/`;
        const before = `site_url = "${BASE_URL}"`;
        if (!toml.includes(before)) {
            throw new Error(
                `zensical.toml: expected site_url line ${JSON.stringify(before)}`,
            );
        }
        toml = toml.replace(before, `site_url = "${url}"`);
        // The human-browsable version index lives at <root>/versions/, outside
        // the version directory. Absolute, not relative: overrides/main.html
        // emits this href verbatim, and every documentation page sits at a
        // different depth below /docs/<version>/, so no single relative path is
        // correct for all of them.
        extra.docs_versions_url = `${BASE_URL}versions/`;
    }
    return withExtra(toml, extra);
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    const fullVersion = packageVersion();
    const version = args.version ?? docsVersion(fullVersion);

    const base = readFileSync(join(REPO_ROOT, 'zensical.toml'), 'utf8');
    const toml = effectiveConfig(base, {
        versioned: args.versioned,
        version,
        fullVersion,
    });

    writeFileSync(EFFECTIVE_CONFIG, toml, 'utf8');
    try {
        const flags = ['build', '-f', EFFECTIVE_CONFIG];
        if (args.clean) flags.push('--clean');
        if (args.strict) flags.push('--strict');
        execFileSync('zensical', flags, { stdio: 'inherit', cwd: REPO_ROOT });
    } finally {
        rmSync(EFFECTIVE_CONFIG, { force: true });
    }
    const where = args.versioned ? `version ${version}` : 'unversioned preview';
    console.log(`docs-build: built ${where} into site/`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
