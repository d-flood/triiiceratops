/**
 * The marketing site's shell, in a browser: what only a browser can see.
 *
 * The rail on every route a reader is offered, the mobile bar and its
 * full-screen sheet, the footer's four institutional facts, and — the assertion
 * this ticket exists for — a route still carrying filler being absent from the
 * rail and marked `noindex`.
 *
 * The filler policy's other two halves are asserted where they are visible:
 * absence from the sitemap in `tests/unit/routes.test.ts`, and the route still
 * resolving in the published tree by `pnpm urls:check`.
 */

import { expect, test, type Page } from '@playwright/test';

import { LISTED, ROUTES, isListed } from '../src/lib/routes';

const PHONE = { width: 390, height: 844 };

const listedPaths = LISTED.map((route) => route.path);
const fillerPaths = ROUTES.filter(
    (route) => route.copy === 'filler' && route.group !== null,
).map((route) => route.path);
const unlistedPaths = ROUTES.filter((route) => !isListed(route)).map(
    (route) => route.path,
);

function rail(page: Page) {
    return page.getByRole('navigation', { name: 'Site navigation' });
}

/** The rail's page links, excluding the coloured block of destinations off-site. */
function railPageLinks(page: Page) {
    return rail(page).locator('.rail__list a');
}

/**
 * Open the mobile sheet, retrying the click until it takes.
 *
 * Every route is prerendered, so the bar's control is present and clickable
 * before the page hydrates — a single click can land on markup that has no
 * handler yet. Retrying is the assertion that the control works, without
 * reaching for a hydration signal that is SvelteKit's internal business.
 */
async function openSheet(page: Page) {
    const sheet = page.getByRole('dialog', { name: 'Site navigation' });
    await expect(async () => {
        await page.getByRole('button', { name: 'Open navigation' }).click();
        await expect(sheet).toBeVisible({ timeout: 1000 });
    }).toPass();
    return sheet;
}

test.describe('every route', () => {
    for (const route of ROUTES) {
        test(`${route.path} is served with the shell and one h1`, async ({
            page,
        }) => {
            await page.goto(route.path);
            await expect(rail(page)).toBeAttached();
            await expect(
                page.getByRole('main').getByRole('heading', { level: 1 }),
            ).toHaveCount(1);
            await expect(
                page.getByRole('link', { name: 'Skip to content' }),
            ).toBeAttached();
        });

        test(`${route.path} carries the footer's four facts`, async ({
            page,
        }) => {
            await page.goto(route.path);
            const footer = page.getByRole('contentinfo');
            await expect(footer).toContainText('MIT licensed');
            await expect(footer).toContainText(/Version \S+, dated \d{4}-/);
            await expect(
                footer.getByRole('link', { name: 'Source on GitHub' }),
            ).toBeVisible();
            await expect(
                footer.getByRole('link', { name: 'Contact' }),
            ).toBeVisible();
        });
    }
});

test.describe('the rail', () => {
    test('lists exactly the routes a reader is offered, on every one of them', async ({
        page,
    }) => {
        for (const path of listedPaths) {
            await page.goto(path);
            await expect(railPageLinks(page)).toHaveCount(listedPaths.length);
            for (const listed of listedPaths) {
                await expect(
                    railPageLinks(page).and(page.locator(`[href="${listed}"]`)),
                ).toHaveCount(1);
            }
        }
    });

    test('marks the current page by ground and weight, not a link elsewhere', async ({
        page,
    }) => {
        await page.goto('/');
        await expect(
            railPageLinks(page).and(page.locator('[aria-current="page"]')),
        ).toHaveCount(1);
    });

    test('points at the sibling subtrees and the repository', async ({
        page,
    }) => {
        await page.goto('/');
        for (const href of ['/viewer/', '/demo/', '/latest/']) {
            await expect(rail(page).locator(`a[href="${href}"]`)).toHaveCount(1);
        }
        await expect(
            rail(page).locator('a[href*="github.com/d-flood/triiiceratops"]'),
        ).toHaveCount(1);
    });
});

