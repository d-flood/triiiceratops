import { expect } from '@playwright/test';

// plugin-pdf-export-iife: no bundler; both script orders, real multi-page export.

const CAPTURE_BLOBS = () => {
    const orig = URL.createObjectURL.bind(URL);

    window.__pdfBlobs = [];
    URL.createObjectURL = (obj) => {
        if (obj instanceof Blob) {
            window.__pdfBlobs.push(obj);
        }
        return orig(obj);
    };
};

async function readPdf(page) {
    return page.evaluate(async () => {
        const blobs = window.__pdfBlobs || [];
        const pdf = blobs.find((b) => b.type === 'application/pdf');
        if (!pdf) return { found: false };
        const buf = new Uint8Array(await pdf.arrayBuffer());
        const magic = String.fromCharCode(...buf.slice(0, 5));
        return { found: true, size: buf.length, magic };
    });
}

async function drivePage(page, baseURL, pathname, pageErrors) {
    await page.addInitScript(CAPTURE_BLOBS);
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
                '@triiiceratops/plugin-pdf-export',
            ),
        ),
    );
    expect(registered, `${pathname}: plugin registered in namespace`).toBe(
        true,
    );

    // Accessible name is the display title, never the package name.
    await page.getByRole('button', { name: 'Open Menu' }).click();
    const pluginButton = page.locator('[aria-label="PDF Export"]');
    await expect(pluginButton).toBeVisible({ timeout: 30_000 });
    await pluginButton.click();

    await page.locator('[data-tri-pdf-start]').selectOption('0');
    await page.locator('[data-tri-pdf-end]').selectOption('1');
    await expect(page.locator('[data-tri-pdf-count]')).toHaveText('2');
    const exportBtn = page.locator('[data-tri-pdf-export]');
    await expect(exportBtn).toBeEnabled({ timeout: 10_000 });
    await exportBtn.click();

    const result = page.locator('[data-tri-pdf-result]');
    await expect(result).toBeVisible({ timeout: 30_000 });
    await expect(result, `${pathname}: two canvases exported`).toContainText(
        '2',
    );

    const pdf = await readPdf(page);
    expect(pdf.found, `${pathname}: a PDF blob was produced`).toBe(true);
    expect(pdf.magic, `${pathname}: bytes start with %PDF magic`).toBe('%PDF-');
    expect(pdf.size, `${pathname}: the PDF has real content`).toBeGreaterThan(
        400,
    );

    expect(
        pageErrors.map((e) => e.message),
        `${pathname}: no uncaught page errors`,
    ).toEqual([]);
}

export default {
    name: 'plugin-pdf-export-iife',
    buildScript: null,
    serveDir: '.',
    manifestTarget: null,
    browser: true,
    tarballs: [
        'triiiceratops',
        '@triiiceratops/plugin-sdk',
        '@triiiceratops/plugin-pdf-export',
    ],
    async assert({ page, baseURL, pageErrors }) {
        await drivePage(page, baseURL, 'index.html', pageErrors);
        await drivePage(page, baseURL, 'index-plugin-first.html', pageErrors);
    },
};
