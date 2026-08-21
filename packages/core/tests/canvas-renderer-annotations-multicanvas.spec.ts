/**
 * Annotations when more than one canvas is on screen — a facing-page spread, and
 * a run of folios in continuous mode.
 *
 * Every annotation surface must resolve geometry per canvas, not against the
 * viewer's single "current" canvas: a spread's facing page needs its own shape
 * and panel row, and in continuous mode "current" is the canvas last NAVIGATED
 * to, which after a scroll is not the one on screen. Both are asserted here
 * against a real renderer, because only a browser lays canvases out.
 *
 * The single-canvas geometry specs live in `canvas-renderer-annotations.spec.ts`;
 * this file is about the plural.
 */

import { expect, test, type Page } from '@playwright/test';

const SURFACE = '[data-testid="canvas-renderer-surface"]';
const ROOT = '[data-testid="canvas-renderer-root"]';

test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Canvas2D renderer specs are Chromium-only.',
);

/** The annotated box, in each canvas's own space. */
const REGION = { x: 300, y: 250, width: 600, height: 400 };

const CANVAS_COUNT = 4;

/**
 * Four 1200×900 canvases, each painted by an inline SVG and each carrying ONE
 * annotation on the same box of its own page.
 *
 * The same box deliberately: two shapes that differ only by which canvas they
 * belong to is what makes "projected through its own page" visible — read through
 * the wrong canvas they would coincide.
 */
const MANIFEST = {
    '@context': 'http://iiif.io/api/presentation/3/context.json',
    id: '/multicanvas-annotations.json',
    type: 'Manifest',
    label: { en: ['Annotations across canvases'] },
    behavior: ['paged'],
    items: Array.from({ length: CANVAS_COUNT }, (_, index) => ({
        id: `/multicanvas-canvas-${index}`,
        type: 'Canvas',
        width: 1200,
        height: 900,
        items: [
            {
                id: `/multicanvas-painting-page-${index}`,
                type: 'AnnotationPage',
                items: [
                    {
                        id: `/multicanvas-painting-${index}`,
                        type: 'Annotation',
                        motivation: 'painting',
                        body: {
                            id: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1200' height='900'%3E%3Crect width='1200' height='900' fill='%23${index}${index}4488'/%3E%3C/svg%3E`,
                            type: 'Image',
                            format: 'image/svg+xml',
                            width: 1200,
                            height: 900,
                        },
                        target: `/multicanvas-canvas-${index}`,
                    },
                ],
            },
        ],
        annotations: [
            {
                id: `/multicanvas-anno-page-${index}`,
                type: 'AnnotationPage',
                items: [
                    {
                        id: `anno-${index}`,
                        type: 'Annotation',
                        motivation: 'commenting',
                        body: {
                            type: 'TextualBody',
                            value: `Note on canvas ${index + 1}`,
                        },
                        target: `/multicanvas-canvas-${index}#xywh=${REGION.x},${REGION.y},${REGION.width},${REGION.height}`,
                    },
                ],
            },
        ],
    })),
};

async function open(
    page: Page,
    config: Record<string, unknown>,
): Promise<void> {
    await page.route('**/multicanvas-annotations.json', (route) =>
        route.fulfill({ json: MANIFEST }),
    );

    const query = encodeURIComponent(
        JSON.stringify({ annotations: { open: true }, ...config }),
    );
    await page.goto(
        `/e2e/harness.html?manifest=/multicanvas-annotations.json&config=${query}`,
        {
            waitUntil: 'domcontentloaded',
        },
    );
    await page.locator(SURFACE).waitFor({ state: 'visible', timeout: 20_000 });
    await page.locator('[data-annotation-id]').first().waitFor({
        state: 'visible',
        timeout: 20_000,
    });
    await settled(page);
}

/** Wait until the surface has stopped resizing, then paint one more frame. */
async function settled(page: Page): Promise<void> {
    let previous = -1;
    await expect
        .poll(async () => {
            const width = await page.locator(SURFACE).evaluate(
                (element) =>
                    (
                        element as HTMLCanvasElement & {
                            __triiiceratopsRenderer?: {
                                getView(): { width: number };
                            };
                        }
                    ).__triiiceratopsRenderer!.getView().width,
            );
            const stable = width === previous;
            previous = width;
            return stable;
        })
        .toBe(true);
    await page.waitForTimeout(250);
}

