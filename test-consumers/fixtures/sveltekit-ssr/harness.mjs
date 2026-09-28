import { expect } from '@playwright/test';

// sveltekit-ssr: build must succeed SSR-safe; page hydrates with zero mismatch and operates.
export default {
    name: 'sveltekit-ssr',
    buildScript: 'build',
    serveDir: 'build',
    manifestTarget: 'static/manifest.json',
    browser: true,
    async assert({ page, baseURL, consoleMessages, pageErrors }) {
        const res = await page.request.get(`${baseURL}/`);
        expect(res.ok(), 'prerendered index.html served').toBe(true);
        const html = await res.text();
        expect(
            html,
            'SSR HTML must contain the server-rendered viewer root',
        ).toContain('id="triiiceratops-viewer"');

        await page.goto(`${baseURL}/`, { waitUntil: 'load' });
        await expect(
            page.locator('#triiiceratops-viewer canvas').first(),
        ).toBeVisible({ timeout: 30_000 });

        const hydrationWarnings = consoleMessages.filter((m) =>
            /hydrat|mismatch/i.test(m.text),
        );
        expect(
            hydrationWarnings.map((m) => m.text),
            'no hydration-mismatch console messages',
        ).toEqual([]);

        expect(
            pageErrors.map((e) => e.message),
            'no uncaught page errors',
        ).toEqual([]);
    },
};
