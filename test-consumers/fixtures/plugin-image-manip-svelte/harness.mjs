import { expect } from '@playwright/test';

// plugin-image-manip-svelte: a Vite + Svelte app that renders the real viewer
// from the packed `triiiceratops` tarball and activates the migrated
// `@triiiceratops/plugin-image-manipulation` plugin (packed ESM entry) through
// the viewer's `plugins` prop. The journey proves the tracer end to end: the
// plugin's flyout opens, a filter slider is adjusted, and the renderer canvas gets
// the corresponding CSS filter.
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

        // Viewer mounts and the renderer paints the first canvas (renderer readiness).
        await expect(page.locator('#triiiceratops-viewer')).toBeVisible({
            timeout: 30_000,
        });
        await expect(
            page.locator('#triiiceratops-viewer canvas').first(),
        ).toBeVisible({ timeout: 30_000 });

        // Core owns the chrome now: the plugin button lives in the toolbar,
        // which starts collapsed. Open the toolbar, then open the plugin flyout
        // from its core-rendered button.
        const openToolbar = page.locator('button.handle');
        await expect(openToolbar).toBeVisible({ timeout: 30_000 });
        await openToolbar.click();

        // Accessible name = the plugin's DISPLAY title
        // (`image_adjustments_title` from the plugin's own catalog), not its
        // package name.
        const toggle = page.locator(
            '[data-flyout-toggle][aria-label="Image Adjustments"]',
        );
        await expect(toggle).toBeVisible({ timeout: 30_000 });
        await toggle.click();

        // Adjust the brightness slider well off the neutral 100.
        const brightness = page.locator('[data-tri-im-slider="brightness"]');
        await expect(brightness).toBeVisible({ timeout: 10_000 });
        await brightness.fill('150');

        // The renderer's canvas receives the CSS filter (brightness(1.5)).
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

        // Confirm the exact filter value landed on the renderer's canvas.
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
