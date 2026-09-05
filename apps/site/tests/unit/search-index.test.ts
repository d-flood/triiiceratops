/**
 * The search indexer's scope: which built pages it takes, and which it refuses.
 *
 * Scope is declared in the markup — a page body region carries
 * `data-pagefind-body`, and the navigation inside it carries
 * `data-pagefind-ignore` — so there is no path allowlist to test against. What
 * is asserted here is that the declaration is what decides: a marked page is
 * indexed, an application page with no marked body is not, and a tree where
 * nothing is marked fails the build rather than publishing an empty index.
 *
 * The reader-facing half — that a query actually returns the install page and
 * the integration guide — is `tests/search.spec.ts`, against the served tree.
 */

import { spawnSync } from 'node:child_process';
import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const SCRIPT = fileURLToPath(
    new URL('../../scripts/search-index.mjs', import.meta.url),
);

const scratches: string[] = [];

function scratch(): string {
    const dir = mkdtempSync(join(tmpdir(), 'search-index-'));
    scratches.push(dir);
    return dir;
}

function write(path: string, contents: string) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents);
}

/** A page as the chrome layout emits it: a marked body region. */
function prose(heading: string, body: string): string {
    return (
        `<!doctype html><html lang="en"><head><title>${heading}</title></head><body>` +
        '<nav class="rail">Rail links</nav>' +
        `<main class="pagebody" data-pagefind-body><h1>${heading}</h1>${body}` +
        '<nav class="docsnav" aria-label="Documentation" data-pagefind-ignore>' +
        '<a href="/docs/">Sidebarword</a></nav>' +
        '</main></body></html>'
    );
}

/** A page as an application route emits it: no marked body region. */
function application(heading: string): string {
    return (
        `<!doctype html><html lang="en"><head><title>${heading}</title></head><body>` +
        `<div class="appwait"><p>${heading}</p></div></body></html>`
    );
}

function run(build: string) {
    return spawnSync(process.execPath, [SCRIPT, '--build', build], {
        encoding: 'utf8',
    });
}

/** The index's own record of what it holds. */
function indexed(build: string): { pages: number } {
    const entry = JSON.parse(
        readFileSync(join(build, 'pagefind', 'pagefind-entry.json'), 'utf8'),
    ) as { languages: Record<string, { page_count: number }> };
    const pages = Object.values(entry.languages).reduce(
        (total, language) => total + language.page_count,
        0,
    );
    return { pages };
}

afterEach(() => {
    for (const dir of scratches.splice(0))
        rmSync(dir, { recursive: true, force: true });
});

describe('the search indexer', () => {
    it('takes the marked page bodies and leaves the application routes alone', () => {
        const build = scratch();
        write(
            join(build, 'index.html'),
            prose('Front', '<p>A IIIF viewer that fits.</p>'),
        );
        write(
            join(build, 'install/index.html'),
            prose(
                'Install and frameworks',
                '<p>Bundler notes and versioning.</p>',
            ),
        );
        write(
            join(build, 'docs/integration/index.html'),
            prose('Any framework', '<p>The custom element in any bundler.</p>'),
        );
        write(
            join(build, 'demo/index.html'),
            application('Loading the playground'),
        );
        write(
            join(build, 'viewer/index.html'),
            application('Loading the viewer'),
        );

        const result = run(build);

        expect(result.status).toBe(0);
        expect(existsSync(join(build, 'pagefind', 'pagefind.js'))).toBe(true);
        expect(indexed(build).pages).toBe(3);
    });

    it('fails when no page declares a body to index', () => {
        const build = scratch();
        write(
            join(build, 'demo/index.html'),
            application('Loading the playground'),
        );

        const result = run(build);

        expect(result.status).toBe(1);
        expect(result.stderr).toContain('data-pagefind-body');
    });

    it('fails when there is no build output to index', () => {
        const build = join(scratch(), 'absent');

        const result = run(build);

        expect(result.status).toBe(1);
        expect(result.stderr).toContain(build);
    });
});
