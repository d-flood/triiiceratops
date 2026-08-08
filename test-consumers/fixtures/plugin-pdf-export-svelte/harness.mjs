import { expect } from '@playwright/test';

// plugin-pdf-export-svelte: a Vite + Svelte app that renders the real viewer
// from the packed `triiiceratops` tarball and activates the migrated
// `@triiiceratops/plugin-pdf-export` plugin (packed ESM entry) through the
// viewer's `plugins` prop. The journey proves the plugin end to end from a real
// tarball install: the plugin's panel opens, a two-canvas range is selected, an
// export runs, and the downloaded bytes are a real multi-page PDF (`%PDF` magic
// bytes). `pdf-lib` is the plugin package's OWN runtime dependency — it left
// core's graph (ticket 16) — so this also proves heavy-dependency isolation.

// The plugin downloads via an `<a download>` + `URL.createObjectURL`. Capture
// every Blob handed to `createObjectURL` (the URL is revoked immediately, but
// the Blob reference lives) so the test can read the produced PDF bytes.
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
        // Assert the magic bytes. pdf-lib packs page objects into compressed
        // object streams by default, so page count is not readable from the raw
        // bytes here — the multi-page nature is asserted from the panel's result
        // message (two canvases exported) instead.
        const magic = String.fromCharCode(...buf.slice(0, 5));
        return { found: true, size: buf.length, magic };
    });
}

export default {
    name: 'plugin-pdf-export-svelte',
    buildScript: 'build',
    serveDir: 'dist',
    // Ship our OWN multi-canvas manifest (in public/), so skip the shared one.
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

        // Viewer mounts and the renderer paints the first canvas (renderer readiness).
        await expect(page.locator('#triiiceratops-viewer')).toBeVisible({
            timeout: 30_000,
        });
        await expect(
            page.locator('#triiiceratops-viewer canvas').first(),
        ).toBeVisible({ timeout: 30_000 });

        // Core owns the plugin chrome (epic restore-plugin-toolbar-chrome): the
        // toolbar button is core-rendered from the plugin's icon, and the panel
        // docks in the viewer chrome. Open the (default-closed) toolbar, then
        // click the plugin's toolbar button to dock its panel.
        //
        // The accessible name is the plugin's DISPLAY title (`pdf_export_title`
        // resolved against the plugin's own catalog), never its package name —
        // asserting on it here guards that regression from the packed tarball.
        await page.getByRole('button', { name: 'Open Menu' }).click();
        const pluginButton = page.locator('[aria-label="PDF Export"]');
        await expect(pluginButton).toBeVisible({ timeout: 30_000 });
        await pluginButton.click();

        // Select a two-canvas range so the export is genuinely multi-page. The
        // range controls are themed `@triiiceratops/ui` `Select`s; the data-attr
        // rides on each one's underlying native <select>, which stays the value
        // source of truth.
        const start = page.locator('[data-tri-pdf-start]');
        const end = page.locator('[data-tri-pdf-end]');
        await expect(start).toBeAttached({ timeout: 10_000 });
        await start.selectOption('0');
        await end.selectOption('1');

        // The selected range covers both canvases → a genuinely multi-page
        // export.
        await expect(page.locator('[data-tri-pdf-count]')).toHaveText('2');

        // Export. The button is enabled once a valid range + manifest are ready.
        const exportBtn = page.locator('[data-tri-pdf-export]');
        await expect(exportBtn).toBeEnabled({ timeout: 10_000 });
        await exportBtn.click();

        // The success alert confirms the export completed and the download
        // fired; it reports the exported canvas count (two → genuinely
        // multi-page).
        const result = page.locator('[data-tri-pdf-result]');
        await expect(result).toBeVisible({ timeout: 30_000 });
        await expect(result).toContainText('2');

        // Assert the captured download is a real PDF (magic bytes).
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
