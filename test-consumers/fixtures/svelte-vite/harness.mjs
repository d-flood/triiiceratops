import { expect } from '@playwright/test';

// svelte-vite: minimal Vite + Svelte app importing `triiiceratops` and
// `triiiceratops/style.css`, rendering a local manifest.
export default {
    name: 'svelte-vite',
    buildScript: 'build',
    serveDir: 'dist',
    manifestTarget: 'public/manifest.json',
    browser: true,
    async assert({ page, baseURL, pageErrors }) {
        await page.goto(`${baseURL}/`, { waitUntil: 'load' });

        // The viewer mounts and the renderer paints the first canvas.
        await expect(page.locator('#triiiceratops-viewer')).toBeVisible({
            timeout: 30_000,
        });
        await expect(
            page.locator('#triiiceratops-viewer canvas').first(),
        ).toBeVisible({ timeout: 30_000 });

        // Styles arrived via the documented stylesheet export: the root carries
        // theme tokens, so its background is not the UA default transparent.
        const bg = await page.evaluate(() => {
            const el = document.querySelector('#triiiceratops-viewer');
            return getComputedStyle(el).backgroundColor;
        });
        expect(
            bg,
            'viewer root should be styled by triiiceratops/style.css',
        ).not.toBe('rgba(0, 0, 0, 0)');

        expect(
            pageErrors.map((e) => e.message),
            'no uncaught page errors',
        ).toEqual([]);
    },
};
