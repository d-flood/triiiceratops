import { expect } from '@playwright/test';

// plugin-image-manip-iife: no bundler; both script orders prove order-independent bootstrap.

async function drivePage(page, baseURL, pathname, pageErrors) {
    await page.goto(`${baseURL}/${pathname}`, { waitUntil: 'load' });

    await expect(page.locator('triiiceratops-viewer')).toBeVisible({
        timeout: 30_000,
    });
    await expect(
        page.locator('#triiiceratops-viewer canvas').first(),
    ).toBeVisible({ timeout: 30_000 });

    const registered = await page.evaluate(() =>
        Boolean(
            window.Triiiceratops?.plugins?.get(
                '@triiiceratops/plugin-image-manipulation',
            ),
        ),
    );
    expect(registered, `${pathname}: plugin registered in namespace`).toBe(
        true,
    );

    const openToolbar = page.locator('button.handle');
    await expect(openToolbar).toBeVisible({ timeout: 30_000 });
    await openToolbar.click();

    // Accessible name is the display title, not the package name.
    const toggle = page.locator(
        '[data-flyout-toggle][aria-label="Image Adjustments"]',
    );
    await expect(toggle).toBeVisible({ timeout: 30_000 });
    await toggle.click();

    const brightness = page.locator('[data-tri-im-slider="brightness"]');
    await expect(brightness).toBeVisible({ timeout: 10_000 });
    await brightness.fill('150');

    await expect
        .poll(
            () =>
                page
                    .locator('#triiiceratops-viewer canvas')
                    .evaluateAll((canvases) =>
                        canvases.some((c) =>
                            (c.style.filter || '').includes('brightness'),
                        ),
                    ),
            { timeout: 15_000 },
        )
        .toBe(true);

    expect(
        pageErrors.map((e) => e.message),
        `${pathname}: no uncaught page errors`,
    ).toEqual([]);
}

export default {
    name: 'plugin-image-manip-iife',
    buildScript: null,
    serveDir: '.',
    manifestTarget: 'manifest.json',
    browser: true,
    tarballs: [
        'triiiceratops',
        '@triiiceratops/plugin-sdk',
        '@triiiceratops/plugin-image-manipulation',
    ],
    async assert({ page, baseURL, pageErrors }) {
        await drivePage(page, baseURL, 'index.html', pageErrors);
        await drivePage(page, baseURL, 'index-plugin-first.html', pageErrors);
    },
};
