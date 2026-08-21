#!/usr/bin/env node
// Site assembly and publish-layer documentation versioning.
//
// `docs/` holds only Markdown and hand-authored assets. Nothing builds into it.
// The published tree is assembled HERE, in the assembly root given by `--dest`,
// from Zensical's output plus each application's own build output:
//
//   <dest>/docs/<major.minor>/   Zensical's `site/` + apps/examples/dist/
//                                (its `examples/` and `dist/` subtrees)
//   <dest>/viewer/               apps/viewer/dist/
//   <dest>/demo/                 apps/demo/dist/
//   <dest>/{index.html,404.html} apps/landing/ verbatim — the site root is a
//                                real page, not a redirect
//   <dest>/{latest/,versions/,versions.json,social/}  generated below
//
// Each subtree has exactly one owner and is written only by the job that owns
// it. `--only <names>` selects which of `docs,examples,viewer,demo,landing` this
// run rebuilds; unselected subtrees are left exactly as the assembly root
// already holds them, which is how a documentation typo fix leaves the viewer
// bytes untouched. The publish-job-owned pieces — `versions.json`,
// `/versions/`, `/latest/` and `/social/` — are regenerated on every run: they
// are cheap, and all four are derived from the tree rather than from a build.
//
// CI assembles into `published/` (restored from the durable `docs-site` branch
// first, so untouched version directories and unselected subtrees survive); a
// local check can point `--dest` at any scratch directory.
//
// Zensical has no native versioning: its own docs describe the `mike` fork as
// "a bridge solution until we introduce native versioning support", and that
// fork is git-install-only and requires a gh-pages-branch deploy model — which
// conflicts with this repo's artifact-based GitHub Pages deploy. So versioning
// is handled here, at the publish layer. Previously published version
// directories are immutable and are preserved on every run.
//
// `/viewer/` and `/demo/` are unversioned. IIIF cookbook recipes link the bare
// viewer directly, so its URL must stay stable across releases; the playground is
// likewise the current build rather than a release artifact. Both are overwritten
// on every deploy instead of being preserved per version.
//
// Usage:
//   node scripts/docs-publish.mjs --dest <assemblyRoot> [--version X.Y] [--site <dir>]
//                                 [--no-build] [--only docs,viewer,demo,landing]
//
// By default it builds the versioned site itself (docs-build.mjs --version)
// into `site/` and copies that in. Pass `--no-build` to publish an
// already-built `--site <dir>`. Application build outputs are always taken from
// the workspace rather than produced here, so the build for each SELECTED
// subtree must have run first — `pnpm build:all` covers every subtree, and a
// run narrowed with `--only` needs only that subtree's build.

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

// `examples` is accepted as a name of its own because the ownership table names
// it, but it and `docs` co-own one version directory: the examples build merges
// into the Zensical output, so neither can be placed without the other.
const SUBTREES = ['docs', 'examples', 'viewer', 'demo', 'landing'];

function parseArgs(argv) {
    const args = { site: join(REPO_ROOT, 'site'), build: true, only: null };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--dest') args.dest = argv[++i];
        else if (a === '--version') args.version = argv[++i];
        else if (a === '--site') args.site = argv[++i];
        else if (a === '--no-build') args.build = false;
        else if (a === '--only') args.only = argv[++i];
        else throw new Error(`unknown argument: ${a}`);
    }
    if (!args.dest) throw new Error('--dest <assemblyRoot> is required');
    return args;
}

/** The set of subtrees this run rebuilds; `--only` absent means all of them. */
function selectedSubtrees(only) {
    if (only == null) return new Set(SUBTREES);
    const names = only
        .split(',')
        .map((n) => n.trim())
        .filter(Boolean);
    const unknown = names.filter((n) => !SUBTREES.includes(n));
    if (unknown.length > 0) {
        throw new Error(
            `--only: unknown subtree(s) ${unknown.join(', ')}; ` +
                `expected a comma-separated subset of ${SUBTREES.join(',')}`,
        );
    }
    if (names.length === 0)
        throw new Error('--only requires at least one name');
    const selected = new Set(names);
    // The docs version directory is one unit: placing Zensical's output without
    // the examples build, or the reverse, publishes a half-written directory.
    if (selected.has('docs') || selected.has('examples')) {
        selected.add('docs');
        selected.add('examples');
    }
    return selected;
}

