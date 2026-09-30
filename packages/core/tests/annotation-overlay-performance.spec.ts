import { expect, test } from '@playwright/test';

import { getView, setView } from './helpers/numberedGrid';

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
        `/e2e/harness.html?manifest=/annotation-performance-manifest.json&config=${config}`,
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

test('annotation connector follows a pan without document-wide queries', async ({
    page,
    browserName,
}) => {
    test.skip(
        browserName !== 'chromium',
        'The renderer test handle is Chromium-only.',
    );
    await page.addInitScript(() => {
        const counters = { queries: 0, frames: 0 };
        (window as any).__connectorCounters = counters;
        for (const proto of [Document.prototype, DocumentFragment.prototype]) {
            const querySelectorAll = proto.querySelectorAll;
            proto.querySelectorAll = function (
                this: ParentNode,
                selectors: string,
            ) {
                counters.queries += 1;
                return querySelectorAll.call(this, selectors);
            } as typeof proto.querySelectorAll;
        }
        const countFrame = () => {
            counters.frames += 1;
            requestAnimationFrame(countFrame);
        };
        requestAnimationFrame(countFrame);
    });
    await page.route('**/annotation-performance-manifest.json', (route) =>
        route.fulfill({ json: manifest }),
    );

    const config = encodeURIComponent(
        JSON.stringify({ annotations: { open: true } }),
    );
    await page.goto(
        `/e2e/harness.html?manifest=/annotation-performance-manifest.json&config=${config}`,
        { waitUntil: 'domcontentloaded' },
    );

    const row = page.locator(
        '#annotation-list-item-annotation-performance-region',
    );
    const shape = page.locator(
        '[data-annotation-id="annotation-performance-region"]',
    );
    await expect(row).toBeVisible();
    await expect(shape).toBeVisible();
    await row.hover();
    await expect(page.locator('.connecting-lines')).toBeVisible();

    const counters = () =>
        page.evaluate(() => ({ ...(window as any).__connectorCounters }));
    const lineEnd = () =>
        page.locator('.connecting-lines .ink-line').evaluate((path) => {
            const numbers = (path.getAttribute('d') ?? '')
                .match(/-?[\d.]+(?:e-?\d+)?/g)!
                .map(Number);
            return { x: numbers[2], y: numbers[3] };
        });
    const shapeCentre = async () => {
        const box = (await shape.boundingBox())!;
        return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    };

    const before = await lineEnd();
    const panStart = await counters();
    const view = await getView(page);
    await setView(page, {
        centre: { x: view.centre.x + 20, y: view.centre.y + 10 },
        scale: view.scale,
    });

    await expect.poll(lineEnd).not.toEqual(before);
    const centre = await shapeCentre();
    await expect
        .poll(async () => {
            const end = await lineEnd();
            return (
                Math.abs(end.x - centre.x) < 0.5 &&
                Math.abs(end.y - centre.y) < 0.5
            );
        })
        .toBe(true);

    const panEnd = await counters();
    expect(panEnd.frames).toBeGreaterThan(panStart.frames);
    expect(panEnd.queries - panStart.queries).toBe(0);
});

const SHAPE_COUNT = 50;

/** The same canvas, carrying a grid of `SHAPE_COUNT` small regions. */
const manyShapesManifest = {
    ...manifest,
    id: '/annotation-performance-many-manifest.json',
    items: [
        {
            ...manifest.items[0],
            annotations: [
                {
                    id: '/annotation-performance-many-page',
                    type: 'AnnotationPage',
                    items: Array.from({ length: SHAPE_COUNT }, (_, index) => ({
                        id: `annotation-performance-many-${index}`,
                        type: 'Annotation',
                        motivation: 'commenting',
                        body: {
                            type: 'TextualBody',
                            value: `Measured annotation ${index}`,
                        },
                        target: `/annotation-performance-canvas#xywh=${(index % 10) * 10},${Math.floor(index / 10) * 20},8,8`,
                    })),
                },
            ],
        },
    ],
};

