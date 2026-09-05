import { expect } from '@playwright/test';

// wc-esm: Vite vanilla app registering the viewer custom element through the
// packaged element entry (ESM import), rendering a local manifest.
export default {
    name: 'wc-esm',
    buildScript: 'build',
    serveDir: 'dist',
    manifestTarget: 'public/manifest.json',
    browser: true,
    async assert({ page, baseURL, pageErrors }) {
        await page.goto(`${baseURL}/`, { waitUntil: 'load' });

        // Custom element upgrades and the renderer paints the first canvas. Playwright CSS
        // locators pierce the element's open shadow root.
        await expect(page.locator('triiiceratops-viewer')).toBeVisible({
            timeout: 30_000,
        });
        await expect(
            page.locator('#triiiceratops-viewer canvas').first(),
        ).toBeVisible({ timeout: 30_000 });

        // Styles live inside the shadow root (no separate element stylesheet).
        const styledInShadow = await page.evaluate(() => {
            const host = document.querySelector('triiiceratops-viewer');
            const root = host && host.shadowRoot;
            if (!root) return false;
            const hasStyleEl = !!root.querySelector('style');
            const hasAdopted =
                (root.adoptedStyleSheets &&
                    root.adoptedStyleSheets.length > 0) ||
                false;
            return hasStyleEl || hasAdopted;
        });
        expect(
            styledInShadow,
            'element must self-style inside its shadow root',
        ).toBe(true);

        expect(
            pageErrors.map((e) => e.message),
            'no uncaught page errors',
        ).toEqual([]);
    },
};
