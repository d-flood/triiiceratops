import { test, expect } from '@playwright/test';

// An invalid/conflicting configuration surfaces as a typed `viewererror` — a
// bubbling, composed CustomEvent from the viewer root — not merely console
// output. Here: `nav.edge: 'top'` while a top-anchored toolbar already owns
// the top edge.

const MANIFEST = '/demo-manifests/e2e/manifest.json';

test('conflicting nav config dispatches a structured viewererror event', async ({
    page,
}) => {
    // Capture the composed event at the document level before the app loads.
    await page.addInitScript(() => {
        (window as unknown as { __viewerErrors: unknown[] }).__viewerErrors =
            [];
        document.addEventListener('viewererror', (e) => {
            (
                window as unknown as { __viewerErrors: unknown[] }
            ).__viewerErrors.push((e as CustomEvent).detail);
        });
    });

    const config = encodeURIComponent(
        JSON.stringify({
            controls: 'split',
            nav: { edge: 'top' },
            toolbar: { anchor: 'top' },
        }),
    );
    await page.goto(`/?manifest=${MANIFEST}&config=${config}`, {
        waitUntil: 'domcontentloaded',
    });

    await expect(page.locator('#triiiceratops-viewer')).toBeVisible();

    await expect
        .poll(
            async () =>
                page.evaluate(
                    () =>
                        (window as unknown as { __viewerErrors: unknown[] })
                            .__viewerErrors.length,
                ),
            { timeout: 10000 },
        )
        .toBeGreaterThan(0);

    const errors = await page.evaluate(
        () =>
            (
                window as unknown as {
                    __viewerErrors: Array<Record<string, unknown>>;
                }
            ).__viewerErrors,
    );

    const conflict = errors.find((e) => e.code === 'nav-edge-conflict');
    expect(conflict).toBeTruthy();
    expect(conflict?.severity).toBe('warning');
    expect(conflict?.scope).toBe('config');
});
