import { expect, test } from '@playwright/test';

const manifest = {
    '@context': 'http://iiif.io/api/presentation/3/context.json',
    id: '/annotation-performance-manifest.json',
    type: 'Manifest',
    label: { en: ['Annotation connector performance'] },
    items: [
        {
            id: '/annotation-performance-canvas',
            type: 'Canvas',
            width: 100,
            height: 100,
            items: [
                {
                    id: '/annotation-performance-painting-page',
                    type: 'AnnotationPage',
                    items: [
                        {
                            id: '/annotation-performance-painting',
                            type: 'Annotation',
                            motivation: 'painting',
                            body: {
                                id: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect width='100' height='100' fill='%232563eb'/%3E%3C/svg%3E",
                                type: 'Image',
                                format: 'image/svg+xml',
                                width: 100,
                                height: 100,
                            },
                            target: '/annotation-performance-canvas',
                        },
                    ],
                },
            ],
            annotations: [
                {
                    id: '/annotation-performance-page',
                    type: 'AnnotationPage',
                    items: [
                        {
                            id: 'annotation-performance-region',
                            type: 'Annotation',
                            motivation: 'commenting',
                            body: {
                                type: 'TextualBody',
                                value: 'Measured annotation',
                            },
                            target: '/annotation-performance-canvas#xywh=20,20,30,30',
                        },
                    ],
                },
            ],
        },
    ],
};

test('annotation connector avoids layout reads while the view is stationary', async ({
    page,
}) => {
    await page.addInitScript(() => {
        const original = Element.prototype.getBoundingClientRect;
        (window as any).__annotationConnectorRectReads = 0;
        Element.prototype.getBoundingClientRect = function () {
            const element = this as Element;
            if (
                element.id?.startsWith('annotation-list-item-') ||
                element.hasAttribute?.('data-annotation-id')
            ) {
                (window as any).__annotationConnectorRectReads += 1;
            }
            return original.call(this);
        };
    });
    await page.route('**/annotation-performance-manifest.json', (route) =>
        route.fulfill({ json: manifest }),
    );

    const config = encodeURIComponent(
        JSON.stringify({ annotations: { open: true } }),
    );
    await page.goto(
        `/?manifest=/annotation-performance-manifest.json&config=${config}`,
        { waitUntil: 'domcontentloaded' },
    );

    const row = page.locator(
        '#annotation-list-item-annotation-performance-region',
    );
    await expect(row).toBeVisible();
    await expect(
        page.locator('[data-annotation-id="annotation-performance-region"]'),
    ).toBeVisible();
    await row.hover();
    await expect(page.locator('.connecting-lines')).toBeVisible();

    await page.evaluate(() => {
        (window as any).__annotationConnectorRectReads = 0;
    });
    await page.waitForTimeout(300);

    const stationaryReads = await page.evaluate(
        () => (window as any).__annotationConnectorRectReads,
    );
    expect(stationaryReads).toBeLessThanOrEqual(2);

    await page.setViewportSize({ width: 1200, height: 800 });
    await expect
        .poll(() =>
            page.evaluate(() => (window as any).__annotationConnectorRectReads),
        )
        .toBeGreaterThan(stationaryReads);
});
