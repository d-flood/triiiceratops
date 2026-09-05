#!/usr/bin/env node
// The bundle-size comparison's measure script.
//
// Drives every pinned viewer in `src/competitors.ts` through a real Chromium
// session — its own documented embed, against a IIIF Cookbook manifest — records
// every file the page actually fetched from that viewer's own hosts, compresses
// those bytes locally at fixed settings, and rewrites `src/measured.json`.
//
//   node scripts/measure.mjs
//
// Sessions are measured rather than computed from a build because two of these
// viewers code-split per media type: an audiovisual manifest costs them
// different bytes than an image one, and only a session can say which chunks
// arrive. Triiiceratops goes through the same path, from this repository's own
// `dist` directories, so no row is produced differently from its neighbours.
//
// It runs on demand only. It is deliberately not wired to a schedule or to CI:
// competitor versions move independently, so a scheduled run would rewrite a
// published marketing claim with nobody reading the diff, and a per-PR run would
// make every unrelated change depend on nine third-party hosts.
//
// This is not the shipped-bytes gate. `scripts/size-check.mjs` and
// `size-baseline.json` ratchet our own artifacts on every build; they are
// separate on purpose and neither reads the other.

import { createServer } from 'node:http';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

import { chromium } from '@playwright/test';

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(HERE, '..');
const REPO_ROOT = resolve(PACKAGE_ROOT, '..', '..');
const OUTPUT = join(PACKAGE_ROOT, 'src', 'measured.json');

/** Compression is identical for every row, and is recorded in the output. */
const GZIP_LEVEL = 9;
const BROTLI_QUALITY = 11;

/**
 * Where a `{{BASE}}` artifact path resolves on disk. A Triiiceratops row loads
 * this repository's built `dist` output over HTTP, so its session is a session
 * and not a directory listing.
 */
const MOUNTS = {
    core: join('packages', 'core', 'dist'),
    'plugin-av': join('packages', 'plugin-av', 'dist'),
};

/**
 * A session is done when nothing it counts has arrived for this long, and never
 * before `MIN_MS`. Both are generous because a code-splitting viewer fetches its
 * chunks in waves: Universal Viewer's later chunks arrive seconds after the gap
 * that looks like the end of the session, and cutting it short silently
 * undercounts a competitor.
 */
const QUIET_MS = 6000;
const MIN_MS = 15_000;
/** Never wait longer than this for one session, however busy the page looks. */
const TIMEOUT_MS = 90_000;

const MIME = {
    '.js': 'text/javascript',
    '.cjs': 'text/javascript',
    '.mjs': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.map': 'application/json',
    '.wasm': 'application/wasm',
};

function fail(message) {
    console.error(`measure: ${message}`);
    process.exit(1);
}

function measure(bytes) {
    return {
        raw: bytes.length,
        gzip: zlib.gzipSync(bytes, { level: GZIP_LEVEL }).length,
        brotli: zlib.brotliCompressSync(bytes, {
            params: {
                [zlib.constants.BROTLI_PARAM_QUALITY]: BROTLI_QUALITY,
            },
        }).length,
    };
}

/**
 * Strip `data:` URIs out of a stylesheet before measuring it.
 *
 * Fonts and images are excluded from every row, and a stylesheet that inlines
 * them as `data:` URIs would otherwise smuggle megabytes of glyphs into a
 * viewer's JavaScript-and-CSS total. One competitor's widget stylesheet is
 * mostly inlined faces and icons, so this is the difference between comparing
 * viewers and comparing icon sets.
 */
