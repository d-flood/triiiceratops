import { expect } from '@playwright/test';

// plugin-image-manip-iife: no bundler. A static page loads the self-contained
// core element IIFE and the self-contained plugin IIFE from installed package
// paths, then activates the plugin explicitly through the shared
// `window.Triiiceratops.plugins` registry. Tested in BOTH script orders
// (core-first and plugin-first) to prove the order-independent bootstrap.

async function drivePage(page, baseURL, pathname, pageErrors) {
    await page.goto(`${baseURL}/${pathname}`, { waitUntil: 'load' });

    // The custom element upgrades and OSD paints inside the shadow root.
    await expect(page.locator('triiiceratops-viewer')).toBeVisible({
        timeout: 30_000,
    });
    await expect(
        page.locator('#triiiceratops-viewer canvas').first(),
    ).toBeVisible({ timeout: 30_000 });

    // The registry resolved the factory regardless of load order.
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

    // Core owns the chrome now: the plugin button lives in the toolbar (in the
    // viewer's shadow root; the Playwright locator pierces it), which starts
    // collapsed. Open the toolbar, then open the plugin flyout from its
    // core-rendered button.
    const openToolbar = page.locator('button.handle');
    await expect(openToolbar).toBeVisible({ timeout: 30_000 });
    await openToolbar.click();

    // Accessible name = the plugin's DISPLAY title (`image_adjustments_title`
    // from the plugin's own catalog), not its package name.
    const toggle = page.locator(
        '[data-flyout-toggle][aria-label="Image Adjustments"]',
    );
    await expect(toggle).toBeVisible({ timeout: 30_000 });
    await toggle.click();

    // Adjust a filter and assert the OSD canvas receives the CSS filter.
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
        // Order A: core IIFE first, then plugin IIFE.
        await drivePage(page, baseURL, 'index.html', pageErrors);
        // Order B: plugin IIFE first (bootstraps the namespace), then core.
        await drivePage(page, baseURL, 'index-plugin-first.html', pageErrors);
    },
};
