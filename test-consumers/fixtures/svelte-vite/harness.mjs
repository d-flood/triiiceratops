import { expect } from '@playwright/test';

// svelte-vite: Vite + Svelte app on `triiiceratops` + stylesheet.
export default {
    name: 'svelte-vite',
    buildScript: 'build',
    serveDir: 'dist',
    manifestTarget: 'public/manifest.json',
    browser: true,
    async assert({ page, baseURL, pageErrors }) {
        await page.goto(`${baseURL}/`, { waitUntil: 'load' });

        await expect(page.locator('#triiiceratops-viewer')).toBeVisible({
            timeout: 30_000,
        });
        await expect(
            page.locator('#triiiceratops-viewer canvas').first(),
        ).toBeVisible({ timeout: 30_000 });

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