/** Numeric major.minor sort key so "1.10" sorts after "1.9". */
function versionKey(dir) {
    const m = VERSION_DIR.exec(dir);
    return m ? Number(m[1]) * 1_000_000 + Number(m[2]) : -1;
}

/** All published version directories under <dest>/docs, newest first. */
function publishedVersions(dest) {
    const docsRoot = join(dest, 'docs');
    if (!existsSync(docsRoot)) return [];
    return readdirSync(docsRoot)
        .filter(
            (e) =>
                VERSION_DIR.test(e) &&
                statSync(join(docsRoot, e)).isDirectory(),
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
// It matters most for `/latest/`, which is a redirect stub. Most social scrapers
// follow HTTP 3xx redirects but NOT `<meta http-equiv="refresh">` — Facebook's
// crawler in particular — so a scraper handed `/latest/` reads THAT document and
// never sees the versioned page it forwards to. Without the tags below it would
// preview as a bare title and no image.
//
// The site root needs nothing from here: it is the landing page, a real document
// carrying its own tags (see apps/landing/index.html).
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
                `      <li><a href="../docs/${v}/">Triiiceratops v${v}</a>${
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

/** An application's build output is a required input, not an optional extra. */
function requireBuildOutput(dir, command) {
    if (!existsSync(dir)) {
        throw new Error(
            `missing build output at ${dir} — run \`${command}\` (or \`pnpm build:all\`) first`,
        );
    }
}

