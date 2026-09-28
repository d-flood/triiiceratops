import { expect } from '@playwright/test';

// plugin-image-export-iife: no bundler; both script orders, asserts a non-empty Blob.

async function drivePage(page, baseURL, pathname, pageErrors) {
    await page.goto(`${baseURL}/${pathname}`, { waitUntil: 'load' });

    await expect(page.locator('triiiceratops-viewer')).toBeVisible({
        timeout: 30_000,
    });
    await expect(
        page.locator('#triiiceratops-viewer canvas').first(),
    ).toBeVisible({ timeout: 30_000 });

    const registered = await page.evaluate(() =>
        Boolean(
            window.Triiiceratops?.plugins?.get(
                '@triiiceratops/plugin-image-export',
            ),
        ),
    );
    expect(registered, `${pathname}: plugin registered in namespace`).toBe(
        true,
    );

    await page.evaluate(() => {
        window.__triDownloads = [];
    });

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
    name: 'plugin-image-export-iife',
    buildScript: null,
    serveDir: '.',
    manifestTarget: 'manifest.json',
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

        await drivePage(page, baseURL, 'index.html', pageErrors);
        await drivePage(page, baseURL, 'index-plugin-first.html', pageErrors);
    },
};
