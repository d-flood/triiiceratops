import { test, expect, type Page } from '@playwright/test';

const config = {
    search: { open: true, showCloseButton: true, query: '' },
    annotations: { open: false, showCloseButton: true },
};

const HITS = 'triiiceratops-viewer [data-annotation-id^="urn:search-hit:"]';
const RESULTS = 'triiiceratops-viewer [data-panel-id="search"] mark';

async function searchForNeedle(page: Page): Promise<void> {
    await page.goto(
        `/e2e/harness.html?manifest=/demo-manifests/e2e/manifest.json&config=${encodeURIComponent(JSON.stringify(config))}`,
        { waitUntil: 'domcontentloaded' },
    );

    await page.waitForFunction(
        () =>
            (document.querySelector('triiiceratops-viewer') as any)?.viewerState
                ?.manifestId,
        undefined,
        { timeout: 20000 },
    );

    await page.evaluate(async () => {
        const el = document.querySelector('triiiceratops-viewer') as any;
        el.searchProvider = async () => [
            {
                canvasIndex: 0,
                canvasLabel: 'Page 1',
                hits: [
                    {
                        type: 'hit',
                        match: '<mark>needle</mark>',
                        bounds: [10, 10, 20, 20],
                    },
                ],
            },
        ];
        await el.viewerState.search('needle');
    });

    await expect(page.locator(RESULTS)).toHaveText('needle', {
        timeout: 20000,
    });
}

async function setSearchOpen(page: Page, open: boolean): Promise<void> {
    await page.evaluate((open) => {
        (document.querySelector('triiiceratops-viewer') as any).config = {
            search: { open },
        };
    }, open);
}

test.describe('search hits', () => {
    test('appear while the annotations panel is closed', async ({ page }) => {
        await searchForNeedle(page);

        await expect(
            page.locator('triiiceratops-viewer [data-panel-id="annotations"]'),
        ).toHaveCount(0);
        await expect(page.locator(HITS)).toHaveCount(1, { timeout: 20000 });
    });

    test('hide with the search panel and return when it reopens', async ({
        page,
    }) => {
        await searchForNeedle(page);
        await expect(page.locator(HITS)).toHaveCount(1, { timeout: 20000 });

        const toggle = page.getByRole('button', { name: 'Toggle Search' });
        await toggle.click();
        await expect(page.locator(HITS)).toHaveCount(0);
        await toggle.click();
        await expect(page.locator(RESULTS)).toHaveText('needle');
        await expect(page.locator(HITS)).toHaveCount(1);

        await setSearchOpen(page, false);
        await expect(page.locator(HITS)).toHaveCount(0);
        await setSearchOpen(page, true);
        await expect(page.locator(RESULTS)).toHaveText('needle');
        await expect(page.locator(HITS)).toHaveCount(1);
    });
});
