#!/usr/bin/env node
// The site's public URL gate.
//
// Asserts the built tree against `site-urls.json`, the committed manifest of the
// site's public URLs. One build emits the whole published tree, so the tree this
// reads is the tree that ships.
//
// FATAL checks (exit 1) — a broken promise about a public URL:
//
//   1. Every URL in the manifest resolves to a non-empty regular file. A path
//      nobody meant to move cannot move silently. A manifest URL whose
//      normalized form escapes the publish root is itself an error.
//   2. Every relative `href`/`src` in the two pages emitted at a depth their
//      source does not show — the site root and 404 — resolves inside the tree.
//      That is exactly how a link that reads correctly in the editor emits
//      broken: the not-found page is rendered at `/404/` and served from the
//      root.
//   3. The two application paths serve the application their `app` field names.
//      `/viewer/` and `/demo/` both resolve to a non-empty index.html whichever
//      way round they are built, so check 1 is blind to the swap — and the
//      swap breaks roughly thirty-four IIIF Cookbook recipes, which link
//      `/viewer/` directly through the cookbook's own `_includes/viewer_link.html`.
//      That path was kept rather than moved for those links; see the
//      `/viewer/` entry's note in the manifest. It has gone wrong on the
//      deployed host once already.
//
// ADVISORY check (warning, exit 0):
//
//   4. Top-level entries the manifest does not account for are REPORTED, never
//      removed. Whether a served path outside the contract should stay is a
//      human's call, so this one never fails the build.
//
// The link checks read `href`/`src` with a regex rather than an HTML parser:
// these documents are small and machine- or hand-written in this repo, and an
// HTML parser dependency in a link check is a worse trade than a false positive
// a maintainer reads in a diff. Double-quoted, single-quoted and unquoted
// attribute values are all matched; anything else — an attribute value assembled
// by script, say — is invisible to this check.
//
// Usage:
//   node scripts/url-contract.mjs [--tree <dir>]
//
// `--tree` defaults to `apps/site/build`, the tree the site's own build emits.

import {
    existsSync,
    lstatSync,
    readdirSync,
    readFileSync,
    statSync,
} from 'node:fs';
import { dirname, join, normalize, relative, resolve, sep } from 'node:path';
import { REPO_ROOT } from './package-version.mjs';

const MANIFEST = join(REPO_ROOT, 'site-urls.json');

/**
 * How to produce each owner's part of the tree, quoted back in failure output so
 * the reader knows which build to run rather than which file to create by hand.
 * The keys are the manifest's `owner` vocabulary.
 */
const OWNER_HINTS = {
    site: 'run `pnpm build:site`',
    examples:
        'run `pnpm build:examples`, then `pnpm build:site` — the site build places its output',
};

/**
 * Served out of the publish root but not public URLs, and so not manifest
 * entries. A manifest entry is a promise about a URL somebody can link; nothing
 * here is linkable, which is the same category as the dotfiles check 4 skips.
 *
 *   CNAME  host configuration, describing the domain rather than a path on it.
 *   _app   the static adapter's asset directory for the marketing site: hashed
 *          JavaScript and CSS the site's own markup references. It is served,
 *          but no page links it and no reader could type it. Listing it in the
 *          URL contract instead would make a promise about a path whose contents
 *          are renamed by every build.
 *   material
 *          the example manifests and their images, which the marketing site's
 *          embedded viewers load. Served, referenced only from the site's own
 *          markup and from the manifests themselves, and never a URL a reader
 *          is offered. Promising them would freeze fixture paths that exist to
 *          be swapped for better material.
 *   fonts  the self-hosted typefaces the site's stylesheet names in
 *          `@font-face` and its head preloads. Served, referenced only from CSS
 *          and from a `rel=preload`, and never a page anyone could link. The
 *          documentation is part of the same build and reads the same copies.
 */
const HOST_CONTROL_FILES = new Set(['CNAME', '_app', 'fonts', 'material']);

