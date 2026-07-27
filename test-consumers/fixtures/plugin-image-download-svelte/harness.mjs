import { expect } from '@playwright/test';

// plugin-image-download-svelte: a Vite + Svelte app that renders the real viewer
// from the packed `triiiceratops` tarball and activates the migrated
// `@triiiceratops/plugin-image-download` plugin (packed ESM entry) through the
// viewer's `plugins` prop. This journey proves the plugin's validation duty
// (SPEC Plugin Migration): ASYNCHRONOUS operations and BINARY output through the
// SDK seam. It opens the panel, triggers an export, and asserts a download-ready
// Blob is produced — captured by intercepting `URL.createObjectURL` (the object
// URL the download is built from).
export default {
    name: 'plugin-image-download-svelte',
    buildScript: 'build',
    serveDir: 'dist',
    manifestTarget: 'public/manifest.json',
    browser: true,
    tarballs: [
        'triiiceratops',
        '@triiiceratops/plugin-sdk',
        '@triiiceratops/plugin-image-download',
    ],
    async assert({ page, baseURL, pageErrors }) {
        // Blob interception: record every object URL minted for a Blob so we can
        // assert the export produced non-empty binary output.
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
                    // ignore non-Blob arguments
                }
                return original(obj);
            };
        });

        await page.goto(`${baseURL}/`, { waitUntil: 'load' });

        // Viewer mounts and OSD paints the first canvas (OSD readiness).
        await expect(page.locator('#triiiceratops-viewer')).toBeVisible({
            timeout: 30_000,
        });
        await expect(
            page.locator('#triiiceratops-viewer canvas').first(),
        ).toBeVisible({ timeout: 30_000 });

        // Core renders the plugin's toolbar button (core-owned chrome, ticket
        // 04) — labelled with the plugin name — and owns opening the docked
        // panel. The app opens the toolbar via config (`toolbarOpen`), so the
        // button sits visible among the toolbar buttons.
        const toggle = page.locator(
            '[aria-label="@triiiceratops/plugin-image-download"]',
        );
        await expect(toggle).toBeVisible({ timeout: 30_000 });
        await toggle.click();

        // The download button enables once a resolution option resolves (async).
        const downloadButton = page.locator('[data-tri-id-download]');
        await expect(downloadButton).toBeVisible({ timeout: 10_000 });
        await expect(downloadButton).toBeEnabled({ timeout: 15_000 });
        await downloadButton.click();

        // The async export completes and reports success.
        await expect(page.locator('[data-tri-id-result]')).toBeVisible({
            timeout: 20_000,
        });

        // A download-ready Blob (non-empty binary output) was produced.
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
