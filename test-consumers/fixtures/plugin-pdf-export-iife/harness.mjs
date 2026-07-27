import { expect } from '@playwright/test';

// plugin-pdf-export-iife: no bundler. A static page loads the self-contained
// core element IIFE and the self-contained plugin IIFE (which bundles its own
// pdf-lib) from installed package paths, then activates the plugin explicitly
// through the shared `window.Triiiceratops.plugins` registry. Tested in BOTH
// script orders (core-first and plugin-first) to prove the order-independent
// bootstrap, and each order runs a real multi-page PDF export end to end.

const CAPTURE_BLOBS = () => {
    const orig = URL.createObjectURL.bind(URL);
    // eslint-disable-next-line no-undef
    window.__pdfBlobs = [];
    URL.createObjectURL = (obj) => {
        if (obj instanceof Blob) {
            // eslint-disable-next-line no-undef
            window.__pdfBlobs.push(obj);
        }
        return orig(obj);
    };
};

async function readPdf(page) {
    return page.evaluate(async () => {
        // eslint-disable-next-line no-undef
        const blobs = window.__pdfBlobs || [];
        const pdf = blobs.find((b) => b.type === 'application/pdf');
        if (!pdf) return { found: false };
        const buf = new Uint8Array(await pdf.arrayBuffer());
        // pdf-lib compresses page objects into object streams, so page count is
        // not readable from raw bytes; multi-page is asserted from the panel's
        // result message (two canvases). Here we assert the %PDF magic bytes.
        const magic = String.fromCharCode(...buf.slice(0, 5));
        return { found: true, size: buf.length, magic };
    });
}

async function drivePage(page, baseURL, pathname, pageErrors) {
    await page.addInitScript(CAPTURE_BLOBS);
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
                '@triiiceratops/plugin-pdf-export',
            ),
        ),
    );
    expect(registered, `${pathname}: plugin registered in namespace`).toBe(
        true,
    );

    // Open the plugin panel (its DOM lives in the viewer's shadow root; the
    // Playwright locator pierces it).
    const toggle = page.locator('[data-tri-pdf-toggle]');
    await expect(toggle).toBeVisible({ timeout: 30_000 });
    await toggle.click();

    // Select a two-canvas range and export.
    await page.locator('[data-tri-pdf-start]').selectOption('0');
    await page.locator('[data-tri-pdf-end]').selectOption('1');
    // The selected range covers both canvases → a genuinely multi-page export.
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
    // Ship our OWN multi-canvas manifest at the fixture root.
    manifestTarget: null,
    browser: true,
    tarballs: [
        'triiiceratops',
        '@triiiceratops/plugin-sdk',
        '@triiiceratops/plugin-pdf-export',
    ],
    async assert({ page, baseURL, pageErrors }) {
        // Order A: core IIFE first, then plugin IIFE.
        await drivePage(page, baseURL, 'index.html', pageErrors);
        // Order B: plugin IIFE first (bootstraps the namespace), then core.
        await drivePage(page, baseURL, 'index-plugin-first.html', pageErrors);
    },
};
