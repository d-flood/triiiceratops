/**
 * The marketing site's shell, in a browser: what only a browser can see.
 *
 * The rail on every route it carries, the mobile bar and its full-screen sheet,
 * the footer's four institutional facts, the appendix's absence from a crawler's
 * reach, and which application each of the two application routes declares
 * itself to be.
 *
 * The crawl policy's other half is asserted where it is visible: absence from
 * the sitemap in `tests/unit/routes.test.ts`.
 */

import { expect, test, type Page } from '@playwright/test';

import {
    APP_MARKER,
    BARE_VIEWER_APP,
    PLAYGROUND_APP,
} from '../src/lib/applications';
import { NAV, ROUTES, isNavigable } from '../src/lib/routes';
import {
    DOCUMENTATION_PATH,
    HOSTED_VIEWER_PATH,
    PLAYGROUND_PATH,
} from '../src/lib/site';

const PHONE = { width: 390, height: 844 };
const WIDE = { width: 1920, height: 1080 };
const BELOW_CAP = [
    { width: 1280, height: 900 },
    { width: 1024, height: 900 },
];

/** Every full-bleed strip of the main column, in the order a page stacks them. */
const FRAME_STRIPS = '.hero, .pagehead, .band, a.next, .sitefoot';

/** Must match `--content-max` in packages/shell/tokens.css. */
const CONTENT_MAX = 1120;

type Strip = {
    width: number;
    content: number;
    padStart: number;
    padEnd: number;
};

/**
 * Each strip's border-box width and the width of the content it lays out,
 * measured rather than read off the stylesheet.
 */
function strips(page: Page): Promise<Strip[]> {
    return page.locator(FRAME_STRIPS).evaluateAll((nodes) =>
        nodes.map((node) => {
            const style = getComputedStyle(node);
            const padStart = parseFloat(style.paddingLeft);
            const padEnd = parseFloat(style.paddingRight);
            return {
                width: node.getBoundingClientRect().width,
                content: node.clientWidth - padStart - padEnd,
                padStart,
                padEnd,
            };
        }),
    );
}

