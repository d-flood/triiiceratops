import { expect } from '@playwright/test';

// plugin-image-manip-failure: failure-isolation smoke for a real SDK plugin. A
// plugin authored on the packed SDK throws in `mount`; core must keep the viewer
// live, degrade silently (ADR 0010 — NO user-facing error UI), and deliver the
// structured `pluginerror` to the host callback with phase `mount`.
export default {
    name: 'plugin-image-manip-failure',
    buildScript: 'build',
    serveDir: 'dist',
    manifestTarget: 'public/manifest.json',
    browser: true,
    tarballs: ['triiiceratops', '@triiiceratops/plugin-sdk'],
    async assert({ page, baseURL, pageErrors }) {
        await page.goto(`${baseURL}/`, { waitUntil: 'load' });

        // The viewer stays operational despite the plugin's mount failure.
        await expect(page.locator('#triiiceratops-viewer')).toBeVisible({
            timeout: 30_000,
        });
        await expect(
            page.locator('#triiiceratops-viewer canvas').first(),
        ).toBeVisible({ timeout: 30_000 });

        // Fail closed (ADR 0010): no user-facing error UI is rendered.
        await expect(
            page.locator('[data-plugin-error-button]'),
        ).toHaveCount(0);
        await expect(page.locator('[data-plugin-error-rail]')).toHaveCount(0);

        // The structured pluginerror reached the host callback with the mount
        // phase, the failing plugin's name, and a retry() affordance.
        const report = await page.evaluate(() => window.__triPluginError);
        expect(report, 'onpluginerror host callback fired').toBeTruthy();
        expect(report.phase).toBe('mount');
        expect(report.name).toBe('@triiiceratops/plugin-broken-fixture');
        expect(report.message).toContain('boom');
        expect(report.hasRetry).toBe(true);

        // The forced mount error is isolated (routed through the channel), not an
        // uncaught page error.
        expect(
            pageErrors.map((e) => e.message),
            'forced plugin error is isolated, not uncaught',
        ).toEqual([]);
    },
};
