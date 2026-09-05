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
//   <dest>/{sitemap.xml,robots.txt,CNAME}             generated below
//
// Each subtree has exactly one owner and is written only by the job that owns
// it. `--only <names>` selects which of `docs,examples,viewer,demo,landing` this
// run rebuilds; unselected subtrees are left exactly as the assembly root
// already holds them, which is how a documentation typo fix leaves the viewer
// bytes untouched. The publish-job-owned pieces — `versions.json`,
// `/versions/`, `/latest/`, `/social/`, `sitemap.xml`, `robots.txt` and `CNAME`
// — are regenerated on every run: they are cheap, and none of them needs a
// build. Most are derived from the version directories present in the tree;
// `robots.txt` and `CNAME` are constants of the site itself.
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
    readFileSync,
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
const SITE_ROOT = 'https://triiiceratops.org/';
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

// ---------------------------------------------------------------------------
// Crawl metadata: the site-wide sitemap, the robots file, and the domain file.
// ---------------------------------------------------------------------------

const XML_ESCAPES = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;',
};

/** No emitted URL currently needs this; a sitemap that silently mis-encodes one later does. */
function xmlEscape(text) {
    return text.replaceAll(/[&<>"']/g, (c) => XML_ESCAPES[c]);
}

/**
 * The current documentation version's pages, as absolute URLs on this site.
 *
 * Derived from the sitemap Zensical emitted for the pages it built, which is the
 * authoritative set: a filesystem walk for `index.html` is NOT equivalent, since
 * Zensical deliberately excludes the architecture-decision and security pages
 * from its sitemap and a walk would publish them into the site-wide one.
 *
 * The host in those `<loc>` values is not trusted. A publish that rebuilds only
 * the landing page carries the previous deploy's version directory forward
 * verbatim, so its locs can still name the host that deploy was built for. Only
 * the `docs/<version>/` segment onwards is kept, and re-rooted at SITE_ROOT.
 *
 * Absent or empty is fatal. A sitemap naming no documentation at all is the
 * exact failure this guards, and it is invisible in a green build.
 */
function documentationLocs(dest, latest) {
    const source = join(dest, 'docs', latest, 'sitemap.xml');
    if (!existsSync(source)) {
        throw new Error(
            `no documentation sitemap at ${source} — the site-wide sitemap is ` +
                'derived from it, and one naming no documentation pages is worse ' +
                'than none at all',
        );
    }
    const segment = `docs/${latest}/`;
    const locs = [];
    for (const m of readFileSync(source, 'utf8').matchAll(
        /<loc>\s*([^<]+?)\s*<\/loc>/g,
    )) {
        const at = m[1].indexOf(segment);
        if (at === -1) {
            throw new Error(
                `${source}: <loc> ${m[1]} does not contain "${segment}", so it ` +
                    'cannot be re-rooted at this site. Refusing to guess.',
            );
        }
        locs.push(`${SITE_ROOT}${segment}${m[1].slice(at + segment.length)}`);
    }
    if (locs.length === 0) {
        throw new Error(
            `${source} yielded no <loc> entries — the site-wide sitemap would ` +
                'name no documentation at all',
        );
    }
    return locs;
}

/**
 * One site-wide sitemap: the landing page, the playground, the bare viewer and
 * the CURRENT documentation version. Archived versions are excluded here and
 * carry `noindex` in the directory itself, so the two halves agree.
 *
 * The first three are emitted unconditionally rather than guarded on the
 * directory existing: they are the site's contract constants, and
 * scripts/url-contract.mjs check 1 is what asserts they resolve. A guard would
 * be actively worse — a publish narrowed with `--only` leaves the other
 * subtrees to the assembly root it was handed, so a guard would silently drop a
 * path that IS being served, and a short sitemap is invisible in a green build.
 *
 * Escaping is deliberately asymmetric. The three URLs above are constructed
 * here from raw text, so they are escaped here. The documentation locs come out
 * of Zensical's sitemap ALREADY XML-escaped and are re-rooted, not rebuilt, so
 * escaping them again would turn a source `&amp;` into `&amp;amp;`.
 */
function writeSitemap(dest, latest) {
    const urls = [
        ...[SITE_ROOT, `${SITE_ROOT}demo/`, `${SITE_ROOT}viewer/`].map(
            xmlEscape,
        ),
        ...documentationLocs(dest, latest),
    ];
    const body = urls
        .map((u) => `  <url>\n    <loc>${u}</loc>\n  </url>`)
        .join('\n');
    writeFileSync(
        join(dest, 'sitemap.xml'),
        '<?xml version="1.0" encoding="UTF-8"?>\n' +
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
            `${body}\n</urlset>\n`,
        'utf8',
    );
    return urls.length;
}

/**
 * The crawl policy: point crawlers at the sitemap, disallow nothing.
 *
 * The absence of a `Disallow` for archived version directories is load-bearing,
 * not an oversight. A `Disallow` stops the crawl, which stops the crawler ever
 * seeing the `noindex` those directories carry, which can leave already-indexed
 * archived URLs indexed indefinitely. `noindex` is the mechanism; robots.txt has
 * to stay permissive for it to work.
 *
 * The `Sitemap:` line is emitted only when a sitemap was actually written. With
 * no version directory in the tree there is no site-wide sitemap to write, and a
 * `Sitemap:` naming a file that does not exist is worse than none: crawlers
 * report it as an error and fall back to nothing. The policy itself is always
 * valid, so it is unconditional.
 */
function writeRobots(dest, { sitemap }) {
    writeFileSync(
        join(dest, 'robots.txt'),
        `User-agent: *\nAllow: /\n` +
            (sitemap ? `Sitemap: ${SITE_ROOT}sitemap.xml\n` : ''),
        'utf8',
    );
}

/**
 * The custom-domain file, written into the ARTIFACT rather than committed at the
 * repository root: Pages serves an uploaded artifact, so a repository-root file
 * would never reach the served tree.
 */
function writeCname(dest) {
    writeFileSync(join(dest, 'CNAME'), `${new URL(SITE_ROOT).host}\n`, 'utf8');
}

const NOINDEX_META = '<meta name="robots" content="noindex" />';

/**
 * Mark every page of one archived version directory `noindex`.
 *
 * Two documentation versions competing for the same query is the most common
 * failure of versioned documentation sites, and this is what prevents it. It has
 * to happen here: version directories are otherwise immutable, so the moment a
 * version stops being latest is the only moment anything rewrites it.
 *
 * The insertion is the single meta element after the document's first `<head>`;
 * every other byte is preserved. A document whose HEAD already carries a robots
 * tag is left alone, so re-running a publish never accumulates duplicates — and
 * a page carrying some other robots directive is never given a conflicting
 * second one. The guard is scoped to the head because the body is prose: a
 * documentation page that shows a `<meta name="robots">` example in its text
 * would otherwise exempt itself from being marked.
 *
 * A page that cannot be marked is fatal, not skipped. It would stay fully
 * indexable and compete with the current version for the same query, which is
 * the failure this function exists to prevent, so the only safe response is to
 * stop rather than publish a half-marked archive.
 */
function markArchived(dest, version) {
    const dir = join(dest, 'docs', version);
    let marked = 0;
    for (const entry of readdirSync(dir, {
        withFileTypes: true,
        recursive: true,
    })) {
        if (!entry.isFile() || !entry.name.endsWith('.html')) continue;
        const file = join(entry.parentPath, entry.name);
        const html = readFileSync(file, 'utf8');
        const head = html.indexOf('<head>');
        if (head === -1) {
            throw new Error(
                `${file}: no <head> to mark noindex, so archived documentation ` +
                    `version ${version} cannot be marked. Refusing to publish a ` +
                    'half-marked archive that would compete with the current ' +
                    'version in search results.',
            );
        }
        const cut = head + '<head>'.length;
        // An unterminated head falls back to the whole document: without a
        // boundary there is nothing to scope to, and over-matching only ever
        // skips a page, never duplicates a directive.
        const headEnd = html.indexOf('</head>', cut);
        const headHtml = headEnd === -1 ? html : html.slice(0, headEnd);
        if (headHtml.includes('<meta name="robots"')) continue;
        writeFileSync(
            file,
            `${html.slice(0, cut)}\n    ${NOINDEX_META}${html.slice(cut)}`,
            'utf8',
        );
        marked++;
    }
    return marked;
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
    let sitemapUrls = 0;
    const archived = [];

    // 5. (Re)generate the switcher data + the `/latest/` redirect. These live
    //    OUTSIDE any version directory, so regenerating them never mutates old
    //    versions, and they are owned by the publish job on every run.
    //
    //    All three describe the version directories in the tree, so with no
    //    version directory there is nothing truthful to write: every one of them
    //    would name a version that does not exist. They are left exactly as the
    //    tree already holds them instead — an empty `versions.json` and a
    //    `/latest/` forwarding nowhere are worse than the previous deploy's.
    //
    //    The site-wide sitemap and the archived-version marking are governed by
    //    the same condition, for the same reason: both are statements about which
    //    version is current, and with no version directory there is no such
    //    statement to make.
    if (versions.length === 0) {
        console.warn(
            `docs-publish: WARNING ${args.dest} holds no docs/<major.minor> ` +
                'directory, so versions.json, /versions/, /latest/ and ' +
                'sitemap.xml were left untouched. Publish a documentation ' +
                'version to generate them.',
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
        sitemapUrls = writeSitemap(args.dest, latest);
        for (const v of versions) {
            if (v === latest) continue;
            const marked = markArchived(args.dest, v);
            if (marked > 0) archived.push(`${v} (${marked})`);
        }
    }

    // 5b. Crawl policy and the domain file, both written whether or not the tree
    //     holds a version. `CNAME` describes the domain, never a version. The
    //     crawl policy is version-independent too, but its `Sitemap:` line is
    //     not: it may only be emitted when a sitemap was actually written above.
    writeRobots(args.dest, { sitemap: sitemapUrls > 0 });
    writeCname(args.dest);

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
            }\n` +
            (sitemapUrls > 0 ? `  sitemap: ${sitemapUrls} URL(s)\n` : '') +
            `  noindex: ${
                archived.length === 0
                    ? 'no archived version needed marking'
                    : `${archived.length} archived version(s) marked — ${archived.join(', ')}`
            }`,
    );
}

if (import.meta.url === `file://${process.argv[1]}`) main();
