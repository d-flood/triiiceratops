import { expect } from '@playwright/test';

// wc-esm: vanilla app registering the element entry via ESM import.
export default {
    name: 'wc-esm',
    buildScript: 'build',
    serveDir: 'dist',
    manifestTarget: 'public/manifest.json',
    browser: true,
    async assert({ page, baseURL, pageErrors }) {
        await page.goto(`${baseURL}/`, { waitUntil: 'load' });

        await expect(page.locator('triiiceratops-viewer')).toBeVisible({
            timeout: 30_000,
        });
        await expect(
            page.locator('#triiiceratops-viewer canvas').first(),
        ).toBeVisible({ timeout: 30_000 });

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

        // Host-supplied German catalog end to end through a real install.
        await expect(
            page.locator('[data-panel-id="search"][role="dialog"]'),
        ).toHaveAttribute('aria-label', 'Suche', { timeout: 30_000 });

        expect(
            pageErrors.map((e) => e.message),
            'no uncaught page errors',
        ).toEqual([]);
    },
};
