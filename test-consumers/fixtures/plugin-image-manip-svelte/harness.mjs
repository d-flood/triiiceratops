import { expect } from '@playwright/test';

// plugin-image-manip-svelte: packed ESM entry end to end via the `plugins` prop.
export default {
    name: 'plugin-image-manip-svelte',
    buildScript: 'build',
    serveDir: 'dist',
    manifestTarget: 'public/manifest.json',
    browser: true,
    tarballs: [
        'triiiceratops',
        '@triiiceratops/plugin-sdk',
        '@triiiceratops/plugin-image-manipulation',
    ],
    async assert({ page, baseURL, pageErrors }) {
        await page.goto(`${baseURL}/`, { waitUntil: 'load' });

        await expect(page.locator('#triiiceratops-viewer')).toBeVisible({
            timeout: 30_000,
        });
        await expect(
            page.locator('#triiiceratops-viewer canvas').first(),
        ).toBeVisible({ timeout: 30_000 });

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
                    page.evaluate(() => {
                        const canvases = document.querySelectorAll(
                            '#triiiceratops-viewer canvas',
                        );
                        return [...canvases].some((c) =>
                            (c.style.filter || '').includes('brightness'),
                        );
                    }),
                { timeout: 15_000 },
            )
            .toBe(true);

        const filter = await page.evaluate(() => {
            const canvases = document.querySelectorAll(
                '#triiiceratops-viewer canvas',
            );
            const filtered = [...canvases].find((c) =>
                (c.style.filter || '').includes('brightness'),
            );
            return filtered ? filtered.style.filter : '';
        });
        expect(filter).toContain('brightness(1.5)');

        expect(
            pageErrors.map((e) => e.message),
            'no uncaught page errors',
        ).toEqual([]);
    },
};
