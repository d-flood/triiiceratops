import { expect } from '@playwright/test';

// plugin-pdf-export-iife: no bundler; both script orders, real multi-page export,
// pdf-lib fetched from its sibling chunk only on export, and a missing chunk.

const CHUNK = '/node_modules/@triiiceratops/plugin-pdf-export/dist/pdf-lib.js';

const CAPTURE_PLUGIN_ERRORS = () => {
    window.__pdfErrors = [];
    document.addEventListener('pluginerror', (event) => {
        window.__pdfErrors.push(event.detail);
    });
};

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

async function openPanelAndExport(page, baseURL, pathname) {
    const chunkRequests = [];
    page.on('request', (request) => {
        if (new URL(request.url()).pathname === CHUNK) {
            chunkRequests.push(request.url());
        }
    });
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
    expect(
        chunkRequests,
        `${pathname}: pdf-lib not fetched before export`,
    ).toEqual([]);
    await exportBtn.click();
    return chunkRequests;
}

async function drivePage(page, baseURL, pathname, pageErrors) {
    await page.addInitScript(CAPTURE_BLOBS);
    const chunkRequests = await openPanelAndExport(page, baseURL, pathname);

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
        chunkRequests,
        `${pathname}: pdf-lib fetched from its chunk`,
    ).toEqual([`${baseURL}${CHUNK}`]);

    expect(
        pageErrors.map((e) => e.message),
        `${pathname}: no uncaught page errors`,
    ).toEqual([]);
}

async function driveMissingChunk(page, baseURL, pageErrors) {
    await page.addInitScript(CAPTURE_PLUGIN_ERRORS);
    await page.route(`**${CHUNK}`, (route) => route.abort());
    await openPanelAndExport(page, baseURL, 'index.html');

    await expect(page.locator('[data-tri-pdf] [role="alert"]')).toHaveText(
        'Unable to export PDF. Check the browser console for details.',
        { timeout: 30_000 },
    );
    const report = await page.evaluate(() => {
        const detail = window.__pdfErrors[0];
        return (
            detail && {
                phase: detail.phase,
                message: detail.error?.message,
                isError: detail.error instanceof Error,
                hasRetry: typeof detail.retry === 'function',
            }
        );
    });
    expect(report, 'missing chunk: pluginerror fired').toBeTruthy();
    expect(report.phase).toBe('command');
    expect(report.isError).toBe(true);
    expect(report.message).toContain(`${baseURL}${CHUNK}`);
    expect(report.hasRetry).toBe(true);

    await page.unroute(`**${CHUNK}`);
    await page.evaluate(() => window.__pdfErrors[0].retry());
    await expect(
        page.locator('[data-tri-pdf-result]'),
        'missing chunk: retry fetches the chunk again',
    ).toBeVisible({ timeout: 30_000 });

    expect(
        pageErrors.map((e) => e.message),
        'missing chunk: no uncaught page errors',
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
        const failurePage = await page.context().newPage();
        const failureErrors = [];
        failurePage.on('pageerror', (e) => failureErrors.push(e));
        await driveMissingChunk(failurePage, baseURL, failureErrors);
    },
};
