/**
 * The URL contract's identity assertion: that the application at `/viewer/` is
 * the bare viewer and the one at `/demo/` is the playground.
 *
 * The failure this guards is the swap, so the swap is what these exercise. A
 * tree with the two pages exchanged resolves every promised URL and passes every
 * other check, which is exactly why existence is not enough.
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

import { afterEach, describe, expect, it } from 'vitest';

import {
    APP_MARKER,
    APPLICATION_OWNERS,
    appMarker,
    applicationMismatches,
} from '../../../../scripts/url-contract.mjs';

const REPO_ROOT = fileURLToPath(new URL('../../../..', import.meta.url));

const MANIFEST = {
    urls: [
        { url: '/', owner: 'site' },
        { url: '/demo/', owner: 'demo' },
        { url: '/viewer/', owner: 'viewer' },
    ],
};

const PAGES = {
    viewer: readFileSync(join(REPO_ROOT, 'apps/viewer/index.html'), 'utf8'),
    demo: readFileSync(join(REPO_ROOT, 'apps/demo/index.html'), 'utf8'),
};

let scratch: string | undefined;

/** A publish tree holding the two application pages at the given paths. */
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
    it('is carried by both application pages as they are authored', () => {
        expect(appMarker(PAGES.viewer)).toBe('viewer');
        expect(appMarker(PAGES.demo)).toBe('demo');
    });

    it('names an owner the manifest uses for an application path', () => {
        for (const owner of APPLICATION_OWNERS) {
            expect(MANIFEST.urls.some((u) => u.owner === owner)).toBe(true);
        }
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

describe('the identity assertion over a publish tree', () => {
    it('passes the correctly assembled tree', () => {
        const dir = tree({ viewer: PAGES.viewer, demo: PAGES.demo });
        expect(applicationMismatches(dir, MANIFEST, '1.0')).toEqual([]);
    });

    it('fails a tree with the two applications exchanged, naming both paths', () => {
        const dir = tree({ viewer: PAGES.demo, demo: PAGES.viewer });
        const mismatches = applicationMismatches(dir, MANIFEST, '1.0');
        expect(mismatches).toEqual([
            {
                url: '/demo/',
                path: join('demo', 'index.html'),
                owner: 'demo',
                found: 'viewer',
            },
            {
                url: '/viewer/',
                path: join('viewer', 'index.html'),
                owner: 'viewer',
                found: 'demo',
            },
        ]);
    });

    it('fails a page whose marker was deleted rather than swapped', () => {
        const stripped = PAGES.viewer.replaceAll(
            new RegExp(`<meta[^>]*${APP_MARKER}[^>]*>`, 'gi'),
            '',
        );
        const dir = tree({ viewer: stripped, demo: PAGES.demo });
        expect(applicationMismatches(dir, MANIFEST, '1.0')).toEqual([
            {
                url: '/viewer/',
                path: join('viewer', 'index.html'),
                owner: 'viewer',
                found: null,
            },
        ]);
    });

    it('says nothing about a path check 1 already reports as missing', () => {
        const dir = tree({ demo: PAGES.demo });
        expect(applicationMismatches(dir, MANIFEST, '1.0')).toEqual([]);
    });

    it('leaves non-application owners alone', () => {
        const dir = tree({ viewer: PAGES.viewer, demo: PAGES.demo });
        const manifest = { urls: [{ url: '/', owner: 'site' }] };
        expect(applicationMismatches(dir, manifest, '1.0')).toEqual([]);
    });
});