test.describe('a route whose prose has not landed', () => {
    test('is absent from the rail', async ({ page }) => {
        test.skip(
            fillerPaths.length === 0,
            'every route’s prose has landed, so the policy has nothing to hide',
        );
        await page.goto('/');
        for (const path of fillerPaths) {
            await expect(
                railPageLinks(page).and(page.locator(`[href="${path}"]`)),
            ).toHaveCount(0);
        }
    });

    test('is still served, and says why it is not yet linked', async ({
        page,
    }) => {
        test.skip(fillerPaths.length === 0, 'no route is carrying filler');
        const response = await page.goto(fillerPaths[0]);
        expect(response?.ok()).toBe(true);
        await expect(page.locator('.pending')).toContainText('noindex');
    });
});

test.describe('a route out of the rail', () => {
    test('carries noindex', async ({ page }) => {
        for (const path of unlistedPaths) {
            await page.goto(path);
            await expect(
                page.locator('head meta[name="robots"][content="noindex"]'),
            ).toHaveCount(1);
        }
    });
});

test.describe('a route in the rail', () => {
    test('carries no robots directive and a canonical URL', async ({ page }) => {
        for (const path of listedPaths) {
            await page.goto(path);
            await expect(page.locator('head meta[name="robots"]')).toHaveCount(
                0,
            );
            await expect(
                page.locator(
                    `head link[rel="canonical"][href="https://triiiceratops.org${path}"]`,
                ),
            ).toHaveCount(1);
        }
    });

    test('points its social card at the image already in circulation', async ({
        page,
    }) => {
        for (const path of ROUTES.map((route) => route.path)) {
            await page.goto(path);
            await expect(
                page.locator(
                    'head meta[property="og:image"][content="https://triiiceratops.org/social/og-landing-v1.png"]',
                ),
            ).toHaveCount(1);
        }
    });
});

test.describe('the next-page link', () => {
    test('sends the reader to a route whose prose has landed', async ({
        page,
    }) => {
        test.skip(
            LISTED.length < 2,
            'only one route is listed, so there is nowhere for the argument to continue',
        );
        for (const path of listedPaths) {
            await page.goto(path);
            const href = await page.locator('a.next').getAttribute('href');
            expect(listedPaths).toContain(href);
            expect(href).not.toBe(path);
        }
    });

    test('is absent while there is nowhere to continue to', async ({ page }) => {
        test.skip(LISTED.length >= 2, 'more than one route is listed');
        await page.goto('/');
        await expect(page.locator('a.next')).toHaveCount(0);
    });
});

test.describe('at phone size', () => {
    test.use({ viewport: PHONE });

    test('the slim bar says which page the reader is on', async ({ page }) => {
        await page.goto('/system/');
        const bar = page.getByRole('banner');
        await expect(bar).toBeVisible();
        await expect(bar).toContainText('Design system');
    });

    test('the bar’s control opens a full-screen sheet holding the same list', async ({
        page,
    }) => {
        await page.goto('/size/');
        await expect(
            page.getByRole('dialog', { name: 'Site navigation' }),
        ).toBeHidden();

        const sheet = await openSheet(page);
        await expect(sheet.locator('.rail__list a')).toHaveCount(
            listedPaths.length,
        );

        await sheet.getByRole('button', { name: 'Close' }).click();
        await expect(sheet).toBeHidden();
    });

    test('the front page keeps its rail unrolled, so it doubles as the index', async ({
        page,
    }) => {
        await page.goto('/');
        await expect(rail(page)).toBeVisible();
        await expect(railPageLinks(page).first()).toBeVisible();
    });

    test('another page collapses its rail into the sheet instead', async ({
        page,
    }) => {
        await page.goto('/system/');
        await expect(rail(page)).toBeHidden();
    });
});
