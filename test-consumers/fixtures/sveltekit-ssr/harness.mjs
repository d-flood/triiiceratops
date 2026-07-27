import { expect } from '@playwright/test';

// sveltekit-ssr: SvelteKit app. `vite build` must succeed (SSR-safe import),
// the server-rendered HTML must be stable, the page must hydrate with zero
// hydration-mismatch console messages, and the viewer must operate after
// hydration.
export default {
    name: 'sveltekit-ssr',
    buildScript: 'build',
    serveDir: 'build',
    manifestTarget: 'static/manifest.json',
    browser: true,
    async assert({ page, baseURL, consoleMessages, pageErrors }) {
        // 1. Server-rendered HTML is stable and already contains the viewer root
        //    markup (rendered without any client JS).
        const res = await page.request.get(`${baseURL}/`);
        expect(res.ok(), 'prerendered index.html served').toBe(true);
        const html = await res.text();
        expect(
            html,
            'SSR HTML must contain the server-rendered viewer root',
        ).toContain('id="triiiceratops-viewer"');

        // 2. Hydrate + operate: OSD paints the first canvas post-hydration.
        await page.goto(`${baseURL}/`, { waitUntil: 'load' });
        await expect(
            page.locator('#triiiceratops-viewer canvas').first(),
        ).toBeVisible({ timeout: 30_000 });

        // 3. Zero hydration-mismatch diagnostics.
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