/** Like requireBuildOutput, for sources checked in rather than built. */
function requireCommittedSource(path, what) {
    if (!existsSync(path)) {
        throw new Error(
            `missing ${what} at ${path} — it is committed, not built`,
        );
    }
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

    const selected = selectedSubtrees(args.only);

    // 1. The documentation version directory: Zensical's output plus the
    //    examples build, replacing ONLY that version directory.
    const versionDest = join(args.dest, 'docs', version);
    if (selected.has('docs')) {
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

        mkdirSync(join(args.dest, 'docs'), { recursive: true });
        rmSync(versionDest, { recursive: true, force: true });
        cpSync(args.site, versionDest, { recursive: true });

        // The examples application owns two subtrees of the version directory:
        // `examples/` (the three framework consumer pages) and `dist/` (this
        // release's built bundles, which the web-component and plain-HTML
        // examples load by relative path). Its build output mirrors that layout
        // exactly, so it merges in as-is.
        const examplesSrc = join(REPO_ROOT, 'apps', 'examples', 'dist');
        requireBuildOutput(examplesSrc, 'pnpm build:examples');
        cpSync(examplesSrc, versionDest, { recursive: true });
    }

    // 2. The bare viewer and the playground are unversioned. Cookbook recipes
    // link `/viewer/` directly, so its URL must stay stable across releases; the
    // playground is the current build rather than a release artifact. Neither is
    // preserved historically — a run that owns one overwrites it.
    for (const app of ['viewer', 'demo']) {
        if (!selected.has(app)) continue;
        const src = join(REPO_ROOT, 'apps', app, 'dist');
        requireBuildOutput(src, `pnpm build:${app}`);
        const dest = join(args.dest, app);
        rmSync(dest, { recursive: true, force: true });
        cpSync(src, dest, { recursive: true });
    }

    // 3. The landing page and the not-found page: static HTML with no build
    // step, so they are copied straight from the workspace. The root is a real
    // page rather than a redirect, and it owns its own canonical and og:url.
    if (selected.has('landing')) {
        const landingSrc = join(REPO_ROOT, 'apps', 'landing');
        for (const file of ['index.html', '404.html']) {
            const src = join(landingSrc, file);
            requireCommittedSource(src, `landing ${file}`);
            cpSync(src, join(args.dest, file));
        }
    }

    // 4. Recompute the version set and the newest version. This reads the tree
    //    rather than this run's inputs, so it sees versions published by earlier
    //    deploys as well as the one just placed.
    const versions = publishedVersions(args.dest); // newest first
    const latest = versions[0];

    // 5. (Re)generate the switcher data + the `/latest/` redirect. These live
    //    OUTSIDE any version directory, so regenerating them never mutates old
    //    versions, and they are owned by the publish job on every run.
    //
    //    All three describe the version directories in the tree, so with no
    //    version directory there is nothing truthful to write: every one of them
    //    would name a version that does not exist. They are left exactly as the
    //    tree already holds them instead — an empty `versions.json` and a
    //    `/latest/` forwarding nowhere are worse than the previous deploy's.
    if (versions.length === 0) {
        console.warn(
            `docs-publish: WARNING ${args.dest} holds no docs/<major.minor> ` +
                'directory, so versions.json, /versions/ and /latest/ were left ' +
                'untouched. Publish a documentation version to generate them.',
        );
    } else {
        writeVersionsJson(args.dest, versions, latest);
        writeVersionsIndex(args.dest, versions, latest);
        const latestDir = join(args.dest, 'latest');
        mkdirSync(latestDir, { recursive: true });
        writeFileSync(
            join(latestDir, 'index.html'),
            redirectHtml(`../docs/${latest}/`, `${SITE_NAME} (latest)`, {
                url: `${SITE_ROOT}latest/`,
                description:
                    'The latest Triiiceratops IIIF viewer documentation: React, Vue and Svelte components, the web component, theming, and the plugin SDK.',
            }),
            'utf8',
        );
    }

    // 6. The social card images, at an unversioned top-level path. They must NOT
    //    live inside a version directory: scrapers cache preview images by URL for
    //    days-to-weeks, so a per-release path would mean a fresh cache miss (and a
    //    briefly imageless card) on every publish. Every page's og:image points
    //    here — see overrides/partials/social-meta.html and the landing page,
    //    which hardcodes /social/og-landing-v1.png.
    //
    //    Sourced from the committed `docs/media/social/`, not from Zensical's
    //    output: `/social/` is publish-job-owned on any publish, so a run that
    //    rebuilds only the landing page or only the viewer must still be able to
    //    populate it without a documentation build having happened.
    const socialSrc = join(REPO_ROOT, 'docs', 'media', 'social');
    if (existsSync(socialSrc)) {
        const socialDest = join(args.dest, 'social');
        rmSync(socialDest, { recursive: true, force: true });
        cpSync(socialSrc, socialDest, {
            recursive: true,
            // Allowlist, not denylist: copy the directory itself and the card
            // PNGs, nothing else. Anything else that lands in
            // docs/media/social/ later — a stray Markdown file, say, which
            // Zensical would also render into the site — must not silently
            // become a public /social/ URL.
            filter: (src) => src === socialSrc || src.endsWith('.png'),
        });
    } else {
        console.warn(
            `docs-publish: WARNING no social cards at ${socialSrc} — ` +
                'shared links will preview without an image',
        );
    }

    console.log(
        `docs-publish: assembled ${args.dest}\n` +
            `  subtrees: ${[...selected].join(', ')}\n` +
            (selected.has('docs')
                ? `  docs: v${version} -> ${versionDest}\n`
                : '') +
            `  versions: ${
                versions.length === 0
                    ? 'none'
                    : versions
                          .map((v) => (v === latest ? `${v} (latest)` : v))
                          .join(', ')
            }`,
    );
}

if (import.meta.url === `file://${process.argv[1]}`) main();
