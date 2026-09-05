/**
 * **Navigation by newspaper article** — Cookbook 0025, in a real browser.
 *
 * 0025's table of contents is a range per article, and every one of its items is
 * a `SpecificResource`: a canvas plus a `FragmentSelector` naming the rectangle
 * the article occupies on the page. Choosing an article is therefore a
 * navigation carrying a region, and what only a browser can settle is the view
 * the viewer ADOPTS for it — the canvas it lands on, and the box it frames.
 *
 * The recipe's own manifest is driven, from the vendored copy at its own
 * `iiif.io` id, with the reference Image API service standing in as the dev
 * server's fake one. What is under test is the recipe, not the internet.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { E2E_ORIGIN } from './helpers/origin';
import { settled } from './helpers/settle';

test.describe.configure({ timeout: 120_000 });

test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Canvas2D renderer slice is Chromium-only (see canvas-renderer.spec.ts).',
);

test.afterEach(async ({ page }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
});

const SURFACE = '[data-testid="canvas-renderer-surface"]';
const STRUCTURES_PANEL = '[role="dialog"][data-panel-id="structures"]';

const RECIPE = '0025-newspaper-article-index';
const MANIFEST = `https://iiif.io/api/cookbook/recipe/${RECIPE}/manifest.json`;
const CANVAS = (page: string) =>
    `https://iiif.io/api/cookbook/recipe/${RECIPE}/canvas/${page}`;
const FIXTURE = join(
    import.meta.dirname,
    '../src/lib/test/fixtures/manifests/cookbook',
    `${RECIPE}.json`,
);

/** Every canvas in the recipe, as the manifest declares them. */
const CANVAS_SIZE = { width: 1634, height: 2402 };

/**
 * The first article and the second, as the manifest spells them: the range
 * "Tagesneuigkeiten" opens on a column of page 2, and "Das Turnier" on one of
 * page 3. A range's first target is the one navigation lands on, the same rule
 * the `#t=` of a chapter follows.
 */
const ARTICLES = [
    {
        label: 'Tagesneuigkeiten',
        canvasId: CANVAS('p2'),
        region: { x: 553, y: 1157, width: 470, height: 1103 },
    },
    {
        label: 'Das Turnier',
        canvasId: CANVAS('p3'),
        region: { x: 113, y: 1489, width: 488, height: 808 },
    },
];

/** What the viewport is looking at, in canvas coordinates. */
function visibleBounds(page: Page) {
    return page.evaluate(() => {
        const host = document.querySelector(
            'triiiceratops-viewer',
        ) as unknown as {
            viewerState?: {
                viewportBounds: {
                    x: number;
                    y: number;
                    width: number;
                    height: number;
                } | null;
            };
        } | null;
        return host?.viewerState?.viewportBounds ?? null;
    });
}

/** The canvas the viewer is on, read off the element's own state. */
function currentCanvas(page: Page): Promise<string | null> {
    return page.evaluate(() => {
        const host = document.querySelector(
            'triiiceratops-viewer',
        ) as unknown as { viewerState?: { canvasId: string | null } } | null;
        return host?.viewerState?.canvasId ?? null;
    });
}

/**
 * Open the recipe with its table of contents showing.
 *
 * The manifest is served from the vendored copy at its own id, and `iiif.io`'s
 * reference image service becomes the dev server's fake one so the pages paint
 * through the real tile pipeline. Anything else remote is a 404.
 */
async function openRecipe(page: Page): Promise<void> {
    await page.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (route) =>
        route.fulfill({ status: 404, body: '' }),
    );
    await page.route('https://iiif.io/api/image/**', async (route) => {
        const path = new URL(route.request().url()).pathname;
        const rest = path.replace('/api/image/3.0/example/reference/', '');
        const response = await route.fetch({
            url: `${E2E_ORIGIN}/iiif-fixture/${rest}`,
        });
        return route.fulfill({ response });
    });
    await page.route(`**${new URL(MANIFEST).pathname}`, (route) =>
        route.fulfill({
            contentType: 'application/json',
            body: readFileSync(FIXTURE),
        }),
    );

    const config = encodeURIComponent(
        JSON.stringify({ structures: { open: true } }),
    );
    await page.goto(
        `/e2e/harness.html?manifest=${encodeURIComponent(MANIFEST)}&config=${config}`,
        { waitUntil: 'domcontentloaded' },
    );
    await page.locator(SURFACE).waitFor({ state: 'visible', timeout: 30_000 });
    await page
        .locator(STRUCTURES_PANEL)
        .waitFor({ state: 'visible', timeout: 30_000 });
}

/** Choose a table-of-contents entry, as a reader does. */
async function chooseEntry(page: Page, label: string): Promise<void> {
    await page
        .locator(STRUCTURES_PANEL)
        .getByRole('button', { name: label, exact: true })
        .click();
}

test('lists the newspaper`s articles under their range labels', async ({
    page,
}) => {
    await openRecipe(page);
    const panel = page.locator(STRUCTURES_PANEL);

    // The recipe's one top-level range, and the articles beneath it: entries
    // with navigable targets, which is what a `SpecificResource` item buys.
    await expect(
        panel.getByRole('button', { name: 'Articles', exact: true }),
    ).toBeVisible();
    for (const article of ARTICLES) {
        await expect(
            panel.getByRole('button', { name: article.label, exact: true }),
        ).toBeVisible();
    }
});

for (const article of ARTICLES) {
    test(`frames the article ${article.label} on the page it occupies`, async ({
        page,
    }) => {
        await openRecipe(page);
        await settled(page, visibleBounds);

        await chooseEntry(page, article.label);

        await expect.poll(() => currentCanvas(page)).toBe(article.canvasId);

        // Settled, not sampled: the fit is eased, so any single read is a
        // moment of an animation. The article's column is taller than the
        // surface is deep relative to its width, so the fit binds on height —
        // the visible box is the region grown on its other axis and centred on
        // it, which is what `min(ratio)` being 1 says without assuming which
        // axis binds.
        const bounds = await settled(page, visibleBounds);
        expect(bounds).not.toBeNull();
        const { x, y, width, height } = article.region;
        expect(
            Math.min(bounds!.width / width, bounds!.height / height),
        ).toBeCloseTo(1, 1);
        expect(bounds!.width).toBeGreaterThanOrEqual(width - 1);
        expect(bounds!.height).toBeGreaterThanOrEqual(height - 1);
        expect(bounds!.x + bounds!.width / 2).toBeCloseTo(x + width / 2, 0);
        expect(bounds!.y + bounds!.height / 2).toBeCloseTo(y + height / 2, 0);
        // Framed, not merely opened: the whole page would otherwise be in view.
        expect(bounds!.height).toBeLessThan(CANVAS_SIZE.height);
    });
}
