/**
 * The documentation shell, in a browser.
 *
 * What only a browser can see: that a documentation page wears the same chrome,
 * type and palette as a marketing page rather than looking like a second
 * website; that its sidebar carries the declared pages and nothing else; and
 * that a contents link actually lands on the heading it names.
 *
 * The declared-versus-derived logic beneath it is asserted in
 * `tests/unit/docs.test.ts`; this is the seam for the served result.
 */

import { expect, test, type Page } from '@playwright/test';

import { DOC_ROUTES } from '../src/lib/routes';

const docPaths = DOC_ROUTES.map((route) => route.path);

function sidebar(page: Page) {
    return page.getByRole('navigation', { name: 'Documentation' });
}

function contents(page: Page) {
    return page.getByRole('navigation', { name: 'On this page' });
}

/** The resolved type and colour of an element, for comparing two pages. */
async function typography(page: Page, selector: string) {
    return page
        .locator(selector)
        .first()
        .evaluate((node) => {
            const style = getComputedStyle(node);
            return {
                fontFamily: style.fontFamily,
                color: style.color,
                background: getComputedStyle(document.body).backgroundColor,
            };
        });
}

test.describe('a documentation page', () => {
    for (const path of docPaths) {
        test(`${path} renders with the site's chrome around it`, async ({
            page,
        }) => {
            await page.goto(path);

            // The rail, the footer and the page's own heading: a documentation
            // page is a page of this site, not a subtree bolted onto it.
            await expect(page.locator('nav.rail')).toBeVisible();
            await expect(page.locator('footer.sitefoot')).toBeVisible();
            await expect(page.getByRole('heading', { level: 1 })).toHaveCount(
                1,
            );
            await expect(sidebar(page)).toBeVisible();
        });
    }

    test('wears the same type and palette as a marketing page', async ({
        page,
    }) => {
        await page.goto('/handles/');
        const marketing = await typography(page, 'main .doc p');

        await page.goto('/docs/');
        const documentation = await typography(page, 'main .doc p');

        // Uncial's own tokens are scoped custom properties and this application
        // loads none of its stylesheets, so a default leaking in would show up
        // here as a serif stack or a colour the site does not own.
        expect(documentation).toEqual(marketing);
    });
});

test.describe('the documentation sidebar', () => {
    test('carries every declared page and nothing else', async ({ page }) => {
        await page.goto('/docs/');

        const hrefs = await sidebar(page)
            .locator('a')
            .evaluateAll((links) =>
                links.map((link) => link.getAttribute('href')),
            );
        expect(hrefs).toEqual(docPaths);
    });

    test('marks the page the reader is on', async ({ page }) => {
        await page.goto('/docs/react/');

        await expect(
            sidebar(page).locator('[aria-current="page"]'),
        ).toHaveAttribute('href', '/docs/react/');
    });

    test('leads from one page to the next', async ({ page }) => {
        await page.goto('/docs/');
        await sidebar(page).getByRole('link', { name: 'React' }).click();

        await expect(page).toHaveURL(/\/docs\/react\/$/);
    });
});

test.describe('a page’s contents', () => {
    test('names every heading the page carries, in order', async ({ page }) => {
        await page.goto('/docs/');

        const links = await contents(page)
            .locator('a')
            .evaluateAll((anchors) =>
                anchors.map((anchor) => anchor.getAttribute('href')),
            );
        const headings = await page
            .locator('main .doc :is(h2, h3, h4, h5, h6)')
            .evaluateAll((nodes) => nodes.map((node) => `#${node.id}`));

        expect(links).toEqual(headings);
    });

    test('lands the reader on the heading a link names', async ({ page }) => {
        await page.goto('/docs/');

        const link = contents(page).locator('a').nth(1);
        const anchor = await link.getAttribute('href');
        await link.click();

        await expect(page).toHaveURL(new RegExp(`${anchor}$`));
        // The anchor is the heading's persisted slug, so the target exists in
        // the markup rather than being computed from the heading's text.
        await expect(page.locator(`main .doc ${anchor}`)).toBeInViewport();
    });
});

test.describe('a documentation page’s edit variant', () => {
    test('opens the editor inside the documentation shell', async ({
        page,
    }) => {
        await page.goto('/docs/react/edit/');

        await expect(page.locator('uncial-editor .ProseMirror')).toContainText(
            'Your first viewer',
        );
        await expect(sidebar(page)).toBeVisible();
        await expect(page.locator('nav.rail')).toBeVisible();
        // The edit variant IS the page it edits, so the sidebar marks the same
        // item as the read view does. It is the chrome layout's site path that
        // says which one; a page load returning its own `path` would shadow it
        // with Uncial's slashless rest parameter and nothing would be current.
        await expect(
            sidebar(page).locator('[aria-current="page"]'),
        ).toHaveAttribute('href', '/docs/react/');
    });
});

/*
 * A reader's two choices, which are sticky per group and shared site-wide.
 *
 * Only a browser can answer this: the selection lives in storage under the
 * group's key, and what makes it worth gating is that the front page's install
 * block and a documentation page's package-manager tabs are two different
 * components reading one group. The framework group is the control — picking a
 * package manager must leave it alone, and the other way round.
 */
test.describe('a reader’s tab choices', () => {
    // A page may carry more than one group on the same key — the reader's
    // choice is one choice, so the first is as good as any.
    function panels(page: Page, group: string) {
        return page.getByRole('tablist', { name: `${group} tabs` }).first();
    }

    function chosen(page: Page, group: string) {
        return panels(page, group).getByRole('tab', { selected: true }).first();
    }

    /**
     * Retried, because a click that lands before the page has hydrated changes
     * nothing and reports success — the same reason the front page's own
     * install-tab screens retry theirs.
     */
    async function choose(page: Page, group: string, label: string) {
        const tab = panels(page, group).getByRole('tab', {
            name: label,
            exact: true,
        });
        await expect(async () => {
            await tab.click();
            await expect(tab).toHaveAttribute('aria-selected', 'true');
        }).toPass();
    }

    test('carries a package manager chosen on the front page into the documentation', async ({
        page,
    }) => {
        await page.goto('/');
        await choose(page, 'package-manager', 'bun');

        await page.goto('/docs/react/');
        await expect(chosen(page, 'package-manager')).toHaveText('bun');
    });

    test('keeps the framework choice out of the package-manager choice', async ({
        page,
    }) => {
        await page.goto('/docs/plugins/');
        await choose(page, 'framework', 'Vue');

        await page.goto('/docs/plugin-av/');
        await expect(chosen(page, 'framework')).toHaveText('Vue');
        // Untouched by the framework pick, and still the default rather than
        // whatever the framework group happens to be on.
        await expect(chosen(page, 'package-manager')).toHaveText('pnpm');
    });

    test('leaves the plugin-UI group its own, so a stray label forms no group', async ({
        page,
    }) => {
        await page.goto('/docs/plugin-authoring/');
        await choose(page, 'plugin-ui', 'Lit');

        await page.goto('/docs/plugins/');
        await expect(chosen(page, 'framework')).toHaveText('HTML');
    });
});
