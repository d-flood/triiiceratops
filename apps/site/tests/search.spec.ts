/**
 * Site search, against the served built tree.
 *
 * The dev server cannot answer these: the index is a post-build artefact, so
 * until `vite build` and the indexer have run there is nothing to search. That
 * makes the built tree the only honest seam for the reader's whole path —
 * the field in the rail, the bundle fetched from its published URL, and the
 * result that lands on a real page.
 *
 * The indexer's scope declaration is asserted separately, over fixtures, in
 * `tests/unit/search-index.test.ts`.
 */

import { expect, test, type Page } from '@playwright/test';

import { PUBLISHED_ORIGIN } from './helpers/origin';

function field(page: Page) {
    return page.getByRole('searchbox', { name: 'Search this site' }).first();
}

function results(page: Page) {
    return page.locator('nav.rail .search__results a');
}

/**
 * Every result path a query returns, once the list has settled.
 *
 * The field's own live region is the settled signal: it reads "Searching…"
 * while a query is in flight and states the outcome when one is not, so waiting
 * on it cannot read the list mid-query.
 */
async function search(page: Page, term: string): Promise<string[]> {
    await field(page).fill(term);
    await expect(page.locator('nav.rail .search__status')).toHaveText(
        /pages? match|No page matches|nothing to search/,
    );
    return results(page).evaluateAll((links) =>
        links.map((link) => new URL((link as HTMLAnchorElement).href).pathname),
    );
}

test.beforeEach(async ({ page }) => {
    await page.goto(`${PUBLISHED_ORIGIN}/`);
});

test('the index is served from the path the URL contract promises', async ({
    page,
}) => {
    const response = await page.request.get(
        `${PUBLISHED_ORIGIN}/pagefind/pagefind.js`,
    );
    expect(response.ok()).toBe(true);
});

test('a query about installing the viewer finds the marketing page and the guide alike', async ({
    page,
}) => {
    const paths = await search(page, 'bundler');

    expect(paths).toContain('/install/');
    expect(paths).toContain('/docs/integration/');
});

test('a query matching documentation prose returns that page', async ({
    page,
}) => {
    expect(await search(page, 'Content-Security-Policy')).toContain(
        '/docs/csp/',
    );
});

test('a query matching marketing prose returns that page', async ({ page }) => {
    expect(await search(page, 'design tokens')).toContain('/system/');
});

test('a result never points at the playground or the bare viewer', async ({
    page,
}) => {
    // Terms drawn from what those two routes prerender, so a page that had
    // wrongly been indexed would rank at the top of these rather than nowhere.
    for (const term of ['playground', 'viewer', 'JavaScript']) {
        const paths = await search(page, term);
        // A term that matches nothing at all would make this pass by saying
        // nothing, so the query has to return something first.
        expect(paths.length).toBeGreaterThan(0);
        for (const path of paths) {
            expect(path).not.toMatch(/^\/(demo|viewer)\//);
        }
    }
});

test('searching reaches nothing but this origin', async ({ page }) => {
    // The index, its WebAssembly and its fragments are all assets of the site.
    // A search that reached a third party would make a reader's query somebody
    // else's data, and would stop working the moment that host did.
    //
    // A route with no embedded viewer, because the rail is the same on every
    // one of them and an embed's material is legitimately off-origin: watching
    // every request on the front page would record the hero fetching its
    // manifest and call it a search reaching a third party.
    await page.goto(`${PUBLISHED_ORIGIN}/install/`);
    await expect(page.locator('.vw')).toHaveCount(0);

    const foreign: string[] = [];
    page.on('request', (request) => {
        if (!request.url().startsWith(PUBLISHED_ORIGIN))
            foreign.push(request.url());
    });

    expect(await search(page, 'bundler')).not.toHaveLength(0);

    expect(foreign).toEqual([]);
});

test('a result lands on a page that exists', async ({ page }) => {
    const [first] = await search(page, 'bundler');
    await results(page).first().click();
    await expect(page).toHaveURL(new RegExp(`${first}$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
});