/**
 * The meta name every application page carries, whose content is the `app` the
 * page declares itself to be.
 *
 * A marker tag rather than a title or a body string, because the two titles are
 * not distinguishable in both directions: the playground's
 * `Live demo — Triiiceratops IIIF Viewer` contains the bare viewer's
 * `Triiiceratops IIIF Viewer` verbatim, so a substring test passes on a swapped
 * tree in one direction. This is exact-matched, and it is not copy — no reader
 * sees it, so no rewording of a heading or a social card can quietly change what
 * it says.
 */
export const APP_MARKER = 'triiiceratops:app';

/**
 * The manifest field naming which application a path serves.
 *
 * Keyed on the entry rather than on its `owner`: the playground and the bare
 * viewer are both routes of the site application, so one owner builds both and
 * `owner` cannot tell them apart. An entry without this field is not confusable
 * with another application's page and is left alone.
 */
const APPLICATION_FIELD = 'app';

/**
 * The pages check 2 walks: the ones served at a depth their source does not
 * show, relative to the tree.
 */
const OWNED_PAGES = ['index.html', '404.html'];

function parseArgs(argv) {
    const args = { tree: join(REPO_ROOT, 'apps', 'site', 'build') };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--tree') args.tree = argv[++i];
        else throw new Error(`unknown argument: ${a}`);
    }
    if (!args.tree) throw new Error('--tree <dir> requires a value');
    return args;
}

/** A manifest URL becomes a path within the tree: a trailing `/` → index.html. */
function resolveUrl(url) {
    const path = url.endsWith('/') ? `${url}index.html` : url;
    return normalize(path.replace(/^\/+/, ''));
}

/**
 * The top-level names the manifest accounts for: the first path segment of each
 * entry's resolved path. Derived rather than listed, so promising a URL in the
 * manifest is the whole of what it takes to account for its top-level name, and
 * the two can never disagree.
 */
function ownedTopLevel(manifest) {
    return new Set(
        manifest.urls.map((entry) => resolveUrl(entry.url).split(sep)[0]),
    );
}

/** True when `absolute` is inside `root` (or is `root` itself). */
function isInside(root, absolute) {
    const rel = relative(root, absolute);
    return rel === '' || (!rel.startsWith('..') && !rel.startsWith(sep));
}

function isNonEmptyFile(absolute) {
    if (!existsSync(absolute)) return false;
    const stat = statSync(absolute);
    return stat.isFile() && stat.size > 0;
}

/**
 * A link target resolves if it names a non-empty file, or a directory holding a
 * non-empty index.html.
 *
 * `lstat`, not `stat`: a symlink is not a served file. The static host uploads
 * a tarred artifact, and a symlink pointing outside the publish root resolves
 * for the checker while serving nothing.
 */
function targetResolves(absolute) {
    if (!existsSync(absolute)) return false;
    const stat = lstatSync(absolute);
    if (stat.isFile()) return stat.size > 0;
    if (!stat.isDirectory()) return false;
    const index = join(absolute, 'index.html');
    if (!existsSync(index)) return false;
    const indexStat = lstatSync(index);
    return indexStat.isFile() && indexStat.size > 0;
}

/**
 * Relative `href`/`src` targets in one HTML document.
 *
 * HTML comments are stripped first: a commented-out example link is not a link.
 * The lookbehind is what keeps `data-src=`, `xlink:href=` and friends out — they
 * are populated by script at runtime, not resolved by the host.
 */
