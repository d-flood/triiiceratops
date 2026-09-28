import { expect } from '@playwright/test';

// plugin-image-export-svelte: packed ESM entry; asserts a non-empty Blob via createObjectURL intercept.
export default {
    name: 'plugin-image-export-svelte',
    buildScript: 'build',
    serveDir: 'dist',
    manifestTarget: 'public/manifest.json',
    browser: true,
    tarballs: [
        'triiiceratops',
        '@triiiceratops/plugin-sdk',
        '@triiiceratops/plugin-image-export',
    ],
    async assert({ page, baseURL, pageErrors }) {
        await page.addInitScript(() => {
            window.__triDownloads = [];
            const original = URL.createObjectURL.bind(URL);
            URL.createObjectURL = (obj) => {
                try {
                    if (obj instanceof Blob) {
                        window.__triDownloads.push({
                            size: obj.size,
                            type: obj.type,
                        });
                    }
                } catch {
                    // Non-Blob arguments need no recording.
                }
                return original(obj);
            };
        });

        await page.goto(`${baseURL}/`, { waitUntil: 'load' });

        await expect(page.locator('#triiiceratops-viewer')).toBeVisible({
            timeout: 30_000,
        });
        await expect(
            page.locator('#triiiceratops-viewer canvas').first(),
        ).toBeVisible({ timeout: 30_000 });

        // Accessible name is the display title, not the package name.
        const toggle = page.locator('[aria-label="Download Image"]');
        await expect(toggle).toBeVisible({ timeout: 30_000 });
        await toggle.click();

        const downloadButton = page.locator('[data-tri-id-download]');
        await expect(downloadButton).toBeVisible({ timeout: 10_000 });
        await expect(downloadButton).toBeEnabled({ timeout: 15_000 });
        await downloadButton.click();

        await expect(page.locator('[data-tri-id-result]')).toBeVisible({
            timeout: 20_000,
        });

        const downloads = await page.evaluate(
            () => window.__triDownloads ?? [],
        );
        expect(
            downloads.length,
            'export minted a Blob object URL',
        ).toBeGreaterThan(0);
        expect(
            downloads.some((d) => d.size > 0),
            'exported Blob is non-empty binary output',
        ).toBe(true);

        expect(
            pageErrors.map((e) => e.message),
            'no uncaught page errors',
        ).toEqual([]);
    },
};
