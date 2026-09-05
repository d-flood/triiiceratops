/**
 * The URL contract's identity assertion: that the application at `/viewer/` is
 * the bare viewer and the one at `/demo/` is the playground.
 *
 * The failure this guards is the swap, so the swap is what these exercise. A
 * tree with the two pages exchanged resolves every promised URL and passes every
 * other check, which is exactly why existence is not enough.
 *
 * Both are routes of this application, so the marker is declared in
 * `src/lib/applications.ts` and written into each route's head. That the served
 * pages actually carry it is a browser assertion — `tests/shell.spec.ts`. What
 * is asserted here is the pure logic, plus the one thing neither seam can see:
 * that the module, the gate and the manifest spell the marker the same way. A
 * guard spelled differently on both sides is a guard that only half exists.
 */

import {
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defaultMapPathToSource } from 'uncial-cms/sveltekit';
import { afterEach, describe, expect, it } from 'vitest';

import {
    APP_MARKER as MARKER_NAME,
    BARE_VIEWER_APP,
    PLAYGROUND_APP,
} from '$lib/applications';
import { CONTENT_ROUTES } from '$lib/routes';
import {
    APP_MARKER,
    appMarker,
    applicationMismatches,
} from '../../../../scripts/url-contract.mjs';

const REPO_ROOT = fileURLToPath(new URL('../../../..', import.meta.url));

const MANIFEST_FILE = JSON.parse(
    readFileSync(join(REPO_ROOT, 'site-urls.json'), 'utf8'),
) as { urls: { url: string; owner: string; app?: string }[] };

const MANIFEST = {
    urls: [
        { url: '/', owner: 'site' },
        { url: '/demo/', owner: 'site', app: PLAYGROUND_APP },
        { url: '/viewer/', owner: 'site', app: BARE_VIEWER_APP },
    ],
};

/** A page as each route emits it: the marker, in a head with other tags. */
function page(app: string): string {
    return (
        '<!doctype html><html lang="en"><head><title>Triiiceratops IIIF Viewer</title>' +
        `<meta name="${MARKER_NAME}" content="${app}">` +
        '<meta name="description" content="A IIIF viewer.">' +
        '</head><body><div id="app"></div></body></html>'
    );
}

const PAGES = {
    viewer: page(BARE_VIEWER_APP),
    demo: page(PLAYGROUND_APP),
};

let scratch: string | undefined;

/** A built tree holding the two application pages at the given paths. */
function tree(pages: Record<string, string>): string {
    scratch = mkdtempSync(join(tmpdir(), 'url-contract-'));
    writeFileSync(
        join(scratch, 'index.html'),
        '<!doctype html><title>site</title>',
    );
    for (const [name, html] of Object.entries(pages)) {
        mkdirSync(join(scratch, name), { recursive: true });
        writeFileSync(join(scratch, name, 'index.html'), html);
    }
    return scratch;
}

afterEach(() => {
    if (scratch) rmSync(scratch, { recursive: true, force: true });
    scratch = undefined;
});

describe('the application marker', () => {
    it('is spelled the same by the routes and by the gate', () => {
        expect(MARKER_NAME).toBe(APP_MARKER);
    });

    it('names, for each application route, the application the manifest promises', () => {
        const promised = new Map(
            MANIFEST_FILE.urls
                .filter((entry) => entry.app !== undefined)
                .map((entry) => [entry.url, entry.app]),
        );
        expect(promised.get('/demo/')).toBe(PLAYGROUND_APP);
        expect(promised.get('/viewer/')).toBe(BARE_VIEWER_APP);
        // Exactly those two: a third application path with no route to serve it
        // would be a promise nothing keeps.
        expect(promised.size).toBe(2);
    });

    it('is absent from a page that does not declare one', () => {
        expect(
            appMarker(
                '<!doctype html><title>Triiiceratops IIIF Viewer</title>',
            ),
        ).toBe(null);
    });

    it('reads the marker whichever order its attributes are written in', () => {
        expect(appMarker(`<meta content="demo" name="${APP_MARKER}">`)).toBe(
            'demo',
        );
    });

    it('ignores a marker inside an HTML comment', () => {
        expect(
            appMarker(`<!-- <meta name="${APP_MARKER}" content="demo"> -->`),
        ).toBe(null);
    });
});

describe('the identity assertion over a built tree', () => {
    it('passes the correctly built tree', () => {
        const dir = tree({ viewer: PAGES.viewer, demo: PAGES.demo });
        expect(applicationMismatches(dir, MANIFEST)).toEqual([]);
    });

    it('fails a tree with the two applications exchanged, naming both paths', () => {
        const dir = tree({ viewer: PAGES.demo, demo: PAGES.viewer });
        const mismatches = applicationMismatches(dir, MANIFEST);
        expect(mismatches).toEqual([
            {
                url: '/demo/',
                path: join('demo', 'index.html'),
                app: PLAYGROUND_APP,
                found: BARE_VIEWER_APP,
            },
            {
                url: '/viewer/',
                path: join('viewer', 'index.html'),
                app: BARE_VIEWER_APP,
                found: PLAYGROUND_APP,
            },
        ]);
    });

    it('fails a page whose marker was deleted rather than swapped', () => {
        const stripped = PAGES.viewer.replaceAll(
            new RegExp(`<meta[^>]*${APP_MARKER}[^>]*>`, 'gi'),
            '',
        );
        const dir = tree({ viewer: stripped, demo: PAGES.demo });
        expect(applicationMismatches(dir, MANIFEST)).toEqual([
            {
                url: '/viewer/',
                path: join('viewer', 'index.html'),
                app: BARE_VIEWER_APP,
                found: null,
            },
        ]);
    });

    it('says nothing about a path check 1 already reports as missing', () => {
        const dir = tree({ demo: PAGES.demo });
        expect(applicationMismatches(dir, MANIFEST)).toEqual([]);
    });

    it('leaves an entry naming no application alone', () => {
        const dir = tree({ viewer: PAGES.viewer, demo: PAGES.demo });
        const manifest = { urls: [{ url: '/', owner: 'site' }] };
        expect(applicationMismatches(dir, manifest)).toEqual([]);
    });
});

/**
 * The other half of the content contract: every route declared as a content
 * route has a document, with the words the page's heading, title and rail label
 * come from.
 *
 * The route declarations are authoritative for what gets built, so a document
 * nobody declared is never prerendered. This is the reverse case, and it is the
 * one that can go wrong silently — a declared route with a missing or wordless
 * document would otherwise be a page with no heading. The build fails on it too,
 * in `$lib/server/pageMeta`; this says so in a second rather than in a build.
 */
describe('every declared content route', () => {
    const SITE_ROOT = fileURLToPath(new URL('../..', import.meta.url));

    for (const route of CONTENT_ROUTES) {
        it(`${route.path} has a document carrying its words`, () => {
            // The mapping the site itself resolves documents through, so this
            // cannot pass against a path the build never reads.
            const file = join(
                SITE_ROOT,
                defaultMapPathToSource(route.path, 'content'),
            );
            const meta = (
                JSON.parse(readFileSync(file, 'utf8')) as {
                    meta?: Record<string, unknown>;
                }
            ).meta;
            expect(meta, file).toBeDefined();
            for (const field of ['title', 'shortTitle', 'intro']) {
                expect(meta![field], `${file} meta.${field}`).toEqual(
                    expect.stringMatching(/\S/),
                );
            }
        });
    }
});