function relativeTargets(html) {
    const targets = new Set();
    const withoutComments = html.replaceAll(/<!--[\s\S]*?-->/g, '');
    const attr =
        /(?<![-\w:])(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi;
    for (const m of withoutComments.matchAll(attr)) {
        const raw = (m[1] ?? m[2] ?? m[3]).trim();
        if (!raw) continue;
        if (raw.startsWith('#')) continue;
        if (raw.startsWith('//')) continue; // protocol-relative
        if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) continue; // http:, mailto:, data:
        targets.add(raw.split(/[?#]/)[0]);
    }
    targets.delete('');
    return [...targets];
}

/** Where a link on `pagePath` lands, as an absolute path. Root-relative allowed. */
function linkTarget(tree, pagePath, target) {
    if (target.startsWith('/')) return normalize(join(tree, target.slice(1)));
    return normalize(join(tree, dirname(pagePath), target));
}

/**
 * The references on the page at `pagePath` that land on nothing served inside
 * `tree`, each as `{ page, target, landing }`. `skip` opts a target out before
 * it is tested, for the links a caller has decided are somebody else's business.
 *
 * Exported because two callers ask the same question of two different sets of
 * pages — check 2 below, and the consumer examples' placement in
 * `apps/site/scripts/place-examples.mjs`. A link check spelled differently in
 * each is a link check that only partly exists.
 */
export function unresolvedTargets(tree, pagePath, html, { skip } = {}) {
    const broken = [];
    for (const target of relativeTargets(html)) {
        const landing = linkTarget(tree, pagePath, target);
        if (skip?.(target, landing)) continue;
        if (!isInside(tree, landing) || !targetResolves(landing)) {
            broken.push({ page: pagePath, target, landing });
        }
    }
    return broken;
}

/**
 * Which application `html` declares itself to be, or `null` if it declares
 * nothing.
 *
 * Attributes are read off each `<meta>` tag rather than matched in one pass, so
 * the order they are written in does not matter. Comments are stripped first,
 * for the same reason `relativeTargets` strips them: a commented-out tag is not
 * a tag.
 */
export function appMarker(html) {
    const withoutComments = html.replaceAll(/<!--[\s\S]*?-->/g, '');
    const value = (attrs, attribute) => {
        const re = new RegExp(
            `(?<![-\\w:])${attribute}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>\`]+))`,
            'i',
        );
        const m = re.exec(attrs);
        return m ? (m[1] ?? m[2] ?? m[3]).trim() : null;
    };
    for (const tag of withoutComments.matchAll(/<meta\b[^>]*>/gi)) {
        if (value(tag[0], 'name') !== APP_MARKER) continue;
        return value(tag[0], 'content');
    }
    return null;
}

/**
 * Application paths in `tree` serving somebody else's application, as
 * `{ url, path, app, found }`. Empty means each application path serves the
 * application the manifest names.
 *
 * A path that is absent is not reported here: check 1 already names it as a
 * missing promise, and saying it twice buries the identity failures this exists
 * to surface.
 */
export function applicationMismatches(tree, manifest) {
    const mismatches = [];
    for (const entry of manifest.urls) {
        const app = entry[APPLICATION_FIELD];
        if (!app) continue;
        const path = resolveUrl(entry.url);
        const absolute = join(tree, path);
        if (!isInside(tree, absolute) || !isNonEmptyFile(absolute)) continue;
        const found = appMarker(readFileSync(absolute, 'utf8'));
        if (found !== app) {
            mismatches.push({ url: entry.url, path, app, found });
        }
    }
    return mismatches;
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    const tree = resolve(args.tree);

    if (!existsSync(tree)) {
        console.error(
            `url-contract: no built tree at ${tree} — run \`pnpm build:all\` first.`,
        );
        process.exit(1);
    }

    const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
    if (!Array.isArray(manifest.urls) || manifest.urls.length === 0) {
        console.error(`url-contract: ${MANIFEST} has no "urls" array.`);
        process.exit(1);
    }

    // ---- 1. Every promised URL resolves ---------------------------------
    // Collected, not thrown: a reviewer wants the whole list of what is
    // missing, which usually names one absent build rather than one bad path.
    const missing = [];
    const escapingUrls = [];
    for (const entry of manifest.urls) {
        const path = resolveUrl(entry.url);
        const absolute = join(tree, path);
        if (!isInside(tree, absolute)) {
            escapingUrls.push({ ...entry, path });
            console.log(`  ${entry.url} -> ${path} [ESCAPES THE TREE]`);
            continue;
        }
        const ok = isNonEmptyFile(absolute);
        if (!ok) missing.push({ ...entry, path });
        console.log(`  ${entry.url} -> ${path} [${ok ? 'ok' : 'MISSING'}]`);
    }

    // ---- 2. Relative links in the pages served below their source -------
    const brokenLinks = [];
    for (const page of OWNED_PAGES) {
        const absolute = join(tree, page);
        if (!existsSync(absolute)) continue; // already reported by check 1
        const html = readFileSync(absolute, 'utf8');
        brokenLinks.push(...unresolvedTargets(tree, page, html));
    }

    // ---- 3. The application paths serve their own application ----------
    const wrongApplication = applicationMismatches(tree, manifest);

    const fatal =
        missing.length +
        escapingUrls.length +
        wrongApplication.length +
        brokenLinks.length;
    if (fatal > 0) {
        if (escapingUrls.length > 0) {
            console.error(
                `\nurl-contract: ${escapingUrls.length} manifest URL(s) resolve outside the publish root:`,
            );
            for (const e of escapingUrls) {
                console.error(`  ${e.url}  (normalizes to ${e.path})`);
            }
            console.error(
                `    Fix the entry in ${MANIFEST}: a public URL is a path within the site.`,
            );
        }
        if (missing.length > 0) {
            console.error(
                `\nurl-contract: ${missing.length} promised URL(s) missing from ${tree}:`,
            );
            for (const m of missing) {
                const hint = OWNER_HINTS[m.owner] ?? `owned by ${m.owner}`;
                console.error(`  ${m.url}  (${m.path})`);
                console.error(`    owner: ${m.owner} — ${hint}`);
            }
        }
        if (wrongApplication.length > 0) {
            console.error(
                `\nurl-contract: ${wrongApplication.length} path(s) serve the wrong application:`,
            );
            for (const w of wrongApplication) {
                const found = w.found ?? 'no application marker';
                console.error(
                    `  ${w.url}  (${w.path}) promises ${w.app}, found ${found}`,
                );
            }
            console.error(
                '    Both applications publish an index.html, so every other check ' +
                    'passes on a tree with them exchanged. /viewer/ is linked directly ' +
                    'by the IIIF Cookbook from roughly thirty-four recipes; serving the ' +
                    'playground there breaks all of them. Check which route ' +
                    'declares which marker in apps/site/src/routes.',
            );
        }
        if (brokenLinks.length > 0) {
            console.error(
                `\nurl-contract: ${brokenLinks.length} unresolvable relative link(s) ` +
                    'in the pages served below their source:',
            );
            for (const b of brokenLinks) {
                console.error(
                    `  ${b.page}: "${b.target}" -> ${relative(tree, b.landing) || '.'}`,
                );
            }
            console.error(
                '    These links are emitted at a depth their source does not show. ' +
                    'Check the link against its published location, not its source location.',
            );
        }
        console.error(
            `\nThe published site would not honour ${MANIFEST}. ` +
                'Fix the tree, or edit the manifest in a reviewed commit if the URL ' +
                'is genuinely meant to change.',
        );
        process.exit(1);
    }

    // ---- 4. Unowned top-level entries: report, never remove --------------
    // Dotfiles are skipped for the same reason as HOST_CONTROL_FILES: they are
    // host and tooling control files (`.nojekyll` and the like), never public URLs.
    const owned = ownedTopLevel(manifest);
    const unowned = readdirSync(tree).filter(
        (name) =>
            !name.startsWith('.') &&
            !owned.has(name) &&
            !HOST_CONTROL_FILES.has(name),
    );
    if (unowned.length > 0) {
        console.warn(
            `\nurl-contract: WARNING ${unowned.length} top-level entr(ies) no owner ` +
                `accounts for: ${unowned.join(', ')}\n` +
                '  Still served, but outside the URL contract. Nothing is deleted ' +
                'here — decide by hand whether it should stay.',
        );
    }

    console.log(
        `\nURL contract OK: ${manifest.urls.length} URL(s) resolve in ${tree}.`,
    );
}

if (import.meta.url === `file://${process.argv[1]}`) main();
