import { expect } from '@playwright/test';

// plugin-pdf-export-svelte: packed ESM entry; two-canvas export must yield `%PDF` bytes.

// Capture Blobs handed to createObjectURL; the URL is revoked but the Blob lives.
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

export default {
    name: 'plugin-pdf-export-svelte',
    buildScript: 'build',
    serveDir: 'dist',
    manifestTarget: null,
    browser: true,
    tarballs: [
        'triiiceratops',
        '@triiiceratops/plugin-sdk',
        '@triiiceratops/plugin-pdf-export',
    ],
    async assert({ page, baseURL, pageErrors }) {
        await page.addInitScript(CAPTURE_BLOBS);
        await page.goto(`${baseURL}/`, { waitUntil: 'load' });

        await expect(page.locator('#triiiceratops-viewer')).toBeVisible({
            timeout: 30_000,
        });
        await expect(
            page.locator('#triiiceratops-viewer canvas').first(),
        ).toBeVisible({ timeout: 30_000 });

        // Accessible name is the display title, never the package name.
        await page.getByRole('button', { name: 'Open Menu' }).click();
        const pluginButton = page.locator('[aria-label="PDF Export"]');
        await expect(pluginButton).toBeVisible({ timeout: 30_000 });
        await pluginButton.click();

        const start = page.locator('[data-tri-pdf-start]');
        const end = page.locator('[data-tri-pdf-end]');
        await expect(start).toBeAttached({ timeout: 10_000 });
        await start.selectOption('0');
        await end.selectOption('1');

        await expect(page.locator('[data-tri-pdf-count]')).toHaveText('2');

        const exportBtn = page.locator('[data-tri-pdf-export]');
        await expect(exportBtn).toBeEnabled({ timeout: 10_000 });
        await exportBtn.click();

        const result = page.locator('[data-tri-pdf-result]');
        await expect(result).toBeVisible({ timeout: 30_000 });
        await expect(result).toContainText('2');

        const pdf = await readPdf(page);
        expect(pdf.found, 'a PDF blob was produced for download').toBe(true);
        expect(pdf.magic, 'downloaded bytes start with the %PDF magic').toBe(
            '%PDF-',
        );
        expect(pdf.size, 'the PDF has real content').toBeGreaterThan(400);

        expect(
            pageErrors.map((e) => e.message),
            'no uncaught page errors',
        ).toEqual([]);
    },
};
