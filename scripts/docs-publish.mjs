#!/usr/bin/env node
// Publish-layer documentation versioning.
//
// Zensical has no native versioning: its own docs describe the `mike` fork as
// "a bridge solution until we introduce native versioning support", and that
// fork is git-install-only and requires a gh-pages-branch deploy model — which
// conflicts with this repo's artifact-based GitHub Pages deploy. So versioning
// is handled here, at the publish layer.
//
// This script places a freshly built site under a version subdirectory of a
// publish root, PRESERVING every previously published version directory
// (old versions are immutable), and (re)generates a mike-compatible
// `versions.json` plus root and `/latest/` redirects that point at the newest
// published version.
//
// The `/viewer/` live demo is the one exception to versioning: IIIF cookbook
// recipes link to it directly, so it is pulled out of the version directory
// and published at a stable, unversioned top-level path instead — always
// reflecting the latest build, not preserved per-version.
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

// ---------------------------------------------------------------------------
// Social-preview metadata for the pages generated below.
//
// These pages are NOT rendered by Zensical, so they cannot use
// overrides/partials/social-meta.html — see that file's header, which lists every
// page that has to carry its own copy.
//
// This matters most for the publish ROOT. `https://d-flood.github.io/triiiceratops/`
// is the URL people actually paste into a post, and it is a redirect stub. Most
// social scrapers follow HTTP 3xx redirects but NOT `<meta http-equiv="refresh">`
// — Facebook's crawler in particular — so they scrape THIS document and never see
// the versioned page it forwards to. Without the tags below, the most-shared URL
// on the site previews as a bare title and no image.
// ---------------------------------------------------------------------------
const SITE_ROOT = 'https://d-flood.github.io/triiiceratops/';
const SITE_NAME = 'Triiiceratops IIIF Viewer';
// Absolute, and outside any version directory: scrapers cache preview images by
// URL for days-to-weeks, so every release resolves to the same cached file. The
// `-v1` suffix is the only way to invalidate that cache — see
// scripts/social-cards.README.md before renaming it.
const OG_IMAGE = `${SITE_ROOT}social/og-docs-v1.png`;
const OG_IMAGE_ALT =
    'Triiiceratops: an IIIF viewer with first-class React, Vue and Svelte components, plus a web component for Django, WordPress or plain HTML.';
const TWITTER_HANDLE = '@FloodDavid';
const FEDIVERSE_CREATOR = '@davidflood@fosstodon.org';
const THEME_COLOR = '#e9ab2b';

/** The shared Open Graph / X card block, absolute URLs throughout. */
function socialMeta({ url, title, description }) {
    return `    <meta name="description" content="${description}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${SITE_NAME}" />
    <meta property="og:locale" content="en_US" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:image" content="${OG_IMAGE}" />
    <meta property="og:image:secure_url" content="${OG_IMAGE}" />
    <meta property="og:image:type" content="image/png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${OG_IMAGE_ALT}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:site" content="${TWITTER_HANDLE}" />
    <meta name="twitter:creator" content="${TWITTER_HANDLE}" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="${OG_IMAGE}" />
    <meta name="twitter:image:alt" content="${OG_IMAGE_ALT}" />
    <meta name="fediverse:creator" content="${FEDIVERSE_CREATOR}" />
    <meta name="theme-color" content="${THEME_COLOR}" />`;
}