function stripDataUris(bytes) {
    const stripped = bytes
        .toString('utf8')
        .replace(/url\(\s*(['"]?)data:[^)]*\1\s*\)/g, 'url()');
    return Buffer.from(stripped, 'utf8');
}

function localPathOf(url, base) {
    const [mount, ...rest] = url.slice(base.length).split('/');
    const dir = MOUNTS[mount];
    if (!dir) return null;
    return join(dir, ...rest);
}

/** Serves the generated embed pages and this repository's built artifacts. */
function startServer(competitors) {
    const pages = new Map();
    const server = createServer((request, response) => {
        const path = new URL(request.url, 'http://127.0.0.1').pathname;
        if (pages.has(path)) {
            response.writeHead(200, { 'content-type': 'text/html' });
            response.end(pages.get(path));
            return;
        }
        if (path.startsWith('/artifacts/')) {
            const relative = localPathOf(path, '/artifacts/');
            const file = relative && join(REPO_ROOT, relative);
            if (file && existsSync(file)) {
                response.writeHead(200, {
                    'content-type':
                        MIME[extname(file)] ?? 'application/octet-stream',
                });
                response.end(readFileSync(file));
                return;
            }
        }
        response.writeHead(404).end('not found');
    });

    return new Promise((resolveServer) => {
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address();
            const origin = `http://127.0.0.1:${port}`;
            const base = `${origin}/artifacts/`;
            const urls = new Map();
            for (const competitor of competitors) {
                for (const kind of competitor.sessions) {
                    const path = `/embed/${competitor.id}/${kind}`;
                    pages.set(
                        path,
                        competitor.embed
                            .replaceAll('{{BASE}}', base)
                            .replaceAll(
                                '{{MANIFEST}}',
                                SESSION_MANIFESTS[kind],
                            ),
                    );
                    urls.set(`${competitor.id}/${kind}`, origin + path);
                }
            }
            resolveServer({ server, base, urls });
        });
    });
}

/**
 * Load one embed page and return every file it fetched from the viewer's own
 * hosts, measured. Source maps are excluded, as are the manifest, its images and
 * its media — those are the IIIF content a viewer then fetches, not the viewer.
 */
async function runSession(browser, { url, assetBases }) {
    const context = await browser.newContext();
    const page = await context.newPage();

    const counted = new Map();
    const refused = new Set();
    let lastArrival = Date.now();

    page.on('response', (response) => {
        const responseUrl = response.url();
        if (responseUrl.endsWith('.map')) return;
        if (!assetBases.some((base) => responseUrl.startsWith(base))) return;
        if (!response.ok()) {
            // A CDN that rate-limits mid-session would otherwise leave this row
            // quietly short of the chunks the viewer actually loads, which is a
            // published figure that is simply wrong. Surface it instead.
            if (response.status() >= 400) refused.add(responseUrl);
            return;
        }
        if (counted.has(responseUrl)) return;
        counted.set(responseUrl, response);
        lastArrival = Date.now();
    });

    const started = Date.now();
    try {
        await page.goto(url, { waitUntil: 'load', timeout: TIMEOUT_MS });
    } catch (error) {
        console.warn(`  navigation did not settle: ${error.message}`);
    }
    while (
        (Date.now() - lastArrival < QUIET_MS ||
            Date.now() - started < MIN_MS) &&
        Date.now() - started < TIMEOUT_MS
    ) {
        await page.waitForTimeout(500);
    }

    const files = [];
    for (const [responseUrl, response] of counted) {
        const body = await response.body();
        const isCss =
            (response.headers()['content-type'] ?? '').includes('text/css') ||
            responseUrl.endsWith('.css');
        files.push({
            url: responseUrl,
            name: new URL(responseUrl).pathname
                .split('/')
                .filter(Boolean)
                .pop(),
            ...measure(isCss ? stripDataUris(body) : body),
        });
    }
    await context.close();
    // Sorted rather than left in arrival order: parallel chunk requests land in
    // a different order on every run, and a re-measure's diff should show what
    // moved, not which chunk won a race.
    files.sort((a, b) => a.url.localeCompare(b.url));
    return { files, refused: [...refused] };
}

/**
 * A third-party CDN can rate-limit or hiccup part-way through nine viewers'
 * worth of sessions, so a refused artifact is retried rather than published as a
 * short row.
 */
async function measureSession(browser, session, label) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
        const { files, refused } = await runSession(browser, session);
        if (refused.length === 0) return files;
        console.warn(
            `  ${label}: ${refused.length} artifact(s) refused, retrying (${attempt}/3)`,
        );
        await new Promise((wait) => setTimeout(wait, 10_000 * attempt));
    }
    fail(`${label}: its host kept refusing artifacts — try again later`);
}

