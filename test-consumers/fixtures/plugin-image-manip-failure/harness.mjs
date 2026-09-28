import { expect } from '@playwright/test';

// plugin-image-manip-failure: mount throw must degrade silently with a `pluginerror` mount report.
export default {
    name: 'plugin-image-manip-failure',
    buildScript: 'build',
    serveDir: 'dist',
    manifestTarget: 'public/manifest.json',
    browser: true,
    tarballs: ['triiiceratops', '@triiiceratops/plugin-sdk'],
    async assert({ page, baseURL, pageErrors }) {
        await page.goto(`${baseURL}/`, { waitUntil: 'load' });

        await expect(page.locator('#triiiceratops-viewer')).toBeVisible({
            timeout: 30_000,
        });
        await expect(
            page.locator('#triiiceratops-viewer canvas').first(),
        ).toBeVisible({ timeout: 30_000 });

        await expect(page.locator('[data-plugin-error-button]')).toHaveCount(0);
        await expect(page.locator('[data-plugin-error-rail]')).toHaveCount(0);

        const report = await page.evaluate(() => window.__triPluginError);
        expect(report, 'onpluginerror host callback fired').toBeTruthy();
        expect(report.phase).toBe('mount');
        expect(report.name).toBe('@triiiceratops/plugin-broken-fixture');
        expect(report.message).toContain('boom');
        expect(report.hasRetry).toBe(true);

        expect(
            pageErrors.map((e) => e.message),
            'forced plugin error is isolated, not uncaught',
        ).toEqual([]);
    },
};