test('many annotations: layer rect read once per frame, and a pan writes positions only', async ({
    page,
    browserName,
}) => {
    test.skip(
        browserName !== 'chromium',
        'The renderer test handle is Chromium-only.',
    );
    await page.addInitScript(() => {
        const original = Element.prototype.getBoundingClientRect;
        const counters = { layerRectReads: 0, frames: 0 };
        (window as any).__overlayCounters = counters;
        Element.prototype.getBoundingClientRect = function () {
            if (this.classList?.contains('anno-shape-layer')) {
                counters.layerRectReads += 1;
            }
            return original.call(this);
        };
        const countFrame = () => {
            counters.frames += 1;
            requestAnimationFrame(countFrame);
        };
        requestAnimationFrame(countFrame);
    });
    await page.route('**/annotation-performance-many-manifest.json', (route) =>
        route.fulfill({ json: manyShapesManifest }),
    );

    const config = encodeURIComponent(
        JSON.stringify({ annotations: { open: true } }),
    );
    await page.goto(
        `/e2e/harness.html?manifest=/annotation-performance-many-manifest.json&config=${config}`,
        { waitUntil: 'domcontentloaded' },
    );

    const shapes = page.locator(
        '[data-testid="annotation-shapes"] [data-annotation-id]',
    );
    await expect(shapes).toHaveCount(SHAPE_COUNT);
    const surface = await page
        .locator('[data-testid="canvas-renderer-surface"]')
        .boundingBox();

    const counters = () =>
        page.evaluate(() => ({ ...(window as any).__overlayCounters }));

    // Hover: a burst of pointer moves inside one frame reads the rect once.
    const hover = await page
        .locator('.renderer-root')
        .evaluate((renderer, box) => {
            const counters = (window as any).__overlayCounters;
            const before = counters.layerRectReads;
            for (let step = 0; step < 40; step += 1) {
                renderer.dispatchEvent(
                    new PointerEvent('pointermove', {
                        bubbles: true,
                        composed: true,
                        clientX: box.x + box.width * (0.2 + step * 0.015),
                        clientY: box.y + box.height * 0.4,
                    }),
                );
            }
            return { reads: counters.layerRectReads - before };
        }, surface!);
    expect(hover.reads).toBe(1);

    // Pan: an animated programmatic pan over every shape. The shape elements
    // survive it, and the only DOM writes are their inline positions.
    await page.mouse.move(1, 1);
    const layer = page.locator('[data-testid="annotation-shapes"]');
    await layer.evaluate((layer) => {
        const records: MutationRecord[] = [];
        const observer = new MutationObserver((batch) =>
            records.push(...batch),
        );
        observer.observe(layer, {
            subtree: true,
            childList: true,
            attributes: true,
        });
        (window as any).__overlayPan = {
            nodes: [...layer.querySelectorAll('[data-annotation-id]')],
            records,
            observer,
        };
    });
    const panStart = await counters();
    const view = await getView(page);
    await setView(page, {
        centre: { x: view.centre.x + 30, y: view.centre.y + 10 },
        scale: view.scale,
    });
    const panEnd = await counters();

    const pan = await layer.evaluate((layer) => {
        const state = (window as any).__overlayPan;
        state.observer.disconnect();
        const records = state.records as MutationRecord[];
        const nodes = [...layer.querySelectorAll('[data-annotation-id]')];
        return {
            sameNodes:
                nodes.length === state.nodes.length &&
                nodes.every((node, index) => node === state.nodes[index]),
            styleWrites: records.filter(
                (record) =>
                    record.type === 'attributes' &&
                    record.attributeName === 'style',
            ).length,
            otherWrites: records
                .filter(
                    (record) =>
                        record.type !== 'attributes' ||
                        record.attributeName !== 'style',
                )
                .map((record) => `${record.type}:${record.attributeName}`),
        };
    });
    const panFrames = panEnd.frames - panStart.frames;

    expect(pan.sameNodes).toBe(true);
    expect(pan.otherWrites).toEqual([]);
    expect(pan.styleWrites).toBeGreaterThan(0);
    // Per shape per frame, a pan writes at most the four positional values —
    // a bound that does not move with the annotation count.
    expect(pan.styleWrites).toBeLessThanOrEqual(
        SHAPE_COUNT * 4 * (panFrames + 1),
    );
    expect(panEnd.layerRectReads - panStart.layerRectReads).toBeLessThanOrEqual(
        panFrames + 1,
    );
});
