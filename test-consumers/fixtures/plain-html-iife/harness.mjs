import { expect } from '@playwright/test';

// plain-html-iife: no bundler. A static page loads the self-contained element
// IIFE from the installed package path via a <script> tag and renders a local
// manifest. No build step — the installed tarball is served as-is.
export default {
    name: 'plain-html-iife',
    buildScript: null,
    serveDir: '.',
    manifestTarget: 'manifest.json',
    browser: true,
    async assert({ page, baseURL, pageErrors }) {
        await page.goto(`${baseURL}/`, { waitUntil: 'load' });

        await expect(page.locator('triiiceratops-viewer')).toBeVisible({
            timeout: 30_000,
        });
        await expect(
            page.locator('#triiiceratops-viewer canvas').first(),
        ).toBeVisible({ timeout: 30_000 });

        expect(
            pageErrors.map((e) => e.message),
            'no uncaught page errors',
        ).toEqual([]);
    },
};
