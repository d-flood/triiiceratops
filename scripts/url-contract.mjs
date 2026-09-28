#!/usr/bin/env node
// Asserts the built tree against site-urls.json.

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

/** How to produce each owner's part of the tree. */
const OWNER_HINTS = {
    site: 'run `pnpm build:site`',
    examples:
        'run `pnpm build:examples`, then `pnpm build:site` — the site build places its output',
};

/** Served from the publish root but not public URLs. */
const HOST_CONTROL_FILES = new Set(['CNAME', '_app', 'fonts', 'material']);

/** The meta name carrying the `app` a page declares itself to be. */
export const APP_MARKER = 'triiiceratops:app';

/** The manifest field naming which application a path serves. */
const APPLICATION_FIELD = 'app';

/** Pages served below their source depth. */
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

/** A manifest URL becomes a path within the tree. */
function resolveUrl(url) {
    const path = url.endsWith('/') ? `${url}index.html` : url;
    return normalize(path.replace(/^\/+/, ''));
}

function ownedTopLevel(manifest) {
    return new Set(
        manifest.urls.map((entry) => resolveUrl(entry.url).split(sep)[0]),
    );
}

/** True when `absolute` is inside `root`. */
function isInside(root, absolute) {
    const rel = relative(root, absolute);
    return rel === '' || (!rel.startsWith('..') && !rel.startsWith(sep));
}

function isNonEmptyFile(absolute) {
    if (!existsSync(absolute)) return false;
    const stat = statSync(absolute);
    return stat.isFile() && stat.size > 0;
}

/** A link target resolves if it names a served file or a directory with an index. */
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

/** Relative `href`/`src` targets in one HTML document. */
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

/** Where a link on `pagePath` lands. */
function linkTarget(tree, pagePath, target) {
    if (target.startsWith('/')) return normalize(join(tree, target.slice(1)));
    return normalize(join(tree, dirname(pagePath), target));
}

/** References on a page that land on nothing served inside `tree`. */
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

/** Which application `html` declares itself to be, or `null`. */
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

/** Application paths serving somebody else's application. */
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

    // ---- 1. Every promised URL resolves ----
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

    // ---- 2. Relative links in pages served below their source ----
    const brokenLinks = [];
    for (const page of OWNED_PAGES) {
        const absolute = join(tree, page);
        if (!existsSync(absolute)) continue; // already reported by check 1
        const html = readFileSync(absolute, 'utf8');
        brokenLinks.push(...unresolvedTargets(tree, page, html));
    }

    // ---- 3. Application paths serve their own application ----
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
                '    Every route publishes an index.html, so every other check passes ' +
                    'on a tree with the wrong page at this path. /viewer/ is linked ' +
                    'directly by the IIIF Cookbook from roughly thirty-four recipes; ' +
                    'serving anything else there breaks all of them. Check which route ' +
                    'declares the marker in apps/site/src/routes.',
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

    // ---- 4. Unowned top-level entries: report, never remove ----
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