function redirectHtml(target, title, { url, description }) {
    // Standards-compliant client redirect: HTTP-equiv refresh + canonical +
    // a manual link fallback. Kept dependency-free and self-contained.
    //
    // `robots: noindex` keeps the stub itself out of search results; `canonical`
    // is what consolidates ranking onto the versioned page. Social scrapers build
    // previews regardless of `noindex`, so the card below still renders.
    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <link rel="canonical" href="${target}" />
    <meta http-equiv="refresh" content="0; url=${target}" />
    <meta name="robots" content="noindex" />
${socialMeta({ url, title, description })}
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
    <link rel="canonical" href="${SITE_ROOT}versions/" />
${socialMeta({
    url: `${SITE_ROOT}versions/`,
    title: 'Triiiceratops documentation versions',
    description:
        'Every published version of the Triiiceratops IIIF viewer documentation.',
})}
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
    //    `viewer/` is excluded here — see step 2b — because it can't live
    //    inside a version directory.
    mkdirSync(args.dest, { recursive: true });
    const versionDest = join(args.dest, version);
    const viewerSrc = join(args.site, 'viewer');
    rmSync(versionDest, { recursive: true, force: true });
    cpSync(args.site, versionDest, {
        recursive: true,
        filter: (src) => src !== viewerSrc,
    });

    // 2b. The `/viewer/` demo is linked to directly by external IIIF cookbook
    // recipes, so its URL must stay stable across releases instead of moving
    // to /<version>/viewer/. Publish it at the top level, outside any version
    // directory. Unlike the version directories, it is NOT preserved
    // historically — each deploy overwrites it with the latest build.
    if (existsSync(viewerSrc)) {
        const viewerDest = join(args.dest, 'viewer');
        rmSync(viewerDest, { recursive: true, force: true });
        cpSync(viewerSrc, viewerDest, { recursive: true });
    }

    // 3. Recompute the version set and the newest version.
    const versions = publishedVersions(args.dest); // newest first
    const latest = versions[0];

    // 4. (Re)generate the switcher data + redirects. These live OUTSIDE any
    //    version directory, so regenerating them never mutates old versions.
    writeVersionsJson(args.dest, versions, latest);
    writeVersionsIndex(args.dest, versions, latest);
    writeFileSync(
        join(args.dest, 'index.html'),
        redirectHtml(`./${latest}/`, SITE_NAME, {
            url: SITE_ROOT,
            description:
                'A modern, lightweight IIIF viewer: first-class React, Vue and Svelte components, a web component for everywhere else, and a versioned plugin SDK.',
        }),
        'utf8',
    );
    const latestDir = join(args.dest, 'latest');
    mkdirSync(latestDir, { recursive: true });
    writeFileSync(
        join(latestDir, 'index.html'),
        redirectHtml(`../${latest}/`, `${SITE_NAME} (latest)`, {
            url: `${SITE_ROOT}latest/`,
            description:
                'The latest Triiiceratops IIIF viewer documentation: React, Vue and Svelte components, the web component, theming, and the plugin SDK.',
        }),
        'utf8',
    );

    // 5. The social card images, at an unversioned top-level path. They must NOT
    //    live inside a version directory: scrapers cache preview images by URL for
    //    days-to-weeks, so a per-release path would mean a fresh cache miss (and a
    //    briefly imageless card) on every publish. Every page's og:image points
    //    here — see overrides/partials/social-meta.html.
    const socialSrc = join(args.site, 'media', 'social');
    if (existsSync(socialSrc)) {
        const socialDest = join(args.dest, 'social');
        rmSync(socialDest, { recursive: true, force: true });
        cpSync(socialSrc, socialDest, {
            recursive: true,
            // Allowlist, not denylist: copy the directory itself and the card
            // PNGs, nothing else. `src/` holds the raw viewer screenshot the
            // cards are composed from (build input, not a card), and anything
            // else that lands in docs/media/social/ later — a stray Markdown
            // file, say, which Zensical would also render into the site — should
            // not silently become a public /social/ URL.
            filter: (src) => src === socialSrc || src.endsWith('.png'),
        });
    } else {
        console.warn(
            `docs-publish: WARNING no social cards at ${socialSrc} — ` +
                'shared links will preview without an image',
        );
    }

    console.log(
        `docs-publish: published v${version} to ${versionDest}\n` +
            `  versions: ${versions.map((v) => (v === latest ? `${v} (latest)` : v)).join(', ')}`,
    );
}

if (import.meta.url === `file://${process.argv[1]}`) main();
