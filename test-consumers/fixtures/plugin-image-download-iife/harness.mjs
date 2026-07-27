import { expect } from '@playwright/test';

// plugin-image-download-iife: no bundler. A static page loads the self-contained
// core element IIFE and the self-contained plugin IIFE from installed package
// paths, then activates the plugin explicitly through the shared
// `window.Triiiceratops.plugins` registry. Tested in BOTH script orders
// (core-first and plugin-first) to prove the order-independent bootstrap, and in
// each order it triggers an export and asserts a download-ready binary Blob is
// produced (the plugin's async/binary validation duty).

async function drivePage(page, baseURL, pathname, pageErrors) {
    await page.goto(`${baseURL}/${pathname}`, { waitUntil: 'load' });

    // The custom element upgrades and OSD paints inside the shadow root.
    await expect(page.locator('triiiceratops-viewer')).toBeVisible({
        timeout: 30_000,
    });
    await expect(
        page.locator('#triiiceratops-viewer canvas').first(),
    ).toBeVisible({ timeout: 30_000 });

    // The registry resolved the factory regardless of load order.
    const registered = await page.evaluate(() =>
        Boolean(
            window.Triiiceratops?.plugins?.get(
                '@triiiceratops/plugin-image-download',
            ),
        ),
    );
    expect(registered, `${pathname}: plugin registered in namespace`).toBe(
        true,
    );

    // Reset the blob-interception log for this page load.
    await page.evaluate(() => {
        window.__triDownloads = [];
    });

    // Open the plugin panel via the core-rendered toolbar button (core-owned
    // chrome, ticket 04) — labelled with the plugin name, living in the viewer's
    // shadow root; the Playwright locator pierces it. The page opens the toolbar
    // via the element's `config` (`toolbarOpen`) so the button is visible.
    const toggle = page.locator(
        '[aria-label="@triiiceratops/plugin-image-download"]',
    );
    await expect(toggle).toBeVisible({ timeout: 30_000 });
    await toggle.click();

    // Trigger the export once a resolution option resolves (async).
    const downloadButton = page.locator('[data-tri-id-download]');
    await expect(downloadButton).toBeVisible({ timeout: 10_000 });
    await expect(downloadButton).toBeEnabled({ timeout: 15_000 });
    await downloadButton.click();

    await expect(page.locator('[data-tri-id-result]')).toBeVisible({
        timeout: 20_000,
    });

    const downloads = await page.evaluate(() => window.__triDownloads ?? []);
    expect(
        downloads.length,
        `${pathname}: export minted a Blob object URL`,
    ).toBeGreaterThan(0);
    expect(
        downloads.some((d) => d.size > 0),
        `${pathname}: exported Blob is non-empty binary output`,
    ).toBe(true);

    expect(
        pageErrors.map((e) => e.message),
        `${pathname}: no uncaught page errors`,
    ).toEqual([]);
}

export default {
    name: 'plugin-image-download-iife',
    buildScript: null,
    serveDir: '.',
    manifestTarget: 'manifest.json',
    browser: true,
    tarballs: [
        'triiiceratops',
        '@triiiceratops/plugin-sdk',
        '@triiiceratops/plugin-image-download',
    ],
    async assert({ page, baseURL, pageErrors }) {
        // Blob interception: record every object URL minted for a Blob.
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

        // Order A: core IIFE first, then plugin IIFE.
        await drivePage(page, baseURL, 'index.html', pageErrors);
        // Order B: plugin IIFE first (bootstraps the namespace), then core.
        await drivePage(page, baseURL, 'index-plugin-first.html', pageErrors);
    },
};