const navPaths = NAV.map((route) => route.path);
const unindexedPaths = ROUTES.filter((route) => !isNavigable(route)).map(
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
    test('lists exactly the routes it carries, on every one of them', async ({
        page,
    }) => {
        for (const path of navPaths) {
            await page.goto(path);
            await expect(railPageLinks(page)).toHaveCount(navPaths.length);
            for (const carried of navPaths) {
                await expect(
                    railPageLinks(page).and(
                        page.locator(`[href="${carried}"]`),
                    ),
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

    test('points at the application routes, the documentation and the repository', async ({
        page,
    }) => {
        await page.goto('/');
        for (const href of [
            HOSTED_VIEWER_PATH,
            PLAYGROUND_PATH,
            DOCUMENTATION_PATH,
        ]) {
            await expect(rail(page).locator(`a[href="${href}"]`)).toHaveCount(
                1,
            );
        }
        await expect(
            rail(page).locator('a[href*="github.com/d-flood/triiiceratops"]'),
        ).toHaveCount(1);
    });
});

/*
 * Which application each path serves, asserted where it is observable: in the
 * served page's head.
 *
 * Both paths resolve and both render a viewer, so nothing else in the tree tells
 * them apart — and a swap breaks every published IIIF Cookbook recipe, which link
 * `/viewer/` directly. `scripts/url-contract.mjs` makes the same assertion over
 * the built tree; this one holds the routes to it as they are authored.
 */
test.describe('the application routes', () => {
    const identities = [
        { path: HOSTED_VIEWER_PATH, app: BARE_VIEWER_APP },
        { path: PLAYGROUND_PATH, app: PLAYGROUND_APP },
    ];

    for (const { path, app } of identities) {
        test(`${path} declares itself as ${app}`, async ({ page }) => {
            await page.goto(path);
            await expect(
                page.locator(`head meta[name="${APP_MARKER}"]`),
            ).toHaveAttribute('content', app);
        });
    }

    test('do not carry the marketing rail', async ({ page }) => {
        // They fill the window and draw their own chrome, which is why they sit
        // outside the group layout that carries the rail.
        for (const { path } of identities) {
            await page.goto(path);
            await expect(rail(page)).toHaveCount(0);
        }
    });

    test('the playground mounts its viewer and the site’s one toggle', async ({
        page,
    }) => {
        await page.goto(PLAYGROUND_PATH);
        await expect(page.locator('.themebtn')).toBeVisible();
        await expect(
            page.locator('[data-testid="canvas-renderer-surface"]'),
        ).toBeVisible({ timeout: 60_000 });
    });

    /*
     * No viewer in the rendered document.
     *
     * Both routes render server-side under `strict` prerendering, and a canvas
     * renderer must never run there. With script off, what is left is exactly
     * what the static adapter wrote to disk — so an eagerly imported viewer
     * would show up here as a surface in a document that ran no client code.
     */
    test.describe('rendered without script', () => {
        test.use({ javaScriptEnabled: false });

        for (const { path } of [
            { path: HOSTED_VIEWER_PATH },
            { path: PLAYGROUND_PATH },
        ]) {
            test(`${path} carries no viewer, and says what it needs`, async ({
                page,
            }) => {
                await page.goto(path);
                await expect(
                    page.locator('[data-testid="canvas-renderer-surface"]'),
                ).toHaveCount(0);
                await expect(page.locator('.appwait')).toContainText(
                    'It needs JavaScript',
                );
            });
        }
    });
});

test.describe('a route not offered to a crawler', () => {
    test('carries noindex', async ({ page }) => {
        for (const path of unindexedPaths) {
            await page.goto(path);
            await expect(
                page.locator('head meta[name="robots"][content="noindex"]'),
            ).toHaveCount(1);
        }
    });
});

test.describe('a route offered to a crawler', () => {
    test('carries no robots directive and a canonical URL', async ({
        page,
    }) => {
        for (const path of navPaths) {
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
    test('sends the reader to a route the rail carries', async ({ page }) => {
        test.skip(
            NAV.length < 2,
            'only one route is navigable, so there is nowhere for the argument to continue',
        );
        for (const path of navPaths) {
            await page.goto(path);
            const href = await page.locator('a.next').getAttribute('href');
            expect(navPaths).toContain(href);
            expect(href).not.toBe(path);
        }
    });

    test('is absent while there is nowhere to continue to', async ({
        page,
    }) => {
        test.skip(NAV.length >= 2, 'more than one route is navigable');
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
            navPaths.length,
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

test.describe('the page frame', () => {
    test.describe('on a wide display', () => {
        test.use({ viewport: WIDE });

        for (const route of ROUTES) {
            test(`${route.path} bounds its content and still runs edge to edge`, async ({
                page,
            }) => {
                await page.goto(route.path);
                const column = await page
                    .locator('.main')
                    .evaluate((node) => node.getBoundingClientRect().width);
                expect(column).toBeGreaterThan(CONTENT_MAX);

                const measured = await strips(page);
                expect(measured.length).toBeGreaterThan(0);
                for (const strip of measured) {
                    expect(strip.content).toBeLessThanOrEqual(CONTENT_MAX);
                    expect(strip.width).toBeCloseTo(column, 0);
                }
            });
        }

        test('the widest figure reads inside the cap', async ({ page }) => {
            await page.goto('/size/');
            const svg = page.locator('.scatter svg').first();
            const box = await svg.evaluate((node) => {
                const rect = node.getBoundingClientRect();
                const label = [...node.querySelectorAll('text')]
                    .map((text) => text.getBoundingClientRect().right)
                    .reduce((widest, right) => Math.max(widest, right), 0);
                return { right: rect.right, width: rect.width, label };
            });
            expect(box.width).toBeLessThanOrEqual(860);
            expect(box.label).toBeLessThanOrEqual(box.right);
        });
    });

    for (const viewport of BELOW_CAP) {
        test.describe(`below the cap at ${viewport.width}px`, () => {
            test.use({ viewport });

            test('every strip is padded the same on both edges, as it was', async ({
                page,
            }) => {
                await page.goto('/size/');
                for (const strip of await strips(page)) {
                    expect(strip.padEnd).toBeCloseTo(strip.padStart, 0);
                }
            });
        });
    }

    test.describe('at phone size', () => {
        test.use({ viewport: PHONE });

        test('the breakpoint’s own padding still wins', async ({ page }) => {
            await page.goto('/system/');
            const head = await page
                .locator('.pagehead')
                .evaluate((node) => getComputedStyle(node).padding);
            expect(head).toBe('32px 24px 24px');
        });
    });
});