/** Re-point a local artifact URL at the repository path it was served from. */
function asRepositoryPath(files, base) {
    return files.map((file) => ({
        ...file,
        url: file.url.startsWith(base)
            ? localPathOf(file.url, base).split(/[\\/]/).join('/')
            : file.url,
    }));
}

function measureLazyArtifacts(paths) {
    return paths.map((path) => {
        const [mount, ...rest] = path.split('/');
        const dir = MOUNTS[mount];
        if (!dir) fail(`unknown artifact mount in '${path}'`);
        const relative = join(dir, ...rest);
        const file = join(REPO_ROOT, relative);
        if (!existsSync(file)) {
            fail(`lazy artifact '${path}' is not built — run 'pnpm build:all'`);
        }
        return {
            url: relative.split(/[\\/]/).join('/'),
            name: rest.at(-1),
            ...measure(readFileSync(file)),
        };
    });
}

function total(files) {
    return {
        raw: files.reduce((sum, file) => sum + file.raw, 0),
        gzip: files.reduce((sum, file) => sum + file.gzip, 0),
        brotli: files.reduce((sum, file) => sum + file.brotli, 0),
    };
}

const { COMPETITORS, SESSION_MANIFESTS } = await import(
    `file://${join(PACKAGE_ROOT, 'src', 'competitors.ts')}`
);

for (const dir of Object.values(MOUNTS)) {
    if (!existsSync(join(REPO_ROOT, dir))) {
        fail(
            `'${dir}' is missing — build the packages first ('pnpm build:all')`,
        );
    }
}

const { server, base, urls } = await startServer(COMPETITORS);
const browser = await chromium.launch();

const viewers = [];
try {
    for (const competitor of COMPETITORS) {
        const sessions = [];
        for (const kind of competitor.sessions) {
            process.stdout.write(`measuring ${competitor.id} (${kind})\n`);
            const assetBases = competitor.assetBases.map((assetBase) =>
                assetBase.replaceAll('{{BASE}}', base),
            );
            const fetched = await measureSession(
                browser,
                {
                    url: urls.get(`${competitor.id}/${kind}`),
                    assetBases,
                },
                `${competitor.id} (${kind})`,
            );
            if (fetched.length === 0) {
                fail(
                    `${competitor.id} (${kind}) fetched none of its own artifacts — ` +
                        'the embed or its asset bases are wrong',
                );
            }
            const files = competitor.local
                ? asRepositoryPath(fetched, base)
                : fetched;
            sessions.push({ kind, ...total(files), files });
        }
        const viewer = {
            id: competitor.id,
            name: competitor.name,
            version: competitor.version,
            isSelf: competitor.local === true,
            sessions,
        };
        if (competitor.lazyArtifacts) {
            viewer.lazyArtifacts = measureLazyArtifacts(
                competitor.lazyArtifacts,
            );
        }
        if (competitor.note) viewer.note = competitor.note;
        viewers.push(viewer);
    }
} finally {
    await browser.close();
    server.close();
}

const output = {
    measuredAt: new Date().toISOString().slice(0, 10),
    compression: { gzipLevel: GZIP_LEVEL, brotliQuality: BROTLI_QUALITY },
    sessionManifests: SESSION_MANIFESTS,
    viewers,
};

writeFileSync(OUTPUT, JSON.stringify(output, null, 4) + '\n');
console.log(
    `measure: wrote ${viewers.length} viewers to ` +
        OUTPUT.slice(REPO_ROOT.length + 1),
);