/** Which annotations have a panel row, in panel order. */
async function rowIds(page: Page): Promise<string[]> {
    return page
        .locator('[data-annotation-row]')
        .evaluateAll((rows) =>
            rows.map((row) => row.getAttribute('data-annotation-row') ?? ''),
        );
}

/** Which annotations have a shape, and where its left edge is. */
async function shapeLefts(page: Page): Promise<Record<string, number>> {
    const boxes = await page
        .locator('[data-testid="annotation-shapes"] [data-annotation-id]')
        .evaluateAll((shapes) =>
            shapes.map((shape) => ({
                id: shape.getAttribute('data-annotation-id') ?? '',
                left: shape.getBoundingClientRect().left,
            })),
        );
    return Object.fromEntries(boxes.map(({ id, left }) => [id, left]));
}

test('a paged spread shows BOTH pages’ annotations, each on its own page', async ({
    page,
}) => {
    // `pagedViewOffset: false` pairs from the first canvas, so the opening view is
    // a spread rather than a lone cover page.
    await open(page, { viewingMode: 'paged', pagedViewOffset: false });

    // The facing page's annotation is listed, not just the current canvas's.
    expect(await rowIds(page)).toEqual(['anno-0', 'anno-1']);

    const lefts = await shapeLefts(page);
    expect(Object.keys(lefts).sort()).toEqual(['anno-0', 'anno-1']);
    // Same box on both pages, so a shape projected through the WRONG canvas would
    // land on top of the other. The verso's is to the right of the recto's by
    // roughly a page.
    expect(lefts['anno-1']).toBeGreaterThan(lefts['anno-0'] + 100);
});

test('the facing page’s annotation is selectable, and connects to its own row', async ({
    page,
}) => {
    await open(page, { viewingMode: 'paged', pagedViewOffset: false });

    const shape = page.locator('[data-annotation-id="anno-1"]');
    const box = await shape.boundingBox();
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);

    // Its own row is marked — not the current canvas's.
    await expect(
        page.locator('[data-annotation-row="anno-1"]'),
    ).toHaveAttribute('aria-current', 'true');
    await expect(
        page.locator('[data-annotation-row="anno-0"]'),
    ).not.toHaveAttribute('aria-current', 'true');
    await expect(page.locator('.connecting-lines')).toHaveCount(1);
});

test('turning the page moves the annotations with it', async ({ page }) => {
    await open(page, { viewingMode: 'paged', pagedViewOffset: false });
    expect(await rowIds(page)).toEqual(['anno-0', 'anno-1']);

    await page.locator('[aria-label*="Next" i]').first().click();
    await expect.poll(() => rowIds(page)).toEqual(['anno-2', 'anno-3']);

    // And the previous spread's shapes are gone rather than left behind.
    expect(Object.keys(await shapeLefts(page)).sort()).toEqual([
        'anno-2',
        'anno-3',
    ]);
});

test('continuous mode follows the VIEWPORT, not the navigated canvas', async ({
    page,
}) => {
    await open(page, { viewingMode: 'continuous' });

    // It opens fitted to the first folio.
    expect(await rowIds(page)).toEqual(['anno-0']);

    // Zoom out until more than one folio is on screen. The canvas the viewer
    // calls "current" never changes — no navigation happens here — so anything
    // that appears did so because the VIEWPORT reached it.
    await page.locator(ROOT).focus();
    await page.keyboard.press('-');
    await page.keyboard.press('-');
    await expect
        .poll(async () => (await rowIds(page)).length, { timeout: 10_000 })
        .toBeGreaterThan(1);

    const rows = await rowIds(page);
    const lefts = await shapeLefts(page);
    // Every listed annotation has a shape and every shape has a row: the panel
    // and the image describe the same set, which is what a connector needs.
    expect(Object.keys(lefts).sort()).toEqual([...rows].sort());
    // Each on its own folio, so no two shapes coincide.
    expect(new Set(Object.values(lefts)).size).toBe(rows.length);
});
