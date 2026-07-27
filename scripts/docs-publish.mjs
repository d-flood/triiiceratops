#!/usr/bin/env node
// Publish-layer documentation versioning (ticket 39).
//
// Zensical has no native versioning: its own docs describe the `mike` fork as
// "a bridge solution until we introduce native versioning support", and that
// fork is git-install-only and requires a gh-pages-branch deploy model — which
// conflicts with this repo's artifact-based GitHub Pages deploy. So versioning
// is handled here, at the publish layer, exactly as the ticket's contract
// allows.
//
// This script places a freshly built site under a version subdirectory of a
// publish root, PRESERVING every previously published version directory
// (old versions are immutable), and (re)generates a mike-compatible
// `versions.json` plus root and `/latest/` redirects that point at the newest
// published version.
//
// Usage:
//   node scripts/docs-publish.mjs --dest <publishRoot> [--version X.Y] [--site <dir>] [--no-build]
//
// By default it builds the versioned site itself (docs-build.mjs --version)
// into `site/` and copies that in. Pass `--no-build` to publish an
// already-built `--site <dir>` (e.g. in CI, after the JS asset pipeline has
// populated docs/ and the versioned build has run).

import { execFileSync } from 'node:child_process';
import {
    cpSync,
    existsSync,
    mkdirSync,
    readdirSync,
    rmSync,
    statSync,
    writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT, docsVersion, packageVersion } from './docs-version.mjs';

const VERSION_DIR = /^(\d+)\.(\d+)$/;

function parseArgs(argv) {
    const args = { site: join(REPO_ROOT, 'site'), build: true };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--dest') args.dest = argv[++i];
        else if (a === '--version') args.version = argv[++i];
        else if (a === '--site') args.site = argv[++i];
        else if (a === '--no-build') args.build = false;
        else throw new Error(`unknown argument: ${a}`);
    }
    if (!args.dest) throw new Error('--dest <publishRoot> is required');
    return args;
}

/** Numeric major.minor sort key so "1.10" sorts after "1.9". */
function versionKey(dir) {
    const m = VERSION_DIR.exec(dir);
    return m ? Number(m[1]) * 1_000_000 + Number(m[2]) : -1;
}

/** All published version directories present in the publish root, newest first. */
function publishedVersions(dest) {
    if (!existsSync(dest)) return [];
    return readdirSync(dest)
        .filter(
            (e) => VERSION_DIR.test(e) && statSync(join(dest, e)).isDirectory(),
        )
        .sort((a, b) => versionKey(b) - versionKey(a));
}

function redirectHtml(target, title) {
    // Standards-compliant client redirect: HTTP-equiv refresh + canonical +
    // a manual link fallback. Kept dependency-free and self-contained.
    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <link rel="canonical" href="${target}" />
    <meta http-equiv="refresh" content="0; url=${target}" />
    <meta name="robots" content="noindex" />
    <script>window.location.replace(${JSON.stringify(target)});</script>
  </head>
  <body>
    <p>Redirecting to <a href="${target}">the latest documentation</a>.</p>
  </body>
</html>
`;
}

function writeVersionsJson(dest, versions, latest) {
    // mike-compatible schema: newest first, latest carries the "latest" alias.
    const entries = versions.map((v) => ({
        version: v,
        title: `v${v}`,
        aliases: v === latest ? ['latest'] : [],
    }));
    writeFileSync(
        join(dest, 'versions.json'),
        JSON.stringify(entries, null, 2) + '\n',
        'utf8',
    );
}

/** A self-contained, human-browsable version index (the "other versions" page). */
function writeVersionsIndex(dest, versions, latest) {
    const items = versions
        .map(
            (v) =>
                `      <li><a href="../${v}/">Triiiceratops v${v}</a>${
                    v === latest ? ' <span class="latest">latest</span>' : ''
                }</li>`,
        )
        .join('\n');
    const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Triiiceratops documentation versions</title>
    <style>
      body { font-family: system-ui, sans-serif; max-width: 40rem; margin: 4rem auto; padding: 0 1rem; line-height: 1.6; }
      h1 { font-size: 1.5rem; }
      ul { list-style: none; padding: 0; }
      li { padding: 0.5rem 0; border-bottom: 1px solid #ddd; }
      .latest { font-size: 0.75rem; background: #2e7d32; color: #fff; padding: 0.1rem 0.4rem; border-radius: 0.25rem; margin-left: 0.5rem; }
      @media (prefers-color-scheme: dark) { body { background: #111; color: #eee; } li { border-color: #333; } a { color: #7ab7ff; } }
    </style>
  </head>
  <body>
    <h1>Triiiceratops documentation versions</h1>
    <p>Choose a version of the documentation:</p>
    <ul>
${items}
    </ul>
  </body>
</html>
`;
    const dir = join(dest, 'versions');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'index.html'), html, 'utf8');
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    const fullVersion = packageVersion();
    const version = args.version ?? docsVersion(fullVersion);
    if (!VERSION_DIR.test(version)) {
        throw new Error(
            `--version must be major.minor (e.g. 1.0); got ${version}`,
        );
    }

    // 1. Build the versioned site unless one was provided.
    if (args.build) {
        execFileSync(
            'node',
            [
                join(REPO_ROOT, 'scripts', 'docs-build.mjs'),
                '--version',
                version,
            ],
            { stdio: 'inherit', cwd: REPO_ROOT },
        );
    }
    if (!existsSync(join(args.site, 'index.html'))) {
        throw new Error(`built site not found at ${args.site}/index.html`);
    }

    // 2. Place it under /<version>/, replacing ONLY that version directory.
    mkdirSync(args.dest, { recursive: true });
    const versionDest = join(args.dest, version);
    rmSync(versionDest, { recursive: true, force: true });
    cpSync(args.site, versionDest, { recursive: true });

    // 3. Recompute the version set and the newest version.
    const versions = publishedVersions(args.dest); // newest first
    const latest = versions[0];

    // 4. (Re)generate the switcher data + redirects. These live OUTSIDE any
    //    version directory, so regenerating them never mutates old versions.
    writeVersionsJson(args.dest, versions, latest);
    writeVersionsIndex(args.dest, versions, latest);
    writeFileSync(
        join(args.dest, 'index.html'),
        redirectHtml(`./${latest}/`, 'Triiiceratops documentation'),
        'utf8',
    );
    const latestDir = join(args.dest, 'latest');
    mkdirSync(latestDir, { recursive: true });
    writeFileSync(
        join(latestDir, 'index.html'),
        redirectHtml(`../${latest}/`, 'Triiiceratops documentation (latest)'),
        'utf8',
    );

    console.log(
        `docs-publish: published v${version} to ${versionDest}\n` +
            `  versions: ${versions.map((v) => (v === latest ? `${v} (latest)` : v)).join(', ')}`,
    );
}

if (import.meta.url === `file://${process.argv[1]}`) main();
