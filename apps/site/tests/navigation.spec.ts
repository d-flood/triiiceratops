import { expect, test } from '@playwright/test';

import { PUBLISHED_ORIGIN } from './helpers/origin';

const pages = [
    '/',
    '/features/',
    '/size/',
    '/accessibility/',
    '/production/',
    '/install/',
];

for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 1280, height: 720 },
    { width: 390, height: 844 },
]) {
    test(`published navigation fits at ${viewport.width} by ${viewport.height}`, async ({
        page,
    }) => {
        await page.setViewportSize(viewport);
        await page.goto(`${PUBLISHED_ORIGIN}/install/`);
        await page.evaluate(() => document.fonts.ready);
        let nav = page.locator('nav.rail');
        if (viewport.width < 900) {
            nav = page.getByRole('dialog', { name: 'Site navigation' });
            await expect(async () => {
                await page
                    .getByRole('button', { name: 'Open navigation' })
                    .click();
                await expect(nav).toBeVisible({ timeout: 1000 });
            }).toPass();
        }
        await expect(nav).toBeVisible();
        expect(
            await nav
                .locator('.rail__list a')
                .evaluateAll((links) =>
                    links.map((link) => link.getAttribute('href')),
                ),
        ).toEqual(pages);
        await expect(nav.locator('.rail__out a')).toHaveText([
            'Try your own manifest →',
            'Build your viewer',
            'Documentation',
            'Source on GitHub',
        ]);
        for (const link of await nav.locator('a').all()) {
            await expect(link).toBeInViewport();
        }
        expect(
            await page.evaluate(
                () => document.documentElement.scrollWidth <= window.innerWidth,
            ),
        ).toBe(true);
    });
}

test('published redirects preserve shared selections and fragments', async ({
    page,
}) => {
    for (const [from, to] of [
        ['/handles/', '/features/'],
        ['/access/', '/accessibility/'],
    ]) {
        await page.goto(`${PUBLISHED_ORIGIN}${from}?feature=2#reading`);
        await expect(page).toHaveURL(
            `${PUBLISHED_ORIGIN}${to}?feature=2#reading`,
        );
        await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
            'href',
            `https://triiiceratops.org${to}`,
        );
    }
});

test('published redirects work without JavaScript', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    try {
        for (const [from, to] of [
            ['/handles/', '/features/'],
            ['/access/', '/accessibility/'],
        ]) {
            await page.goto(`${PUBLISHED_ORIGIN}${from}`);
            await expect(page).toHaveURL(`${PUBLISHED_ORIGIN}${to}`);
        }
    } finally {
        await context.close();
    }
});

test('published sitemap includes the builder and canonical pages without legacy routes', async ({
    request,
}) => {
    const response = await request.get(`${PUBLISHED_ORIGIN}/sitemap.xml`);
    const xml = await response.text();
    for (const path of [...pages, '/configure/']) {
        expect(xml).toContain(`<loc>https://triiiceratops.org${path}</loc>`);
    }
    for (const path of ['/handles/', '/access/', '/demo/', '/system/']) {
        expect(xml).not.toContain(
            `<loc>https://triiiceratops.org${path}</loc>`,
        );
    }
});
